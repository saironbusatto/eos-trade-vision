"""
EoS IQ ML - Análise Abrangente de Forex
Encontrar combinações Par + Horário com WR > 70%
"""

import numpy as np
import pandas as pd
import yfinance as yf
from pathlib import Path
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# Todos os principais pares Forex
FOREX_PAIRS = [
    # Majors
    'EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'USDCHF=X', 'AUDUSD=X', 'USDCAD=X', 'NZDUSD=X',
    # Crosses EUR
    'EURGBP=X', 'EURJPY=X', 'EURCHF=X', 'EURAUD=X', 'EURCAD=X', 'EURNZD=X',
    # Crosses GBP
    'GBPJPY=X', 'GBPCHF=X', 'GBPAUD=X', 'GBPCAD=X', 'GBPNZD=X',
    # Crosses AUD/CAD/NZD
    'AUDCAD=X', 'AUDNZD=X', 'AUDJPY=X', 'AUDCHF=X',
    'CADCHF=X', 'CADJPY=X',
    'NZDJPY=X', 'NZDCHF=X', 'NZDCAD=X',
    # Exóticos
    'USDZAR=X', 'USDMXN=X', 'USDTRY=X', 'USDBRL=X',
]


def fetch_all_pairs():
    """Baixa dados de todos os pares."""
    print("="*70)
    print("   FASE 1: Coleta de Dados (30+ pares)")
    print("="*70)
    
    all_data = []
    
    for pair in FOREX_PAIRS:
        name = pair.replace('=X', '')
        print(f"  {name}... ", end='', flush=True)
        
        try:
            ticker = yf.Ticker(pair)
            data = ticker.history(period='5d', interval='5m')
            
            if data.empty or len(data) < 100:
                print("❌ Sem dados")
                continue
            
            df = data.reset_index()
            df = df.rename(columns={
                'Datetime': 'datetime', 'Open': 'open', 'High': 'high',
                'Low': 'low', 'Close': 'close', 'Volume': 'volume'
            })
            df['pair'] = name
            df['datetime'] = pd.to_datetime(df['datetime'])
            df['hour'] = df['datetime'].dt.hour
            df['day_of_week'] = df['datetime'].dt.dayofweek
            
            # Sessões
            df['session'] = df['hour'].apply(lambda h: 
                'ASIA' if 0 <= h < 8 else
                'LONDON' if 8 <= h < 14 else
                'NY' if 14 <= h < 21 else 'NIGHT')
            
            print(f"✅ {len(df)} candles")
            all_data.append(df)
            
        except Exception as e:
            print(f"❌ {str(e)[:30]}")
    
    if all_data:
        return pd.concat(all_data, ignore_index=True)
    return pd.DataFrame()


def calculate_returns(df: pd.DataFrame, horizon: int = 1):
    """Calcula retornos futuros."""
    df = df.copy()
    df['future_close'] = df.groupby('pair')['close'].shift(-horizon)
    df['return'] = (df['future_close'] - df['close']) / df['close'] * 100
    df['direction'] = np.where(df['return'] > 0, 'CALL', 'PUT')
    return df.dropna(subset=['return'])


def analyze_patterns(df: pd.DataFrame, min_trades: int = 30, min_wr: float = 55):
    """Analisa todos os padrões possíveis."""
    print("\n" + "="*70)
    print("   FASE 2: Análise de Padrões")
    print("="*70)
    
    results = []
    
    # 1. WR por Par
    print("\n📊 Win Rate por Par:")
    for pair in df['pair'].unique():
        subset = df[df['pair'] == pair]
        if len(subset) < min_trades:
            continue
        
        # CALL WR
        call_wr = (subset['return'] > 0).mean() * 100
        put_wr = 100 - call_wr
        
        results.append({
            'type': 'pair',
            'pair': pair,
            'filter': 'ALL',
            'total': len(subset),
            'call_wr': round(call_wr, 1),
            'put_wr': round(put_wr, 1),
            'best_dir': 'CALL' if call_wr > 50 else 'PUT',
            'best_wr': max(call_wr, put_wr)
        })
    
    # Mostrar top 10 pares
    pair_results = [r for r in results if r['type'] == 'pair']
    pair_results.sort(key=lambda x: x['best_wr'], reverse=True)
    for r in pair_results[:10]:
        print(f"  {r['pair']}: {r['best_dir']} {r['best_wr']:.1f}% ({r['total']} trades)")
    
    # 2. WR por Par + Hora
    print("\n📊 Melhores combinações Par + Hora (WR > 55%):")
    for pair in df['pair'].unique():
        for hour in range(24):
            subset = df[(df['pair'] == pair) & (df['hour'] == hour)]
            if len(subset) < 10:  # Mínimo de trades
                continue
            
            call_wr = (subset['return'] > 0).mean() * 100
            put_wr = 100 - call_wr
            best_wr = max(call_wr, put_wr)
            
            if best_wr >= min_wr:
                results.append({
                    'type': 'pair_hour',
                    'pair': pair,
                    'filter': f'{hour:02d}:00',
                    'total': len(subset),
                    'call_wr': round(call_wr, 1),
                    'put_wr': round(put_wr, 1),
                    'best_dir': 'CALL' if call_wr > 50 else 'PUT',
                    'best_wr': best_wr
                })
    
    # Mostrar top combinações
    hour_results = [r for r in results if r['type'] == 'pair_hour']
    hour_results.sort(key=lambda x: x['best_wr'], reverse=True)
    for r in hour_results[:20]:
        print(f"  {r['pair']} @ {r['filter']}: {r['best_dir']} {r['best_wr']:.1f}% ({r['total']} trades)")
    
    # 3. WR por Par + Sessão
    print("\n📊 Melhores combinações Par + Sessão:")
    for pair in df['pair'].unique():
        for session in ['ASIA', 'LONDON', 'NY', 'NIGHT']:
            subset = df[(df['pair'] == pair) & (df['session'] == session)]
            if len(subset) < 20:
                continue
            
            call_wr = (subset['return'] > 0).mean() * 100
            put_wr = 100 - call_wr
            best_wr = max(call_wr, put_wr)
            
            if best_wr >= min_wr:
                results.append({
                    'type': 'pair_session',
                    'pair': pair,
                    'filter': session,
                    'total': len(subset),
                    'call_wr': round(call_wr, 1),
                    'put_wr': round(put_wr, 1),
                    'best_dir': 'CALL' if call_wr > 50 else 'PUT',
                    'best_wr': best_wr
                })
    
    session_results = [r for r in results if r['type'] == 'pair_session']
    session_results.sort(key=lambda x: x['best_wr'], reverse=True)
    for r in session_results[:15]:
        print(f"  {r['pair']} @ {r['filter']}: {r['best_dir']} {r['best_wr']:.1f}% ({r['total']} trades)")
    
    return pd.DataFrame(results)


def find_high_probability_setups(results_df: pd.DataFrame, threshold: float = 65):
    """Encontra setups com WR > threshold."""
    print("\n" + "="*70)
    print(f"   FASE 3: Setups com WR > {threshold}%")
    print("="*70)
    
    high_prob = results_df[results_df['best_wr'] >= threshold].copy()
    high_prob = high_prob.sort_values('best_wr', ascending=False)
    
    if high_prob.empty:
        print(f"  ⚠️ Nenhum setup com WR > {threshold}%")
        print(f"  Sugestão: Baixar mais dados ou diminuir threshold")
        return high_prob
    
    print(f"\n🎯 {len(high_prob)} setups encontrados:\n")
    
    for _, row in high_prob.head(30).iterrows():
        emoji = '🟢' if row['best_wr'] >= 70 else '🟡' if row['best_wr'] >= 60 else '⚪'
        print(f"  {emoji} {row['pair']:10} | {row['filter']:8} | {row['best_dir']} | {row['best_wr']:.1f}% | {row['total']} trades")
    
    return high_prob


def main():
    print("="*70)
    print("   EoS IQ - Análise Abrangente de Forex")
    print("   Meta: Encontrar confluência > 70%")
    print("="*70)
    
    # Baixar dados
    df = fetch_all_pairs()
    
    if df.empty:
        print("❌ Sem dados")
        return
    
    print(f"\n📊 Total: {len(df)} candles de {df['pair'].nunique()} pares")
    
    # Calcular retornos
    df = calculate_returns(df, horizon=1)  # 5 min (próximo candle)
    
    # Analisar padrões
    results = analyze_patterns(df, min_trades=20, min_wr=55)
    
    # Encontrar setups de alta probabilidade
    high_prob = find_high_probability_setups(results, threshold=65)
    
    # Salvar resultados
    output_path = DATA_DIR / "forex_analysis.csv"
    results.to_csv(output_path, index=False)
    print(f"\n✅ Análise salva: {output_path}")
    
    # Resumo
    print("\n" + "="*70)
    print("   RESUMO")
    print("="*70)
    
    above_70 = len(results[results['best_wr'] >= 70])
    above_65 = len(results[results['best_wr'] >= 65])
    above_60 = len(results[results['best_wr'] >= 60])
    
    print(f"\n  WR >= 70%: {above_70} setups")
    print(f"  WR >= 65%: {above_65} setups")
    print(f"  WR >= 60%: {above_60} setups")
    
    return results


if __name__ == "__main__":
    main()
