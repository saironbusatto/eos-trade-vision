import sqlite3
import pandas as pd
import requests
import time
from datetime import datetime
import numpy as np

DB_PATH = 'eos-telegram-bot/data/eos.db'
BASE_URL = 'https://api.binance.com/api/v3/klines'
TEST_LIMIT = 100

def get_historical_klines(symbol, end_ts_ms, lookback_candles=50):
    # Binance limits: use minimal required.
    # 50 candles * 5min = 250 min ~ 4 hours back.
    start_ts = end_ts_ms - (lookback_candles * 5 * 60 * 1000)
    
    params = {
        'symbol': symbol,
        'interval': '5m',
        'startTime': start_ts,
        'endTime': end_ts_ms, # Exclude the trade candle itself to filter look-ahead bias? 
                              # Actually "at entry", we know the current candle state up to that second, 
                              # but safely we should use "closed" candles.
                              # Let's fetch up to end_ts.
        'limit': lookback_candles + 5 # Buffer
    }
    
    try:
        r = requests.get(BASE_URL, params=params)
        data = r.json()
        if isinstance(data, dict) and 'code' in data:
            return None
        return data
    except:
        return None

def run_backfill(limit=None):
    print(f"🕵️ Iniciando Backfill de Regime (Limite: {limit or 'FULL'})")
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    # Select target trades (where meta_adx is NULL)
    query = "SELECT id, symbol, created_at FROM signals WHERE asset_type='CRYPTO' AND meta_adx IS NULL"
    if limit:
        query += f" LIMIT {limit}"
        
    trades = conn.execute(query).fetchall()
    print(f"📦 Processando {len(trades)} trades...")
    
    count = 0
    updates = []
    
    for t in trades:
        ts_str = t['created_at']
        try:
            ts_dt = pd.to_datetime(ts_str)
            end_ts = int(ts_dt.timestamp() * 1000)
            
            # Download history
            klines = get_historical_klines(t['symbol'], end_ts)
            if not klines or len(klines) < 20: 
                continue
                
            # Create DF
            df = pd.DataFrame(klines, columns=['ts', 'open', 'high', 'low', 'close', 'v', 'ct', 'qv', 'n', 'tb', 'tq', 'i'])
            df['high'] = df['high'].astype(float)
            df['low'] = df['low'].astype(float)
            df['close'] = df['close'].astype(float)
            
            # TA Logic (Manual implementation used if pandas_ta missing, but assuming environment standard.
            # Actually, standard pandas_ta might not be installed. Let's write raw pandas logic to be safe/standalone).
            
            # --- MANUAL ADX/ATR LOGIC ---
            df['tr0'] = abs(df['high'] - df['low'])
            df['tr1'] = abs(df['high'] - df['close'].shift(1))
            df['tr2'] = abs(df['low'] - df['close'].shift(1))
            df['tr'] = df[['tr0', 'tr1', 'tr2']].max(axis=1)
            df['atr'] = df['tr'].rolling(14).mean() # SMA method for ATR simple
            
            # ADX
            df['up'] = df['high'] - df['high'].shift(1)
            df['dn'] = df['low'].shift(1) - df['low']
            df['pos_dm'] = np.where((df['up'] > df['dn']) & (df['up'] > 0), df['up'], 0)
            df['neg_dm'] = np.where((df['dn'] > df['up']) & (df['dn'] > 0), df['dn'], 0)
            
            # Wilder Smoothing (approx with EMA for simplicity or full func)
            # Using EWM for speed: alpha = 1/14
            df['tr_s'] = df['tr'].ewm(alpha=1/14, adjust=False).mean()
            df['pos_dm_s'] = df['pos_dm'].ewm(alpha=1/14, adjust=False).mean()
            df['neg_dm_s'] = df['neg_dm'].ewm(alpha=1/14, adjust=False).mean()
            
            df['pos_di'] = 100 * (df['pos_dm_s'] / df['tr_s'])
            df['neg_di'] = 100 * (df['neg_dm_s'] / df['tr_s'])
            df['dx'] = 100 * abs(df['pos_di'] - df['neg_di']) / (df['pos_di'] + df['neg_di'])
            df['adx'] = df['dx'].ewm(alpha=1/14, adjust=False).mean()
            
            # Get values
            adx_val = df['adx'].iloc[-1]
            atr_val = df['atr'].iloc[-1]
            
            regime = 'TRENDING' if adx_val > 25 else 'RANGING'
            
            updates.append((round(adx_val, 2), round(atr_val, 4), regime, t['id']))
            count += 1
            
            time.sleep(0.1) # Rate limit
            
        except Exception as e:
            print(f"Error {t['id']}: {e}")
            continue
            
    # Batch Update
    if updates:
        conn.executemany("UPDATE signals SET meta_adx=?, meta_atr=?, regime_type=? WHERE id=?", updates)
        conn.commit()
        print(f"✅ Atualizados {len(updates)} trades.")
        
    conn.close()

if __name__ == "__main__":
    run_backfill(limit=TEST_LIMIT)
