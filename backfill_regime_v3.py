import sqlite3
import pandas as pd
import requests
import time
from datetime import datetime
import numpy as np
import sys

DB_PATH = 'eos-telegram-bot/data/eos.db'
BASE_URL = 'https://api.binance.com/api/v3/klines'
REPORT_PATH = 'backfill_regime_report.txt'
BATCH_SIZE = 50

# Use Session for pooling
session = requests.Session()

def get_historical_klines(symbol, end_ts_ms, lookback_candles=50, retries=3):
    start_ts = end_ts_ms - (lookback_candles * 5 * 60 * 1000)
    params = {
        'symbol': symbol,
        'interval': '5m',
        'startTime': start_ts,
        'endTime': end_ts_ms,
        'limit': lookback_candles + 15
    }
    
    for attempt in range(retries):
        try:
            r = session.get(BASE_URL, params=params, timeout=3)
            data = r.json()
            if isinstance(data, dict) and 'code' in data: # Error
                time.sleep(0.5)
                continue
            return data
        except Exception:
            time.sleep(0.5)
            
    return None

def calculate_manual_ta(df):
    try:
        # ATR / TR
        df['tr0'] = abs(df['high'] - df['low'])
        df['tr1'] = abs(df['high'] - df['close'].shift(1))
        df['tr2'] = abs(df['low'] - df['close'].shift(1))
        df['tr'] = df[['tr0', 'tr1', 'tr2']].max(axis=1)
        
        # ADX
        df['up'] = df['high'] - df['high'].shift(1)
        df['dn'] = df['low'].shift(1) - df['low']
        df['pos_dm'] = np.where((df['up'] > df['dn']) & (df['up'] > 0), df['up'], 0)
        df['neg_dm'] = np.where((df['dn'] > df['up']) & (df['dn'] > 0), df['dn'], 0)
        
        # EWM Smoothing
        alpha = 1/14
        df['tr_s'] = df['tr'].ewm(alpha=alpha, adjust=False).mean()
        df['pos_dm_s'] = df['pos_dm'].ewm(alpha=alpha, adjust=False).mean()
        df['neg_dm_s'] = df['neg_dm'].ewm(alpha=alpha, adjust=False).mean()
        
        df['pos_di'] = 100 * (df['pos_dm_s'] / df['tr_s'])
        df['neg_di'] = 100 * (df['neg_dm_s'] / df['tr_s'])
        df['dx'] = 100 * abs(df['pos_di'] - df['neg_di']) / (df['pos_di'] + df['neg_di'])
        df['adx'] = df['dx'].ewm(alpha=alpha, adjust=False).mean()
        df['atr'] = df['tr'].rolling(14).mean() 
        
        last = df.iloc[-1]
        adx = last['adx']
        atr = last['atr']
        
        if pd.isna(adx) or pd.isna(atr): return None, None, None
        
        # Regime Logic
        if adx > 25: regime = 'TRENDING'
        elif adx < 20: regime = 'RANGING'
        else: regime = 'CHOP'
        
        return round(adx, 2), round(atr, 4), regime
        
    except:
        return None, None, None

def run_robust_backfill():
    print("🚀 Starting Optimized Regime Backfill (v3)...")
    start_time = time.time()
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    total_trades = conn.execute("SELECT COUNT(*) FROM signals WHERE asset_type='CRYPTO'").fetchone()[0]
    initial_nulls = conn.execute("SELECT COUNT(*) FROM signals WHERE asset_type='CRYPTO' AND meta_adx IS NULL").fetchone()[0]
    print(f"Total: {total_trades} | Pending: {initial_nulls}")
    
    updated_total = 0
    errors_total = 0
    processed_symbols = {}
    
    while True:
        # Fetch Batch
        current_rows = conn.execute("SELECT id, symbol, created_at FROM signals WHERE asset_type='CRYPTO' AND meta_adx IS NULL LIMIT ?", (BATCH_SIZE,)).fetchall()
        
        if not current_rows:
            print("✅ DONE. No more rows.")
            break
            
        print(f"🔄 Processing batch of {len(current_rows)}...", end=' ', flush=True)
        
        updates = []
        batch_start = time.time()
        
        for idx, row in enumerate(current_rows):
            if idx > 0 and idx % 10 == 0:
                print(f"{idx}..", end=' ', flush=True)
                
            try:
                ts_dt = pd.to_datetime(row['created_at'])
                end_ts = int(ts_dt.timestamp() * 1000)
                
                klines = get_historical_klines(row['symbol'], end_ts)
                if not klines or len(klines) < 30:
                    errors_total += 1
                    continue
                    
                df = pd.DataFrame(klines, columns=['ts', 'open', 'high', 'low', 'close', 'v', 'ct', 'qv', 'n', 'tb', 'tq', 'i'])
                df[['high','low','close']] = df[['high','low','close']].astype(float)
                
                adx, atr, regime = calculate_manual_ta(df)
                
                if adx is not None:
                    updates.append((adx, atr, regime, row['id']))
                    processed_symbols[row['symbol']] = processed_symbols.get(row['symbol'], 0) + 1
                else:
                    errors_total += 1
                    
            except Exception as e:
                errors_total += 1
        
        # Commit Batch
        if updates:
            conn.executemany("UPDATE signals SET meta_adx=?, meta_atr=?, regime_type=? WHERE id=?", updates)
            conn.commit()
            updated_total += len(updates)
            elapsed = time.time() - batch_start
            print(f" Saved {len(updates)} (Rate: {len(updates)/elapsed:.1f} t/s) | Total: {updated_total}/{initial_nulls}")
        else:
            print(f" Skipped/Errors in batch.")
            
        # Avoid tight loops if failing fast
        if len(updates) == 0 and len(current_rows) > 0:
             time.sleep(1)
        
    duration = time.time() - start_time
    
    # Reports
    final_nulls = conn.execute("SELECT COUNT(*) FROM signals WHERE asset_type='CRYPTO' AND meta_adx IS NULL").fetchone()[0]
    regime_dist = pd.read_sql_query("SELECT regime_type, COUNT(*) as qtd FROM signals WHERE asset_type='CRYPTO' GROUP BY regime_type", conn)
    conn.close()
    
    with open(REPORT_PATH, 'w', encoding='utf-8') as f:
        f.write("BACKFILL REGIME REPORT V3\n")
        f.write("=========================\n")
        f.write(f"Trades Processed: {updated_total}\n")
        f.write(f"Errors: {errors_total}\n")
        f.write(f"Remaining NULLs: {final_nulls}\n")
        f.write(f"Time: {duration/60:.2f} min\n\n")
        f.write("Regime Dist:\n")
        f.write(regime_dist.to_string(index=False))
        
    print(f"\nReport saved: {REPORT_PATH}")

if __name__ == "__main__":
    run_robust_backfill()
