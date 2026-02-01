import pandas as pd
import numpy as np
import sqlite3
import os

# Configurar pandas
pd.set_option('display.max_columns', None)
pd.set_option('display.width', 1000)

# Caminhos absolutos para garantir que o ATTACH funcione
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EOS_DB = os.path.join(BASE_DIR, 'data', 'eos.db')
IQ_DB = os.path.join(BASE_DIR, '..', 'eos-iq-bot', 'data', 'eos-iq.db')

print(f"📊 Bases:\n  EOS: {EOS_DB}\n  IQ:  {IQ_DB}\n")

if not os.path.exists(EOS_DB) or not os.path.exists(IQ_DB):
    print("❌ Erro: Um dos bancos não foi encontrado.")
    exit()

conn = sqlite3.connect(EOS_DB)

# Query unificada (Tentativa de attach)
try:
    # Anexar banco IQ
    conn.execute(f"ATTACH DATABASE '{IQ_DB}' AS legacy")
    
    # OBS: O banco IQ pode nao ter a coluna asset_type populada (pois nao migramos ele), entao filtramos por symbol
    query = """
    SELECT 
        'PROD' as source,
        id, symbol, result, entry_price, price_change_24h,
        f_volume as volume, f_imbalance as imbalance, f_absorption as absorption
        -- Adicione colunas conforme existirem
    FROM main.signals 
    WHERE asset_type = 'CRYPTO'
    
    UNION ALL
    
    SELECT 
        'LEGACY' as source,
        id, pair as symbol, result, entry_price, delta as price_change_24h,
        delta_cumulative as volume, stacked_imbalances as imbalance, absorption_detected as absorption
    FROM legacy.signals 
    WHERE 
       (pair LIKE '%USDT' OR pair LIKE '%BUSD') -- Filtro RIGOROSO: Apenas Crypto
    """
    
    df = pd.read_sql_query(query, conn)
    print(f"✅ Dataset Carregado: {len(df)} trades")
    print(df['source'].value_counts())
    print("\n")
    
    # ═══════════════════════════════════════════════════════
    # ANÁLISE BÁSICA (Já que colunas novas como location_va estao vazias no legado)
    # ═══════════════════════════════════════════════════════
    
    # Win Rate Geral
    wr = (df['result'] == 'WIN').mean() * 100
    print(f"🏆 Win Rate Geral (Crypto): {wr:.2f}%")
    
    # Por Símbolo
    print("\n🔹 Win Rate por Símbolo (Top 5):")
    print(df.groupby('symbol')['result'].apply(lambda x: (x=='WIN').mean()*100).sort_values(ascending=False).head(5))

    # ═══════════════════════════════════════════════════════
    # 2. VALIDAÇÃO DE MICROESTRUTURA (ORDER FLOW)
    # ═══════════════════════════════════════════════════════
    
    print("\n🔬 MICROESTRUTURA - ANÁLISE DE 46k TRADES (Legacy + Crypto)\n")
    
    # Converter colunas para numérico/booleano seguro
    df['absorption'] = pd.to_numeric(df['absorption'], errors='coerce').fillna(0)
    df['imbalance'] = pd.to_numeric(df['imbalance'], errors='coerce').fillna(0)
    
    # 2.1 ABSORÇÃO
    # Legacy: absorption_detected (0 ou 1)
    # Crypto: f_absorption (float score) -> Converter para bool se necessário ou usar threshold
    
    # Normalizar: Se for > 0 considera 'Com Absorção'
    df['has_absorption'] = df['absorption'] > 0
    
    abs_stats = df.groupby('has_absorption').agg({
        'result': lambda x: (x == 'WIN').mean() * 100,
        'id': 'count'
    }).rename(columns={'result': 'Win_Rate%', 'id': 'N_Trades'})
    
    abs_stats.index = ['Sem_Absorção', 'Com_Absorção']
    print("🔹 Impacto da Absorção no Win Rate:")
    print(abs_stats.to_string(float_format="%.2f"))
    
    diff_abs = abs_stats.loc['Com_Absorção', 'Win_Rate%'] - abs_stats.loc['Sem_Absorção', 'Win_Rate%']
    print(f"\n   👉 Delta: {diff_abs:+.2f}pp ao operar com Absorção.")
    
    print("-" * 50)

    # 2.2 STACKED IMBALANCES
    # Legacy: stacked_imbalances (int count?)
    
    df['has_imbalance'] = df['imbalance'] > 0
    
    imb_stats = df.groupby('has_imbalance').agg({
        'result': lambda x: (x == 'WIN').mean() * 100,
        'id': 'count'
    }).rename(columns={'result': 'Win_Rate%', 'id': 'N_Trades'})
    
    imb_stats.index = ['Sem_Imbalance', 'Com_Imbalance']
    print("\n🔹 Impacto de Stacked Imbalances no Win Rate:")
    print(imb_stats.to_string(float_format="%.2f"))
    
    diff_imb = imb_stats.loc['Com_Imbalance', 'Win_Rate%'] - imb_stats.loc['Sem_Imbalance', 'Win_Rate%']
    print(f"\n   👉 Delta: {diff_imb:+.2f}pp ao operar com Imbalance a favor.")

    # ═══════════════════════════════════════════════════════
    # 3. MFE / MAE (Necessário Backfill)
    # ═══════════════════════════════════════════════════════
    print("\n⚠️  OTIMIZAÇÃO DE STOP/ALVO (MFE/MAE):")
    print("   Colunas 'mfe' e 'mae' não existem no banco legado.")
    print("   NECESSÁRIO: Executar Fase 3 (Backfill de Velas) para calcular excurssão de preço.")

except Exception as e:
    print(f"❌ Erro na query ou processamento: {e}")
    import traceback
    traceback.print_exc()
finally:
    conn.close()
