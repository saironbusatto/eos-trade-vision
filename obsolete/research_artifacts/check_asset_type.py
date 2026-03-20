import sqlite3
import pandas as pd

conn = sqlite3.connect('eos-telegram-bot/data/eos.db')
print("Verificando asset_type:")
df = pd.read_sql_query("SELECT asset_type, COUNT(*) as qtd FROM signals GROUP BY asset_type", conn)
print(df)

print("\nVerificando colunas novas (amostra):")
df2 = pd.read_sql_query("SELECT id, symbol, mfe, mae, asset_type FROM signals LIMIT 5", conn)
print(df2)
conn.close()
