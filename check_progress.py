import sqlite3
import pandas as pd
import time

conn = sqlite3.connect('eos-telegram-bot/data/eos.db')
cursor = conn.cursor()

total = cursor.execute("SELECT COUNT(*) FROM signals WHERE asset_type='CRYPTO'").fetchone()[0]
done = cursor.execute("SELECT COUNT(*) FROM signals WHERE asset_type='CRYPTO' AND meta_adx IS NOT NULL").fetchone()[0]

print(f"Total: {total}")
print(f"Done: {done}")
print(f"Percentage: {done/total*100:.2f}%")
print(f"Remaining: {total - done}")

conn.close()
