"""
EoS ML - API Server
Servidor Flask para servir predições do modelo ML.
"""

from flask import Flask, request, jsonify
import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.preprocessing import StandardScaler

# Paths
MODEL_DIR = Path(__file__).parent.parent / "models"
DATA_DIR = Path(__file__).parent.parent / "data"

app = Flask(__name__)

# Carregar modelos na inicialização
gmm_data = None
xgb_data = None
scaler = None
bad_clusters = []

def load_models():
    global gmm_data, xgb_data, scaler, bad_clusters
    
    # GMM
    gmm_path = MODEL_DIR / "gmm_regime.pkl"
    if gmm_path.exists():
        gmm_data = pickle.load(open(gmm_path, 'rb'))
        bad_clusters = gmm_data.get('bad_clusters', [])
        print(f"✅ GMM carregado | Bad clusters: {bad_clusters}")
    
    # XGBoost
    xgb_path = MODEL_DIR / "xgboost_v1.pkl"
    if xgb_path.exists():
        xgb_data = pickle.load(open(xgb_path, 'rb'))
        print(f"✅ XGBoost carregado")
    
    # Scaler
    features_path = DATA_DIR / "features.pkl"
    if features_path.exists():
        data = pickle.load(open(features_path, 'rb'))
        scaler = data.get('scaler_regime')
        print(f"✅ Scaler carregado")


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'gmm': gmm_data is not None,
        'xgb': xgb_data is not None,
    })


@app.route('/predict', methods=['POST'])
def predict():
    """
    Endpoint para predição.
    
    Body JSON:
    {
        "f_volume": 0.5,
        "f_momentum": 0.5,
        "f_trend": 0.5,
        "f_price_context": 0.5,
        "f_smart_money": 0.5,
        "f_imbalance": 0.5,
        "f_absorption": 0.5,
        "score": 50,
        "hour_utc": 12
    }
    
    Response:
    {
        "should_execute": true,
        "probability": 0.65,
        "regime_ok": true,
        "cluster": 2,
        "reason": "Aprovado (prob=65%)"
    }
    """
    try:
        data = request.json
        
        result = {
            'should_execute': True,
            'probability': 0.5,
            'regime_ok': True,
            'cluster': -1,
            'reason': ''
        }
        
        # Step 1: Check regime (GMM)
        if gmm_data and scaler:
            regime_features = pd.DataFrame([{
                'f_volume': data.get('f_volume', 0.5),
                'f_momentum': data.get('f_momentum', 0.5),
                'f_trend': data.get('f_trend', 0.5),
                'hour_utc': data.get('hour_utc', 12),
            }])
            
            regime_scaled = scaler.transform(regime_features)
            cluster = gmm_data['model'].predict(regime_scaled)[0]
            result['cluster'] = int(cluster)
            
            if cluster in bad_clusters:
                result['regime_ok'] = False
                result['should_execute'] = False
                result['reason'] = f"Regime ruim (cluster {cluster})"
                return jsonify(result)
        
        # Step 2: XGBoost prediction
        if xgb_data:
            signal_features = pd.DataFrame([{
                'f_price_context_frac': data.get('f_price_context', 0.5),
                'f_smart_money': data.get('f_smart_money', 0.5),
                'f_imbalance': data.get('f_imbalance', 0.5),
                'f_absorption': data.get('f_absorption', 0.5),
                'score': data.get('score', 50),
            }])
            
            prob = xgb_data['model'].predict_proba(signal_features)[0][1]
            result['probability'] = float(prob)
            
            threshold = xgb_data.get('threshold', 0.55)
            
            if prob >= threshold:
                result['should_execute'] = True
                result['reason'] = f"Aprovado (prob={prob:.1%})"
            else:
                result['should_execute'] = False
                result['reason'] = f"Rejeitado (prob={prob:.1%} < {threshold:.0%})"
        else:
            result['reason'] = "ML não disponível - aprovado por default"
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'error': str(e),
            'should_execute': True,  # Fallback
            'reason': f'Erro: {e}'
        }), 500


if __name__ == '__main__':
    load_models()
    print("\n🚀 EoS ML API Server")
    print("   http://localhost:5000/health")
    print("   http://localhost:5000/predict")
    app.run(host='0.0.0.0', port=5000, debug=False)
