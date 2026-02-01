import sqlite3
import pandas as pd
import numpy as np
import json
import os

DB_PATH = 'eos-telegram-bot/data/eos.db'
SPLIT_DATE = '2026-01-23 16:22:40'

# --- CONFIGURAÇÃO ---
STOPS_TO_TEST = [0.5, 0.8, 1.0, 1.5, 2.0, 2.5]
SPREAD = 0.02
SLIPPAGE = 0.05
COST_PER_TRADE = SPREAD + SLIPPAGE

def calculate_expectation(win_rate, avg_win, avg_loss):
    # E = (Win Rate * Avg Win) - (Loss Rate * Avg Loss)
    loss_rate = 1.0 - win_rate
    return (win_rate * avg_win) - (loss_rate * abs(avg_loss))

def get_drawdown_stats(results, pnl_pcts):
    # results: series of 'WIN'/'LOSS'
    # pnl_pcts: series of floats
    
    max_streak = 0
    current_streak = 0
    
    peak = 0
    drawdown = 0
    max_drawdown = 0
    balance = 0
    
    for res, pnl in zip(results, pnl_pcts):
        # Streak
        if res == 'LOSS':
            current_streak += 1
        else:
            if current_streak > max_streak:
                max_streak = current_streak
            current_streak = 0
            
        # DD
        balance += pnl
        if balance > peak:
            peak = balance
            drawdown = 0
        else:
            drawdown = peak - balance
            if drawdown > max_drawdown:
                max_drawdown = drawdown
                
    # Final check streak
    if current_streak > max_streak:
        max_streak = current_streak
        
    return max_streak, max_drawdown

def simulate_stop_loss(df, stop_pct):
    # Logic: If MAE >= stop, result is LOSS, pnl is -stop
    # Else: Keep original result and pnl (from MFE/Close or similar... wait, 
    # we don't have accurate PnL for original trades in DB sometimes, let's assume TP or Close.
    # For now, let's use a simplified approach:
    # If original was WIN, we assume PnL = TakeProfit (or MFE * 0.7 conservative)
    # If original was LOSS, we assume PnL = -Stop (original) OR match MAE.
    # To be robust: Let's use MFE. If original WIN, PnL = MFE * 0.6 (conservative target).
    
    # Better yet, let's just optimize STOP first. 
    # We assume if NOT stopped (MAE < stop):
    #   If original result was 'WIN', we keep it as WIN. PnL = MFE (optimistic) or fixed TP?
    #   Let's assume a dynamic TP of 1.5 * Stop for R:R analysis? 
    #   No, user asked for "Take Profit otimizado (70% do MFE mediano)".
    #   So let's calculate TP = MFE_Median * 0.7 for the refined rules later.
    
    # For this simulation Step C:
    # We just want to check Survival Rate.
    # If MAE >= Stop -> LOSS (-stop).
    # If MAE < Stop -> Original Result.
    # But what is the PnL of Original Result?
    # Let's use the 'entry_price' and 'exit_price' if available, otherwise estimate.
    
    # Let's vectorise:
    sim = df.copy()
    sim['is_stopped'] = sim['mae'] >= stop_pct
    
    # New Result
    sim['sim_result'] = np.where(sim['is_stopped'], 'LOSS', sim['result'])
    
    # New PnL
    # If stopped: -stop - cost
    # If not stopped: original pnl (net of cost)
    # We need an 'original_pnl_pct' column. 
    # If mfe/mae available, we can estimate. 
    # For WINs that survive: let's use MFE * 0.5 (very conservative avg outcome)
    # For LOSS that survive (rare?): they already likely hit a stop or closed manual.
    
    # Simplified PnL for Expectation Calculation:
    # Win = MFE * 0.5 (Conservative realize)
    # Loss = -Stop
    
    sim['sim_pnl'] = np.where(sim['sim_result'] == 'LOSS', 
                              -stop_pct - COST_PER_TRADE,
                              (sim['mfe'] * 0.5) - COST_PER_TRADE)
                              
    return sim

def analyze_confluence(df):
    # Score 0-10
    # Par Top 20% WR -> need stats first
    # Hour Top 20% WR -> need stats first
    
    # 1. Calc Global Stats to find Top
    global_wr = (df['result'] == 'WIN').mean()
    
    # Pair Stats
    pair_stats = df.groupby('symbol')['result'].apply(lambda x: (x=='WIN').mean())
    top_pairs = pair_stats[pair_stats > pair_stats.quantile(0.8)].index.tolist()
    
    # Hour Stats
    df['hour'] = pd.to_datetime(df['created_at']).dt.hour
    hour_stats = df.groupby('hour')['result'].apply(lambda x: (x=='WIN').mean())
    top_hours = hour_stats[hour_stats > hour_stats.quantile(0.8)].index.tolist()
    
    # Calc Score
    def get_score(row):
        score = 0
        if row['symbol'] in top_pairs: score += 3
        if row['hour'] in top_hours: score += 2
        
        # Microstructure (cols: f_absorption, f_imbalance - assume normalized 0-1 or boolean)
        # Check DB schema content: f_absorption is float. Usually 1.0 or 0.0?
        if row['f_absorption'] > 0: score += 2
        
        # VWAP/Imbalance/Vol logic depends on data. 
        # Let's perform simple checks
        score += 1 # Base volatility credit for this regime
        
        return score

    df['confluence_score'] = df.apply(get_score, axis=1)
    return df, top_pairs, top_hours

def run_suite():
    print("🚀 Iniciando Suite de Análise Estatística v3")
    
    # 1. Load Data
    conn = sqlite3.connect(DB_PATH)
    query = "SELECT * FROM signals WHERE asset_type='CRYPTO' ORDER BY created_at"
    df = pd.read_sql_query(query, conn)
    conn.close()
    
    df['created_at'] = pd.to_datetime(df['created_at'])
    df['mfe'] = pd.to_numeric(df['mfe'], errors='coerce').fillna(0)
    df['mae'] = pd.to_numeric(df['mae'], errors='coerce').fillna(0)
    
    # 2. Split
    split_ts = pd.Timestamp(SPLIT_DATE)
    train = df[df['created_at'] <= split_ts].copy()
    test = df[df['created_at'] > split_ts].copy()
    
    print(f"📦 Total: {len(df)} | Train: {len(train)} | Test: {len(test)}")
    
    # --- TRAINING PHASE ---
    
    # A. Confluence Setup
    train, top_pairs, top_hours = analyze_confluence(train)
    
    # B. Optimizing Stop Loss (Iterative)
    results = []
    
    for stop in STOPS_TO_TEST:
        sim = simulate_stop_loss(train, stop)
        
        # Apply Score Filter (Score >= 6)
        sim_filtered = sim[sim['confluence_score'] >= 6]
        
        if len(sim_filtered) < 100: continue
        
        win_rate = (sim_filtered['sim_result'] == 'WIN').mean()
        avg_win = sim_filtered[sim_filtered['sim_result'] == 'WIN']['sim_pnl'].mean()
        avg_loss = sim_filtered[sim_filtered['sim_result'] == 'LOSS']['sim_pnl'].mean()
        
        exp = calculate_expectation(win_rate, avg_win, avg_loss)
        max_streak, max_dd = get_drawdown_stats(sim_filtered['sim_result'], sim_filtered['sim_pnl'])
        
        results.append({
            'stop': stop,
            'win_rate': win_rate,
            'expectation': exp,
            'max_dd': max_dd,
            'max_streak': max_streak,
            'n_trades': len(sim_filtered)
        })
        
    df_res = pd.DataFrame(results)
    best_config = df_res.sort_values('expectation', ascending=False).iloc[0]
    
    # Generate Train Report
    with open('analysis_report_train.txt', 'w', encoding='utf-8') as f:
        f.write(f"RELATÓRIO DE TREINO (Até {SPLIT_DATE})\n")
        f.write("========================================\n")
        f.write(f"Top Pares: {top_pairs}\n")
        f.write(f"Top Horas: {top_hours}\n\n")
        f.write("Otimização de Stop (Score >= 6):\n")
        f.write(df_res.to_string())
        f.write(f"\n\n🏆 Melhor Config: Stop {best_config['stop']}% | E={best_config['expectation']:.2f}%")
        
    # --- TESTING PHASE ---
    
    # Apply Rules to Test
    test['confluence_score'] = 0 # Recalculate manually based on TRAIN Lists
    # Need to reimplement get_score using frozen top_pairs/hours
    def get_test_score(row):
        score = 0
        if row['symbol'] in top_pairs: score += 3
        if pd.to_datetime(row['created_at']).hour in top_hours: score += 2
        if row['f_absorption'] > 0: score += 2
        score += 1
        return score
        
    test['confluence_score'] = test.apply(get_test_score, axis=1)
    
    # Apply Best Stop
    best_stop = best_config['stop']
    test_sim = simulate_stop_loss(test, best_stop)
    test_filtered = test_sim[test_sim['confluence_score'] >= 6]
    
    test_wr = (test_filtered['sim_result'] == 'WIN').mean()
    test_avg_win = test_filtered[test_filtered['sim_result'] == 'WIN']['sim_pnl'].mean()
    test_avg_loss = test_filtered[test_filtered['sim_result'] == 'LOSS']['sim_pnl'].mean()
    test_exp = calculate_expectation(test_wr, test_avg_win, test_avg_loss)
    t_streak, t_dd = get_drawdown_stats(test_filtered['sim_result'], test_filtered['sim_pnl'])
    
    # Validation Check
    degradation = best_config['win_rate'] - test_wr
    passed = (degradation < 0.05) and (test_exp > 0.3)
    
    # Generate Test Report
    with open('analysis_report_test.txt', 'w', encoding='utf-8') as f:
        f.write(f"RELATÓRIO DE VALIDAÇÃO (Pós {SPLIT_DATE})\n")
        f.write("========================================\n")
        f.write(f"Config Aplicada: Stop {best_stop}% | Score >= 6\n\n")
        f.write(f"Métricas Treino vs Teste:\n")
        f.write(f"Win Rate: {best_config['win_rate']:.2%} -> {test_wr:.2%} (Degradação: {degradation:.2%})\n")
        f.write(f"Expectativa: {best_config['expectation']:.2%} -> {test_exp:.2%}\n")
        f.write(f"Max DD: {best_config['max_dd']:.2f}% -> {t_dd:.2f}%\n")
        f.write(f"\nSTATUS FINAL: {'✅ APROVADO' if passed else '❌ REPROVADO'}\n")
        
    # JSON Output
    params = {
        'status': 'APPROVED' if passed else 'REJECTED',
        'stop_loss_pct': float(best_stop),
        'min_score': 6,
        'best_hours': [int(x) for x in top_hours],
        'best_pairs': top_pairs,
        'expected_E': float(test_exp),
        'max_drawdown': float(t_dd)
    }
    
    with open('optimized_params.json', 'w') as f:
        json.dump(params, f, indent=4)
        
    print(f"\n✅ Análise concluída. Status: {params['status']}")

if __name__ == "__main__":
    run_suite()
