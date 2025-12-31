"""
EoS IQ ML - Data Fetcher
Busca dados históricos do Forex via API gratuita e simula sinais para treinar.
"""

import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# Pares Forex
PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'EUR/GBP']


def fetch_forex_data(pair: str, interval: str = '5min', outputsize: int = 5000) -> pd.DataFrame:
    """
    Busca dados históricos do Forex via Yahoo Finance.
    """
    try:
        import yfinance as yf
        
        # Converter par para ticker Yahoo
        ticker = pair.replace('/', '') + '=X'
        
        print(f"Buscando {pair} via Yahoo Finance...")
        
        # Buscar últimos 30 dias de dados 5min
        ticker_obj = yf.Ticker(ticker)
        data = ticker_obj.history(period='30d', interval='5m')
        
        if data.empty:
            print(f"  ❌ Sem dados para {pair}")
            return pd.DataFrame()
        
        df = data.reset_index()
        df = df.rename(columns={
            'Datetime': 'datetime',
            'Open': 'open',
            'High': 'high',
            'Low': 'low', 
            'Close': 'close',
            'Volume': 'volume'
        })
        df['pair'] = pair
        
        # Selecionar apenas colunas que existem
        cols = ['datetime', 'pair', 'open', 'high', 'low', 'close', 'volume']
        df = df[[c for c in cols if c in df.columns]]
        
        print(f"  ✅ {len(df)} candles")
        return df
        
    except Exception as e:
        print(f"  ❌ Erro: {e}")
        return pd.DataFrame()


def calculate_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calcula features OFA simplificadas para Forex.
    """
    # Delta (simulado como close - open)
    df['delta'] = df['close'] - df['open']
    
    # Delta cumulativo
    df['delta_cumulative'] = df['delta'].rolling(10).sum()
    
    # Trend (EMA 20)
    df['ema20'] = df['close'].ewm(span=20).mean()
    df['trend'] = (df['close'] - df['ema20']) / df['ema20']
    
    # Momentum (ROC 10)
    df['momentum'] = df['close'].pct_change(10)
    
    # Volatilidade (ATR)
    df['tr'] = np.maximum(
        df['high'] - df['low'],
        np.maximum(
            abs(df['high'] - df['close'].shift(1)),
            abs(df['low'] - df['close'].shift(1))
        )
    )
    df['atr'] = df['tr'].rolling(14).mean()
    df['volatility'] = df['atr'] / df['close']
    
    # Volume ratio
    df['volume_ratio'] = df['volume'] / df['volume'].rolling(20).mean()
    
    # Hora UTC
    df['hour_utc'] = pd.to_datetime(df['datetime']).dt.hour
    df['day_of_week'] = pd.to_datetime(df['datetime']).dt.dayofweek
    
    return df


def create_labels(df: pd.DataFrame, horizon: int = 5, tp_pct: float = 0.001, sl_pct: float = 0.0005) -> pd.DataFrame:
    """
    Cria labels usando Triple Barrier simplificado.
    Para Forex M5: TP 0.1% (10 pips), SL 0.05% (5 pips)
    """
    df = df.copy()
    df['is_win'] = np.nan
    
    for i in range(len(df) - horizon):
        entry = df['close'].iloc[i]
        
        # Simular CALL
        future_prices = df['close'].iloc[i+1:i+1+horizon].values
        
        # Verificar se atingiu TP ou SL
        for price in future_prices:
            pct_change = (price - entry) / entry
            if pct_change >= tp_pct:
                df.loc[df.index[i], 'is_win'] = 1  # WIN
                break
            elif pct_change <= -sl_pct:
                df.loc[df.index[i], 'is_win'] = 0  # LOSS
                break
        
        # Se não atingiu nenhum, verifica resultado final
        if pd.isna(df.loc[df.index[i], 'is_win']):
            final_pct = (future_prices[-1] - entry) / entry
            df.loc[df.index[i], 'is_win'] = 1 if final_pct > 0 else 0
    
    return df


def main():
    print("="*60)
    print("   EoS IQ ML - Forex Data Fetcher")
    print("="*60)
    
    all_data = []
    
    for pair in PAIRS:
        df = fetch_forex_data(pair)
        if not df.empty:
            df = calculate_features(df)
            df = create_labels(df)
            all_data.append(df)
    
    if not all_data:
        print("❌ Nenhum dado obtido")
        return
    
    # Concatenar todos os pares
    full_df = pd.concat(all_data, ignore_index=True)
    
    # Preencher NaN nas features com 0
    feature_cols = ['delta', 'delta_cumulative', 'trend', 'momentum', 'volatility', 'volume_ratio']
    for col in feature_cols:
        if col in full_df.columns:
            full_df[col] = full_df[col].fillna(0)
    
    # Remover apenas onde is_win é NaN
    full_df = full_df.dropna(subset=['is_win'])
    
    print(f"\n📊 Total: {len(full_df)} samples")
    print(f"   WIN: {(full_df['is_win'] == 1).sum()}")
    print(f"   LOSS: {(full_df['is_win'] == 0).sum()}")
    
    # Salvar
    output_path = DATA_DIR / "forex_data.parquet"
    full_df.to_parquet(output_path)
    print(f"\n✅ Salvo em: {output_path}")
    
    return full_df


if __name__ == "__main__":
    main()
