"""
EOS RL Feature Engineering
Extract and normalize features for RL trading
"""

import numpy as np
import pandas as pd
from typing import Tuple


def calculate_rsi(prices: np.ndarray, period: int = 14) -> np.ndarray:
    """Calculate RSI indicator."""
    deltas = np.diff(prices)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)
    
    avg_gain = pd.Series(gains).rolling(window=period).mean()
    avg_loss = pd.Series(losses).rolling(window=period).mean()
    
    rs = avg_gain / (avg_loss + 1e-10)
    rsi = 100 - (100 / (1 + rs))
    
    return np.concatenate([[np.nan] * period, rsi.values])


def calculate_ema(prices: np.ndarray, period: int) -> np.ndarray:
    """Calculate EMA indicator."""
    ema = pd.Series(prices).ewm(span=period, adjust=False).mean()
    return ema.values


def calculate_macd(prices: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Calculate MACD indicator."""
    ema12 = calculate_ema(prices, 12)
    ema26 = calculate_ema(prices, 26)
    macd_line = ema12 - ema26
    signal_line = calculate_ema(macd_line, 9)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def calculate_bollinger_bands(prices: np.ndarray, period: int = 20) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Calculate Bollinger Bands."""
    sma = pd.Series(prices).rolling(window=period).mean()
    std = pd.Series(prices).rolling(window=period).std()
    upper = sma + 2 * std
    lower = sma - 2 * std
    return upper.values, sma.values, lower.values


def calculate_atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14) -> np.ndarray:
    """Calculate ATR indicator."""
    tr1 = high - low
    tr2 = np.abs(high - np.roll(close, 1))
    tr3 = np.abs(low - np.roll(close, 1))
    tr = np.maximum(np.maximum(tr1, tr2), tr3)
    atr = pd.Series(tr).rolling(window=period).mean()
    return atr.values


def calculate_obv(close: np.ndarray, volume: np.ndarray) -> np.ndarray:
    """Calculate On-Balance Volume."""
    obv = np.zeros_like(volume)
    obv[0] = volume[0]
    
    for i in range(1, len(close)):
        if close[i] > close[i - 1]:
            obv[i] = obv[i - 1] + volume[i]
        elif close[i] < close[i - 1]:
            obv[i] = obv[i - 1] - volume[i]
        else:
            obv[i] = obv[i - 1]
    
    return obv


def calculate_momentum(prices: np.ndarray, period: int = 10) -> np.ndarray:
    """Calculate momentum indicator."""
    return prices - np.roll(prices, period)


def calculate_volatility(prices: np.ndarray, period: int = 20) -> np.ndarray:
    """Calculate rolling volatility."""
    returns = np.diff(prices) / (prices[:-1] + 1e-10)
    returns = np.concatenate([[0], returns])
    vol = pd.Series(returns).rolling(window=period).std()
    return vol.values


def extract_features(df: pd.DataFrame) -> Tuple[np.ndarray, list]:
    """
    Extract features from OHLCV data.
    
    Args:
        df: DataFrame with columns [Open, High, Low, Close, Volume]
    
    Returns:
        features: numpy array of shape (n_timesteps, n_features)
        feature_names: list of feature names
    """
    close = df['Close'].values
    high = df['High'].values
    low = df['Low'].values
    volume = df['Volume'].values
    open_price = df['Open'].values
    
    features = []
    feature_names = []
    
    # Price features (normalized)
    features.append(close / close[0] - 1)  # Normalized close
    feature_names.append('close_norm')
    
    features.append((high - close) / (close + 1e-10))  # High - Close ratio
    feature_names.append('high_close_ratio')
    
    features.append((close - low) / (close + 1e-10))  # Close - Low ratio
    feature_names.append('close_low_ratio')
    
    features.append((close - open_price) / (open_price + 1e-10))  # Returns
    feature_names.append('returns')
    
    # Volume features
    volume_ma = pd.Series(volume).rolling(window=20).mean().values
    features.append(volume / (volume_ma + 1e-10))  # Volume ratio
    feature_names.append('volume_ratio')
    
    # Technical indicators
    rsi = calculate_rsi(close, 14)
    features.append(rsi / 100)  # Normalize to 0-1
    feature_names.append('rsi')
    
    ema9 = calculate_ema(close, 9)
    ema21 = calculate_ema(close, 21)
    features.append((ema9 - ema21) / (ema21 + 1e-10))  # EMA crossover
    feature_names.append('ema_crossover')
    
    macd_line, signal_line, histogram = calculate_macd(close)
    features.append(histogram / (np.abs(histogram).max() + 1e-10))  # Normalized MACD
    feature_names.append('macd_hist')
    
    upper, middle, lower = calculate_bollinger_bands(close)
    bb_width = (upper - lower) / (middle + 1e-10)
    features.append(bb_width / (bb_width.max() + 1e-10))  # Normalized BB width
    feature_names.append('bb_width')
    
    atr = calculate_atr(high, low, close, 14)
    features.append(atr / (close + 1e-10))  # ATR ratio
    feature_names.append('atr_ratio')
    
    obv = calculate_obv(close, volume)
    obv_ma = pd.Series(obv).rolling(window=20).mean().values
    features.append((obv - obv_ma) / (np.abs(obv_ma).max() + 1e-10))  # OBV divergence
    feature_names.append('obv_divergence')
    
    momentum = calculate_momentum(close, 10)
    features.append(momentum / (np.abs(momentum).max() + 1e-10))  # Normalized momentum
    feature_names.append('momentum')
    
    volatility = calculate_volatility(close, 20)
    features.append(volatility / (volatility.max() + 1e-10))  # Normalized volatility
    feature_names.append('volatility')
    
    # Stack features
    features_array = np.column_stack(features)
    
    # Replace NaN with 0
    features_array = np.nan_to_num(features_array, nan=0.0)
    
    return features_array, feature_names


def normalize_features(features: np.ndarray) -> np.ndarray:
    """
    Normalize features using z-score normalization.
    """
    mean = np.mean(features, axis=0)
    std = np.std(features, axis=0) + 1e-10
    return (features - mean) / std
