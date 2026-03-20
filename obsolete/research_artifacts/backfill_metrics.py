import sqlite3
import pandas as pd
import requests
import time
from datetime import datetime, timedelta

DB_PATH = 'eos-telegram-bot/data/eos.db'
BASE_URL = 'https://api.binance.com/api/v3/klines'

def get_klines(symbol, start_ts, end_ts, interval='5m'):
    klines = []
    limit = 1000
    
    current_start = int(start_ts)
    end_ts = int(end_ts)
    
    while current_start < end_ts:
        print(f"   Downloading {symbol} from {datetime.fromtimestamp(current_start/1000)}...")
        params = {
            'symbol': symbol,
            'interval': interval,
            'startTime': current_start,
            'endTime': end_ts,
            'limit': limit
        }
        try:
            r = requests.get(BASE_URL, params=params)
            data = r.json()
            
            if isinstance(data, dict) and 'code' in data:
                print(f"   ❌ Error: {data}")
                break
                
            if not data:
                break
                
            klines.extend(data)
            last_close_time = data[-1][6]
            current_start = last_close_time + 1
            
            time.sleep(0.1) # Rate limit
            
        except Exception as e:
            print(f"   ❌ Request Error: {e}")
            time.sleep(1)
            
    return klines

def calculate_metrics(trade, df_klines):
    # Trade: id, symbol, entry_price, action, timestamp
    # df_klines: index=timestamp (ms), columns=[high, low, close, volume, vwap_candle]
    
    entry_time = pd.to_datetime(trade['timestamp']).timestamp() * 1000
    entry_price = float(trade['entry_price'])
    direction = 1 if trade['action'] == 'BUY' else -1
    
    # Filter candles AFTER entry (up to 24h or exit)
    # Assuming valid analysis window of 2 hours for MFE/MAE optimization or until result
    # For now, let's look at next 4 hours (48 candles of 5m)
    future_candles = df_klines[df_klines.index >= entry_time].head(48)
    
    if len(future_candles) == 0:
        return None, None, None
        
    # MFE (Max profit)
    if direction == 1:
        max_price = future_candles['high'].max()
        mfe = (max_price - entry_price) / entry_price * 100
        
        min_price = future_candles['low'].min()
        mae = (entry_price - min_price) / entry_price * 100
    else:
        min_price = future_candles['low'].min()
        mfe = (entry_price - min_price) / entry_price * 100
        
        max_price = future_candles['high'].max()
        mae = (max_price - entry_price) / entry_price * 100

    # VWAP (Simplified: Volume Weighted Average Price of the future window)
    # trade_vwap = (future_candles['close'] * future_candles['volume']).sum() / future_candles['volume'].sum()
    # Actually User requested VWAP Distance usually. But let's store the VWAP of the entry candle or period.
    # For now, let's store VWAP of the entry metric window.
    vwap = (future_candles['close'] * future_candles['volume']).sum() / future_candles['volume'].sum()

    return round(mfe, 2), round(mae, 2), round(vwap, 4)

def run():
    print(f"🚀 Iniciando Backfill em {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    # 1. Get Trades
    trades = conn.execute("SELECT id, symbol, action, entry_price, created_at as timestamp FROM signals WHERE asset_type='CRYPTO' AND mfe IS NULL").fetchall()
    print(f"📦 Total Trades para processar: {len(trades)}")
    
    # Group by Symbol
    df_trades = pd.DataFrame([dict(t) for t in trades])
    if df_trades.empty:
        print("✅ Nada a processar.")
        return

    symbols = df_trades['symbol'].unique()
    
    total_updated = 0
    
    for symbol in symbols:
        print(f"\n🔄 Processando {symbol}...")
        symbol_trades = df_trades[df_trades['symbol'] == symbol]
        
        # Determine range
        min_ts = pd.to_datetime(symbol_trades['timestamp'].min()).timestamp() * 1000
        max_ts = pd.to_datetime(symbol_trades['timestamp'].max()).timestamp() * 1000 + (4 * 3600 * 1000) # +4h buffer
        
        # Download Candles
        raw_klines = get_klines(symbol, min_ts, max_ts)
        
        if not raw_klines:
            print("   ⚠️ Sem candles baixados.")
            continue
            
        # Process Candles to DF
        # Binance: [Open Time, Open, High, Low, Close, Volume, ...]
        df_k = pd.DataFrame(raw_klines, columns=['ts', 'open', 'high', 'low', 'close', 'volume', 'ct', 'qv', 'n', 'tb', 'tq', 'i'])
        df_k['ts'] = df_k['ts'].astype(int)
        df_k['high'] = df_k['high'].astype(float)
        df_k['low'] = df_k['low'].astype(float)
        df_k['close'] = df_k['close'].astype(float)
        df_k['volume'] = df_k['volume'].astype(float)
        df_k.set_index('ts', inplace=True)
        
        batch_updates = []
        
        for idx, trade in symbol_trades.iterrows():
            mfe, mae, vwap = calculate_metrics(trade, df_k)
            if mfe is not None:
                batch_updates.append((mfe, mae, vwap, trade['id']))
                
        if batch_updates:
            conn.executemany("UPDATE signals SET mfe=?, mae=?, vwap=? WHERE id=?", batch_updates)
            conn.commit()
            total_updated += len(batch_updates)
            print(f"   ✅ Atualizados {len(batch_updates)} trades.")
            
    print(f"\n🏁 Concluido. Total Atualizados: {total_updated}")
    conn.close()

if __name__ == "__main__":
    run()
