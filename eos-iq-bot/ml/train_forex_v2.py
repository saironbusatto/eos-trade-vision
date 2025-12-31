"""
EoS IQ ML - Forex Training Pipeline v2
Com features avançadas de Trader Dale, Villahermosa e Kaabar.
"""

import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import precision_score, classification_report
from sklearn.mixture import GaussianMixture
import xgboost as xgb

# Importar features avançadas
import sys
sys.path.insert(0, str(Path(__file__).parent))
from advanced_features import calculate_all_features, calculate_volume_profile

DATA_DIR = Path(__file__).parent.parent / "data"
MODEL_DIR = Path(__file__).parent.parent / "models"
MODEL_DIR.mkdir(exist_ok=True)


def load_and_prepare_data():
    """Carrega dados e calcula features avançadas."""
    df = pd.read_parquet(DATA_DIR / "forex_data.parquet")
    
    # Aplicar features avançadas de Kaabar
    df = calculate_all_features(df)
    
    return df


def train_gmm_regime(df: pd.DataFrame):
    """
    Treina GMM para classificação de regime (Ruiz & Chan).
    Identifica regimes: Trending, Ranging, Volatile.
    """
    print("\n" + "="*60)
    print("   GMM Regime Detection (Ruiz & Chan)")
    print("="*60)
    
    regime_features = ['vol_normalized', 'trend_strength', 'volume_z']
    X_regime = df[regime_features].fillna(0).values
    
    # Treinar GMM com 3 clusters
    gmm = GaussianMixture(n_components=3, random_state=42)
    gmm.fit(X_regime)
    
    df['regime'] = gmm.predict(X_regime)
    
    # Analisar performance por regime
    print("\nWin Rate por Regime:")
    for regime in [0, 1, 2]:
        subset = df[df['regime'] == regime]
        if len(subset) > 0:
            wr = subset['is_win'].mean() * 100
            print(f"  Regime {regime}: {wr:.1f}% ({len(subset)} samples)")
    
    return gmm, df


def train_xgboost_v2(df: pd.DataFrame):
    """
    Treina XGBoost v2 com features avançadas de Kaabar.
    """
    print("\n" + "="*60)
    print("   XGBoost v2 (Kaabar Features)")
    print("="*60)
    
    # Features avançadas
    feature_cols = [
        # Features originais
        'delta', 'delta_cumulative', 'trend', 'momentum', 'volatility',
        # Kaabar features
        'tick_velocity', 'absorption_proxy', 'liquidity_proxy', 
        'price_to_vwap', 'body_ratio',
        # Regime features
        'vol_normalized', 'trend_strength', 'volume_z',
        # Time
        'hour_utc', 'day_of_week'
    ]
    
    feature_cols = [c for c in feature_cols if c in df.columns]
    print(f"Features: {feature_cols}")
    
    X = df[feature_cols].fillna(0)
    y = df['is_win'].values
    
    # Split temporal
    tscv = TimeSeriesSplit(n_splits=5)
    
    model = xgb.XGBClassifier(
        objective='binary:logistic',
        n_estimators=150,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        eval_metric='logloss'
    )
    
    # Cross-validation
    print("\nCross-Validation:")
    cv_results = []
    
    for fold, (train_idx, test_idx) in enumerate(tscv.split(X)):
        X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
        y_train, y_test = y[train_idx], y[test_idx]
        
        model.fit(X_train, y_train)
        y_proba = model.predict_proba(X_test)[:, 1]
        
        for thresh in [0.55, 0.60, 0.65]:
            y_pred = (y_proba >= thresh).astype(int)
            trades = y_pred.sum()
            if trades > 0:
                precision = precision_score(y_test, y_pred, zero_division=0)
                cv_results.append({
                    'fold': fold + 1, 'threshold': thresh,
                    'trades': trades, 'precision': precision
                })
    
    cv_df = pd.DataFrame(cv_results)
    
    print("\nMédia por Threshold:")
    for thresh in [0.55, 0.60, 0.65]:
        subset = cv_df[cv_df['threshold'] == thresh]
        if len(subset) > 0:
            avg_prec = subset['precision'].mean()
            avg_trades = subset['trades'].mean()
            print(f"  {thresh:.0%}: Precision={avg_prec:.1%} | Trades/fold={avg_trades:.0f}")
    
    # Treinar modelo final
    model.fit(X, y)
    
    # Feature importance
    print("\nFeature Importance (top 10):")
    importance = sorted(zip(feature_cols, model.feature_importances_), key=lambda x: -x[1])[:10]
    for name, imp in importance:
        print(f"  {name}: {imp:.3f}")
    
    return model, feature_cols


def main():
    print("="*60)
    print("   EoS IQ ML - Forex Training v2 (Kaabar Method)")
    print("="*60)
    
    # Carregar dados
    df = load_and_prepare_data()
    print(f"\nTotal samples: {len(df)}")
    print(f"WIN: {(df['is_win'] == 1).sum()} | LOSS: {(df['is_win'] == 0).sum()}")
    
    # Treinar GMM
    gmm, df = train_gmm_regime(df)
    
    # Treinar XGBoost v2
    model, feature_cols = train_xgboost_v2(df)
    
    # Salvar modelos
    model_data = {
        'model': model,
        'gmm': gmm,
        'version': 'forex-v2.0-kaabar',
        'threshold': 0.60,
        'features': feature_cols,
    }
    
    output_path = MODEL_DIR / "forex_xgboost_v2.pkl"
    with open(output_path, 'wb') as f:
        pickle.dump(model_data, f)
    
    print(f"\n✅ Modelo v2 salvo: {output_path}")
    
    # Análise de melhores condições
    print("\n" + "="*60)
    print("   Melhores Condições de Trading")
    print("="*60)
    
    # Melhores horários por regime
    for regime in [0, 1, 2]:
        subset = df[df['regime'] == regime]
        if len(subset) > 100:
            best_hours = subset.groupby('hour_utc')['is_win'].mean().nlargest(3)
            print(f"\nRegime {regime} - Melhores horários:")
            for hour, wr in best_hours.items():
                print(f"  {int(hour)}:00 UTC: {wr*100:.1f}%")


if __name__ == "__main__":
    main()
