import pandas as pd
import os

FILES = [
    'eos-telegram-bot/data/ml/train.csv',
    'eos-telegram-bot/data/ml/val.csv'
]

def peek(path):
    print(f"\n📂 Arquivo: {path}")
    if not os.path.exists(path):
        print("   ❌ Não encontrado")
        return

    try:
        df = pd.read_csv(path, nrows=5)
        cols = list(df.columns)
        print(f"   📊 Colunas ({len(cols)}): {cols[:10]}...")
        
        target_cols = ['mfe', 'mae', 'pnl', 'volume', 'vwap', 'entry_price', 'close']
        found = [c for c in cols if any(x in c.lower() for x in target_cols)]
        print(f"   🎯 Targets: {found}")

        with open(path, 'r', encoding='utf-8') as f:
            count = sum(1 for _ in f)
        print(f"   🔢 Linhas totais: {count}")
        
    except Exception as e:
        print(f"   ❌ Erro: {e}")

if __name__ == "__main__":
    for f in FILES:
        peek(f)
