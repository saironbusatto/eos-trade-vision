# ML Pipeline para EOS Crypto Bot
# train_direction.py - Treina modelo XGBoost multiclass para direção

"""
Treina modelo de direção (LONG / SHORT / NO-TRADE) usando XGBoost.
- Walk-forward validation para robustez
- Feature importance para interpretabilidade
- Métricas: F1 por classe, accuracy, confusion matrix
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
    accuracy_score
)

# Configuração
import os
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ML_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'ml')
MODEL_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'ml', 'models')

# Hiperparâmetros XGBoost (baseline conservador)
XGB_PARAMS = {
    'objective': 'multi:softmax',
    'num_class': 3,
    'max_depth': 4,          # Shallow para evitar overfit
    'learning_rate': 0.1,
    'n_estimators': 100,
    'subsample': 0.8,
    'colsample_bytree': 0.8,
    'reg_alpha': 0.1,        # L1 regularization
    'reg_lambda': 1.0,       # L2 regularization
    'random_state': 42,
    'use_label_encoder': False,
    'eval_metric': 'mlogloss'
}

def load_datasets():
    """Carrega datasets de treino/validação/teste"""
    train = pd.read_csv(f'{ML_DIR}/train.csv')
    val = pd.read_csv(f'{ML_DIR}/val.csv')
    test = pd.read_csv(f'{ML_DIR}/test.csv')
    
    with open(f'{ML_DIR}/metadata.json', 'r') as f:
        metadata = json.load(f)
    
    return train, val, test, metadata

def prepare_data(df, feature_cols, label_col):
    """Prepara X e y para treinamento"""
    X = df[feature_cols].copy()
    y = df[label_col].copy()
    
    # Mapear labels para 0, 1, 2 (XGBoost requer)
    # -1 (SHORT) -> 0, 0 (NO-TRADE) -> 1, 1 (LONG) -> 2
    y_mapped = y.map({-1: 0, 0: 1, 1: 2})
    
    return X, y_mapped

def train_model(X_train, y_train, X_val, y_val):
    """Treina modelo XGBoost com early stopping"""
    model = XGBClassifier(**XGB_PARAMS)
    
    # Treinar com early stopping
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=False
    )
    
    return model

def evaluate_model(model, X, y, dataset_name='Test'):
    """Avalia modelo e retorna métricas"""
    y_pred = model.predict(X)
    
    # Mapear de volta para labels originais
    label_map = {0: 'SHORT', 1: 'NO-TRADE', 2: 'LONG'}
    
    acc = accuracy_score(y, y_pred)
    f1_macro = f1_score(y, y_pred, average='macro')
    f1_weighted = f1_score(y, y_pred, average='weighted')
    
    print(f"\n{'='*50}")
    print(f"Avaliação - {dataset_name}")
    print(f"{'='*50}")
    print(f"Accuracy: {acc:.4f}")
    print(f"F1 Macro: {f1_macro:.4f}")
    print(f"F1 Weighted: {f1_weighted:.4f}")
    
    print(f"\nClassification Report:")
    print(classification_report(y, y_pred, target_names=['SHORT', 'NO-TRADE', 'LONG']))
    
    print(f"\nConfusion Matrix:")
    cm = confusion_matrix(y, y_pred)
    print(cm)
    
    return {
        'accuracy': acc,
        'f1_macro': f1_macro,
        'f1_weighted': f1_weighted,
        'confusion_matrix': cm.tolist(),
        'predictions': y_pred.tolist()
    }

def get_feature_importance(model, feature_cols):
    """Extrai importância das features"""
    importance = model.feature_importances_
    importance_df = pd.DataFrame({
        'feature': feature_cols,
        'importance': importance
    }).sort_values('importance', ascending=False)
    
    print("\nFeature Importance:")
    print(importance_df.to_string(index=False))
    
    return importance_df.to_dict('records')

def walk_forward_validation(df, feature_cols, label_col, 
                           train_days=60, val_days=15, step_days=15):
    """
    Walk-forward validation para simular produção.
    Treina em N dias, valida nos próximos M dias, avança step dias.
    """
    print("\n" + "="*60)
    print("WALK-FORWARD VALIDATION")
    print("="*60)
    
    # Assumir que temos ~1000 sinais em ~30 dias = ~33 sinais/dia
    signals_per_day = 33
    train_size = train_days * signals_per_day
    val_size = val_days * signals_per_day
    step_size = step_days * signals_per_day
    
    results = []
    fold = 0
    start_idx = 0
    
    while start_idx + train_size + val_size <= len(df):
        fold += 1
        train_end = start_idx + train_size
        val_end = train_end + val_size
        
        train_df = df.iloc[start_idx:train_end]
        val_df = df.iloc[train_end:val_end]
        
        X_train, y_train = prepare_data(train_df, feature_cols, label_col)
        X_val, y_val = prepare_data(val_df, feature_cols, label_col)
        
        # Treinar (sem early stopping no walk-forward)
        model = XGBClassifier(**XGB_PARAMS)
        model.fit(X_train, y_train, verbose=False)
        
        # Avaliar
        y_pred = model.predict(X_val)
        f1 = f1_score(y_val, y_pred, average='macro')
        acc = accuracy_score(y_val, y_pred)
        
        print(f"Fold {fold}: Train[{start_idx}:{train_end}] Val[{train_end}:{val_end}] | Acc={acc:.3f} F1={f1:.3f}")
        
        results.append({
            'fold': fold,
            'train_start': start_idx,
            'train_end': train_end,
            'val_start': train_end,
            'val_end': val_end,
            'accuracy': acc,
            'f1_macro': f1
        })
        
        start_idx += step_size
    
    # Resumo
    avg_acc = np.mean([r['accuracy'] for r in results])
    avg_f1 = np.mean([r['f1_macro'] for r in results])
    std_acc = np.std([r['accuracy'] for r in results])
    std_f1 = np.std([r['f1_macro'] for r in results])
    
    print(f"\nResumo Walk-Forward ({len(results)} folds):")
    print(f"Accuracy: {avg_acc:.4f} ± {std_acc:.4f}")
    print(f"F1 Macro: {avg_f1:.4f} ± {std_f1:.4f}")
    
    return results

def save_model(model, feature_cols, metrics, output_dir):
    """Salva modelo treinado e metadados"""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    # Salvar modelo
    model_path = f'{output_dir}/direction_model.pkl'
    with open(model_path, 'wb') as f:
        pickle.dump(model, f)
    
    # Salvar metadados
    metadata = {
        'model_type': 'XGBClassifier',
        'feature_cols': feature_cols,
        'label_mapping': {-1: 0, 0: 1, 1: 2},
        'label_names': {0: 'SHORT', 1: 'NO-TRADE', 2: 'LONG'},
        'metrics': metrics,
        'params': XGB_PARAMS
    }
    
    with open(f'{output_dir}/direction_metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2, default=str)
    
    print(f"\nModelo salvo em {model_path}")

def main():
    print("="*60)
    print("TRAIN DIRECTION MODEL - XGBoost Multiclass")
    print("="*60)
    
    # 1. Carregar dados
    print("\n1. Carregando datasets...")
    train, val, test, metadata = load_datasets()
    feature_cols = metadata['feature_cols']
    
    print(f"   Train: {len(train)}, Val: {len(val)}, Test: {len(test)}")
    print(f"   Features: {len(feature_cols)}")
    
    # 2. Preparar dados
    print("\n2. Preparando dados...")
    X_train, y_train = prepare_data(train, feature_cols, 'y_direction')
    X_val, y_val = prepare_data(val, feature_cols, 'y_direction')
    X_test, y_test = prepare_data(test, feature_cols, 'y_direction')
    
    # 3. Treinar modelo principal
    print("\n3. Treinando modelo principal...")
    model = train_model(X_train, y_train, X_val, y_val)
    
    # 4. Avaliar
    print("\n4. Avaliando modelo...")
    val_metrics = evaluate_model(model, X_val, y_val, 'Validation')
    test_metrics = evaluate_model(model, X_test, y_test, 'Test')
    
    # 5. Feature importance
    print("\n5. Analisando importância das features...")
    importance = get_feature_importance(model, feature_cols)
    
    # 6. Walk-forward validation
    print("\n6. Walk-forward validation...")
    all_data = pd.concat([train, val, test])
    wf_results = walk_forward_validation(all_data, feature_cols, 'y_direction')
    
    # 7. Salvar modelo
    print("\n7. Salvando modelo...")
    metrics = {
        'validation': val_metrics,
        'test': test_metrics,
        'feature_importance': importance,
        'walk_forward': wf_results
    }
    save_model(model, feature_cols, metrics, MODEL_DIR)
    
    print("\n" + "="*60)
    print("TREINAMENTO CONCLUÍDO!")
    print("="*60)

if __name__ == '__main__':
    main()
