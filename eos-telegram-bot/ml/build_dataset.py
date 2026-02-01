# ML Pipeline para EOS Crypto Bot
# Autor: EOS Trading System
# Data: 2026-01

"""
build_dataset.py - Exporta dados do SQLite e cria features para treinamento

Labels:
- 1 (LONG): profit_15m > threshold (normalizado por volatilidade)
- -1 (SHORT): profit_15m < -threshold
- 0 (NO-TRADE): abs(profit_15m) <= threshold

Features:
- f_smart_money, f_trend, f_momentum, f_volume, f_imbalance, f_absorption
- score
- hour_sin, hour_cos (ciclo 24h)
- dow_sin, dow_cos (ciclo 7 dias)
- macro_sentiment_encoded
- fear_greed
"""

import sqlite3
import pandas as pd
import numpy as np
from pathlib import Path
import json

# Configuração - ajustar para ambiente local ou produção
import os
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(SCRIPT_DIR, '..', 'data', 'eos.db')
OUTPUT_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'ml')
LABEL_THRESHOLD_PCT = 0.5  # Threshold base de 0.5%
VOLATILITY_LOOKBACK = 20   # Janela para calcular volatilidade por símbolo

def load_data():
    """Carrega dados do SQLite - tabela ml_training (desnormalizada)"""
    conn = sqlite3.connect(DB_PATH)
    
    # Query principal - ml_training já tem os profits por checkpoint
    query = """
    SELECT 
        m.id,
        m.signal_id,
        m.symbol,
        m.action,
        m.result,
        m.final_profit,
        m.time_to_result_min,
        m.hour_utc,
        m.day_of_week,
        m.f_smart_money,
        m.f_price_context,
        m.f_imbalance,
        m.f_absorption,
        m.f_trend,
        m.f_momentum,
        m.f_volume,
        m.score,
        m.profit_5m,
        m.profit_10m,
        m.profit_15m,
        m.profit_30m,
        m.profit_45m,
        m.macro_sentiment,
        m.fear_greed,
        m.macro_confidence,
        m.sp500_trend,
        m.fed_stance
    FROM ml_training m
    WHERE m.profit_15m IS NOT NULL
    ORDER BY m.id ASC
    """
    
    df = pd.read_sql_query(query, conn)
    conn.close()
    
    print(f"   Loaded {len(df)} records from ml_training")
    return df

def encode_cyclical_features(df):
    """Codifica hora e dia como seno/cosseno"""
    # Hora (ciclo de 24h)
    df['hour_sin'] = np.sin(2 * np.pi * df['hour_utc'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour_utc'] / 24)
    
    # Dia da semana (ciclo de 7 dias)
    df['dow_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
    df['dow_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
    
    return df

def calculate_profit_if_missing(df):
    """Calcula profit se não tiver checkpoints"""
    if 'profit_15m' not in df.columns:
        # Usa exit_price vs entry_price como proxy
        df['profit_15m'] = (df['exit_price'] - df['entry_price']) / df['entry_price'] * 100
        # Ajusta sinal para SHORT
        df.loc[df['action'] == 'SELL', 'profit_15m'] *= -1
    return df

def create_labels(df, threshold_pct=LABEL_THRESHOLD_PCT):
    """
    Cria labels de 3 classes normalizadas por volatilidade
    1 = LONG (comprar foi boa ideia)
    -1 = SHORT (vender foi boa ideia)
    0 = NO-TRADE (movimento insignificante)
    """
    # Calcular volatilidade por símbolo (rolling std dos retornos)
    # Por simplicidade, usamos threshold fixo por ora
    # TODO: Implementar threshold dinâmico por símbolo
    
    df['y_direction'] = 0  # NO-TRADE default
    
    # LONG: profit_15m > threshold
    df.loc[df['profit_15m'] > threshold_pct, 'y_direction'] = 1
    
    # SHORT: profit_15m < -threshold
    df.loc[df['profit_15m'] < -threshold_pct, 'y_direction'] = -1
    
    # Label binário para gating model (TRADE vs NO-TRADE)
    df['y_trade'] = (df['y_direction'] != 0).astype(int)
    
    return df

def select_features(df):
    """Seleciona features para treinamento"""
    feature_cols = [
        # Features OFA normalizadas
        'f_smart_money',
        'f_price_context', 
        'f_imbalance',
        'f_absorption',
        'f_trend',
        'f_momentum',
        'f_volume',
        
        # Score do sistema
        'score',
        
        # Features temporais (cíclicas)
        'hour_sin',
        'hour_cos',
        'dow_sin',
        'dow_cos',
        
        # Raw metrics (opcional, testar se melhora)
        'volume_ratio',
        'trend',
        'momentum',
        'price_change_24h',
    ]
    
    # Filtrar apenas colunas que existem
    available_features = [c for c in feature_cols if c in df.columns]
    
    return available_features

def split_temporal(df, train_ratio=0.7, val_ratio=0.15):
    """Split temporal (sem shuffle para evitar data leakage)"""
    n = len(df)
    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))
    
    train = df.iloc[:train_end].copy()
    val = df.iloc[train_end:val_end].copy()
    test = df.iloc[val_end:].copy()
    
    return train, val, test

def save_datasets(train, val, test, feature_cols, output_dir):
    """Salva datasets em CSV e metadados em JSON"""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    train.to_csv(f'{output_dir}/train.csv', index=False)
    val.to_csv(f'{output_dir}/val.csv', index=False)
    test.to_csv(f'{output_dir}/test.csv', index=False)
    
    # Metadados
    metadata = {
        'feature_cols': feature_cols,
        'label_col_direction': 'y_direction',
        'label_col_gate': 'y_trade',
        'train_size': len(train),
        'val_size': len(val),
        'test_size': len(test),
        'class_distribution_train': train['y_direction'].value_counts().to_dict(),
        'threshold_pct': LABEL_THRESHOLD_PCT,
    }
    
    with open(f'{output_dir}/metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Datasets salvos em {output_dir}")
    print(f"Train: {len(train)}, Val: {len(val)}, Test: {len(test)}")
    print(f"Features: {feature_cols}")
    print(f"Label distribution (train): {metadata['class_distribution_train']}")

def main():
    print("=" * 60)
    print("BUILD DATASET - EOS ML Pipeline")
    print("=" * 60)
    
    # 1. Carregar dados
    print("\n1. Carregando dados do SQLite...")
    df = load_data()
    print(f"   Total de sinais: {len(df)}")
    
    # 2. Calcular profit se necessário
    print("\n2. Calculando profit...")
    df = calculate_profit_if_missing(df)
    
    # 3. Codificar features cíclicas
    print("\n3. Codificando features temporais...")
    df = encode_cyclical_features(df)
    
    # 4. Criar labels
    print("\n4. Criando labels (3 classes)...")
    df = create_labels(df)
    
    # 5. Selecionar features
    print("\n5. Selecionando features...")
    feature_cols = select_features(df)
    
    # 6. Limpar NaN
    print("\n6. Limpando dados...")
    df_clean = df.dropna(subset=feature_cols + ['y_direction'])
    print(f"   Sinais após limpeza: {len(df_clean)}")
    
    # 7. Split temporal
    print("\n7. Dividindo dataset (70/15/15 temporal)...")
    train, val, test = split_temporal(df_clean)
    
    # 8. Salvar
    print("\n8. Salvando datasets...")
    save_datasets(train, val, test, feature_cols, OUTPUT_DIR)
    
    print("\n" + "=" * 60)
    print("Dataset pronto para treinamento!")
    print("=" * 60)

if __name__ == '__main__':
    main()
