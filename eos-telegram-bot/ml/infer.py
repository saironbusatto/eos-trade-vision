# ML Pipeline para EOS Crypto Bot
# infer.py - Inferência em produção

"""
Aplica modelos treinados para filtrar sinais em tempo real.

Pipeline de decisão:
1. Carregar modelos (direction + gate)
2. Preparar features do sinal atual
3. Gating model: P(trade) > threshold?
4. Direction model: LONG ou SHORT?
5. Score >= 70?
6. Decisão final

Saída: { should_trade: bool, direction: str, confidence: float, reasons: [] }
"""

import json
import pickle
import numpy as np
from pathlib import Path

MODEL_DIR = '/app/data/ml/models'

class MLInferenceEngine:
    """Engine de inferência ML para filtrar sinais"""
    
    def __init__(self):
        self.direction_model = None
        self.gate_model = None
        self.direction_metadata = None
        self.gate_metadata = None
        self.is_loaded = False
    
    def load_models(self):
        """Carrega modelos treinados"""
        try:
            # Direction model
            with open(f'{MODEL_DIR}/direction_model.pkl', 'rb') as f:
                self.direction_model = pickle.load(f)
            with open(f'{MODEL_DIR}/direction_metadata.json', 'r') as f:
                self.direction_metadata = json.load(f)
            
            # Gate model
            with open(f'{MODEL_DIR}/gate_model.pkl', 'rb') as f:
                self.gate_model = pickle.load(f)
            with open(f'{MODEL_DIR}/gate_metadata.json', 'r') as f:
                self.gate_metadata = json.load(f)
            
            self.is_loaded = True
            print("[ML] Modelos carregados com sucesso")
            return True
            
        except FileNotFoundError as e:
            print(f"[ML] Erro: Modelos não encontrados. Execute o treinamento primeiro. {e}")
            return False
        except Exception as e:
            print(f"[ML] Erro ao carregar modelos: {e}")
            return False
    
    def prepare_features(self, signal_data: dict) -> np.ndarray:
        """
        Prepara features para inferência.
        
        Args:
            signal_data: dict com as features do sinal
            
        Expected keys:
            f_smart_money, f_price_context, f_imbalance, f_absorption,
            f_trend, f_momentum, f_volume, score, hour_utc, day_of_week,
            volume_ratio, trend, momentum, price_change_24h
        """
        feature_cols = self.direction_metadata['feature_cols']
        
        # Codificar features cíclicas
        hour = signal_data.get('hour_utc', 12)
        dow = signal_data.get('day_of_week', 3)
        
        signal_data['hour_sin'] = np.sin(2 * np.pi * hour / 24)
        signal_data['hour_cos'] = np.cos(2 * np.pi * hour / 24)
        signal_data['dow_sin'] = np.sin(2 * np.pi * dow / 7)
        signal_data['dow_cos'] = np.cos(2 * np.pi * dow / 7)
        
        # Extrair features na ordem correta
        features = []
        for col in feature_cols:
            val = signal_data.get(col, 0)
            features.append(val if val is not None else 0)
        
        return np.array([features])
    
    def predict(self, signal_data: dict, min_score: int = 70) -> dict:
        """
        Prediz se deve executar o trade.
        
        Returns:
            {
                'should_trade': bool,
                'direction': 'LONG' | 'SHORT' | 'NO-TRADE',
                'confidence': float,
                'gate_probability': float,
                'direction_probabilities': {LONG: float, SHORT: float, NO_TRADE: float},
                'reasons': [str],
                'score_check': bool
            }
        """
        if not self.is_loaded:
            if not self.load_models():
                return {
                    'should_trade': False,
                    'direction': 'NO-TRADE',
                    'confidence': 0,
                    'reasons': ['Modelos ML não carregados']
                }
        
        reasons = []
        X = self.prepare_features(signal_data)
        
        # 1. Score check (regra fixa)
        score = signal_data.get('score', 0)
        score_check = score >= min_score
        if not score_check:
            reasons.append(f'Score {score} < {min_score}')
        
        # 2. Gating model
        gate_threshold = self.gate_metadata.get('optimal_threshold', 0.5)
        gate_proba = self.gate_model.predict_proba(X)[0][1]
        gate_pass = gate_proba >= gate_threshold
        
        if not gate_pass:
            reasons.append(f'Gate P(trade)={gate_proba:.2f} < {gate_threshold:.2f}')
        
        # 3. Direction model
        direction_proba = self.direction_model.predict_proba(X)[0]
        direction_pred = self.direction_model.predict(X)[0]
        
        # Mapear de volta: 0=SHORT, 1=NO-TRADE, 2=LONG
        direction_map = {0: 'SHORT', 1: 'NO-TRADE', 2: 'LONG'}
        direction = direction_map[direction_pred]
        
        direction_probs = {
            'SHORT': direction_proba[0],
            'NO_TRADE': direction_proba[1],
            'LONG': direction_proba[2]
        }
        
        # Confiança = probabilidade da classe escolhida
        confidence = max(direction_proba)
        
        if direction == 'NO-TRADE':
            reasons.append('Direction model sugere NO-TRADE')
        
        # 4. Decisão final (todos os filtros passaram)
        should_trade = score_check and gate_pass and (direction != 'NO-TRADE')
        
        if should_trade:
            reasons.append(f'✅ Trade aprovado: {direction} com {confidence:.1%} confiança')
        
        return {
            'should_trade': should_trade,
            'direction': direction,
            'confidence': confidence,
            'gate_probability': gate_proba,
            'direction_probabilities': direction_probs,
            'score_check': score_check,
            'gate_check': gate_pass,
            'reasons': reasons
        }


# Singleton para uso global
ml_engine = MLInferenceEngine()


def should_execute_trade(signal_data: dict, min_score: int = 70) -> dict:
    """
    Função helper para chamar do código principal.
    
    Uso:
        from ml.infer import should_execute_trade
        
        result = should_execute_trade({
            'f_smart_money': 0.7,
            'f_trend': 0.5,
            'f_momentum': 0.3,
            'f_volume': 0.8,
            'f_imbalance': 0.4,
            'f_absorption': 0.6,
            'score': 75,
            'hour_utc': 14,
            'day_of_week': 2
        })
        
        if result['should_trade']:
            execute_trade(result['direction'])
    """
    return ml_engine.predict(signal_data, min_score)


    def validate_features(self, signal_data: dict) -> list:
        """Valida se todas as features necessárias estão presentes"""
        if not self.is_loaded:
            self.load_models()
        
        missing = []
        if self.direction_metadata:
            required = self.direction_metadata.get('feature_cols', [])
            for feat in required:
                if feat not in signal_data and feat not in ['hour_sin', 'hour_cos', 'dow_sin', 'dow_cos']:
                    # Features cíclicas são geradas internamente, as outras devem vir no payload
                    missing.append(feat)
        return missing

if __name__ == '__main__':
    import sys
    
    # Modo CLI: Lê JSON do stdin e imprime JSON no stdout
    try:
        # Ler entrada (pode ser multiline ou single line)
        input_data = sys.stdin.read()
        if not input_data.strip():
            print(json.dumps({"error": "Empty input"}))
            sys.exit(1)
            
        signal_data = json.loads(input_data)
        
        # Validar features
        missing_features = ml_engine.validate_features(signal_data)
        if missing_features:
            print(json.dumps({
                "should_trade": False, 
                "direction": "NO-TRADE", 
                "confidence": 0,
                "reasons": [f"Missing features: {missing_features}"]
            }))
            sys.exit(0)
            
        # Executar predição
        # Nota: min_score pode vir no payload ou ser padrão
        min_score = signal_data.get('min_score', 70)
        result = ml_engine.predict(signal_data, min_score)
        
        # Output JSON puro
        print(json.dumps(result))
        
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON input"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
