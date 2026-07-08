"""
EOS RL Training Script
Train PPO agent for cryptocurrency trading
"""

import os
import sys
import json
import numpy as np
import pandas as pd
from datetime import datetime
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from rl.env import CryptoTradingEnv
from rl.features import extract_features, normalize_features


def load_data(db_path: str, symbol: str = "BTCUSDT") -> pd.DataFrame:
    """
    Load OHLCV data from SQLite database.
    """
    import sqlite3
    
    conn = sqlite3.connect(db_path)
    
    # Try to get data from crypto_signals table
    query = f"""
    SELECT created_at, entry_price as close, entry_price as high, 
           entry_price as low, entry_price as open, volume_ratio as volume
    FROM signals 
    WHERE symbol = '{symbol}'
    ORDER BY created_at
    """
    
    try:
        df = pd.read_sql_query(query, conn)
        conn.close()
        return df
    except Exception as e:
        print(f"Error loading from signals table: {e}")
        conn.close()
        return None


def fetch_binance_data(symbol: str = "BTCUSDT", interval: str = "1h", 
                       days: int = 365) -> pd.DataFrame:
    """
    Fetch OHLCV data from Binance API.
    """
    from binance.client import Client
    import time
    
    client = Client("", "")  # Public API, no keys needed
    
    # Calculate start time
    end_time = int(time.time() * 1000)
    start_time = end_time - (days * 24 * 60 * 60 * 1000)
    
    # Fetch klines
    klines = client.get_klines(
        symbol=symbol,
        interval=interval,
        startTime=start_time,
        endTime=end_time,
        limit=1000
    )
    
    # Convert to DataFrame
    df = pd.DataFrame(klines, columns=[
        'Open time', 'Open', 'High', 'Low', 'Close', 'Volume',
        'Close time', 'Quote volume', 'Trades', 'Taker buy base',
        'Taker buy quote', 'Ignore'
    ])
    
    # Convert to numeric
    for col in ['Open', 'High', 'Low', 'Close', 'Volume']:
        df[col] = pd.to_numeric(df[col])
    
    # Select relevant columns
    df = df[['Open time', 'Open', 'High', 'Low', 'Close', 'Volume']]
    df['Open time'] = pd.to_datetime(df['Open time'], unit='ms')
    
    return df


def create_env(df: pd.DataFrame, window_size: int = 20) -> CryptoTradingEnv:
    """
    Create trading environment from DataFrame.
    """
    # Extract features
    features, feature_names = extract_features(df)
    
    # Normalize features
    features = normalize_features(features)
    
    # Create environment
    env = CryptoTradingEnv(
        df=features,
        feature_names=feature_names,
        window_size=window_size,
        initial_balance=10000.0,
        transaction_fee=0.001,
    )
    
    return env


def train_ppo(env: CryptoTradingEnv, total_timesteps: int = 500000,
              learning_rate: float = 3e-4, n_steps: int = 2048,
              batch_size: int = 64, gamma: float = 0.99,
              clip_range: float = 0.2, ent_coef: float = 0.01,
              eval_freq: int = 10000, save_path: str = "ppo_crypto"):
    """
    Train PPO agent.
    """
    from stable_baselines3 import PPO
    from stable_baselines3.common.vec_env import DummyVecEnv
    from stable_baselines3.common.callbacks import EvalCallback
    
    # Create vectorized environment
    vec_env = DummyVecEnv([lambda: env])
    
    # Create model
    model = PPO(
        "MlpPolicy",
        vec_env,
        verbose=1,
        learning_rate=learning_rate,
        n_steps=n_steps,
        batch_size=batch_size,
        gamma=gamma,
        clip_range=clip_range,
        ent_coef=ent_coef,
        tensorboard_log="./tb_logs/",
    )
    
    # Create eval environment (split data)
    eval_env = create_env(env.df, window_size=env.window_size)
    eval_vec_env = DummyVecEnv([lambda: eval_env])
    
    # Create callback
    eval_callback = EvalCallback(
        eval_vec_env,
        best_model_save_path=f"./models/{save_path}",
        log_path="./logs/",
        eval_freq=eval_freq,
        n_eval_episodes=5,
        deterministic=True,
        render=False,
    )
    
    # Train
    print(f"Training PPO for {total_timesteps} timesteps...")
    model.learn(
        total_timesteps=total_timesteps,
        callback=eval_callback,
        progress_bar=True,
    )
    
    # Save final model
    model.save(f"./models/{save_path}_final")
    
    print(f"Training complete! Model saved to ./models/{save_path}")
    
    return model


def main():
    """
    Main training script.
    """
    # Configuration
    SYMBOL = "BTCUSDT"
    INTERVAL = "1h"
    DAYS = 365  # 1 year of data
    WINDOW_SIZE = 20
    TOTAL_TIMESTEPS = 500000
    
    print("=" * 60)
    print("EOS RL Trading - Training Pipeline")
    print("=" * 60)
    
    # Fetch data
    print(f"\n1. Fetching {SYMBOL} data from Binance ({INTERVAL}, {DAYS} days)...")
    df = fetch_binance_data(SYMBOL, INTERVAL, DAYS)
    print(f"   Loaded {len(df)} candles")
    
    # Create environment
    print(f"\n2. Creating trading environment (window_size={WINDOW_SIZE})...")
    env = create_env(df, WINDOW_SIZE)
    print(f"   Observation space: {env.observation_space.shape}")
    print(f"   Action space: {env.action_space.n} actions")
    
    # Train
    print(f"\n3. Training PPO agent ({TOTAL_TIMESTEPS} timesteps)...")
    model = train_ppo(
        env,
        total_timesteps=TOTAL_TIMESTEPS,
        save_path=f"ppo_{SYMBOL.lower()}",
    )
    
    # Test
    print("\n4. Testing trained agent...")
    obs, _ = env.reset()
    total_reward = 0
    steps = 0
    
    while True:
        action, _ = model.predict(obs, deterministic=True)
        obs, reward, terminated, truncated, info = env.step(action)
        total_reward += reward
        steps += 1
        
        if terminated or truncated:
            break
    
    print(f"   Test results:")
    print(f"   - Steps: {steps}")
    print(f"   - Total reward: {total_reward:.4f}")
    print(f"   - Final portfolio: ${info['portfolio_value']:.2f}")
    print(f"   - Total trades: {info['total_trades']}")
    
    # Save metadata
    metadata = {
        "symbol": SYMBOL,
        "interval": INTERVAL,
        "days": DAYS,
        "window_size": WINDOW_SIZE,
        "total_timesteps": TOTAL_TIMESTEPS,
        "final_portfolio": info["portfolio_value"],
        "total_trades": info["total_trades"],
        "total_reward": total_reward,
        "timestamp": datetime.now().isoformat(),
    }
    
    with open(f"./models/ppo_{SYMBOL.lower()}_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    
    print(f"\n5. Training complete!")
    print(f"   Model: ./models/ppo_{SYMBOL.lower()}")
    print(f"   Metadata: ./models/ppo_{SYMBOL.lower()}_metadata.json")


if __name__ == "__main__":
    main()
