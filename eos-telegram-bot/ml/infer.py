# ML Pipeline para EOS Crypto Bot
# infer.py - Inferência em produção

"""
Aplica modelos treinados para filtrar sinais em tempo real.

Pipeline de decisão:
1. Carregar modelos (direction + gate)
2. Preparar features do sinal atual
3. Gating model: P(trade) > threshold?
4. Direction model: LONG ou SHORT?
5. Score >= min_score?
6. Decisão final
"""

import json
import os
import pickle
from pathlib import Path
from typing import Any

import numpy as np


def resolve_model_dir() -> Path:
    script_dir = Path(__file__).resolve().parent
    candidates = [
        os.getenv("ML_MODEL_DIR"),
        "/app/data/ml/models",
        str(script_dir.parent / "data" / "ml" / "models"),
    ]

    required = [
        "direction_model.pkl",
        "direction_metadata.json",
        "gate_model.pkl",
        "gate_metadata.json",
    ]

    for candidate in candidates:
        if not candidate:
            continue
        path = Path(candidate)
        if all((path / filename).exists() for filename in required):
            return path

    # Mantem fallback previsivel mesmo sem validar arquivos
    return Path(candidates[1])


MODEL_DIR = resolve_model_dir()


class MLInferenceEngine:
    """Engine de inferência ML para filtrar sinais."""

    def __init__(self):
        self.direction_model = None
        self.gate_model = None
        self.direction_metadata = None
        self.gate_metadata = None
        self.is_loaded = False

    def load_models(self) -> bool:
        """Carrega modelos treinados."""
        try:
            with open(MODEL_DIR / "direction_model.pkl", "rb") as f:
                self.direction_model = pickle.load(f)
            with open(MODEL_DIR / "direction_metadata.json", "r", encoding="utf-8") as f:
                self.direction_metadata = json.load(f)

            with open(MODEL_DIR / "gate_model.pkl", "rb") as f:
                self.gate_model = pickle.load(f)
            with open(MODEL_DIR / "gate_metadata.json", "r", encoding="utf-8") as f:
                self.gate_metadata = json.load(f)

            # Compatibilidade entre versoes do XGBoost:
            # modelos serializados em uma versao podem ficar sem atributos
            # esperados por outra versao durante predict/predict_proba.
            for model in (self.direction_model, self.gate_model):
                self._patch_xgb_compat(model)

            self.is_loaded = True
            return True
        except FileNotFoundError as e:
            print(
                f"[ML] Erro: Modelos não encontrados em {MODEL_DIR}. "
                f"Defina ML_MODEL_DIR se necessário. {e}"
            )
            return False
        except Exception as e:
            print(f"[ML] Erro ao carregar modelos: {e}")
            return False

    def _patch_xgb_compat(self, model: Any) -> None:
        if model is None:
            return

        name = type(model).__name__.lower()
        if "xgb" not in name:
            return

        # Tenta copiar atributos default de uma instancia "limpa" da mesma classe
        # para cobrir diferencas entre versoes.
        try:
            template = model.__class__()
            for attr, value in vars(template).items():
                if not hasattr(model, attr):
                    setattr(model, attr, value)
        except Exception:
            # Se falhar, seguimos com patch manual minimo.
            pass

        # Fallbacks explicitos para atributos frequentes em erros de compatibilidade.
        if not hasattr(model, "use_label_encoder"):
            setattr(model, "use_label_encoder", False)
        if not hasattr(model, "gpu_id"):
            setattr(model, "gpu_id", -1)

    def prepare_features(self, signal_data: dict[str, Any]) -> np.ndarray:
        """
        Prepara features para inferência.

        Expected keys:
            f_smart_money, f_price_context, f_imbalance, f_absorption,
            f_trend, f_momentum, f_volume, score, hour_utc, day_of_week,
            volume_ratio, trend, momentum, price_change_24h
        """
        feature_cols = self.direction_metadata["feature_cols"]

        hour = float(signal_data.get("hour_utc", 12))
        dow = float(signal_data.get("day_of_week", 3))

        signal_data["hour_sin"] = np.sin(2 * np.pi * hour / 24)
        signal_data["hour_cos"] = np.cos(2 * np.pi * hour / 24)
        signal_data["dow_sin"] = np.sin(2 * np.pi * dow / 7)
        signal_data["dow_cos"] = np.cos(2 * np.pi * dow / 7)

        features = []
        for col in feature_cols:
            val = signal_data.get(col, 0)
            features.append(val if val is not None else 0)

        return np.array([features], dtype=float)

    def validate_features(self, signal_data: dict[str, Any]) -> list[str]:
        """Valida se todas as features necessárias estão presentes."""
        if not self.is_loaded and not self.load_models():
            return []

        missing: list[str] = []
        required = self.direction_metadata.get("feature_cols", [])

        for feat in required:
            if feat in ["hour_sin", "hour_cos", "dow_sin", "dow_cos"]:
                continue
            if feat not in signal_data:
                missing.append(feat)

        return missing

    def predict(self, signal_data: dict[str, Any], min_score: int = 70) -> dict[str, Any]:
        """Prediz se deve executar o trade."""
        if not self.is_loaded and not self.load_models():
            return {
                "should_trade": False,
                "direction": "NO-TRADE",
                "confidence": 0.0,
                "reasons": [f"Modelos ML não carregados em {MODEL_DIR}"],
            }

        reasons: list[str] = []
        X = self.prepare_features(signal_data)

        score = float(signal_data.get("score", 0))
        score_check = score >= min_score
        if not score_check:
            reasons.append(f"Score {score:.0f} < {min_score}")

        gate_threshold = float(self.gate_metadata.get("optimal_threshold", 0.5))
        gate_proba = float(self.gate_model.predict_proba(X)[0][1])
        gate_pass = gate_proba >= gate_threshold

        if not gate_pass:
            reasons.append(f"Gate P(trade)={gate_proba:.2f} < {gate_threshold:.2f}")

        direction_proba = self.direction_model.predict_proba(X)[0]
        direction_pred = int(self.direction_model.predict(X)[0])

        direction_map = {0: "SHORT", 1: "NO-TRADE", 2: "LONG"}
        direction = direction_map.get(direction_pred, "NO-TRADE")

        direction_probs = {
            "SHORT": float(direction_proba[0]),
            "NO_TRADE": float(direction_proba[1]),
            "LONG": float(direction_proba[2]),
        }

        confidence = float(max(direction_proba))
        if direction == "NO-TRADE":
            reasons.append("Direction model sugere NO-TRADE")

        should_trade = bool(score_check and gate_pass and (direction != "NO-TRADE"))
        if should_trade:
            reasons.append(f"Trade aprovado: {direction} com {confidence:.1%} confiança")

        return {
            "should_trade": should_trade,
            "direction": direction,
            "confidence": confidence,
            "gate_probability": gate_proba,
            "direction_probabilities": direction_probs,
            "score_check": bool(score_check),
            "gate_check": bool(gate_pass),
            "reasons": reasons,
        }


ml_engine = MLInferenceEngine()


def should_execute_trade(signal_data: dict[str, Any], min_score: int = 70) -> dict[str, Any]:
    return ml_engine.predict(signal_data, min_score)


if __name__ == "__main__":
    import sys

    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            print(json.dumps({"error": "Empty input"}))
            sys.exit(1)

        signal_data = json.loads(input_data)
        missing_features = ml_engine.validate_features(signal_data)
        if missing_features:
            print(
                json.dumps(
                    {
                        "should_trade": False,
                        "direction": "NO-TRADE",
                        "confidence": 0.0,
                        "reasons": [f"Missing features: {missing_features}"],
                    }
                )
            )
            sys.exit(0)

        min_score = int(signal_data.get("min_score", 70))
        result = ml_engine.predict(signal_data, min_score)
        print(json.dumps(result))
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON input"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
