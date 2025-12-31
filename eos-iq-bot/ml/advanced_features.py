"""
EoS IQ ML - Advanced Forex Features
Features baseadas em Trader Dale, Villahermosa, Kaabar e Ruiz & Chan.
"""

import numpy as np
import pandas as pd
from typing import Tuple, Dict


def calculate_volume_profile(df: pd.DataFrame, num_bins: int = 20) -> Dict:
    """
    Calcula Volume Profile usando Tick Volume como proxy.
    Baseado em Trader Dale: "O Volume Profile funciona bem com Tick Volume"
    
    Returns:
        - vpoc: Preço com maior volume (Volume Point of Control)
        - value_area_high: Topo da Value Area (70% do volume)
        - value_area_low: Base da Value Area
        - hvn: High Volume Nodes (zonas de acumulação)
        - lvn: Low Volume Nodes (zonas de baixa liquidez)
    """
    if len(df) < 10:
        return {'vpoc': np.nan, 'va_high': np.nan, 'va_low': np.nan, 'hvn': [], 'lvn': []}
    
    price_range = df['high'].max() - df['low'].min()
    bin_size = price_range / num_bins
    
    # Criar bins de preço
    bins = np.linspace(df['low'].min(), df['high'].max(), num_bins + 1)
    
    # Distribuir volume por bin
    volume_profile = np.zeros(num_bins)
    
    for _, row in df.iterrows():
        # Para cada candle, distribuir volume proporcionalmente
        for i in range(num_bins):
            bin_low, bin_high = bins[i], bins[i+1]
            # Se o candle passou por esse nível
            if row['low'] <= bin_high and row['high'] >= bin_low:
                volume_profile[i] += row['volume']
    
    # VPOC - preço com maior volume
    vpoc_idx = np.argmax(volume_profile)
    vpoc = (bins[vpoc_idx] + bins[vpoc_idx + 1]) / 2
    
    # Value Area (70% do volume)
    total_volume = volume_profile.sum()
    target_volume = total_volume * 0.7
    
    # Expandir do VPOC até atingir 70%
    va_volume = volume_profile[vpoc_idx]
    va_low_idx, va_high_idx = vpoc_idx, vpoc_idx
    
    while va_volume < target_volume and (va_low_idx > 0 or va_high_idx < num_bins - 1):
        # Adicionar o lado com mais volume
        low_vol = volume_profile[va_low_idx - 1] if va_low_idx > 0 else 0
        high_vol = volume_profile[va_high_idx + 1] if va_high_idx < num_bins - 1 else 0
        
        if low_vol >= high_vol and va_low_idx > 0:
            va_low_idx -= 1
            va_volume += low_vol
        elif va_high_idx < num_bins - 1:
            va_high_idx += 1
            va_volume += high_vol
        else:
            break
    
    value_area_low = bins[va_low_idx]
    value_area_high = bins[va_high_idx + 1]
    
    # HVN e LVN
    mean_vol = volume_profile.mean()
    std_vol = volume_profile.std()
    
    hvn = [(bins[i] + bins[i+1])/2 for i in range(num_bins) if volume_profile[i] > mean_vol + std_vol]
    lvn = [(bins[i] + bins[i+1])/2 for i in range(num_bins) if volume_profile[i] < mean_vol - 0.5*std_vol]
    
    return {
        'vpoc': vpoc,
        'va_high': value_area_high,
        'va_low': value_area_low,
        'hvn': hvn,
        'lvn': lvn,
        'volume_profile': volume_profile
    }


def calculate_kaabar_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calcula features proxy de Kaabar para inferir Order Flow.
    
    Baseado em: "Volatilidade como proxy de liquidez" e 
    "Range/Volume ratio para detectar absorção simulada"
    """
    df = df.copy()
    
    # 1. Tick Velocity - velocidade de mudança de preço
    # Alta velocity = mercado agressivo
    df['tick_velocity'] = df['close'].diff().abs() / df['volume'].replace(0, 1)
    
    # 2. Range/Volume Ratio - absorção simulada
    # Alto volume + baixo range = absorção (alguém está segurando o preço)
    df['candle_range'] = df['high'] - df['low']
    df['range_volume_ratio'] = df['candle_range'] / df['volume'].replace(0, 1)
    
    # 3. Absorption Proxy
    # Muito volume de ticks, pouco movimento de preço = absorção
    df['absorption_proxy'] = (df['volume'] / df['volume'].rolling(20).mean()) / \
                             (df['candle_range'] / df['candle_range'].rolling(20).mean() + 0.0001)
    
    # 4. Volatilidade como proxy de liquidez (Kaabar)
    # Alta volatilidade com baixo tick volume = baixa liquidez
    df['volatility_std'] = df['close'].rolling(20).std()
    df['liquidity_proxy'] = df['volume'] / (df['volatility_std'] + 0.0001)
    
    # 5. Trend Strength (usando VWAP simulado)
    df['vwap'] = (df['volume'] * df['close']).rolling(20).sum() / df['volume'].rolling(20).sum()
    df['price_to_vwap'] = (df['close'] - df['vwap']) / df['vwap']
    
    # 6. Momentum Classification
    # Classificar se é "Initiative" ou "Responsive"
    df['body_ratio'] = abs(df['close'] - df['open']) / (df['candle_range'] + 0.0001)
    df['is_initiative'] = (df['body_ratio'] > 0.6) & (df['volume'] > df['volume'].rolling(10).mean())
    
    return df


def calculate_regime_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Features para classificação de regime (GMM).
    Baseado em Ruiz & Chan.
    """
    df = df.copy()
    
    # Volatilidade normalizada
    df['vol_normalized'] = df['close'].pct_change().rolling(20).std() * np.sqrt(252 * 24 * 12)  # Anualizado
    
    # Trend strength
    df['ema_fast'] = df['close'].ewm(span=10).mean()
    df['ema_slow'] = df['close'].ewm(span=30).mean()
    df['trend_strength'] = (df['ema_fast'] - df['ema_slow']) / df['ema_slow']
    
    # Volume regime
    df['volume_z'] = (df['volume'] - df['volume'].rolling(50).mean()) / df['volume'].rolling(50).std()
    
    return df


def calculate_all_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calcula todas as features para ML.
    """
    df = calculate_kaabar_features(df)
    df = calculate_regime_features(df)
    
    # Preenchter NaN
    for col in df.columns:
        if df[col].dtype in ['float64', 'float32']:
            df[col] = df[col].fillna(0)
    
    return df


if __name__ == "__main__":
    # Teste
    import yfinance as yf
    
    print("Testando features...")
    
    ticker = yf.Ticker("EURUSD=X")
    data = ticker.history(period='5d', interval='5m')
    
    df = data.reset_index()
    df = df.rename(columns={
        'Datetime': 'datetime', 'Open': 'open', 'High': 'high',
        'Low': 'low', 'Close': 'close', 'Volume': 'volume'
    })
    
    # Volume Profile
    vp = calculate_volume_profile(df)
    print(f"\nVolume Profile:")
    print(f"  VPOC: {vp['vpoc']:.5f}")
    print(f"  VA High: {vp['va_high']:.5f}")
    print(f"  VA Low: {vp['va_low']:.5f}")
    print(f"  HVN count: {len(vp['hvn'])}")
    print(f"  LVN count: {len(vp['lvn'])}")
    
    # Kaabar features
    df = calculate_all_features(df)
    print(f"\nKaabar Features:")
    print(df[['tick_velocity', 'absorption_proxy', 'liquidity_proxy', 'is_initiative']].describe())
