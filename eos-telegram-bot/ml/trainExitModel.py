"""
Train Exit Decision Model — Fase 2
===================================
Treina o modelo LightGBM de saída usando dados do exit_decisions_log.

Pré-requisito: >= 300 operações finalizadas com outcome registrado.
  python ml/trainExitModel.py --check   # verifica quantos registros há
  python ml/trainExitModel.py           # treina com defaults

Como o label é construído:
  Cada linha de exit_decisions_log representa uma observação durante o trade.
  - Se a observação tem outcome=WIN e is_final=0 → label = HOLD
    (O bot segurou e ganhou — correto não ter saído neste ponto)
  - Se a observação tem is_final=1 e outcome=WIN → label = HOLD
    (fechamento natural no take_profit — também correto)
  - Se a observação tem is_final=1 e outcome=LOSS → label = EXIT
    (parou no stop — precisaríamos ter saído antes ou no momento)
  - MOVE_STOP: intermediário com pnl_pct > 0 e outcome=WIN antes de sair
    → linha onde o bot estava no lucro e fechou sem ter movido o stop.
    Se cf_pnl_5m > pnl_pct (teria ganho mais segurando) → HOLD
    Se cf_pnl_5m < pnl_pct (teria perdido segurar) → EXIT

Ajuste esses critérios após análise exploratória dos seus dados.
"""

import argparse
import json
import os
import pickle
import sqlite3
import sys
from pathlib import Path

import numpy as np
import pandas as pd

try:
    import lightgbm as lgb
    from lightgbm import LGBMClassifier
except ImportError:
    print("ERRO: lightgbm não instalado. Execute: pip install lightgbm")
    sys.exit(1)

from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import LabelEncoder

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
DB_PATH    = Path(os.getenv("DATABASE_PATH",
                             str(SCRIPT_DIR.parent / "data" / "eos.db")))
MODEL_DIR  = Path(os.getenv("ML_MODEL_DIR",
                             str(SCRIPT_DIR.parent / "data" / "ml" / "models")))

# ── Feature columns ───────────────────────────────────────────────────────────
FEATURE_COLS = [
    "pnl_pct",
    "time_in_trade_seconds",
    "distance_to_stop_pct",
    "distance_to_target_pct",
    "volume_ratio",
    "volatility_5m",
    "volatility_15m",
    "volatility_ratio",
    "rsi_current",
    "rsi_slope",
    "candles_in_favor",
    "candles_against",
    "original_signal_score",
    "bid_ask_spread_pct",
]

MIN_RECORDS = 300   # mínimo para treino confiável
RANDOM_STATE = 42

# ── LightGBM hiperparâmetros (baseline conservador) ──────────────────────────
LGBM_PARAMS = {
    "objective":       "multiclass",
    "num_class":       3,  # sobrescrito dinamicamente em train_model() com as classes reais
    "num_leaves":      31,
    "max_depth":       5,
    "learning_rate":   0.05,
    "n_estimators":    300,
    "subsample":       0.8,
    "colsample_bytree":0.8,
    "reg_alpha":       0.1,
    "reg_lambda":      1.0,
    "min_child_samples": 20,
    "class_weight":    "balanced",    # compensa desequilíbrio de classes
    "random_state":    RANDOM_STATE,
    "n_jobs":          -1,
    "verbose":         -1,
}


# ═══════════════════════════════════════════════════════════════════════════════
# Carregamento de dados
# ═══════════════════════════════════════════════════════════════════════════════

def load_data() -> pd.DataFrame:
    """Carrega exit_decisions_log do SQLite e retorna DataFrame."""
    if not DB_PATH.exists():
        print(f"ERRO: banco não encontrado: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    query = """
        SELECT
            e.id,
            e.signal_id,
            e.action,
            e.pnl_pct,
            e.time_in_trade_seconds,
            e.distance_to_stop_pct,
            e.distance_to_target_pct,
            e.volume_ratio,
            e.volatility_5m,
            e.volatility_15m,
            e.volatility_ratio,
            e.rsi_current,
            e.rsi_slope,
            e.candles_in_favor,
            e.candles_against,
            e.original_signal_score,
            e.bid_ask_spread_pct,
            e.is_final,
            e.outcome,
            e.pnl_final,
            e.cf_pnl_5m,
            e.cf_pnl_10m,
            e.cf_pnl_15m
        FROM exit_decisions_log e
        WHERE e.outcome IS NOT NULL
        ORDER BY e.signal_id, e.id
    """
    df = pd.read_sql_query(query, conn)
    conn.close()
    print(f"[Train] Carregados {len(df)} registros de {df['signal_id'].nunique()} sinais únicos.")
    return df


# ═══════════════════════════════════════════════════════════════════════════════
# Construção de labels
# ═══════════════════════════════════════════════════════════════════════════════

def build_labels(df: pd.DataFrame) -> pd.DataFrame:
    """
    Aplica heurística para gerar label de saída em cada observação.

    Regras:
    ─────────────────────────────────────────────────────────────────────────
    HOLD      → observação intermediária (is_final=0) com outcome=WIN
                 O bot segurou e ganhou — corretíssimo não ter saído aqui.

    EXIT      → observação final (is_final=1) com outcome=LOSS
                 O bot foi stopado — correto sair assim que o stop foi atingido.
                 Também: observação intermediária com outcome=LOSS
                 E pnl_pct < -80% do stop → saída defensiva.

    MOVE_STOP → observação intermediária com pnl_pct > 0.15% e outcome=WIN
                 E cf_pnl_5m < pnl_pct (teria perdido ao segurar mais)
                 → era momento de mover o stop para breakeven.

    Observações sem regra clara → descartadas.
    ─────────────────────────────────────────────────────────────────────────
    """
    labels = []

    for _, row in df.iterrows():
        is_final = bool(row["is_final"])
        outcome  = row["outcome"]
        pnl      = float(row["pnl_pct"] or 0)
        cf5m     = row["cf_pnl_5m"]
        stop_dist = float(row["distance_to_stop_pct"] or 0)

        if is_final:
            if outcome == "WIN":
                labels.append("HOLD")   # fechou no alvo naturalmente
            elif outcome == "LOSS":
                labels.append("EXIT")   # stopado
            else:
                labels.append(None)

        else:  # observação intermediária
            if outcome == "WIN":
                # Estava lucrando e acabou ganhando: estava correto segurar
                if pnl > 0.15 and pd.notna(cf5m) and float(cf5m) < pnl:
                    # Teria ganho menos daqui a 5 min → era momento de mover stop
                    labels.append("MOVE_STOP")
                else:
                    labels.append("HOLD")
            elif outcome == "LOSS":
                # Estava perdendo e acabou perdendo: saída defensiva era melhor
                if stop_dist < 0.10:
                    # Muito perto do stop → sai
                    labels.append("EXIT")
                else:
                    # Ainda longe do stop → aguarda (HOLD) para coleta
                    labels.append("HOLD")
            else:
                labels.append(None)

    df = df.copy()
    df["label"] = labels
    before = len(df)
    df = df.dropna(subset=["label"])
    print(f"[Train] Labels geradas: {len(df)} usáveis de {before} total.")
    print(f"[Train] Distribuição:\n{df['label'].value_counts()}")
    return df


# ═══════════════════════════════════════════════════════════════════════════════
# Treino
# ═══════════════════════════════════════════════════════════════════════════════

def train_model(df: pd.DataFrame) -> tuple:
    """
    Treina LGBMClassifier com validação cruzada temporal (StratifiedKFold).
    Retorna (model, metadata, le) onde le = LabelEncoder.
    """
    X = df[FEATURE_COLS].copy()
    for col in FEATURE_COLS:
        X[col] = pd.to_numeric(X[col], errors="coerce").fillna(0.0)

    le = LabelEncoder()
    y  = le.fit_transform(df["label"])

    # Ajusta num_class dinamicamente (pode ser 2 se MOVE_STOP ainda não apareceu)
    n_classes = len(le.classes_)
    LGBM_PARAMS["num_class"] = n_classes
    if n_classes == 2:
        LGBM_PARAMS["objective"] = "binary"
        LGBM_PARAMS.pop("num_class")

    print(f"\n[Train] Classes: {list(le.classes_)} → {list(range(n_classes))}")
    print(f"[Train] Features: {FEATURE_COLS}")
    print(f"[Train] Total amostras: {len(X)}")

    # Walk-forward com 5 folds
    skf = StratifiedKFold(n_splits=5, shuffle=False)
    cv_f1s = []

    for fold, (train_idx, val_idx) in enumerate(skf.split(X, y), 1):
        X_tr, X_val = X.iloc[train_idx], X.iloc[val_idx]
        y_tr, y_val = y[train_idx], y[val_idx]

        clf = LGBMClassifier(**LGBM_PARAMS)
        clf.fit(
            X_tr, y_tr,
            eval_set=[(X_val, y_val)],
            callbacks=[lgb.early_stopping(30, verbose=False),
                       lgb.log_evaluation(period=-1)]
        )
        preds = clf.predict(X_val)
        f1 = f1_score(y_val, preds, average="weighted")
        cv_f1s.append(f1)
        print(f"  Fold {fold}: F1 weighted = {f1:.4f}")

    print(f"\n[Train] CV F1 médio: {np.mean(cv_f1s):.4f} ± {np.std(cv_f1s):.4f}")

    # Treino final em todos os dados
    final_model = LGBMClassifier(**LGBM_PARAMS)
    final_model.fit(X, y)

    # Feature importance
    fi = dict(sorted(
        {col: int(imp) for col, imp in zip(FEATURE_COLS, final_model.feature_importances_)}.items(),
        key=lambda x: x[1], reverse=True
    ))
    print("\n[Train] Feature importance (gain):")
    for feat, imp in fi.items():
        print(f"  {feat:35s} {imp:.1f}")

    # Métricas finais
    y_pred = final_model.predict(X)
    print("\n[Train] Classification report (treino completo):")
    print(classification_report(y, y_pred, target_names=le.classes_))

    metadata = {
        "feature_cols":      FEATURE_COLS,
        "classes":           list(map(int, le.transform(le.classes_))),
        "class_names":       list(le.classes_),
        "cv_f1_mean":        float(np.mean(cv_f1s)),
        "cv_f1_std":         float(np.std(cv_f1s)),
        "n_samples":         int(len(X)),
        "lgbm_params":       LGBM_PARAMS,
        "feature_importance": fi,
        "label_map":         {str(int(le.transform([c])[0])): c for c in le.classes_},
    }

    return final_model, metadata, le


# ═══════════════════════════════════════════════════════════════════════════════
# Entry point
# ═══════════════════════════════════════════════════════════════════════════════

def check_data() -> None:
    """Verifica quantos registros estão disponíveis para treino."""
    if not DB_PATH.exists():
        print(f"Banco não encontrado: {DB_PATH}")
        return
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute(
        "SELECT COUNT(*) as n, "
        "SUM(CASE WHEN outcome='WIN' THEN 1 ELSE 0 END) as wins, "
        "SUM(CASE WHEN outcome='LOSS' THEN 1 ELSE 0 END) as losses "
        "FROM exit_decisions_log WHERE outcome IS NOT NULL"
    )
    row = cur.fetchone()
    conn.close()
    total, wins, losses = int(row[0]), int(row[1] or 0), int(row[2] or 0)
    pct = total / MIN_RECORDS * 100
    status = "✅ PRONTO" if total >= MIN_RECORDS else f"⏳ {pct:.0f}% do mínimo"
    print(f"[TrainCheck] Registros com outcome: {total} ({wins} WIN / {losses} LOSS) — {status}")
    if total < MIN_RECORDS:
        print(f"[TrainCheck] Meta: {MIN_RECORDS} registros. Faltam {MIN_RECORDS - total}.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Treina Exit Decision Model")
    parser.add_argument("--check",    action="store_true",
                        help="Apenas verifica quantos dados há (não treina)")
    parser.add_argument("--min-records", type=int, default=MIN_RECORDS,
                        help=f"Mínimo de registros para treinar (default: {MIN_RECORDS})")
    parser.add_argument("--force",    action="store_true",
                        help="Treina mesmo abaixo do mínimo")
    args = parser.parse_args()

    if args.check:
        check_data()
        return

    df = load_data()
    n = len(df[df["outcome"].notna()])

    if n < args.min_records and not args.force:
        print(f"[Train] Apenas {n} registros com outcome. Mínimo: {args.min_records}.")
        print("[Train] Use --force para treinar mesmo assim, ou aguarde mais operações.")
        sys.exit(0)

    df_labeled = build_labels(df)
    if len(df_labeled) < 50:
        print("[Train] Labels insuficientes após filtragem. Aguarde mais dados.")
        sys.exit(0)

    model, metadata, le = train_model(df_labeled)

    # Salva
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    from exitDecisionModel import ExitDecisionModel
    saver = ExitDecisionModel()
    saver.save(model, metadata)

    print(f"\n[Train] ✅ Modelo salvo. Para ativar: defina USE_ML_EXIT=true no .env e reinicie o bot.")
    print(f"[Train]    Verifique: python ml/exitDecisionModel.py --action info")


if __name__ == "__main__":
    main()
