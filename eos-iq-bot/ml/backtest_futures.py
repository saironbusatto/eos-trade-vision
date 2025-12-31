"""
EoS IQ ML - Backtest com Futuros CME
Valida estratégia Cross-Market Analysis (Villahermosa)
Analisa 6E (EUR Futures) e 6B (GBP Futures)
"""

import numpy as np
import pandas as pd
import yfinance as yf
from pathlib import Path
from datetime import datetime

# Importar features avançadas
import sys
sys.path.insert(0, str(Path(__file__).parent))
from advanced_features import calculate_all_features, calculate_volume_profile

DATA_DIR = Path(__file__).parent.parent / "data"


def fetch_futures_data():
    """Baixa dados de futuros CME via Yahoo Finance."""
    print("="*60)
    print("   Baixando Dados de Futuros CME")
    print("="*60)
    
    futures = {
        '6E=F': 'EUR Futures',
        '6B=F': 'GBP Futures',
        '6J=F': 'JPY Futures',
        '6A=F': 'AUD Futures',
        '6S=F': 'CHF Futures',     # CHF/USD
        '6C=F': 'CAD Futures',     # USD/CAD
        'AUDCAD=X': 'AUD/CAD Spot', # Não tem futuro, usar spot
    }
    
    all_data = []
    
    for ticker, name in futures.items():
        print(f"\nBaixando {name} ({ticker})...")
        try:
            ticker_obj = yf.Ticker(ticker)
            data = ticker_obj.history(period='3mo', interval='1d')
            
            if data.empty:
                print(f"  ❌ Sem dados")
                continue
            
            df = data.reset_index()
            df = df.rename(columns={
                'Date': 'datetime',
                'Open': 'open',
                'High': 'high',
                'Low': 'low',
                'Close': 'close',
                'Volume': 'volume'
            })
            df['pair'] = ticker
            df['pair_name'] = name
            
            # Selecionar colunas necessárias
            cols = ['datetime', 'open', 'high', 'low', 'close', 'volume', 'pair', 'pair_name']
            df = df[[c for c in cols if c in df.columns]]
            
            print(f"  ✅ {len(df)} candles diários")
            all_data.append(df)
            
        except Exception as e:
            print(f"  ❌ Erro: {e}")
    
    if all_data:
        return pd.concat(all_data, ignore_index=True)
    return pd.DataFrame()


def calculate_ofa_signals(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calcula sinais OFA para futuros.
    Simula o que faríamos com dados Level 2.
    """
    df = df.copy()
    
    # Delta simulado (movimento direcional)
    df['delta'] = df['close'] - df['open']
    df['delta_cumulative'] = df['delta'].rolling(5).sum()
    
    # Volume Analysis
    df['volume_ma'] = df['volume'].rolling(20).mean()
    df['volume_ratio'] = df['volume'] / df['volume_ma']
    df['high_volume'] = df['volume_ratio'] > 1.5
    
    # Trend
    df['ema_fast'] = df['close'].ewm(span=10).mean()
    df['ema_slow'] = df['close'].ewm(span=20).mean()
    df['trend'] = np.where(df['ema_fast'] > df['ema_slow'], 1, -1)
    
    # Volatilidade
    df['atr'] = (df['high'] - df['low']).rolling(14).mean()
    df['volatility'] = df['atr'] / df['close']
    
    # Absorption Proxy (muito volume, pouco movimento)
    df['range_pct'] = (df['high'] - df['low']) / df['close']
    df['absorption'] = (df['volume_ratio'] > 1.5) & (df['range_pct'] < df['range_pct'].rolling(20).mean())
    
    # Sinal de entrada
    # Compra: Delta positivo + Volume alto + Trend up
    df['signal_buy'] = (df['delta'] > 0) & (df['volume_ratio'] > 1.2) & (df['trend'] == 1)
    
    # Venda: Delta negativo + Volume alto + Trend down  
    df['signal_sell'] = (df['delta'] < 0) & (df['volume_ratio'] > 1.2) & (df['trend'] == -1)
    
    return df


def backtest_signals(df: pd.DataFrame, tp_pct: float = 0.01, sl_pct: float = 0.005, holding_days: int = 5):
    """
    Backtest dos sinais.
    TP: 1% | SL: 0.5% | Holding: 5 dias max
    """
    results = []
    
    for i in range(len(df) - holding_days):
        row = df.iloc[i]
        
        if row['signal_buy'] or row['signal_sell']:
            entry_price = row['close']
            direction = 'BUY' if row['signal_buy'] else 'SELL'
            
            # Verificar próximos dias
            for j in range(1, holding_days + 1):
                if i + j >= len(df):
                    break
                    
                future_row = df.iloc[i + j]
                
                if direction == 'BUY':
                    pct_change = (future_row['close'] - entry_price) / entry_price
                    hit_tp = future_row['high'] >= entry_price * (1 + tp_pct)
                    hit_sl = future_row['low'] <= entry_price * (1 - sl_pct)
                else:
                    pct_change = (entry_price - future_row['close']) / entry_price
                    hit_tp = future_row['low'] <= entry_price * (1 - tp_pct)
                    hit_sl = future_row['high'] >= entry_price * (1 + sl_pct)
                
                if hit_tp:
                    results.append({
                        'date': row['datetime'],
                        'pair': row['pair'],
                        'direction': direction,
                        'entry': entry_price,
                        'result': 'WIN',
                        'pct': tp_pct * 100,
                        'days': j
                    })
                    break
                elif hit_sl:
                    results.append({
                        'date': row['datetime'],
                        'pair': row['pair'],
                        'direction': direction,
                        'entry': entry_price,
                        'result': 'LOSS',
                        'pct': -sl_pct * 100,
                        'days': j
                    })
                    break
            else:
                # Timeout
                results.append({
                    'date': row['datetime'],
                    'pair': row['pair'],
                    'direction': direction,
                    'entry': entry_price,
                    'result': 'WIN' if pct_change > 0 else 'LOSS',
                    'pct': pct_change * 100,
                    'days': holding_days
                })
    
    return pd.DataFrame(results)


def analyze_results(results: pd.DataFrame):
    """Analisa resultados do backtest."""
    print("\n" + "="*60)
    print("   RESULTADOS DO BACKTEST")
    print("="*60)
    
    if results.empty:
        print("Nenhum trade executado.")
        return
    
    total = len(results)
    wins = (results['result'] == 'WIN').sum()
    losses = (results['result'] == 'LOSS').sum()
    win_rate = wins / total * 100
    
    print(f"\nTotal Trades: {total}")
    print(f"Wins: {wins} | Losses: {losses}")
    print(f"Win Rate: {win_rate:.1f}%")
    
    # Profit
    total_pct = results['pct'].sum()
    avg_win = results[results['result'] == 'WIN']['pct'].mean() if wins > 0 else 0
    avg_loss = results[results['result'] == 'LOSS']['pct'].mean() if losses > 0 else 0
    
    print(f"\nRetorno Total: {total_pct:.2f}%")
    print(f"Média WIN: +{avg_win:.2f}%")
    print(f"Média LOSS: {avg_loss:.2f}%")
    
    # Por par
    print("\n--- Por Par ---")
    for pair in results['pair'].unique():
        subset = results[results['pair'] == pair]
        wr = (subset['result'] == 'WIN').mean() * 100
        ret = subset['pct'].sum()
        print(f"{pair}: {len(subset)} trades | WR={wr:.1f}% | Ret={ret:.2f}%")
    
    # Por direção
    print("\n--- Por Direção ---")
    for direction in ['BUY', 'SELL']:
        subset = results[results['direction'] == direction]
        if len(subset) > 0:
            wr = (subset['result'] == 'WIN').mean() * 100
            print(f"{direction}: {len(subset)} trades | WR={wr:.1f}%")
    
    # Sharpe Ratio aproximado
    returns = results['pct'].values / 100
    if returns.std() > 0:
        sharpe = np.sqrt(252 / 5) * returns.mean() / returns.std()  # Ajustado para holding de 5 dias
        print(f"\nSharpe Ratio (aprox): {sharpe:.2f}")
    
    # Max Drawdown
    cumulative = (1 + results['pct'] / 100).cumprod()
    peak = cumulative.cummax()
    drawdown = (cumulative - peak) / peak
    max_dd = drawdown.min() * 100
    print(f"Max Drawdown: {max_dd:.2f}%")
    
    return results


def main():
    print("="*60)
    print("   EoS IQ - Backtest Futuros CME (Villahermosa)")
    print("="*60)
    
    # Baixar dados
    df = fetch_futures_data()
    
    if df.empty:
        print("❌ Sem dados para backtest")
        return
    
    # Calcular sinais por par
    all_results = []
    
    for pair in df['pair'].unique():
        pair_df = df[df['pair'] == pair].copy()
        pair_df = pair_df.sort_values('datetime').reset_index(drop=True)
        
        # Calcular OFA
        pair_df = calculate_ofa_signals(pair_df)
        
        # Backtest
        results = backtest_signals(pair_df)
        all_results.append(results)
    
    # Consolidar
    final_results = pd.concat(all_results, ignore_index=True)
    
    # Analisar
    analyze_results(final_results)
    
    # Salvar
    output_path = DATA_DIR / "backtest_futures.csv"
    final_results.to_csv(output_path, index=False)
    print(f"\n✅ Resultados salvos: {output_path}")
    
    return final_results


if __name__ == "__main__":
    main()
