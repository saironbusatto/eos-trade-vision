import sqlite3
import pandas as pd
import numpy as np

DB_PATH = 'eos-telegram-bot/data/eos.db'
MIN_TRADES = 30 # Ignorar grupos pequenos demais
COST = 0.07 # Spread + Slippage + Fees (custo estimado)

# Parâmetros Base para Simulação (Pode ser ajustado)
STOP_MULT = 1.5
TP_MULT = 3.0

def load_data():
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("SELECT * FROM signals WHERE asset_type='CRYPTO' ORDER BY created_at", conn)
    conn.close()
    
    # Conversões
    df['created_at'] = pd.to_datetime(df['created_at'])
    cols = ['mfe', 'mae', 'entry_price', 'meta_atr', 'meta_adx']
    for c in cols:
        df[c] = pd.to_numeric(df[c], errors='coerce')
        
    df = df.dropna(subset=cols + ['regime_type'])
    return df

def simulate_pnl(row):
    # Simulação linha a linha (lenta, mas flexível para vetorizar depois)
    # Stop/TP definidos pelo ATR da linha
    stop_dist = row['meta_atr'] * STOP_MULT
    tp_dist = row['meta_atr'] * TP_MULT
    
    stop_pct = (stop_dist / row['entry_price']) * 100
    tp_pct = (tp_dist / row['entry_price']) * 100
    
    # Logic
    hit_stop = row['mae'] >= stop_pct
    hit_tp = row['mfe'] >= tp_pct
    
    if hit_stop: return -stop_pct - COST
    if hit_tp: return tp_pct - COST
    return -COST # Time Stop / Draw

def add_dimensions(df):
    # 1. Volatility Buckets (Proxy for Fear/Greed context per Asset)
    # Precisamos normalizar o ATR pelo preço para comparar (ATR %)
    df['atr_pct'] = (df['meta_atr'] / df['entry_price']) * 100
    
    # Categorizar em tercis (Low, Med, High) POR SYMBOL
    def safe_qcut(x):
        if len(x) <= 10: return 'UNKNOWN'
        try:
            return pd.qcut(x, 3, labels=['LOW_VOL', 'MED_VOL', 'HIGH_VOL'])
        except ValueError:
            # Fallback for duplicates
            try:
                # Let pandas generate labels automatically then map, or just bins
                bins = pd.qcut(x, 3, duplicates='drop')
                # Map intervals to Low/Med/High roughly? 
                # Simpler: Just try fewer bins
                return pd.qcut(x, 2, labels=['LOW_VOL', 'HIGH_VOL'], duplicates='drop')
            except:
                return 'MED_VOL'

    df['vol_cat'] = df.groupby('symbol')['atr_pct'].transform(safe_qcut)
    
    # 2. Session (Asia, London, NY)
    # Hour UTC
    df['hour'] = df['created_at'].dt.hour
    df['session'] = pd.cut(df['hour'], 
                           bins=[-1, 8, 16, 24], 
                           labels=['ASIA', 'LONDON', 'NY'])
                           
    return df

def mine_data():
    print("⛏️ Minerando dados... (Carregando DB)")
    df = load_data()
    print(f"📉 Dados Brutos: {len(df)} trades")
    
    df = add_dimensions(df)
    
    # Pre-calc PnL (Vectorized)
    # Stop % Global reference
    stop_pct_col = (df['meta_atr'] * STOP_MULT / df['entry_price']) * 100
    tp_pct_col = (df['meta_atr'] * TP_MULT / df['entry_price']) * 100
    
    # Conditions
    loss_cond = df['mae'] >= stop_pct_col
    win_cond = (~loss_cond) & (df['mfe'] >= tp_pct_col)
    
    df['sim_pnl'] = np.where(loss_cond, -stop_pct_col - COST, 
                             np.where(win_cond, tp_pct_col - COST, -COST))
    
    df['is_win'] = win_cond
    
    # Stratification Levels
    combinations = [
        ['symbol'], # Level 1: Just Symbol
        ['regime_type'], # Level 1: Just Regime
        ['vol_cat'], # Level 1: Just Vol
        ['symbol', 'regime_type'], # Level 2
        ['symbol', 'vol_cat'],     # Level 2
        ['regime_type', 'vol_cat'], # Level 2
        ['session', 'regime_type']  # Level 2
    ]
    
    report = []
    
    print("🔍 Analisando combinações...")
    
    for comb in combinations:
        grouped = df.groupby(comb)
        
        # Agregação rápida
        stats = grouped.agg(
            n=('id', 'count'),
            win_rate=('is_win', 'mean'),
            avg_pnl=('sim_pnl', 'mean') 
            # Avg PnL aqui já serve como proxy de Expectativa ($%)
        ).reset_index()
        
        # Filtro de Significância
        stats = stats[stats['n'] >= MIN_TRADES]
        
        # Formatar Report
        for _, row in stats.iterrows():
            # Criar chave legível (ex: "SOLUSDT | TRENDING")
            label = " + ".join([str(row[c]) for c in comb])
            
            report.append({
                'Segment': label,
                'Criteria': str(comb),
                'N': row['n'],
                'WinRate': row['win_rate'],
                'Avg_Exp': row['avg_pnl'] # Expectativa por trade em %
            })
            
    # Criar DataFrame final e ordernar
    res = pd.DataFrame(report)
    
    if res.empty:
        print("❌ Nenhum segmento encontrado com N > 30.")
        return

    best = res.sort_values('Avg_Exp', ascending=False).head(20)
    worst = res.sort_values('Avg_Exp', ascending=True).head(10)
    
    print("\n💎 TOP 20 SEGMENTOS LUCRATIVOS (Expectativa % por trade):")
    print(best.to_string(index=False))
    
    print("\n💀 FLOP 10 SEGMENTOS:")
    print(worst.to_string(index=False))
    
    # Salvar em CSV para o user validar se quiser
    res.to_csv('stratification_results.csv', index=False)
    print("\n📄 Resultados completos salvos em 'stratification_results.csv'")

if __name__ == "__main__":
    mine_data()
