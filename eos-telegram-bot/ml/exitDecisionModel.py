"""
Exit Decision Model — Fase 2
============================
Modelo de classificação para a decisão de saída: EXIT | HOLD | MOVE_STOP

Arquitetura:
  - LightGBM (LGBMClassifier) como modelo primário
    * Mais rápido que XGBoost em tabelas pequenas, handles categóricas nativamente
    * Bem calibrado para predict_proba() com class_weight balanceado
  - Scikit-learn pipeline para pré-processamento
  - Threshold tuning via curva PR (precision-recall) pós-treino

Nota: LightGBM não tem bindings JS/TypeScript oficiais estáveis.
A inferência é chamada via child_process.spawn() em TypeScript,
exatamente como ml/infer.py — sem overhead de subprocess persistente
pois o modelo carrega em < 200ms.

Como usar:
  python ml/exitDecisionModel.py --action predict --input '{"pnl_pct": -0.3, ...}'
  python ml/exitDecisionModel.py --action info

Treinamento: use ml/trainExitModel.py
"""

import argparse
import json
import os
import pickle
import sys
from pathlib import Path

import numpy as np

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
MODEL_DIR  = Path(os.getenv("ML_MODEL_DIR", str(SCRIPT_DIR.parent / "data" / "ml" / "models")))
EXIT_MODEL_PATH    = MODEL_DIR / "exit_model.pkl"
EXIT_META_PATH     = MODEL_DIR / "exit_metadata.json"

# ── Feature columns (mesma ordem usada no treino) ─────────────────────────────
EXIT_FEATURE_COLS = [
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

# ── Labels ────────────────────────────────────────────────────────────────────
# 0 = HOLD  (não fecharia ainda — outcome final foi WIN)
# 1 = EXIT  (fecharia agora — stop/target batido ou loss inevitável)
# 2 = MOVE_STOP (mover stop para breakeven — operação em float profit)
LABEL_MAP     = {0: "HOLD", 1: "EXIT", 2: "MOVE_STOP"}
LABEL_MAP_INV = {"HOLD": 0, "EXIT": 1, "MOVE_STOP": 2}


# ═══════════════════════════════════════════════════════════════════════════════
class ExitDecisionModel:
    """
    Wrapper para carregar e invocar o modelo de saída.

    Uso típico (chamado pelo TypeScript via stdin/stdout):
        model = ExitDecisionModel()
        model.load()
        result = model.predict(features_dict)
        print(json.dumps(result))
    """

    def __init__(self):
        self.model    = None
        self.metadata = {}
        self.loaded   = False

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    def load(self) -> bool:
        """Carrega modelo e metadados do disco."""
        if not EXIT_MODEL_PATH.exists():
            print(f"[ExitModel] Modelo não encontrado: {EXIT_MODEL_PATH}", file=sys.stderr)
            return False
        try:
            with open(EXIT_MODEL_PATH, "rb") as f:
                self.model = pickle.load(f)
            if EXIT_META_PATH.exists():
                with open(EXIT_META_PATH, "r") as f:
                    self.metadata = json.load(f)
            self.loaded = True
            return True
        except Exception as e:
            print(f"[ExitModel] Erro ao carregar: {e}", file=sys.stderr)
            return False

    def save(self, model, metadata: dict) -> None:
        """Salva modelo treinado e metadados."""
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        with open(EXIT_MODEL_PATH, "wb") as f:
            pickle.dump(model, f)
        with open(EXIT_META_PATH, "w") as f:
            json.dump(metadata, f, indent=2)
        print(f"[ExitModel] Modelo salvo em {EXIT_MODEL_PATH}")

    # ── Inferência ─────────────────────────────────────────────────────────────

    def _prepare_features(self, data: dict) -> np.ndarray:
        """Converte dict de features para array numpy na ordem correta."""
        feat_cols = self.metadata.get("feature_cols", EXIT_FEATURE_COLS)
        row = [float(data.get(col, 0) or 0) for col in feat_cols]
        return np.array([row], dtype=float)

    def predict(self, features: dict) -> dict:
        """
        Retorna decisão de saída com confiança.

        Returns
        -------
        dict com:
            decision    : 'HOLD' | 'EXIT' | 'MOVE_STOP'
            confidence  : float 0-1 (probabilidade da classe predita)
            probabilities: dict {HOLD, EXIT, MOVE_STOP}
            source      : 'ML'
        """
        if not self.loaded and not self.load():
            return {
                "decision":   "EXIT",   # fallback conservador: sai se modelo não carregou
                "confidence": 0.0,
                "source":     "FALLBACK",
                "reason":     f"Modelo não disponível em {EXIT_MODEL_PATH}"
            }

        X = self._prepare_features(features)
        proba   = self.model.predict_proba(X)[0]
        pred    = int(np.argmax(proba))
        conf    = float(proba[pred])

        # Mapear índices para labels (respeita a ordem do LabelEncoder usado no treino)
        classes = self.metadata.get("classes", [0, 1, 2])
        proba_dict = {LABEL_MAP.get(int(c), str(c)): float(p) for c, p in zip(classes, proba)}

        return {
            "decision":      LABEL_MAP.get(pred, "EXIT"),
            "confidence":    conf,
            "probabilities": proba_dict,
            "source":        "ML"
        }

    def info(self) -> dict:
        """Retorna metadados do modelo para diagnóstico."""
        if not self.loaded:
            self.load()
        return {
            "model_path":    str(EXIT_MODEL_PATH),
            "model_exists":  EXIT_MODEL_PATH.exists(),
            "metadata":      self.metadata,
            "feature_cols":  EXIT_FEATURE_COLS,
        }


# ── Singleton ─────────────────────────────────────────────────────────────────
_model_instance: ExitDecisionModel | None = None

def get_model() -> ExitDecisionModel:
    global _model_instance
    if _model_instance is None:
        _model_instance = ExitDecisionModel()
    return _model_instance


# ── CLI (chamado pelo TypeScript via stdin) ────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="Exit Decision Model inference")
    parser.add_argument("--action", choices=["predict", "info"], default="predict")
    parser.add_argument("--input",  type=str, help="JSON string com features (alternativo ao stdin)")
    args = parser.parse_args()

    model = get_model()

    if args.action == "info":
        print(json.dumps(model.info()))
        return

    # predict
    raw = args.input or sys.stdin.read()
    if not raw.strip():
        print(json.dumps({"error": "Empty input"}))
        sys.exit(1)

    try:
        features = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"JSON inválido: {e}"}))
        sys.exit(1)

    result = model.predict(features)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
