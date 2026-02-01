import sqlite3
import pandas as pd
import numpy as np
import json

DB_PATH = 'eos-telegram-bot/data/eos.db'
SPLIT_DATE = '2026-01-23 16:22:40'
SPREAD = 0.02
SLIPPAGE = 0.05
COST_PER_TRADE = SPREAD + SLIPPAGE

def calculate_expectation(win_rate, avg_win, avg_loss):
    return (win_rate * avg_win) - ((1 - win_rate) * abs(avg_loss))

def get_drawdown_stats(results, pnl_pcts):
    max_streak = 0
    current_streak = 0
    peak = 0
    drawdown = 0
    max_drawdown = 0
    balance = 0
    for res, pnl in zip(results, pnl_pcts):
        if res == 'LOSS':
            current_streak += 1
        else:
            if current_streak > max_streak: max_streak = current_streak
            current_streak = 0
        balance += pnl
        if balance > peak:
            peak = balance
            drawdown = 0
        else:
            drawdown = peak - balance
            if drawdown > max_drawdown: max_drawdown = drawdown
    if current_streak > max_streak: max_streak = current_streak
    return max_streak, max_drawdown

def simulate_strategy(df, stop_multiplier_atr, tp_multiplier_atr, regime):
    # Logic based on Regime
    # ATR is in 'meta_atr'. Price is 'entry_price'.
    # Stop Size % = (meta_atr * stop_mult / entry_price) * 100
    
    sim = df.copy()
    
    # Check if ATR valid
    sim = sim.dropna(subset=['meta_atr', 'entry_price'])
    
    # Calculate Dynamic Stop %
    sim['stop_pct_val'] = (sim['meta_atr'] * stop_multiplier_atr / sim['entry_price']) * 100
    sim['tp_pct_val'] = (sim['meta_atr'] * tp_multiplier_atr / sim['entry_price']) * 100
    
    # Apply logic
    # Loss if MAE >= Stop
    sim['is_stopped'] = sim['mae'] >= sim['stop_pct_val']
    
    # TP Logic (Assume hit if MFE >= TP)
    sim['is_tp'] = sim['mfe'] >= sim['tp_pct_val']
    
    # Outcome
    # Priority: usually Stop happens first if chopped, but depends on granularity.
    # Metric conservative: If stopped, always LOSS. If TP and NOT Stopped => WIN.
    # Ambiguous (MAE>Stop and MFE>TP): Assume STOP first (Conservative).
    
    conditions = [
        sim['is_stopped'], 
        (~sim['is_stopped']) & (sim['is_tp']),
        (~sim['is_stopped']) & (~sim['is_tp'])
    ]
    choices = ['LOSS', 'WIN', sim['result']] # If neither, keep original? Or TimeExit?
    
    # If original was WIN but we didn't hit our TP? 
    # original 'result' assumes the bot's logic. 
    # If we are testing NEW logic, we strictly follow IS_TP or IS_STOP.
    # If neither reached? Close at end of candle? 
    # Let's assume Close PnL = original PnL (approx) or 0.
    
    sim['sim_result'] = np.select(conditions, choices, default='DRAW')
    
    # PnL
    # Loss = -Stop%
    # Win = +TP%
    sim['sim_pnl'] = np.where(sim['sim_result']=='LOSS', -sim['stop_pct_val'] - COST_PER_TRADE,
                              np.where(sim['sim_result']=='WIN', sim['tp_pct_val'] - COST_PER_TRADE,
                                       0)) # Draw/Orig
                                       
    return sim

def run_analysis_v4():
    print("🚀 Análise v4: Regime-Based Optimization")
    
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("SELECT * FROM signals WHERE asset_type='CRYPTO' ORDER BY created_at", conn)
    conn.close()
    
    df['created_at'] = pd.to_datetime(df['created_at'])
    split_ts = pd.Timestamp(SPLIT_DATE)
    
    train = df[df['created_at'] <= split_ts].copy()
    test = df[df['created_at'] > split_ts].copy()
    
    # Filter Regimes (Train)
    train_trend = train[train['regime_type'] == 'TRENDING']
    train_range = train[train['regime_type'] == 'RANGING']
    
    print(f"Train Sizes -> Trends: {len(train_trend)}, Ranges: {len(train_range)}")
    
    # Review needed params
    # Trend: Wide Stpos (2x ATR?), TP let run?
    # Range: Tight Stops (1x ATR?), TP Quick (1.5x ATR?)
    
    pass ## To be continued

if __name__ == "__main__":
    run_analysis_v4()
