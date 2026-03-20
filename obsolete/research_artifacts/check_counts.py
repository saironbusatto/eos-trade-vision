import sqlite3
import pandas as pd
import os

DB_PATH = 'eos-telegram-bot/data/eos.db'
print(f"Checking: {DB_PATH} ({os.path.getsize(DB_PATH)/1024/1024:.2f} MB)")

conn = sqlite3.connect(DB_PATH)
try:
    print("Total Rows:", conn.execute("SELECT COUNT(*) FROM signals").fetchone()[0])
    print("USDT Rows:", conn.execute("SELECT COUNT(*) FROM signals WHERE symbol LIKE '%USDT'").fetchone()[0])
    print("Asset Type dist:")
    print(pd.read_sql_query("SELECT asset_type, COUNT(*) as qtd FROM signals GROUP BY asset_type", conn))
except Exception as e:
    print(e)
conn.close()
