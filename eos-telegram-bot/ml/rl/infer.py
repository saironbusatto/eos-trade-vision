"""
EOS RL Inference Script
Run trained PPO agent for live trading
"""

import os
import sys
import json
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from rl.features import extract_features, normalize_features


class RLTrader:
    """
    RL-based trading agent for live trading.
    """
    
    def __init__(self, model_path: str, window_size: int = 20):
        """
        Initialize the RL trader.
        
        Args:
            model_path: Path to trained PPO model
            window_size: Lookback window for features
        """
        from stable_baselines3 import PPO
        
        self.model = PPO.load(model_path)
        self.window_size = window_size
        self.price_history = []
        self.feature_history = []
        
    def prepare_observation(self, df: pd.DataFrame) -> np.ndarray:
        """
        Prepare observation from OHLCV data.
        
        Args:
            df: DataFrame with OHLCV data
        
        Returns:
            observation: numpy array for model input
        """
        # Extract features
        features, _ = extract_features(df)
        
        # Normalize features
        features = normalize_features(features)
        
        # Get last window_size timesteps
        if len(features) >= self.window_size:
            window = features[-self.window_size:]
        else:
            # Pad with zeros if not enough data
            padding = np.zeros((self.window_size - len(features), features.shape[1]))
            window = np.vstack([padding, features])
        
        # Flatten
        obs = window.flatten()
        
        # Add portfolio state (simplified)
        portfolio_state = np.array([1.0, 0.0, 1.0])  # 100% cash initially
        obs = np.concatenate([obs, portfolio_state]).astype(np.float32)
        
        return obs
    
    def predict(self, df: pd.DataFrame) -> dict:
        """
        Predict trading action.
        
        Args:
            df: DataFrame with OHLCV data
        
        Returns:
            prediction: dict with action and confidence
        """
        obs = self.prepare_observation(df)
        
        # Get action from model
        action, _ = self.model.predict(obs, deterministic=True)
        
        # Map action to label
        action_map = {0: "HOLD", 1: "BUY", 2: "SELL"}
        
        return {
            "action": action_map[action],
            "action_id": int(action),
            "timestamp": datetime.now().isoformat(),
        }
    
    def update_history(self, price: float, features: np.ndarray):
        """
        Update price and feature history.
        
        Args:
            price: Current price
            features: Current features
        """
        self.price_history.append(price)
        self.feature_history.append(features)
        
        # Keep only last 1000 entries
        if len(self.price_history) > 1000:
            self.price_history = self.price_history[-1000:]
            self.feature_history = self.feature_history[-1000:]


def run_inference(model_path: str, symbol: str = "BTCUSDT", interval: str = "1h"):
    """
    Run inference loop for a symbol.
    
    Args:
        model_path: Path to trained model
        symbol: Trading pair symbol
        interval: Kline interval
    """
    from binance.client import Client
    import time
    
    print("=" * 60)
    print("EOS RL Trading - Inference")
    print("=" * 60)
    
    # Initialize trader
    print(f"\n1. Loading model from {model_path}...")
    trader = RLTrader(model_path, window_size=20)
    print("   Model loaded successfully!")
    
    # Initialize Binance client
    client = Client("", "")
    
    # Main loop
    print(f"\n2. Starting inference loop for {symbol} ({interval})...")
    print("   Press Ctrl+C to stop\n")
    
    try:
        while True:
            # Fetch latest klines
            klines = client.get_klines(
                symbol=symbol,
                interval=interval,
                limit=100
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
            
            # Get prediction
            prediction = trader.predict(df)
            
            # Get current price
            current_price = float(df['Close'].iloc[-1])
            
            # Print prediction
            print(f"[{datetime.now().strftime('%H:%M:%S')}] "
                  f"{symbol}: ${current_price:.2f} -> {prediction['action']}")
            
            # Wait for next interval
            time.sleep(60)  # Check every minute
            
    except KeyboardInterrupt:
        print("\n\nInference stopped by user")


def export_onnx(model_path: str, output_path: str):
    """
    Export model to ONNX format for faster inference.
    
    Args:
        model_path: Path to trained model
        output_path: Output path for ONNX model
    """
    import torch
    
    from stable_baselines3 import PPO
    
    print("=" * 60)
    print("EOS RL Trading - ONNX Export")
    print("=" * 60)
    
    # Load model
    print(f"\n1. Loading model from {model_path}...")
    model = PPO.load(model_path)
    print("   Model loaded!")
    
    # Export to ONNX
    print(f"\n2. Exporting to ONNX format...")
    
    # Get observation space size
    obs_size = model.observation_space.shape[0]
    
    # Create dummy input
    dummy_input = torch.randn(1, obs_size)
    
    # Export
    torch.onnx.export(
        model.policy,
        dummy_input,
        output_path,
        opset_version=11,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch_size"}},
    )
    
    print(f"   ONNX model saved to: {output_path}")
    
    # Test ONNX
    print("\n3. Testing ONNX model...")
    import onnxruntime as ort
    
    session = ort.InferenceSession(output_path)
    
    # Test inference
    test_input = np.random.randn(1, obs_size).astype(np.float32)
    result = session.run(None, {"input": test_input})
    
    print(f"   ONNX inference successful!")
    print(f"   Input shape: {test_input.shape}")
    print(f"   Output shape: {result[0].shape}")


def main():
    """
    Main entry point.
    """
    import argparse
    
    parser = argparse.ArgumentParser(description="EOS RL Trading Inference")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Inference command
    infer_parser = subparsers.add_parser("infer", help="Run inference")
    infer_parser.add_argument("--model", required=True, help="Path to model")
    infer_parser.add_argument("--symbol", default="BTCUSDT", help="Trading pair")
    infer_parser.add_argument("--interval", default="1h", help="Kline interval")
    
    # Export command
    export_parser = subparsers.add_parser("export", help="Export to ONNX")
    export_parser.add_argument("--model", required=True, help="Path to model")
    export_parser.add_argument("--output", required=True, help="Output ONNX path")
    
    args = parser.parse_args()
    
    if args.command == "infer":
        run_inference(args.model, args.symbol, args.interval)
    elif args.command == "export":
        export_onnx(args.model, args.output)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
