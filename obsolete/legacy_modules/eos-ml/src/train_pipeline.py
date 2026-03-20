"""
EoS ML - Pipeline Completo
Executa todas as etapas de treinamento em sequência.
"""

import pandas as pd
import numpy as np
import pickle
import json
from pathlib import Path
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import TimeSeriesSplit
from sklearn.mixture import GaussianMixture
from sklearn.metrics import precision_score, roc_auc_score
from statsmodels.tsa.stattools import adfuller
import xgboost as xgb

# Paths
DATA_DIR = Path(__file__).parent.parent / "data"
MODEL_DIR = Path(__file__).parent.parent / "models"

# Importar fracdiff local
from fracdiff import fdiff


def step1_load_data():
    """Carrega dados exportados"""
    print("\n" + "="*50)
    print("STEP 1: Carregando dados")
    print("="*50)
    
    df = pd.read_parquet(DATA_DIR / "signals.parquet")
    print(f"Total: {len(df)} sinais")
    print(f"WIN: {df['is_win'].sum()} | LOSS: {(~df['is_win'].astype(bool)).sum()}")
    
    return df


def step2_find_optimal_d(df):
    """Encontra d ótimo para features de preço"""
    print("\n" + "="*50)
    print("STEP 2: Find Optimal d (ADF)")
    print("="*50)
    
    def find_d(series, max_d=1.0, step=0.1):
        for d in np.arange(0.1, max_d + step, step):
            try:
                if d == 0:
                    diff = series
                else:
                    diff = pd.Series(fdiff(series.values, d))
                diff = diff.replace([np.inf, -np.inf], np.nan).dropna()
                if len(diff) < 20:
                    continue
                result = adfuller(diff, autolag='AIC')
                if result[1] < 0.05:
                    return round(d, 2)
            except:
                continue
        return 0.4  # default
    
    optimal_d = {}
    
    # f_price_context
    if 'f_price_context' in df.columns:
        d = find_d(df['f_price_context'].dropna())
        optimal_d['f_price_context'] = d
        print(f"f_price_context: d = {d}")
    
    # Salvar
    with open(DATA_DIR / "optimal_d.json", 'w') as f:
        json.dump(optimal_d, f)
    
    return optimal_d


def step3_triple_barrier_labeling(df):
    """Aplica Triple Barrier Method"""
    print("\n" + "="*50)
    print("STEP 3: Triple Barrier Labeling")
    print("="*50)
    
    def get_label(row, max_time=45):
        if row['time_to_result_min'] >= max_time:
            return 0  # TIMEOUT = LOSS
        
        entry = row['entry_price']
        exit_price = row['exit_price']
        action = row['action']
        tp = row['take_profit']
        sl = row['stop_loss']
        
        if action == 'BUY':
            if exit_price >= tp:
                return 1
            elif exit_price <= sl:
                return 0
        else:
            if exit_price <= tp:
                return 1
            elif exit_price >= sl:
                return 0
        
        # Profit based
        if action == 'BUY':
            return 1 if exit_price > entry else 0
        else:
            return 1 if exit_price < entry else 0
    
    df['y'] = df.apply(get_label, axis=1)
    
    print(f"WIN (Triple Barrier): {df['y'].sum()}")
    print(f"LOSS: {(~df['y'].astype(bool)).sum()}")
    
    # Salvar
    df.to_parquet(DATA_DIR / "signals_labeled.parquet", index=False)
    
    return df


def step4_feature_engineering(df, optimal_d):
    """Cria X_regime e X_signal"""
    print("\n" + "="*50)
    print("STEP 4: Feature Engineering")
    print("="*50)
    
    # X_regime (GMM)
    regime_features = ['f_volume', 'f_momentum', 'f_trend', 'hour_utc']
    X_regime = df[regime_features].copy()
    
    scaler = StandardScaler()
    X_regime_scaled = pd.DataFrame(
        scaler.fit_transform(X_regime),
        columns=regime_features
    )
    print(f"X_regime: {X_regime_scaled.shape}")
    
    # X_signal (XGBoost) - FracDiff só em preço
    d = optimal_d.get('f_price_context', 0.4)
    df['f_price_context_frac'] = fdiff(df['f_price_context'].values, d)
    
    signal_features = [
        'f_price_context_frac',
        'f_smart_money',
        'f_imbalance',
        'f_absorption',
        'score',
    ]
    X_signal = df[signal_features].fillna(0)
    print(f"X_signal: {X_signal.shape}")
    
    y = df['y'].values
    
    # Salvar
    features = {
        'X_regime': X_regime_scaled,
        'X_signal': X_signal,
        'y': y,
        'scaler_regime': scaler,
        'regime_features': regime_features,
        'signal_features': signal_features,
    }
    
    with open(DATA_DIR / "features.pkl", 'wb') as f:
        pickle.dump(features, f)
    
    return X_regime_scaled, X_signal, y, scaler


def step5_train_gmm(X_regime, y):
    """Treina GMM para regime detection"""
    print("\n" + "="*50)
    print("STEP 5: Train GMM (Regime Detection)")
    print("="*50)
    
    # Encontrar n ótimo
    best_n, best_bic = 2, float('inf')
    for n in range(2, 6):
        gmm = GaussianMixture(n_components=n, random_state=42, n_init=5)
        gmm.fit(X_regime)
        bic = gmm.bic(X_regime)
        if bic < best_bic:
            best_bic = bic
            best_n = n
    
    print(f"Número ótimo de clusters: {best_n}")
    
    # Treinar GMM final
    gmm = GaussianMixture(n_components=best_n, random_state=42, n_init=10)
    gmm.fit(X_regime)
    
    clusters = gmm.predict(X_regime)
    
    # Mapear clusters
    cluster_stats = pd.DataFrame({'cluster': clusters, 'y': y}).groupby('cluster')['y'].mean() * 100
    print("\nWin Rate por Cluster:")
    print(cluster_stats)
    
    bad_clusters = cluster_stats[cluster_stats < 45].index.tolist()
    print(f"Clusters para BLOQUEAR: {bad_clusters}")
    
    # Salvar
    MODEL_DIR.mkdir(exist_ok=True)
    gmm_data = {
        'model': gmm,
        'bad_clusters': bad_clusters,
        'cluster_stats': cluster_stats.to_dict(),
    }
    
    with open(MODEL_DIR / "gmm_regime.pkl", 'wb') as f:
        pickle.dump(gmm_data, f)
    
    print(f"\nGMM salvo em: {MODEL_DIR / 'gmm_regime.pkl'}")
    
    return gmm, bad_clusters


def step6_train_xgboost(X_signal, y):
    """Treina XGBoost com TimeSeriesSplit"""
    print("\n" + "="*50)
    print("STEP 6: Train XGBoost")
    print("="*50)
    
    params = {
        'objective': 'binary:logistic',
        'eval_metric': 'auc',
        'max_depth': 4,
        'learning_rate': 0.1,
        'n_estimators': 100,
        'subsample': 0.8,
        'colsample_bytree': 0.8,
        'random_state': 42,
    }
    
    # Cross-validation temporal
    tscv = TimeSeriesSplit(n_splits=5)
    cv_results = []
    
    for fold, (train_idx, test_idx) in enumerate(tscv.split(X_signal)):
        X_train = X_signal.iloc[train_idx]
        X_test = X_signal.iloc[test_idx]
        y_train, y_test = y[train_idx], y[test_idx]
        
        model = xgb.XGBClassifier(**params)
        model.fit(X_train, y_train, verbose=False)
        
        y_proba = model.predict_proba(X_test)[:, 1]
        y_pred_65 = (y_proba >= 0.65).astype(int)
        
        precision = precision_score(y_test, y_pred_65, zero_division=0)
        auc = roc_auc_score(y_test, y_proba)
        trades = y_pred_65.sum()
        
        cv_results.append({'fold': fold+1, 'precision': precision, 'auc': auc, 'trades': trades})
        print(f"Fold {fold+1}: Precision={precision:.2%} | AUC={auc:.3f} | Trades={trades}")
    
    cv_df = pd.DataFrame(cv_results)
    print(f"\nMédia: Precision={cv_df['precision'].mean():.2%} | AUC={cv_df['auc'].mean():.3f}")
    
    # Treinar modelo final
    final_model = xgb.XGBClassifier(**params)
    final_model.fit(X_signal, y, verbose=False)
    
    # Feature importance
    print("\nFeature Importance:")
    importance = pd.DataFrame({
        'feature': X_signal.columns,
        'importance': final_model.feature_importances_
    }).sort_values('importance', ascending=False)
    print(importance)
    
    # Salvar
    model_data = {
        'model': final_model,
        'threshold': 0.65,
        'features': list(X_signal.columns),
        'cv_results': cv_df.to_dict(),
    }
    
    with open(MODEL_DIR / "xgboost_v1.pkl", 'wb') as f:
        pickle.dump(model_data, f)
    
    print(f"\nXGBoost salvo em: {MODEL_DIR / 'xgboost_v1.pkl'}")
    
    return final_model


def main():
    """Executa pipeline completo"""
    print("\n" + "="*60)
    print("   EoS ML - Pipeline Completo")
    print("="*60)
    
    # Step 1
    df = step1_load_data()
    
    # Step 2
    optimal_d = step2_find_optimal_d(df)
    
    # Step 3
    df = step3_triple_barrier_labeling(df)
    
    # Step 4
    X_regime, X_signal, y, scaler = step4_feature_engineering(df, optimal_d)
    
    # Step 5
    gmm, bad_clusters = step5_train_gmm(X_regime, y)
    
    # Step 6
    xgb_model = step6_train_xgboost(X_signal, y)
    
    print("\n" + "="*60)
    print("   ✅ Pipeline Concluído!")
    print("="*60)
    print(f"\nModelos salvos em: {MODEL_DIR}")
    print("- gmm_regime.pkl")
    print("- xgboost_v1.pkl")


if __name__ == "__main__":
    main()
