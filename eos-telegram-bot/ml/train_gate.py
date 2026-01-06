# ML Pipeline para EOS Crypto Bot
# train_gate.py - Treina modelo binário (TRADE vs NO-TRADE)

"""
Gating Model: decide se vale operar ou não.
- Binário: 1 = TRADE (vale operar), 0 = NO-TRADE (pular)
- Aplicado ANTES do modelo de direção
- Reduz trades "meia-boca" que degradam performance

O modelo aprende:
- Quando o mercado está propício para operar
- Quais combinações de features indicam alta confiança
"""

import pandas as pd
import numpy as np
import json
from pathlib import Path
import pickle

try:
    from xgboost import XGBClassifier
except ImportError:
    print("ERRO: xgboost não instalado. Execute: pip install xgboost")
    exit(1)

from sklearn.metrics import (
    classification_report, 
    confusion_matrix, 
    f1_score,
    accuracy_score,
    precision_score,
    recall_score,
    roc_auc_score
)

# Configuração
ML_DIR = '/app/data/ml'
MODEL_DIR = '/app/data/ml/models'

# Hiperparâmetros XGBoost (otimizado para precisão)
XGB_PARAMS = {
    'objective': 'binary:logistic',
    'max_depth': 3,          # Mais raso para evitar overfit
    'learning_rate': 0.05,   # Menor learning rate
    'n_estimators': 150,
    'subsample': 0.7,
    'colsample_bytree': 0.7,
    'reg_alpha': 0.5,        # Mais regularização
    'reg_lambda': 2.0,
    'scale_pos_weight': 1.0, # Ajustar se classes desbalanceadas
    'random_state': 42,
    'use_label_encoder': False,
    'eval_metric': 'auc'
}

def load_datasets():
    """Carrega datasets de treino/validação/teste"""
    train = pd.read_csv(f'{ML_DIR}/train.csv')
    val = pd.read_csv(f'{ML_DIR}/val.csv')
    test = pd.read_csv(f'{ML_DIR}/test.csv')
    
    with open(f'{ML_DIR}/metadata.json', 'r') as f:
        metadata = json.load(f)
    
    return train, val, test, metadata

def prepare_data(df, feature_cols, label_col='y_trade'):
    """Prepara X e y para treinamento binário"""
    X = df[feature_cols].copy()
    y = df[label_col].copy()
    return X, y

def train_model(X_train, y_train, X_val, y_val):
    """Treina modelo binário com early stopping"""
    model = XGBClassifier(**XGB_PARAMS)
    
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=False
    )
    
    return model

def find_optimal_threshold(model, X_val, y_val):
    """
    Encontra threshold ótimo para balancear precision/recall.
    Para gating, preferimos ALTA PRECISION (evitar falsos positivos).
    """
    y_proba = model.predict_proba(X_val)[:, 1]
    
    best_f1 = 0
    best_threshold = 0.5
    
    for threshold in np.arange(0.3, 0.8, 0.05):
        y_pred = (y_proba >= threshold).astype(int)
        f1 = f1_score(y_val, y_pred)
        prec = precision_score(y_val, y_pred)
        
        # Preferimos precision > 60% para não deixar passar trades ruins
        if prec >= 0.6 and f1 > best_f1:
            best_f1 = f1
            best_threshold = threshold
    
    print(f"\nThreshold ótimo encontrado: {best_threshold:.2f} (F1={best_f1:.3f})")
    return best_threshold

def evaluate_model(model, X, y, threshold=0.5, dataset_name='Test'):
    """Avalia modelo binário"""
    y_proba = model.predict_proba(X)[:, 1]
    y_pred = (y_proba >= threshold).astype(int)
    
    acc = accuracy_score(y, y_pred)
    prec = precision_score(y, y_pred)
    rec = recall_score(y, y_pred)
    f1 = f1_score(y, y_pred)
    auc = roc_auc_score(y, y_proba)
    
    # Coverage: % de trades que o modelo deixa passar
    coverage = y_pred.sum() / len(y_pred) * 100
    
    print(f"\n{'='*50}")
    print(f"Avaliação Gating Model - {dataset_name}")
    print(f"{'='*50}")
    print(f"Threshold: {threshold:.2f}")
    print(f"Accuracy: {acc:.4f}")
    print(f"Precision: {prec:.4f}")
    print(f"Recall: {rec:.4f}")
    print(f"F1 Score: {f1:.4f}")
    print(f"AUC-ROC: {auc:.4f}")
    print(f"Coverage: {coverage:.1f}% ({y_pred.sum()}/{len(y_pred)} trades)")
    
    print(f"\nConfusion Matrix:")
    print(confusion_matrix(y, y_pred))
    
    return {
        'threshold': threshold,
        'accuracy': acc,
        'precision': prec,
        'recall': rec,
        'f1': f1,
        'auc': auc,
        'coverage': coverage
    }

def save_model(model, feature_cols, threshold, metrics, output_dir):
    """Salva modelo e metadados"""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    model_path = f'{output_dir}/gate_model.pkl'
    with open(model_path, 'wb') as f:
        pickle.dump(model, f)
    
    metadata = {
        'model_type': 'XGBClassifier (Binary)',
        'feature_cols': feature_cols,
        'optimal_threshold': threshold,
        'metrics': metrics,
        'params': XGB_PARAMS
    }
    
    with open(f'{output_dir}/gate_metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2, default=str)
    
    print(f"\nGating model salvo em {model_path}")

def main():
    print("="*60)
    print("TRAIN GATING MODEL - TRADE vs NO-TRADE")
    print("="*60)
    
    # 1. Carregar dados
    print("\n1. Carregando datasets...")
    train, val, test, metadata = load_datasets()
    feature_cols = metadata['feature_cols']
    
    # 2. Verificar balanceamento de classes
    print("\n2. Distribuição de classes:")
    print(f"   Train: {train['y_trade'].value_counts().to_dict()}")
    
    # 3. Preparar dados
    X_train, y_train = prepare_data(train, feature_cols)
    X_val, y_val = prepare_data(val, feature_cols)
    X_test, y_test = prepare_data(test, feature_cols)
    
    # 4. Treinar modelo
    print("\n4. Treinando gating model...")
    model = train_model(X_train, y_train, X_val, y_val)
    
    # 5. Encontrar threshold ótimo
    print("\n5. Buscando threshold ótimo...")
    optimal_threshold = find_optimal_threshold(model, X_val, y_val)
    
    # 6. Avaliar
    print("\n6. Avaliando modelo...")
    val_metrics = evaluate_model(model, X_val, y_val, optimal_threshold, 'Validation')
    test_metrics = evaluate_model(model, X_test, y_test, optimal_threshold, 'Test')
    
    # 7. Salvar
    print("\n7. Salvando modelo...")
    metrics = {'validation': val_metrics, 'test': test_metrics}
    save_model(model, feature_cols, optimal_threshold, metrics, MODEL_DIR)
    
    print("\n" + "="*60)
    print("GATING MODEL TREINADO!")
    print(f"Usar threshold {optimal_threshold:.2f} para filtrar trades")
    print("="*60)

if __name__ == '__main__':
    main()
