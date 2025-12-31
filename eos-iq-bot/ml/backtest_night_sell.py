"""
EoS IQ ML - Backtest Horário Noturno
Testa padrão: SELL em GBP/CAD e AUD/CAD entre 22:00-01:30 UTC
"""

import numpy as np
import pandas as pd
import yfinance as yf
from pathlib import Path
from datetime import datetime

DATA_DIR = Path(__file__).parent.parent / "data"


def fetch_intraday_data():
    """Baixa dados intraday de GBP/CAD e AUD/CAD."""
    print("="*60)
    print("   Baixando Dados Intraday")
    print("="*60)
    
    pairs = {
        'GBPCAD=X': 'GBP/CAD',
        'AUDCAD=X': 'AUD/CAD',
    }
    
    all_data = []
    
    for ticker, name in pairs.items():
        print(f"\nBaixando {name} ({ticker})...")
        try:
            ticker_obj = yf.Ticker(ticker)
            # Pegar 5 dias de dados 5min (máximo do Yahoo)
            data = ticker_obj.history(period='5d', interval='5m')
            
            if data.empty:
                print(f"  ❌ Sem dados")
                continue
            
            df = data.reset_index()
            df = df.rename(columns={
                'Datetime': 'datetime',
                'Open': 'open',
                'High': 'high',
                'Low': 'low',
                'Close': 'close',
                'Volume': 'volume'
            })
            df['pair'] = ticker
            df['pair_name'] = name
            
            # Extrair hora UTC
            df['datetime'] = pd.to_datetime(df['datetime'])
            df['hour_utc'] = df['datetime'].dt.hour
            df['minute'] = df['datetime'].dt.minute
            
            print(f"  ✅ {len(df)} candles 5min")
            all_data.append(df)
            
        except Exception as e:
            print(f"  ❌ Erro: {e}")
    
    if all_data:
        return pd.concat(all_data, ignore_index=True)
    return pd.DataFrame()


def backtest_night_sell(df: pd.DataFrame):
    """
    Backtest específico:
    - Horário: 22:00-01:30 UTC (equivalente ~19:00-22:30 BRT)
    - Direção: SELL
    - Expiration: 5 minutos
    """
    print("\n" + "="*60)
    print("   Backtest: SELL Noturno (22:00-01:30 UTC)")
    print("="*60)
    
    results = []
    
    for pair in df['pair'].unique():
        pair_df = df[df['pair'] == pair].copy()
        pair_df = pair_df.sort_values('datetime').reset_index(drop=True)
        
        # Filtrar horário noturno (22, 23, 0, 1)
        night_df = pair_df[pair_df['hour_utc'].isin([22, 23, 0, 1])]
        
        print(f"\n{pair}: {len(night_df)} candles no horário noturno")
        
        for i in range(len(night_df) - 1):
            row = night_df.iloc[i]
            next_row = night_df.iloc[i + 1]
            
            entry_price = row['close']
            exit_price = next_row['close']
            
            # SELL: ganha se preço cai
            pct_change = (entry_price - exit_price) / entry_price * 100
            result = 'WIN' if pct_change > 0 else 'LOSS'
            
            results.append({
                'datetime': row['datetime'],
                'pair': row['pair_name'],
                'hour': row['hour_utc'],
                'minute': row['minute'],
                'direction': 'SELL',
                'entry': entry_price,
                'exit': exit_price,
                'pct': pct_change,
                'result': result
            })
    
    return pd.DataFrame(results)


def analyze_night_results(results: pd.DataFrame):
    """Analisa resultados do horário noturno."""
    print("\n" + "="*60)
    print("   RESULTADOS SELL NOTURNO")
    print("="*60)
    
    if results.empty:
        print("Nenhum trade.")
        return
    
    total = len(results)
    wins = (results['result'] == 'WIN').sum()
    losses = (results['result'] == 'LOSS').sum()
    win_rate = wins / total * 100
    
    print(f"\nTotal: {total} trades")
    print(f"Wins: {wins} | Losses: {losses}")
    print(f"Win Rate: {win_rate:.1f}%")
    
    # Por par
    print("\n--- Por Par ---")
    for pair in results['pair'].unique():
        subset = results[results['pair'] == pair]
        wr = (subset['result'] == 'WIN').mean() * 100
        avg_pct = subset['pct'].mean()
        print(f"{pair}: {len(subset)} trades | WR={wr:.1f}% | Avg={avg_pct:.3f}%")
    
    # Por hora
    print("\n--- Por Hora UTC ---")
    for hour in sorted(results['hour'].unique()):
        subset = results[results['hour'] == hour]
        wr = (subset['result'] == 'WIN').mean() * 100
        print(f"{int(hour):02d}:00: {len(subset)} trades | WR={wr:.1f}%")
    
    # Análise de sequências
    print("\n--- Análise de Tendência ---")
    for pair in results['pair'].unique():
        subset = results[results['pair'] == pair]
        # Contar sequências de WIN
        consecutive_wins = 0
        max_wins = 0
        for r in subset['result']:
            if r == 'WIN':
                consecutive_wins += 1
                max_wins = max(max_wins, consecutive_wins)
            else:
                consecutive_wins = 0
        print(f"{pair}: Máx sequência WIN = {max_wins}")
    
    return results


def main():
    print("="*60)
    print("   EoS IQ - Backtest SELL Noturno")
    print("   Padrão: GBP/CAD e AUD/CAD 22:00-01:30 UTC")
    print("="*60)
    
    # Baixar dados
    df = fetch_intraday_data()
    
    if df.empty:
        print("❌ Sem dados")
        return
    
    # Backtest
    results = backtest_night_sell(df)
    
    # Analisar
    analyze_night_results(results)
    
    # Salvar
    output_path = DATA_DIR / "backtest_night_sell.csv"
    results.to_csv(output_path, index=False)
    print(f"\n✅ Resultados salvos: {output_path}")
    
    return results


if __name__ == "__main__":
    main()
