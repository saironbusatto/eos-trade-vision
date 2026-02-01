import sqlite3
import os

DBS = [
    {'name': 'CRYPTO BOT', 'path': 'eos-telegram-bot/data/eos.db'},
    {'name': 'IQ BOT (Legacy)', 'path': 'eos-iq-bot/data/eos-iq.db'}
]

def inspect(db_info):
    print(f"\n🔍 Inspecionando: {db_info['name']} ({db_info['path']})...")
    
    if not os.path.exists(db_info['path']):
        print(f"❌ Arquivo não encontrado!")
        return

    try:
        conn = sqlite3.connect(db_info['path'])
        cursor = conn.cursor()
        
        # Listar tabelas
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [t[0] for t in cursor.fetchall()]
        print(f"   📂 Tabelas: {', '.join(tables)}")
        
        if 'signals' in tables:
            cursor.execute("SELECT count(*) FROM signals")
            count = cursor.fetchone()[0]
            print(f"   📊 Total de Sinais: {count}")
            
            # Mostrar ultimo sinal
            cursor.execute("SELECT * FROM signals ORDER BY rowid DESC LIMIT 1")
            last = cursor.fetchone()
            print(f"   Time do último sinal: {last}") # Mostra tupla crua
            print(f"   ✅ Status: OK")
        else:
            print(f"   ⚠️ Tabela 'signals' não encontrada.")
            
        conn.close()
    except Exception as e:
        print(f"❌ Erro ao ler banco: {e}")

if __name__ == "__main__":
    for db in DBS:
        inspect(db)
