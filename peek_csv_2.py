import pandas as pd
import os

FILES = [
    'eos-iq-bot/data/backtest_futures.csv',
    'eos-iq-bot/data/backtest_night_sell.csv',
    'eos-iq-bot/data/ibkr_analysis.csv'
]

def peek(path):
    print(f"\n📂 Arquivo: {path}")
    if not os.path.exists(path):
        print("   ❌ Não encontrado")
        return

    try:
        df = pd.read_csv(path, nrows=5)
        cols = list(df.columns)
        # Check for MFE/MAE case insensitive
        targets = ['mfe', 'mae', 'pnl', 'profit', 'entry', 'exit']
        found = [c for c in cols if any(t in c.lower() for t in targets)]
        
        print(f"   📊 Colunas: {cols[:5]}...")
        print(f"   🎯 Targets encontrados: {found}")
        
        with open(path, 'r', encoding='utf-8') as f:
            count = sum(1 for _ in f)
        print(f"   🔢 Linhas totais: {count}")
        
    except Exception as e:
        print(f"   ❌ Erro: {e}")

if __name__ == "__main__":
    for f in FILES:
        peek(f)
