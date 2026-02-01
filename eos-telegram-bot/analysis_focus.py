import pandas as pd
import sqlite3
import os

pd.set_option('display.max_columns', None)
pd.set_option('display.max_rows', 100)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EOS_DB = os.path.join(BASE_DIR, 'data', 'eos.db')
IQ_DB = os.path.join(BASE_DIR, '..', 'eos-iq-bot', 'data', 'eos-iq.db')

print(f"🔎 Analisando Bases:\n  PROD:   {EOS_DB}\n  LEGACY: {IQ_DB}\n")

if not os.path.exists(EOS_DB) or not os.path.exists(IQ_DB):
    print("❌ Um dos bancos não existe")
    exit()

conn = sqlite3.connect(EOS_DB)
try:
    conn.execute(f"ATTACH DATABASE '{IQ_DB}' AS legacy")

    # 1. Dataset Desejado (Crypto Pura)
    query_crypto = """
    SELECT 
        'PROD' as source, id, symbol, result, entry_price, 
        f_imbalance as imbalance, f_absorption as absorption
    FROM main.signals 
    WHERE asset_type = 'CRYPTO'
    UNION ALL
    SELECT 
        'LEGACY' as source, id, pair as symbol, result, entry_price, 
        stacked_imbalances as imbalance, absorption_detected as absorption
    FROM legacy.signals
    WHERE (pair LIKE '%USDT' OR pair LIKE '%BUSD')
    """
    df_crypto = pd.read_sql_query(query_crypto, conn)
    
    # 2. Dataset Descartado (Forex/Noise)
    query_discard = """
    SELECT pair, COUNT(*) as qtd 
    FROM legacy.signals 
    WHERE pair NOT LIKE '%USDT' AND pair NOT LIKE '%BUSD'
    GROUP BY pair 
    ORDER BY qtd DESC
    LIMIT 10
    """
    df_discard = pd.read_sql_query(query_discard, conn)

    print(f"📊 DATASET 'CRYPTO ONLY' (Alvo):")
    print(f"   Total de Trades: {len(df_crypto)}")
    print(df_crypto['source'].value_counts().to_string())
    print(f"   Win Rate Unificado: {(df_crypto['result'] == 'WIN').mean():.1%}")

    print(f"\n🗑️  DATASET DESCARTADO (Forex/Outros):")
    total_discarded = pd.read_sql_query("SELECT COUNT(*) FROM legacy.signals WHERE pair NOT LIKE '%USDT' AND pair NOT LIKE '%BUSD'", conn).iloc[0,0]
    print(f"   Total Ignorado: {total_discarded} trades")
    print("   Top Pares Ignorados:")
    print(df_discard.to_string(index=False))

    # Análise Rápida de Microestrutura (no que sobrou)
    if len(df_crypto) > 0:
        print("\n🔬 Microestrutura (Apenas Crypto):")
        df_crypto['has_absorption'] = pd.to_numeric(df_crypto['absorption'], errors='coerce') > 0
        print(df_crypto.groupby('has_absorption')['result'].agg(['count', lambda x: (x=='WIN').mean()]))

except Exception as e:
    print(f"❌ Erro: {e}")
finally:
    conn.close()
