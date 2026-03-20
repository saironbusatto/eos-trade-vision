# ML Pipeline para EOS Crypto Bot
# build_dataset.py - Exporta dados do SQLite e cria features para treinamento

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv("EOS_DB_PATH") or os.path.join(SCRIPT_DIR, "..", "data", "eos.db")
OUTPUT_DIR = os.getenv("ML_OUTPUT_DIR") or os.path.join(SCRIPT_DIR, "..", "data", "ml")
LABEL_THRESHOLD_PCT = float(os.getenv("ML_LABEL_THRESHOLD_PCT", "0.5"))
GATE_LABEL_MODE = (os.getenv("ML_GATE_LABEL_MODE") or "win").strip().lower()


def load_data() -> pd.DataFrame:
    """Carrega dados de treino com join em `signals` para features cruas."""
    conn = sqlite3.connect(DB_PATH)

    query = """
    SELECT
        m.id,
        m.signal_id,
        m.symbol,
        m.action,
        m.result,
        m.final_profit,
        m.time_to_result_min,
        m.hour_utc,
        m.day_of_week,
        m.f_smart_money,
        m.f_price_context,
        m.f_imbalance,
        m.f_absorption,
        m.f_trend,
        m.f_momentum,
        m.f_volume,
        m.score,
        m.profit_5m,
        m.profit_10m,
        m.profit_15m,
        m.profit_30m,
        m.profit_45m,
        m.macro_sentiment,
        m.fear_greed,
        m.macro_confidence,
        m.trade_recommendation,
        m.sp500_trend,
        m.fed_stance,
        s.created_at,
        s.volume_ratio,
        s.trend,
        s.momentum,
        s.price_change_24h
    FROM ml_training m
    LEFT JOIN signals s ON s.id = m.signal_id
    ORDER BY m.id ASC
    """

    df = pd.read_sql_query(query, conn)
    conn.close()

    print(f"   Loaded {len(df)} records from ml_training")
    return df


def encode_cyclical_features(df: pd.DataFrame) -> pd.DataFrame:
    """Codifica hora e dia como seno/cosseno com fallback em created_at."""
    created_at = pd.to_datetime(df.get("created_at"), errors="coerce")

    hour_fallback = created_at.dt.hour.fillna(12)
    dow_fallback = created_at.dt.dayofweek.fillna(3)

    df["hour_utc"] = pd.to_numeric(df.get("hour_utc"), errors="coerce").fillna(hour_fallback)
    df["day_of_week"] = pd.to_numeric(df.get("day_of_week"), errors="coerce").fillna(dow_fallback)

    df["hour_sin"] = np.sin(2 * np.pi * df["hour_utc"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour_utc"] / 24)
    df["dow_sin"] = np.sin(2 * np.pi * df["day_of_week"] / 7)
    df["dow_cos"] = np.cos(2 * np.pi * df["day_of_week"] / 7)

    return df


def encode_macro_features(df: pd.DataFrame) -> pd.DataFrame:
    """Codifica variáveis macro categóricas para numérico."""
    macro_maps = {
        "macro_sentiment": {"BEARISH": -1, "NEUTRAL": 0, "BULLISH": 1},
        "sp500_trend": {"BEARISH": -1, "NEUTRAL": 0, "BULLISH": 1},
        "fed_stance": {"HAWKISH": -1, "NEUTRAL": 0, "DOVISH": 1},
        "trade_recommendation": {"AVOID": -1, "CONSERVATIVE": 0, "NORMAL": 1},
    }

    for col, mapping in macro_maps.items():
        encoded_col = f"{col}_encoded"
        df[encoded_col] = (
            df.get(col)
            .astype(str)
            .str.upper()
            .map(mapping)
            .fillna(0)
        )

    df["fear_greed"] = pd.to_numeric(df.get("fear_greed"), errors="coerce").fillna(0)
    df["macro_confidence"] = pd.to_numeric(df.get("macro_confidence"), errors="coerce").fillna(0)
    return df


def create_targets(df: pd.DataFrame, threshold_pct: float = LABEL_THRESHOLD_PCT) -> pd.DataFrame:
    """
    Cria targets para direção e gate.

    Direção (`y_direction`):
      - +1 LONG, 0 NO-TRADE, -1 SHORT
      - Ajusta o sinal por `action` para refletir direção de mercado.

    Gate (`y_trade`):
      - Modo `win`: 1 quando result == WIN
      - Modo `movement`: 1 quando abs(signed_profit_target) > threshold
    """
    for col in ["profit_15m", "profit_10m", "profit_30m", "final_profit"]:
        df[col] = pd.to_numeric(df.get(col), errors="coerce")

    target = df["profit_15m"].copy()
    target = target.fillna(df["profit_10m"])
    target = target.fillna(df["profit_30m"])
    target = target.fillna(df["final_profit"])
    df["profit_target"] = target

    is_sell = df["action"].astype(str).str.upper().eq("SELL")
    signed_target = target.copy()
    signed_target[is_sell] = -signed_target[is_sell]
    df["signed_profit_target"] = signed_target

    df["y_direction"] = 0
    df.loc[signed_target > threshold_pct, "y_direction"] = 1
    df.loc[signed_target < -threshold_pct, "y_direction"] = -1

    if GATE_LABEL_MODE == "movement":
        df["y_trade"] = (signed_target.abs() > threshold_pct).astype(int)
    else:
        # default: gate supervision por resultado final do sinal
        df["y_trade"] = df["result"].astype(str).str.upper().eq("WIN").astype(int)

    return df


def select_features(df: pd.DataFrame) -> list[str]:
    """Seleciona features disponíveis para treino."""
    feature_cols = [
        # OFA normalizadas
        "f_smart_money",
        "f_price_context",
        "f_imbalance",
        "f_absorption",
        "f_trend",
        "f_momentum",
        "f_volume",
        "score",
        # Temporais
        "hour_sin",
        "hour_cos",
        "dow_sin",
        "dow_cos",
        # Raw market context
        "volume_ratio",
        "trend",
        "momentum",
        "price_change_24h",
        # Macro
        "macro_confidence",
        "fear_greed",
        "macro_sentiment_encoded",
        "sp500_trend_encoded",
        "fed_stance_encoded",
        "trade_recommendation_encoded",
    ]

    return [c for c in feature_cols if c in df.columns]


def clean_dataset(df: pd.DataFrame, feature_cols: list[str]) -> pd.DataFrame:
    """Limpa dataset sem perder linhas por NaN em features opcionais."""
    df = df.copy()
    df = df.dropna(subset=["signed_profit_target", "y_direction", "y_trade"])

    for col in feature_cols:
        series = pd.to_numeric(df[col], errors="coerce")
        median = series.median()
        fill_value = 0 if np.isnan(median) else median
        df[col] = series.fillna(fill_value)

    if "created_at" in df.columns:
        created = pd.to_datetime(df["created_at"], errors="coerce")
        df["_sort_key"] = created.fillna(pd.Timestamp("1970-01-01"))
        df = df.sort_values("_sort_key").drop(columns=["_sort_key"])
    else:
        df = df.sort_values("id")

    return df.reset_index(drop=True)


def split_temporal(df: pd.DataFrame, train_ratio: float = 0.7, val_ratio: float = 0.15):
    n = len(df)
    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))

    train = df.iloc[:train_end].copy()
    val = df.iloc[train_end:val_end].copy()
    test = df.iloc[val_end:].copy()
    return train, val, test


def save_datasets(
    train: pd.DataFrame,
    val: pd.DataFrame,
    test: pd.DataFrame,
    feature_cols: list[str],
    output_dir: str,
) -> None:
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    train.to_csv(f"{output_dir}/train.csv", index=False)
    val.to_csv(f"{output_dir}/val.csv", index=False)
    test.to_csv(f"{output_dir}/test.csv", index=False)

    metadata: dict[str, Any] = {
        "feature_cols": feature_cols,
        "label_col_direction": "y_direction",
        "label_col_gate": "y_trade",
        "train_size": len(train),
        "val_size": len(val),
        "test_size": len(test),
        "class_distribution_train": train["y_direction"].value_counts().to_dict(),
        "gate_distribution_train": train["y_trade"].value_counts().to_dict(),
        "threshold_pct": LABEL_THRESHOLD_PCT,
        "gate_label_mode": GATE_LABEL_MODE,
        "db_path": DB_PATH,
    }

    with open(f"{output_dir}/metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, default=str)

    print(f"Datasets salvos em {output_dir}")
    print(f"Train: {len(train)}, Val: {len(val)}, Test: {len(test)}")
    print(f"Features ({len(feature_cols)}): {feature_cols}")
    print(f"Label distribution (train y_direction): {metadata['class_distribution_train']}")
    print(f"Label distribution (train y_trade): {metadata['gate_distribution_train']}")


def main():
    print("=" * 60)
    print("BUILD DATASET - EOS ML Pipeline")
    print("=" * 60)
    print(f"DB_PATH: {DB_PATH}")
    print(f"OUTPUT_DIR: {OUTPUT_DIR}")
    print(f"LABEL_THRESHOLD_PCT: {LABEL_THRESHOLD_PCT}")
    print(f"GATE_LABEL_MODE: {GATE_LABEL_MODE}")

    print("\n1. Carregando dados do SQLite...")
    df = load_data()
    print(f"   Total de sinais: {len(df)}")

    print("\n2. Codificando features temporais...")
    df = encode_cyclical_features(df)

    print("\n3. Codificando features macro...")
    df = encode_macro_features(df)

    print("\n4. Criando targets...")
    df = create_targets(df)

    print("\n5. Selecionando features...")
    feature_cols = select_features(df)

    print("\n6. Limpando dados...")
    df_clean = clean_dataset(df, feature_cols)
    print(f"   Sinais após limpeza: {len(df_clean)}")

    print("\n7. Dividindo dataset (70/15/15 temporal)...")
    train, val, test = split_temporal(df_clean)

    print("\n8. Salvando datasets...")
    save_datasets(train, val, test, feature_cols, OUTPUT_DIR)

    print("\n" + "=" * 60)
    print("Dataset pronto para treinamento!")
    print("=" * 60)


if __name__ == "__main__":
    main()
