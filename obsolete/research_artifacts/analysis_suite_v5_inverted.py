import sqlite3
import pandas as pd
import numpy as np
import json
import os

DB_PATH = 'eos-telegram-bot/data/eos.db'
SPLIT_DATE = '2026-01-23 16:22:40'
SPREAD = 0.02
SLIPPAGE = 0.05
COST_PER_TRADE = SPREAD + SLIPPAGE + 0.02 # Adding a bit more buffer for swap costs/funding if applicable, or keep strict.

# --- CONFIGS TO TEST ---
# We keep same grid to be comparable
TREND_STOPS = [1.5, 2.0, 2.5, 3.0, 4.0] 
TREND_TPS = [2.0, 3.0, 4.0, 5.0, 10.0] 

RANGE_STOPS = [0.5, 0.8, 1.0, 1.2, 1.5]
RANGE_TPS = [0.8, 1.0, 1.2, 1.5] 

def calculate_expectation(win_rate, avg_win, avg_loss):
    if win_rate == 0: return -abs(avg_loss or 1)
    return (win_rate * avg_win) - ((1 - win_rate) * abs(avg_loss))

def simulate_strategy(df, stop_mult, tp_mult):
    if df.empty: return df
    
    sim = df.copy()
    
    # Calc dynamic levels
    sim['stop_dist'] = sim['meta_atr'] * stop_mult
    sim['tp_dist'] = sim['meta_atr'] * tp_mult
    
    # % Terms
    sim['stop_pct'] = (sim['stop_dist'] / sim['entry_price']) * 100
    sim['tp_pct'] = (sim['tp_dist'] / sim['entry_price']) * 100
    
    # Logic
    sim['hit_stop'] = sim['mae'] >= sim['stop_pct']
    sim['hit_tp'] = sim['mfe'] >= sim['tp_pct']
    
    conditions = [
        sim['hit_stop'],
        (~sim['hit_stop']) & (sim['hit_tp'])
    ]
    choices = ['LOSS', 'WIN']
    sim['sim_result'] = np.select(conditions, choices, default='DRAW')
    
    sim['sim_pnl'] = np.where(sim['sim_result']=='LOSS', -sim['stop_pct'] - COST_PER_TRADE,
                              np.where(sim['sim_result']=='WIN', sim['tp_pct'] - COST_PER_TRADE,
                                       -COST_PER_TRADE))
                                       
    return sim

def optimize_grid(df, stops, tps, name="Generic"):
    best_res = None
    best_exp = -999
    
    print(f"   Running Inverted Optimization for {name} ({len(df)} trades)...")
    
    for s in stops:
        for t in tps:
            sim = simulate_strategy(df, s, t)
            
            wr = (sim['sim_result']=='WIN').mean()
            if len(sim[sim['sim_result']=='WIN']) > 0:
                avg_win = sim[sim['sim_result']=='WIN']['sim_pnl'].mean()
            else: avg_win = 0
            
            if len(sim[sim['sim_result']=='LOSS']) > 0:
                avg_loss = sim[sim['sim_result']=='LOSS']['sim_pnl'].mean()
            else: avg_loss = 0
            
            exp = calculate_expectation(wr, avg_win, avg_loss)
            
            if exp > best_exp:
                best_exp = exp
                best_res = {
                    'stop_atr': s,
                    'tp_atr': t,
                    'win_rate': wr,
                    'expectation': exp,
                    'n_trades': len(sim)
                }
                
    return best_res

def run_suite():
    print("🚀 Análise v5: INVERTED LOGIC CHECK")
    
    # 1. Load
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("SELECT * FROM signals WHERE asset_type='CRYPTO' ORDER BY created_at", conn)
    conn.close()
    
    df['created_at'] = pd.to_datetime(df['created_at'])
    df['mfe'] = pd.to_numeric(df['mfe'], errors='coerce')
    df['mae'] = pd.to_numeric(df['mae'], errors='coerce')
    df['entry_price'] = pd.to_numeric(df['entry_price'], errors='coerce')
    
    # Filter NULLs
    df = df.dropna(subset=['meta_atr', 'regime_type', 'mfe', 'mae'])
    
    # --- CRITICAL STEP: INVERT LOGIC ---
    print("🔄 SWAPPING MFE & MAE (Simulation of Reverse Trade)...")
    # Store original MFE in temp
    df['original_mfe'] = df['mfe']
    df['mfe'] = df['mae'] # New Favorable = Old Adverse (Short wins if price drops)
    df['mae'] = df['original_mfe'] # New Adverse = Old Favorable (Short loses if price rises)
    # -----------------------------------
    
    # 2. Split
    split_ts = pd.Timestamp(SPLIT_DATE)
    train = df[df['created_at'] <= split_ts].copy()
    test = df[df['created_at'] > split_ts].copy()
    
    # 3. Segregate by Regime
    train_trend = train[train['regime_type'] == 'TRENDING']
    train_range = train[train['regime_type'] == 'RANGING']
    
    test_trend = test[test['regime_type'] == 'TRENDING']
    test_range = test[test['regime_type'] == 'RANGING']
    
    # 4. Optimizations
    res_trend = optimize_grid(train_trend, TREND_STOPS, TREND_TPS, "TRENDING (INVERTED)")
    res_range = optimize_grid(train_range, RANGE_STOPS, RANGE_TPS, "RANGING (INVERTED)")
    
    # 5. Validation on Test
    
    def get_metrics(df, col='sim_result'):
        if df.empty or col not in df.columns: return 0.0, 0.0
        wr = (df[col]=='WIN').mean()
        avg_win = df[df[col]=='WIN']['sim_pnl'].mean() if wr > 0 else 0
        has_loss = len(df[df[col]=='LOSS']) > 0
        avg_loss = df[df[col]=='LOSS']['sim_pnl'].mean() if has_loss else 0
        exp = calculate_expectation(wr, avg_win, avg_loss)
        return wr, exp

    # Apply Trend Params
    val_trend_df = simulate_strategy(test_trend, res_trend['stop_atr'] if res_trend else 2.0, res_trend['tp_atr'] if res_trend else 2.0)
    val_trend_wr, val_trend_exp = get_metrics(val_trend_df)
    
    # Apply Range Params
    val_range_df = simulate_strategy(test_range, res_range['stop_atr'] if res_range else 1.0, res_range['tp_atr'] if res_range else 1.0)
    val_range_wr, val_range_exp = get_metrics(val_range_df)
                                          
    # 6. Report
    with open('analysis_report_v5_inverted.txt', 'w', encoding='utf-8') as f:
        f.write("RELATÓRIO DE ANÁLISE V5 (LÓGICA INVERTIDA)\n")
        f.write("==========================================\n")
        f.write("Teste de Hipótese: 'Se comprarmos quando o bot manda vender (e vice-versa), ganhamos dinheiro?'\n\n")
        
        f.write("1. ESTRATÉGIA TRENDING INVERTIDA (ADX > 25)\n")
        if res_trend:
            f.write(f"   Best Train: Stop {res_trend['stop_atr']}xATR | TP {res_trend['tp_atr']}xATR | E={res_trend['expectation']:.2f}%\n")
        f.write(f"   Validation: E={val_trend_exp:.2f}% | WR={val_trend_wr:.1%}\n\n")
        
        f.write("2. ESTRATÉGIA RANGING INVERTIDA (ADX < 20)\n")
        if res_range:
            f.write(f"   Best Train: Stop {res_range['stop_atr']}xATR | TP {res_range['tp_atr']}xATR | E={res_range['expectation']:.2f}%\n")
        f.write(f"   Validation: E={val_range_exp:.2f}% | WR={val_range_wr:.1%}\n\n")
        
        passed = (val_trend_exp > 0) or (val_range_exp > 0)
        f.write(f"STATUS FINAL: {'✅ POTENCIAL ENCONTRADO' if passed else '💀 SEM EDGE (Ruído)'}\n")
        
    print(f"\n✅ Análise Invertida concluída. Relatório salvo.")
    print(f"Inverted Trends E: {val_trend_exp:.2f}%")
    print(f"Inverted Ranges E: {val_range_exp:.2f}%")

if __name__ == "__main__":
    run_suite()
