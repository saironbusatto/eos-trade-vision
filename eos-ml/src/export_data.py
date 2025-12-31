"""
EoS ML - Export Data
Exporta dados do SQLite para Parquet com features iniciais.
"""

import sqlite3
import pandas as pd
from pathlib import Path

# Paths
DB_PATH = Path(__file__).parent.parent.parent / "eos-telegram-bot" / "data" / "eos-cloud-backup.db"
OUTPUT_DIR = Path(__file__).parent.parent / "data"

def export_signals():
    """Exporta tabela signals"""
    conn = sqlite3.connect(DB_PATH)
    
    query = """
    SELECT 
        id,
        symbol,
        action,
        entry_price,
        stop_loss,
        take_profit,
        score,
        result,
        created_at,
        validated_at,
        exit_price,
        f_smart_money,
        f_price_context,
        f_imbalance,
        f_absorption,
        f_trend,
        f_momentum,
        f_volume,
        volume_ratio,
        trend,
        momentum,
        price_change_24h
    FROM signals
    WHERE result IN ('WIN', 'LOSS')
    ORDER BY created_at
    """
    
    df = pd.read_sql_query(query, conn)
    conn.close()
    
    # Converter timestamps
    df['created_at'] = pd.to_datetime(df['created_at'])
    df['validated_at'] = pd.to_datetime(df['validated_at'])
    
    # Calcular features derivadas
    df['profit_pct'] = (df['exit_price'] - df['entry_price']) / df['entry_price'] * 100
    df['is_win'] = (df['result'] == 'WIN').astype(int)
    
    # Extrair features temporais
    df['hour_utc'] = df['created_at'].dt.hour
    df['day_of_week'] = df['created_at'].dt.dayofweek
    
    # Calcular tempo até resultado
    df['time_to_result_min'] = (
        (df['validated_at'] - df['created_at']).dt.total_seconds() / 60
    ).fillna(45)
    
    print(f"Exportando {len(df)} sinais...")
    print(f"WIN: {df['is_win'].sum()} | LOSS: {(~df['is_win'].astype(bool)).sum()}")
    print(f"Win Rate: {df['is_win'].mean()*100:.1f}%")
    
    # Salvar
    OUTPUT_DIR.mkdir(exist_ok=True)
    output_path = OUTPUT_DIR / "signals.parquet"
    df.to_parquet(output_path, index=False)
    print(f"Salvo em: {output_path}")
    
    return df


def export_ml_training():
    """Exporta tabela ml_training com checkpoints"""
    conn = sqlite3.connect(DB_PATH)
    
    query = """
    SELECT 
        signal_id,
        symbol,
        action,
        result,
        final_profit,
        time_to_result_min,
        f_smart_money,
        f_price_context,
        f_imbalance,
        f_absorption,
        f_trend,
        f_momentum,
        f_volume,
        score,
        profit_5m,
        profit_10m,
        profit_15m,
        profit_30m,
        profit_45m,
        hour_utc,
        day_of_week
    FROM ml_training
    ORDER BY signal_id
    """
    
    df = pd.read_sql_query(query, conn)
    conn.close()
    
    # Target binário
    df['is_win'] = (df['result'] == 'WIN').astype(int)
    
    print(f"Exportando {len(df)} registros de ml_training...")
    
    output_path = OUTPUT_DIR / "ml_training.parquet"
    df.to_parquet(output_path, index=False)
    print(f"Salvo em: {output_path}")
    
    return df


if __name__ == "__main__":
    print("=" * 50)
    print("EoS ML - Exportação de Dados")
    print("=" * 50)
    
    signals_df = export_signals()
    print()
    ml_df = export_ml_training()
    
    print()
    print("Exportação concluída!")
