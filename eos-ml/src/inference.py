"""
EoS ML - Inference
Script para fazer inferência usando os modelos treinados.
Pode ser integrado ao bot para filtrar sinais.
"""

import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.preprocessing import StandardScaler

# Paths
MODEL_DIR = Path(__file__).parent.parent / "models"
DATA_DIR = Path(__file__).parent.parent / "data"


class EoSMLPredictor:
    """
    Classe para fazer predições usando GMM + XGBoost.
    
    Pipeline:
    1. GMM verifica se o regime é "bom"
    2. XGBoost prediz probabilidade de WIN
    3. Se prob >= threshold: EXECUTE
    """
    
    def __init__(self, threshold=0.55):
        """
        Args:
            threshold: Probabilidade mínima para aprovar sinal (default 0.55)
        """
        self.threshold = threshold
        self.gmm = None
        self.xgb = None
        self.scaler = None
        self.bad_clusters = []
        
        self._load_models()
    
    def _load_models(self):
        """Carrega modelos treinados"""
        # GMM
        gmm_path = MODEL_DIR / "gmm_regime.pkl"
        if gmm_path.exists():
            data = pickle.load(open(gmm_path, 'rb'))
            self.gmm = data['model']
            self.bad_clusters = data.get('bad_clusters', [])
            print(f"✅ GMM carregado | Bad clusters: {self.bad_clusters}")
        else:
            print("⚠️ GMM não encontrado")
        
        # XGBoost
        xgb_path = MODEL_DIR / "xgboost_v1.pkl"
        if xgb_path.exists():
            data = pickle.load(open(xgb_path, 'rb'))
            self.xgb = data['model']
            self.features = data['features']
            print(f"✅ XGBoost carregado | Features: {self.features}")
        else:
            print("⚠️ XGBoost não encontrado")
        
        # Scaler para GMM
        features_path = DATA_DIR / "features.pkl"
        if features_path.exists():
            data = pickle.load(open(features_path, 'rb'))
            self.scaler = data.get('scaler_regime')
            self.regime_features = data.get('regime_features', [])
            print(f"✅ Scaler carregado")
    
    def check_regime(self, signal: dict) -> tuple:
        """
        Verifica se o regime atual é favorável.
        
        Args:
            signal: Dict com features de regime (f_volume, f_momentum, f_trend, hour_utc)
        
        Returns:
            (is_good_regime, cluster_id)
        """
        if self.gmm is None or self.scaler is None:
            return True, -1  # Skip regime check
        
        # Preparar features
        regime_data = pd.DataFrame([{
            'f_volume': signal.get('f_volume', 0.5),
            'f_momentum': signal.get('f_momentum', 0.5),
            'f_trend': signal.get('f_trend', 0.5),
            'hour_utc': signal.get('hour_utc', 12),
        }])
        
        # Normalizar
        regime_scaled = self.scaler.transform(regime_data)
        
        # Predizer cluster
        cluster = self.gmm.predict(regime_scaled)[0]
        
        # Verificar se é cluster ruim
        is_good = cluster not in self.bad_clusters
        
        return is_good, cluster
    
    def predict(self, signal: dict) -> dict:
        """
        Prediz se o sinal deve ser executado.
        
        Args:
            signal: Dict com todas as features do sinal
        
        Returns:
            {
                'should_execute': bool,
                'probability': float,
                'regime_ok': bool,
                'cluster': int,
                'reason': str
            }
        """
        result = {
            'should_execute': False,
            'probability': 0.0,
            'regime_ok': True,
            'cluster': -1,
            'reason': ''
        }
        
        # Step 1: Check regime
        regime_ok, cluster = self.check_regime(signal)
        result['regime_ok'] = regime_ok
        result['cluster'] = cluster
        
        if not regime_ok:
            result['reason'] = f"Regime ruim (cluster {cluster})"
            return result
        
        # Step 2: XGBoost prediction
        if self.xgb is None:
            result['should_execute'] = True
            result['reason'] = "XGBoost não disponível - aprovado por default"
            return result
        
        # Preparar features (sem FracDiff por enquanto)
        signal_data = pd.DataFrame([{
            'f_price_context_frac': signal.get('f_price_context', 0.5),
            'f_smart_money': signal.get('f_smart_money', 0.5),
            'f_imbalance': signal.get('f_imbalance', 0.5),
            'f_absorption': signal.get('f_absorption', 0.5),
            'score': signal.get('score', 50),
        }])
        
        # Predizer probabilidade
        prob = self.xgb.predict_proba(signal_data)[0][1]
        result['probability'] = prob
        
        # Aplicar threshold
        if prob >= self.threshold:
            result['should_execute'] = True
            result['reason'] = f"Aprovado (prob={prob:.1%})"
        else:
            result['reason'] = f"Rejeitado (prob={prob:.1%} < {self.threshold:.0%})"
        
        return result


def test_predictor():
    """Testa o predictor com dados de exemplo"""
    print("\n" + "="*50)
    print("   EoS ML - Teste de Inferência")
    print("="*50)
    
    predictor = EoSMLPredictor(threshold=0.55)
    
    # Teste com sinal bom
    good_signal = {
        'f_volume': 0.8,
        'f_momentum': 0.7,
        'f_trend': 0.6,
        'f_price_context': 0.7,
        'f_smart_money': 0.8,
        'f_imbalance': 0.6,
        'f_absorption': 0.5,
        'score': 75,
        'hour_utc': 14,
    }
    
    print("\n📊 Sinal de teste (score alto):")
    result = predictor.predict(good_signal)
    print(f"   Regime OK: {result['regime_ok']} (cluster {result['cluster']})")
    print(f"   Prob WIN: {result['probability']:.1%}")
    print(f"   Executar: {'✅' if result['should_execute'] else '❌'} - {result['reason']}")
    
    # Teste com sinal ruim
    bad_signal = {
        'f_volume': 0.3,
        'f_momentum': 0.4,
        'f_trend': 0.5,
        'f_price_context': 0.3,
        'f_smart_money': 0.2,
        'f_imbalance': 0.1,
        'f_absorption': 0.2,
        'score': 42,
        'hour_utc': 3,
    }
    
    print("\n📊 Sinal de teste (score baixo):")
    result = predictor.predict(bad_signal)
    print(f"   Regime OK: {result['regime_ok']} (cluster {result['cluster']})")
    print(f"   Prob WIN: {result['probability']:.1%}")
    print(f"   Executar: {'✅' if result['should_execute'] else '❌'} - {result['reason']}")


if __name__ == "__main__":
    test_predictor()
