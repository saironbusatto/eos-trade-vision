import sqlite3
import pandas as pd

conn = sqlite3.connect('eos-telegram-bot/data/eos.db')
print("Verificando Regime Detectado (Amostra):")

query = """
SELECT id, symbol, created_at, meta_adx, meta_atr, regime_type 
FROM signals 
WHERE meta_adx IS NOT NULL 
LIMIT 10
"""
df = pd.read_sql_query(query, conn)
print(df.to_string())

print("\nDistribuicao de Regimes:")
dist = pd.read_sql_query("SELECT regime_type, count(*) as qtd FROM signals WHERE meta_adx IS NOT NULL GROUP BY regime_type", conn)
print(dist)
conn.close()
