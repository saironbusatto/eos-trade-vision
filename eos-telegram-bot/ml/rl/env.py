"""
EOS RL Trading Environment
Custom Gymnasium environment for cryptocurrency trading
"""

import numpy as np
import gymnasium as gym
from gymnasium import spaces
from typing import Optional, Tuple, Dict, Any


class CryptoTradingEnv(gym.Env):
    """
    Custom cryptocurrency trading environment for RL.
    
    Action Space: Discrete(3) - Hold(0), Buy(1), Sell(2)
    Observation Space: Window of features + portfolio state
    """
    
    metadata = {"render_modes": ["human", "rgb_array"]}
    
    def __init__(
        self,
        df: np.ndarray,
        feature_names: list,
        window_size: int = 20,
        initial_balance: float = 10000.0,
        transaction_fee: float = 0.001,
        render_mode: Optional[str] = None,
    ):
        super().__init__()
        
        self.df = df
        self.feature_names = feature_names
        self.window_size = window_size
        self.initial_balance = initial_balance
        self.transaction_fee = transaction_fee
        self.render_mode = render_mode
        
        # Number of features per timestep
        self.n_features = df.shape[1]
        
        # Action space: 0=Hold, 1=Buy, 2=Sell
        self.action_space = spaces.Discrete(3)
        
        # Observation space: window of features + portfolio state (3 values)
        obs_size = window_size * self.n_features + 3
        self.observation_space = spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(obs_size,),
            dtype=np.float32,
        )
        
        # Price column index (assume column 3 is Close)
        self.price_idx = 3  # Close price
        
        self.reset()
    
    def reset(
        self, seed: Optional[int] = None, options: Optional[Dict[str, Any]] = None
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        super().reset(seed=seed)
        
        self.current_step = self.window_size
        self.balance = self.initial_balance
        self.shares_held = 0
        self.cost_basis = 0.0
        self.total_shares_sold = 0
        self.total_sales_value = 0.0
        self.total_trades = 0
        self.max_portfolio_value = self.initial_balance
        
        return self._get_observation(), {}
    
    def step(self, action: int) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        current_price = self.df[self.current_step, self.price_idx]
        
        # Execute action
        if action == 1:  # Buy
            if self.balance > current_price * (1 + self.transaction_fee):
                max_shares = int(self.balance / (current_price * (1 + self.transaction_fee)))
                if max_shares > 0:
                    cost = max_shares * current_price * (1 + self.transaction_fee)
                    self.balance -= cost
                    self.shares_held += max_shares
                    self.cost_basis = (
                        (self.cost_basis * (self.shares_held - max_shares) + cost)
                        / self.shares_held
                    )
                    self.total_trades += 1
                    
        elif action == 2:  # Sell
            if self.shares_held > 0:
                revenue = self.shares_held * current_price * (1 - self.transaction_fee)
                self.balance += revenue
                self.total_shares_sold += self.shares_held
                self.total_sales_value += revenue
                self.shares_held = 0
                self.total_trades += 1
        
        # Move to next step
        self.current_step += 1
        
        # Calculate portfolio value
        new_price = self.df[self.current_step, self.price_idx]
        portfolio_value = self.balance + self.shares_held * new_price
        
        # Update max portfolio value
        self.max_portfolio_value = max(self.max_portfolio_value, portfolio_value)
        
        # Calculate reward
        reward = self._calculate_reward(portfolio_value)
        
        # Check if done
        terminated = self.current_step >= len(self.df) - 1
        truncated = portfolio_value <= 0
        
        # Info
        info = {
            "portfolio_value": portfolio_value,
            "balance": self.balance,
            "shares_held": self.shares_held,
            "total_trades": self.total_trades,
            "current_price": new_price,
        }
        
        return self._get_observation(), reward, terminated, truncated, info
    
    def _get_observation(self) -> np.ndarray:
        # Window of features
        start = self.current_step - self.window_size
        end = self.current_step
        window_data = self.df[start:end].flatten()
        
        # Portfolio state
        current_price = self.df[self.current_step, self.price_idx]
        portfolio_state = np.array([
            self.balance / self.initial_balance,
            self.shares_held * current_price / self.initial_balance,
            (self.balance + self.shares_held * current_price) / self.initial_balance,
        ])
        
        return np.concatenate([window_data, portfolio_state]).astype(np.float32)
    
    def _calculate_reward(self, portfolio_value: float) -> float:
        """
        Calculate reward based on:
        - Portfolio value change
        - Drawdown penalty
        - Trade penalty (to discourage overtrading)
        """
        # Basic return
        returns = (portfolio_value - self.initial_balance) / self.initial_balance
        
        # Drawdown penalty
        drawdown = (self.max_portfolio_value - portfolio_value) / self.max_portfolio_value
        drawdown_penalty = -0.5 * drawdown if drawdown > 0.1 else 0
        
        # Trade penalty (small)
        trade_penalty = -0.001 if self.total_trades > 0 else 0
        
        return returns + drawdown_penalty + trade_penalty
    
    def render(self):
        if self.render_mode == "human":
            portfolio_value = self.balance + self.shares_held * self.df[self.current_step, self.price_idx]
            print(
                f"Step: {self.current_step}, "
                f"Balance: ${self.balance:.2f}, "
                f"Shares: {self.shares_held}, "
                f"Portfolio: ${portfolio_value:.2f}"
            )
