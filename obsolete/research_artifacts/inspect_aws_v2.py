import sqlite3
import os
import pandas as pd

DUMP_DIR = 'eos-telegram-bot/data/aws_dump'
FILES = [
    'eos_prod_full.db',
    'eos_iq_full.db',
    'eos_bot_archive.db'
]

print(f"🔎 Inspecionando dumps em: {DUMP_DIR}\n")

for f in FILES:
    path = os.path.join(DUMP_DIR, f)
    if not os.path.exists(path):
        continue
        
    print(f"📂 Banco: {f}")
    try:
        conn = sqlite3.connect(path)
        cursor = conn.cursor()
        
        # Obter Colunas
        try:
            cursor.execute("PRAGMA table_info(signals)")
            cols = [c[1] for c in cursor.fetchall()]
            print(f"   Colunas: {cols}")
            
            total = cursor.execute("SELECT COUNT(*) FROM signals").fetchone()[0]
            print(f"   Total Sinais: {total}")

            # Identificar colunas chaves
            col_target = 'symbol' if 'symbol' in cols else ('pair' if 'pair' in cols else None)
            col_time = 'timestamp' if 'timestamp' in cols else ('created_at' if 'created_at' in cols else ('start_time' if 'start_time' in cols else None))
            
            if col_target and col_time:
                query = f"SELECT MIN({col_time}) as start, MAX({col_time}) as end, COUNT(*) as cnt FROM signals WHERE {col_target} LIKE '%USDT' OR {col_target} LIKE '%BUSD'"
                df = pd.read_sql_query(query, conn)
                print(f"   📊 Crypto: {df.iloc[0]['cnt']}")
                print(f"      Range: {df.iloc[0]['start']} -> {df.iloc[0]['end']}")
            else:
                print(f"   ⚠️ Colunas não mapeadas. Symbol: {col_target}, Time: {col_time}")

        except Exception as e:
             print(f"   Erro SQL: {e}")

        conn.close()
    except Exception as e:
        print(f"   Erro Geral: {e}")
    print("-" * 40)
