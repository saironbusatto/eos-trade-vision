import sqlite3
import os
import pandas as pd

DBS = [
    {'name': 'CRYPTO BOT', 'path': 'eos-telegram-bot/data/eos.db'},
    {'name': 'IQ BOT (Legacy)', 'path': 'eos-iq-bot/data/eos-iq.db'}
]

def analyze_db(db_info):
    print(f"\n📘 BANCO: {db_info['name']} ({db_info['path']})")
    
    if not os.path.exists(db_info['path']):
        print(f"   ❌ Arquivo não encontrado.")
        return

    try:
        conn = sqlite3.connect(db_info['path'])
        
        # Get all tables
        query_tables = "SELECT name FROM sqlite_master WHERE type='table';"
        tables = pd.read_sql_query(query_tables, conn)['name'].tolist()
        
        for table in tables:
            # Count rows
            count = pd.read_sql_query(f"SELECT count(*) as cnt FROM {table}", conn)['cnt'].iloc[0]
            print(f"   📂 Tabela: {table.ljust(20)} | Linhas: {count}")
            
            # Show columns if count > 0
            if count > 0:
                cols = pd.read_sql_query(f"PRAGMA table_info({table})", conn)['name'].tolist()
                print(f"      Colunas: {', '.join(cols[:10])} {'...' if len(cols)>10 else ''}")
                
                # Check for specific columns asked by user
                target_cols = ['mfe', 'mae', 'pnl', 'volume', 'vwap', 'entry_price']
                found = [c for c in target_cols if any(x in c.lower() for x in cols)]
                if found:
                    print(f"      🎯 Targets encontrados: {found}")
                    
        conn.close()
    except Exception as e:
        print(f"   ❌ Erro: {e}")

if __name__ == "__main__":
    with open('analysis_output.txt', 'w', encoding='utf-8') as f:
        for db in DBS:
            f.write(f"\n📘 BANCO: {db['name']} ({db['path']})\n")
            
            if not os.path.exists(db['path']):
                f.write(f"   ❌ Arquivo não encontrado.\n")
                continue

            try:
                conn = sqlite3.connect(db['path'])
                query_tables = "SELECT name FROM sqlite_master WHERE type='table';"
                tables = pd.read_sql_query(query_tables, conn)['name'].tolist()
                
                for table in tables:
                    try:
                        count = pd.read_sql_query(f"SELECT count(*) as cnt FROM {table}", conn)['cnt'].iloc[0]
                        f.write(f"   📂 Tabela: {table.ljust(20)} | Linhas: {count}\n")
                        
                        if count > 0:
                            cols = pd.read_sql_query(f"PRAGMA table_info({table})", conn)['name'].tolist()
                            f.write(f"      Colunas: {', '.join(cols)}\n")
                    except:
                        f.write(f"      Erro ao ler tabela {table}\n")
                            
                conn.close()
            except Exception as e:
                f.write(f"   ❌ Erro: {e}\n")
