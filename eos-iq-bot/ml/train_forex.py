"""
EoS IQ ML - Forex Training Pipeline
Treina modelo XGBoost para Forex usando dados históricos.
"""

import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import precision_score, classification_report
import xgboost as xgb

DATA_DIR = Path(__file__).parent.parent / "data"
MODEL_DIR = Path(__file__).parent.parent / "models"
MODEL_DIR.mkdir(exist_ok=True)


def train_forex_model():
    print("="*60)
    print("   EoS IQ ML - Forex Training Pipeline")
    print("="*60)
    
    # Carregar dados
    df = pd.read_parquet(DATA_DIR / "forex_data.parquet")
    print(f"\n📊 Total samples: {len(df)}")
    print(f"   Pares: {df['pair'].unique()}")
    
    # Features
    feature_cols = [
        'delta', 'delta_cumulative', 'trend', 'momentum', 
        'volatility', 'volume_ratio', 'hour_utc', 'day_of_week'
    ]
    
    # Filtrar apenas colunas existentes
    feature_cols = [c for c in feature_cols if c in df.columns]
    print(f"   Features: {feature_cols}")
    
    X = df[feature_cols].fillna(0)
    y = df['is_win'].values
    
    print(f"\n   WIN: {(y == 1).sum()} ({(y == 1).mean()*100:.1f}%)")
    print(f"   LOSS: {(y == 0).sum()} ({(y == 0).mean()*100:.1f}%)")
    
    # Split temporal
    tscv = TimeSeriesSplit(n_splits=5)
    
    # Modelo XGBoost
    model = xgb.XGBClassifier(
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
    
    # Cross-validation
    print("\n" + "="*60)
    print("   Cross-Validation")
    print("="*60)
    
    cv_results = []
    
    for fold, (train_idx, test_idx) in enumerate(tscv.split(X)):
        X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
        y_train, y_test = y[train_idx], y[test_idx]
        
        model.fit(X_train, y_train)
        
        # Predições
        y_proba = model.predict_proba(X_test)[:, 1]
        
        for thresh in [0.55, 0.60, 0.65, 0.70]:
            y_pred = (y_proba >= thresh).astype(int)
            trades = y_pred.sum()
            
            if trades > 0:
                precision = precision_score(y_test, y_pred, zero_division=0)
                cv_results.append({
                    'fold': fold + 1,
                    'threshold': thresh,
                    'trades': trades,
                    'precision': precision
                })
    
    cv_df = pd.DataFrame(cv_results)
    
    # Resumo por threshold
    print("\nMédia por Threshold:")
    for thresh in [0.55, 0.60, 0.65, 0.70]:
        subset = cv_df[cv_df['threshold'] == thresh]
        if len(subset) > 0:
            avg_prec = subset['precision'].mean()
            avg_trades = subset['trades'].mean()
            print(f"  {thresh:.0%}: Precision={avg_prec:.1%} | Trades/fold={avg_trades:.0f}")
    
    # Treinar modelo final
    print("\n" + "="*60)
    print("   Training Final Model")
    print("="*60)
    
    model.fit(X, y)
    
    # Importância das features
    print("\nFeature Importance:")
    for name, imp in sorted(zip(feature_cols, model.feature_importances_), key=lambda x: -x[1]):
        print(f"  {name}: {imp:.3f}")
    
    # Salvar
    threshold = 0.60  # Escolher melhor threshold
    
    model_data = {
        'model': model,
        'version': 'forex-v1.0',
        'threshold': threshold,
        'features': feature_cols,
    }
    
    output_path = MODEL_DIR / "forex_xgboost_v1.pkl"
    with open(output_path, 'wb') as f:
        pickle.dump(model_data, f)
    
    print(f"\n✅ Modelo salvo: {output_path}")
    
    # Análise por par
    print("\n" + "="*60)
    print("   Win Rate por Par (histórico)")
    print("="*60)
    
    for pair in df['pair'].unique():
        subset = df[df['pair'] == pair]
        wr = subset['is_win'].mean() * 100
        print(f"  {pair}: {wr:.1f}% ({len(subset)} samples)")
    
    # Análise por hora
    print("\n" + "="*60)
    print("   Win Rate por Hora UTC (top 5)")
    print("="*60)
    
    hour_wr = df.groupby('hour_utc')['is_win'].agg(['mean', 'count'])
    hour_wr.columns = ['win_rate', 'count']
    hour_wr = hour_wr.sort_values('win_rate', ascending=False).head(5)
    
    for hour, row in hour_wr.iterrows():
        print(f"  {hour}:00 UTC: {row['win_rate']*100:.1f}% ({row['count']} samples)")
    
    return model


if __name__ == "__main__":
    train_forex_model()
