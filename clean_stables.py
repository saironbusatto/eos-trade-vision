import sqlite3

DB_PATH = 'eos-telegram-bot/data/eos.db'
STABLES = ['USDC', 'BUSD', 'USDT', 'DAI', 'TUSD', 'FDUSD', 'USDP']

def is_stable_pair(symbol):
    # Check if BASE is stable
    # Assume QUOTE is USDT or BUSD (based on previous filter)
    # If symbol starts with STABLE and ends with USDT/BUSD
    
    for s in STABLES:
        if symbol.startswith(s):
            # Check if what remains is also stable or empty
            remainder = symbol[len(s):]
            if remainder in STABLES:
                return True
    return False

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

cursor.execute("SELECT DISTINCT symbol FROM signals")
rows = cursor.fetchall()

to_delete = []
for r in rows:
    sym = r[0]
    if is_stable_pair(sym):
        to_delete.append(sym)
        
print(f"Found {len(to_delete)} stable pairs: {to_delete}")

if to_delete:
    placeholders = ','.join(['?'] * len(to_delete))
    cursor.execute(f"DELETE FROM signals WHERE symbol IN ({placeholders})", to_delete)
    conn.commit()
    print(f"Deleted rows for {len(to_delete)} pairs.")
    
    # Verify count
    count = cursor.execute("SELECT COUNT(*) FROM signals").fetchone()[0]
    print(f"Remaining trades: {count}")
    
conn.close()
