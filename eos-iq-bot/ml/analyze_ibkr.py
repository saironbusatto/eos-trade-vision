"""
EoS IQ ML - Análise Dados IBKR
Compara dados reais IBKR com Yahoo Finance e encontra setups > 70%
"""

import pandas as pd
import numpy as np
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"


def analyze_ibkr_data():
    print("="*70)
    print("   Análise Dados IBKR (Forex Real)")
    print("="*70)
    
    # Carregar dados
    df = pd.read_parquet(DATA_DIR / "ibkr_forex.parquet")
    
    print(f"\nTotal: {len(df)} candles de {df['pair'].nunique()} pares")
    
    # Calcular retornos
    df['return'] = df.groupby('pair')['close'].pct_change() * 100
    df = df.dropna(subset=['return'])
    
    # Sessões
    df['session'] = df['hour'].apply(lambda h: 
        'ASIA' if 0 <= h < 8 else
        'LONDON' if 8 <= h < 14 else
        'NY' if 14 <= h < 21 else 'NIGHT')
    
    results = []
    
    # 1. Análise por Par
    print("\n" + "="*70)
    print("   Win Rate por Par")
    print("="*70)
    
    for pair in sorted(df['pair'].unique()):
        subset = df[df['pair'] == pair]
        call_wr = (subset['return'] > 0).mean() * 100
        print(f"  {pair:10}: CALL={call_wr:.1f}% | PUT={100-call_wr:.1f}% ({len(subset)} trades)")
        
        results.append({
            'type': 'pair',
            'pair': pair,
            'filter': 'ALL',
            'total': len(subset),
            'call_wr': call_wr,
            'put_wr': 100 - call_wr,
            'best_dir': 'CALL' if call_wr > 50 else 'PUT',
            'best_wr': max(call_wr, 100 - call_wr)
        })
    
    # 2. Análise por Par + Hora
    print("\n" + "="*70)
    print("   Melhores Par + Hora (WR >= 60%)")
    print("="*70)
    
    for pair in df['pair'].unique():
        for hour in range(24):
            subset = df[(df['pair'] == pair) & (df['hour'] == hour)]
            if len(subset) < 20:
                continue
            
            call_wr = (subset['return'] > 0).mean() * 100
            put_wr = 100 - call_wr
            best_wr = max(call_wr, put_wr)
            
            if best_wr >= 55:
                results.append({
                    'type': 'pair_hour',
                    'pair': pair,
                    'filter': f'{hour:02d}:00',
                    'total': len(subset),
                    'call_wr': call_wr,
                    'put_wr': put_wr,
                    'best_dir': 'CALL' if call_wr > 50 else 'PUT',
                    'best_wr': best_wr
                })
    
    # Mostrar top
    hour_results = [r for r in results if r['type'] == 'pair_hour']
    hour_results.sort(key=lambda x: x['best_wr'], reverse=True)
    
    for r in hour_results[:25]:
        emoji = '🟢' if r['best_wr'] >= 70 else '🟡' if r['best_wr'] >= 60 else '⚪'
        print(f"  {emoji} {r['pair']:10} @ {r['filter']}: {r['best_dir']} {r['best_wr']:.1f}% ({r['total']} trades)")
    
    # 3. Análise por Sessão
    print("\n" + "="*70)
    print("   Melhores Par + Sessão")
    print("="*70)
    
    for pair in df['pair'].unique():
        for session in ['ASIA', 'LONDON', 'NY', 'NIGHT']:
            subset = df[(df['pair'] == pair) & (df['session'] == session)]
            if len(subset) < 50:
                continue
            
            call_wr = (subset['return'] > 0).mean() * 100
            put_wr = 100 - call_wr
            best_wr = max(call_wr, put_wr)
            
            if best_wr >= 55:
                results.append({
                    'type': 'pair_session',
                    'pair': pair,
                    'filter': session,
                    'total': len(subset),
                    'call_wr': call_wr,
                    'put_wr': put_wr,
                    'best_dir': 'CALL' if call_wr > 50 else 'PUT',
                    'best_wr': best_wr
                })
    
    session_results = [r for r in results if r['type'] == 'pair_session']
    session_results.sort(key=lambda x: x['best_wr'], reverse=True)
    
    for r in session_results[:15]:
        emoji = '🟢' if r['best_wr'] >= 70 else '🟡' if r['best_wr'] >= 60 else '⚪'
        print(f"  {emoji} {r['pair']:10} @ {r['filter']:8}: {r['best_dir']} {r['best_wr']:.1f}% ({r['total']} trades)")
    
    # Consolidar
    results_df = pd.DataFrame(results)
    
    # Resumo final
    print("\n" + "="*70)
    print("   RESUMO - Setups de Alta Probabilidade")
    print("="*70)
    
    above_70 = len(results_df[results_df['best_wr'] >= 70])
    above_65 = len(results_df[results_df['best_wr'] >= 65])
    above_60 = len(results_df[results_df['best_wr'] >= 60])
    
    print(f"\n  WR >= 70%: {above_70} setups")
    print(f"  WR >= 65%: {above_65} setups")
    print(f"  WR >= 60%: {above_60} setups")
    
    # Mostrar top setups
    if above_70 > 0:
        print("\n🏆 GOLDEN SETUPS (>= 70%):")
        top = results_df[results_df['best_wr'] >= 70].sort_values('best_wr', ascending=False)
        for _, r in top.head(15).iterrows():
            print(f"   {r['pair']:10} @ {r['filter']:8} → {r['best_dir']} {r['best_wr']:.1f}% ({r['total']} trades)")
    
    # Salvar
    output = DATA_DIR / "ibkr_analysis.csv"
    results_df.to_csv(output, index=False)
    print(f"\n✅ Análise salva: {output}")
    
    return results_df


if __name__ == "__main__":
    analyze_ibkr_data()
