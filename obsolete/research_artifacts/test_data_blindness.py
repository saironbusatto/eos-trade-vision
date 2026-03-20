import requests
import time
import sys
from datetime import datetime, timedelta

# Force valid encoding for stdout just in case
sys.stdout.reconfigure(encoding='utf-8')

SYMBOL = 'SOLUSDT'
LOOKBACK_MIN = 60
BASE_URL = 'https://api.binance.com/api/v3/aggTrades'

def fetch_limited(symbol, start_ts, end_ts):
    params = {
        'symbol': symbol,
        'startTime': start_ts,
        'endTime': end_ts,
        'limit': 1000
    }
    r = requests.get(BASE_URL, params=params)
    return r.json()

def fetch_full_robust(symbol, start_ts, end_ts):
    all_trades = []
    current_start = start_ts
    
    print(f"   Fetching FULL history (paging)...")
    
    while current_start < end_ts:
        params = {
            'symbol': symbol,
            'startTime': current_start,
            'endTime': end_ts,
            'limit': 1000
        }
        try:
            r = requests.get(BASE_URL, params=params)
            trades = r.json()
        except Exception as e:
            print(f"Error fetching: {e}")
            time.sleep(1)
            continue
            
        if not trades:
            break
            
        all_trades.extend(trades)
        last_ts = trades[-1]['T']
        
        if last_ts >= end_ts:
            break
            
        if len(trades) == 1000:
            current_start = last_ts + 1
        else:
            current_start = end_ts + 1000 
            
    return all_trades

def run_test():
    print("TESTE DE CEGUEIRA DE DADOS (DATA BLINDNESS PROOF)")
    print(f"Alvo: {SYMBOL} | Janela: {LOOKBACK_MIN} minutos")
    
    end_time = int(time.time() * 1000)
    start_time = end_time - (LOOKBACK_MIN * 60 * 1000)
    
    start_dt = datetime.fromtimestamp(start_time/1000)
    end_dt = datetime.fromtimestamp(end_time/1000)
    
    print(f"Period: {start_dt} -> {end_dt}")
    print("-" * 50)
    
    # 1. Fetch "Current Bot Logic"
    print("1. Simulando Bot Atual (Limit=1000)...")
    t0 = time.time()
    legacy_trades = fetch_limited(SYMBOL, start_time, end_time)
    
    if not legacy_trades:
        print("Failed to fetch legacy trades.")
        return

    first_legacy = legacy_trades[0]['T']
    last_legacy = legacy_trades[-1]['T']
    
    covered_ms = last_legacy - first_legacy
    covered_min = covered_ms / 60000
    
    # Calculate Blindness metrics
    blind_min = LOOKBACK_MIN - covered_min
    
    print(f"   [OK] Recebidos: {len(legacy_trades)} trades")
    print(f"   [TIME] Tempo coberto: {covered_min:.2f} minutos")
    
    # 2. Fetch "Real Data"
    print("2. Buscando Dados Reais (Paginacao Completa)...")
    real_trades = fetch_full_robust(SYMBOL, start_time, end_time)
    
    print(f"   [OK] Recebidos: {len(real_trades)} trades")
    print("-" * 50)
    
    # 3. Report Generation
    missing_trades = len(real_trades) - len(legacy_trades)
    missing_pct = (missing_trades / len(real_trades)) * 100 if len(real_trades) > 0 else 0
    
    try:
        with open('blindness_report.txt', 'w', encoding='utf-8') as f:
            f.write("TESTE DE CEGUEIRA DE DADOS\n")
            f.write("--------------------------\n")
            f.write(f"1. Bot Atual (Limit 1000):\n")
            f.write(f"   - Trades: {len(legacy_trades)}\n")
            f.write(f"   - Tempo Coberto: {covered_min:.2f} min\n")
            f.write(f"   - O resto ({blind_min:.2f} min) e ignorado.\n\n")
            
            f.write(f"2. Realidade (Full History):\n")
            f.write(f"   - Trades: {len(real_trades)}\n")
            f.write(f"   - Tempo Coberto: {((real_trades[-1]['T'] - real_trades[0]['T']) / 60000):.2f} min\n\n")
            
            f.write(f"VEREDITO:\n")
            f.write(f"   - Perda de Dados: {missing_pct:.2f}%\n")
            f.write(f"   - Trades Ignorados: {missing_trades}\n")
            
            if missing_pct > 50:
                f.write("\nCONCLUSAO: O sistema esta cego. A aleatoriedade e esperada.\n")
                
        print("Report saved to blindness_report.txt")
        
    except Exception as e:
        print(f"Error writing report: {e}")

if __name__ == "__main__":
    run_test()
