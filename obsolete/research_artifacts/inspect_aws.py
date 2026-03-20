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
        print(f"❌ {f}: Arquivo não encontrado")
        continue
        
    print(f"📂 Banco: {f} ({os.path.getsize(path)/1024/1024:.2f} MB)")
    
    try:
        conn = sqlite3.connect(path)
        cursor = conn.cursor()
        
        # Verificar se tabela exists
        try:
            cursor.execute("SELECT COUNT(*) FROM signals")
            total = cursor.fetchone()[0]
        except:
             print("   ⚠️ Tabela 'signals' não encontrada.")
             conn.close()
             continue

        # Get Columns
        cursor.execute("PRAGMA table_info(signals)")
        cols = [c[1] for c in cursor.fetchall()]
        col_target = 'symbol' if 'symbol' in cols else 'pair'
        
        if col_target:
             query_crypto = f"SELECT MIN(timestamp) as start, MAX(timestamp) as end, COUNT(*) as cnt FROM signals WHERE {col_target} LIKE '%USDT' OR {col_target} LIKE '%BUSD'"
             df_cy = pd.read_sql_query(query_crypto, conn)
             
             cnt = df_cy.iloc[0]['cnt']
             start = df_cy.iloc[0]['start']
             end = df_cy.iloc[0]['end']
             
             print(f"   📊 Sinais Crypto: {cnt} (Total: {total})")
             if cnt > 0:
                 print(f"      Periodo: {start} até {end}")
                 print("      Top 5 Pares:")
                 top = pd.read_sql_query(f"SELECT {col_target}, COUNT(*) as c FROM signals WHERE {col_target} LIKE '%USDT' OR {col_target} LIKE '%BUSD' GROUP BY {col_target} ORDER BY c DESC LIMIT 5", conn)
                 print(top.to_string(index=False))
             
        else:
             print("   ⚠️ Sem coluna symbol/pair")
             
        conn.close()

    except Exception as e:
        print(f"   ❌ Erro: {e}")
    print("-" * 40)
