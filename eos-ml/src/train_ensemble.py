"""
EoS ML v3.0 - Ensemble Strategy
Implementa votação entre múltiplos modelos + Cross-validation.
"""

import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.model_selection import TimeSeriesSplit, cross_val_score
from sklearn.ensemble import VotingClassifier, RandomForestClassifier, GradientBoostingClassifier
from sklearn.metrics import precision_score, make_scorer
import xgboost as xgb
import lightgbm as lgb

# Paths
DATA_DIR = Path(__file__).parent.parent / "data"
MODEL_DIR = Path(__file__).parent.parent / "models"


def create_ensemble():
    """
    Cria ensemble de 4 modelos com votação suave (probabilidades).
    
    Modelos:
    1. XGBoost - Gradient boosting otimizado
    2. LightGBM - Rápido e eficiente
    3. Random Forest - Robusto a overfitting
    4. Gradient Boosting - Sklearn tradicional
    """
    
    # XGBoost
    xgb_model = xgb.XGBClassifier(
        objective='binary:logistic',
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        use_label_encoder=False,
        eval_metric='logloss'
    )
    
    # LightGBM
    lgb_model = lgb.LGBMClassifier(
        objective='binary',
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        verbose=-1
    )
    
    # Random Forest
    rf_model = RandomForestClassifier(
        n_estimators=100,
        max_depth=6,
        min_samples_split=10,
        random_state=42
    )
    
    # Gradient Boosting (sklearn)
    gb_model = GradientBoostingClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        random_state=42
    )
    
    # Voting Classifier - soft voting (usa probabilidades)
    ensemble = VotingClassifier(
        estimators=[
            ('xgb', xgb_model),
            ('lgb', lgb_model),
            ('rf', rf_model),
            ('gb', gb_model)
        ],
        voting='soft',  # Usa predict_proba
        weights=[2, 2, 1, 1]  # XGB e LGB têm peso maior
    )
    
    return ensemble


def train_with_cross_validation():
    """
    Treina ensemble com TimeSeriesSplit cross-validation.
    """
    print("="*60)
    print("   EoS ML v3.0 - Ensemble Training")
    print("="*60)
    
    # Carregar dados
    df = pd.read_parquet(DATA_DIR / "signals.parquet")
    print(f"\nTotal sinais: {len(df)}")
    
    # Preparar features (sem FracDiff nas discretas)
    X = df[[
        'f_price_context',
        'f_smart_money',
        'f_imbalance',
        'f_absorption',
        'f_trend',
        'f_momentum',
        'f_volume',
        'score'
    ]].fillna(0)
    
    y = df['is_win'].values
    
    print(f"Features: {list(X.columns)}")
    print(f"Target: {y.sum()} WIN / {(~y.astype(bool)).sum()} LOSS")
    
    # Criar ensemble
    ensemble = create_ensemble()
    
    # Cross-validation temporal
    tscv = TimeSeriesSplit(n_splits=5)
    
    # Scorer customizado para Precision
    precision_scorer = make_scorer(precision_score, zero_division=0)
    
    print("\n" + "="*60)
    print("   Cross-Validation (TimeSeriesSplit)")
    print("="*60)
    
    cv_results = []
    
    for fold, (train_idx, test_idx) in enumerate(tscv.split(X)):
        X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
        y_train, y_test = y[train_idx], y[test_idx]
        
        # Treinar
        ensemble.fit(X_train, y_train)
        
        # Predições com threshold 70%
        y_proba = ensemble.predict_proba(X_test)[:, 1]
        y_pred_70 = (y_proba >= 0.70).astype(int)
        
        # Métricas
        trades = y_pred_70.sum()
        if trades > 0:
            wins = ((y_test == 1) & (y_pred_70 == 1)).sum()
            precision = wins / trades
        else:
            wins = 0
            precision = 0
        
        cv_results.append({
            'fold': fold + 1,
            'precision': precision,
            'trades': trades,
            'wins': wins
        })
        
        print(f"Fold {fold+1}: Precision={precision:.1%} | Trades={trades} | Wins={wins}")
    
    cv_df = pd.DataFrame(cv_results)
    avg_precision = cv_df['precision'].mean()
    
    print(f"\n📊 Precision Média (threshold 70%): {avg_precision:.1%}")
    
    # Treinar modelo final com todos os dados
    print("\n" + "="*60)
    print("   Training Final Model")
    print("="*60)
    
    ensemble.fit(X, y)
    
    # Testar diferentes thresholds
    y_proba_all = ensemble.predict_proba(X)[:, 1]
    
    print("\nAnálise de Thresholds:")
    for thresh in [0.60, 0.65, 0.70, 0.75, 0.80]:
        y_pred = (y_proba_all >= thresh).astype(int)
        trades = y_pred.sum()
        if trades > 0:
            wins = ((y == 1) & (y_pred == 1)).sum()
            precision = wins / trades
            print(f"  {thresh:.0%}: {trades} trades | Precision={precision:.1%}")
    
    # Salvar modelo
    MODEL_DIR.mkdir(exist_ok=True)
    
    model_data = {
        'model': ensemble,
        'version': 'v3.0-ensemble',
        'threshold': 0.70,
        'features': list(X.columns),
        'cv_results': cv_df.to_dict(),
        'avg_precision': avg_precision
    }
    
    with open(MODEL_DIR / "ensemble_v3.pkl", 'wb') as f:
        pickle.dump(model_data, f)
    
    print(f"\n✅ Modelo salvo: {MODEL_DIR / 'ensemble_v3.pkl'}")
    
    return ensemble, avg_precision


if __name__ == "__main__":
    train_with_cross_validation()
