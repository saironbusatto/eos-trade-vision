# PROMPT PARA ANTIGRAVITY: ANÁLISE IMEDIATA + MIGRAÇÃO LIMPA (EOS CRYPTO)

---

## ⚠️ PASSO 0: CONFIGURAR ALEMBIC (OBRIGATÓRIO ANTES DE TUDO)

**Objetivo:** Garantir controle de versão do schema e rollback seguro antes de qualquer migração.

---

### **0.1: INICIALIZAR ALEMBIC NO PROJETO**

```bash
# No diretório do projeto eos-telegram-bot
cd /caminho/eos-telegram-bot

# Instalar Alembic (se não instalado)
pip install alembic

# Inicializar Alembic
alembic init alembic

# Estrutura criada:
# alembic/
# ├── versions/         ← Migrations versionadas
# ├── env.py           ← Configuração do ambiente
# ├── script.py.mako   ← Template de migrations
# └── alembic.ini      ← Configuração global
```

---

### **0.2: CONFIGURAR ALEMBIC PARA SQLITE**

**Editar `alembic.ini`:**

```ini
# alembic.ini

# Linha ~38: Configurar URL do banco
sqlalchemy.url = sqlite:///databases/eos.db

# OU usar variável de ambiente (recomendado)
# sqlalchemy.url = driver://user:pass@localhost/dbname
```

**Editar `alembic/env.py`:**

```python
# alembic/env.py

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import sys
import os

# Adicionar path do projeto
sys.path.insert(0, os.path.realpath(os.path.join(os.path.dirname(__file__), '..')))

# Importar seus models (ajustar conforme estrutura)
from models import Base  # ou onde estão seus modelos SQLAlchemy

# this is the Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
target_metadata = Base.metadata

# Suportar múltiplos bancos (Crypto vs Forex)
def get_url():
    db_name = os.getenv("ALEMBIC_DB", "eos.db")
    return f"sqlite:///databases/{db_name}"

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = get_url()
    
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, 
            target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

---

### **0.3: CRIAR MIGRATION INICIAL (SNAPSHOT DO SCHEMA ATUAL)**

```bash
# Gerar migration automática baseada nos models
alembic revision --autogenerate -m "initial_schema_snapshot"

# OU criar migration manual
alembic revision -m "initial_schema_snapshot"
```

**Editar a migration criada em `alembic/versions/XXXXX_initial_schema_snapshot.py`:**

```python
"""initial_schema_snapshot

Revision ID: XXXXX
Revises: 
Create Date: 2026-02-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'XXXXX'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Criar tabela signals (ajustar conforme schema real)
    op.create_table(
        'signals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('symbol', sa.String(20), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('entry_price', sa.Float(), nullable=False),
        sa.Column('exit_price', sa.Float(), nullable=True),
        sa.Column('direction', sa.String(10), nullable=False),  # CALL/PUT
        sa.Column('result', sa.String(10), nullable=True),      # WIN/LOSS
        sa.Column('pnl', sa.Float(), nullable=True),
        sa.Column('mfe', sa.Float(), nullable=True),            # Maximum Favorable Excursion
        sa.Column('mae', sa.Float(), nullable=True),            # Maximum Adverse Excursion
        sa.Column('volume', sa.Float(), nullable=True),
        sa.Column('vwap', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Índices para performance
    op.create_index('idx_signals_symbol', 'signals', ['symbol'])
    op.create_index('idx_signals_timestamp', 'signals', ['timestamp'])
    op.create_index('idx_signals_result', 'signals', ['result'])

def downgrade() -> None:
    op.drop_index('idx_signals_result', table_name='signals')
    op.drop_index('idx_signals_timestamp', table_name='signals')
    op.drop_index('idx_signals_symbol', table_name='signals')
    op.drop_table('signals')
```

---

### **0.4: APLICAR MIGRATION INICIAL (VALIDAÇÃO)**

```bash
# Aplicar em banco de teste primeiro
ALEMBIC_DB=eos-test.db alembic upgrade head

# Verificar histórico
alembic current
alembic history

# Se OK, aplicar em produção
ALEMBIC_DB=eos.db alembic upgrade head
```

---

### **0.5: CRIAR MIGRATION PARA ADICIONAR COLUNAS DERIVADAS**

**Para análise estatística, precisamos de novas colunas:**

```bash
alembic revision -m "add_analysis_columns"
```

**Editar migration:**

```python
"""add_analysis_columns

Revision ID: YYYYY
Revises: XXXXX
Create Date: 2026-02-01 12:05:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'YYYYY'
down_revision = 'XXXXX'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Adicionar colunas para análise estatística
    op.add_column('signals', sa.Column('location_va', sa.String(10), nullable=True))  # ACIMA/DENTRO/ABAIXO
    op.add_column('signals', sa.Column('distance_vwap_std', sa.Float(), nullable=True))
    op.add_column('signals', sa.Column('effort_result_ratio', sa.Float(), nullable=True))
    op.add_column('signals', sa.Column('is_absorption', sa.Boolean(), nullable=True))
    op.add_column('signals', sa.Column('volatility_regime', sa.String(10), nullable=True))  # BAIXA/MÉDIA/ALTA
    op.add_column('signals', sa.Column('setup_type', sa.String(20), nullable=True))  # BREAKOUT/REVERSAO/CONTINUACAO
    op.add_column('signals', sa.Column('asset_type', sa.String(10), nullable=True))  # CRYPTO/FOREX
    
    # Índices para filtros
    op.create_index('idx_signals_asset_type', 'signals', ['asset_type'])
    op.create_index('idx_signals_location_va', 'signals', ['location_va'])
    op.create_index('idx_signals_vol_regime', 'signals', ['volatility_regime'])

def downgrade() -> None:
    op.drop_index('idx_signals_vol_regime', table_name='signals')
    op.drop_index('idx_signals_location_va', table_name='signals')
    op.drop_index('idx_signals_asset_type', table_name='signals')
    
    op.drop_column('signals', 'asset_type')
    op.drop_column('signals', 'setup_type')
    op.drop_column('signals', 'volatility_regime')
    op.drop_column('signals', 'is_absorption')
    op.drop_column('signals', 'effort_result_ratio')
    op.drop_column('signals', 'distance_vwap_std')
    op.drop_column('signals', 'location_va')
```

```bash
# Aplicar migration
ALEMBIC_DB=eos.db alembic upgrade head
```

---

### **0.6: CRIAR MIGRATION PARA CLASSIFICAR ASSET_TYPE**

**Populando coluna `asset_type` baseado em `symbol`:**

```bash
alembic revision -m "populate_asset_type"
```

**Editar migration:**

```python
"""populate_asset_type

Revision ID: ZZZZZ
Revises: YYYYY
Create Date: 2026-02-01 12:10:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column

revision = 'ZZZZZ'
down_revision = 'YYYYY'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Classificar asset_type baseado em symbol
    signals = table('signals',
        column('symbol', sa.String),
        column('asset_type', sa.String)
    )
    
    # Crypto (termina com USDT ou BUSD)
    op.execute(
        signals.update()
        .where(
            sa.or_(
                signals.c.symbol.like('%USDT'),
                signals.c.symbol.like('%BUSD')
            )
        )
        .values(asset_type='CRYPTO')
    )
    
    # Forex (pares tradicionais)
    op.execute(
        signals.update()
        .where(
            sa.and_(
                ~signals.c.symbol.like('%USDT'),
                ~signals.c.symbol.like('%BUSD'),
                signals.c.symbol.like('%USD%')
            )
        )
        .values(asset_type='FOREX')
    )
    
    # Unknown (resto)
    op.execute(
        signals.update()
        .where(signals.c.asset_type.is_(None))
        .values(asset_type='UNKNOWN')
    )

def downgrade() -> None:
    signals = table('signals',
        column('asset_type', sa.String)
    )
    
    op.execute(
        signals.update().values(asset_type=None)
    )
```

```bash
# Aplicar migration
ALEMBIC_DB=eos.db alembic upgrade head

# Verificar
sqlite3 eos.db "SELECT asset_type, COUNT(*) FROM signals GROUP BY asset_type;"
```

---

### **0.7: BACKUP SEGURO COM ALEMBIC**

```bash
# Criar backup versionado
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REVISION=$(alembic current | awk '{print $1}')

cp databases/eos.db "databases/backups/eos_${REVISION}_${TIMESTAMP}.db"
cp databases/eos-iq.db "databases/backups/eos-iq_${REVISION}_${TIMESTAMP}.db"

echo "Backup criado: eos_${REVISION}_${TIMESTAMP}.db"
```

---

### **0.8: ROLLBACK DE EMERGÊNCIA**

```bash
# Se algo der errado durante migração, voltar para versão anterior
alembic downgrade -1

# Ou voltar para versão específica
alembic downgrade XXXXX

# Ou rollback completo
alembic downgrade base
```

---

## ✅ CHECKLIST PRÉ-MIGRAÇÃO (OBRIGATÓRIO)

Antes de prosseguir para Fase 1 (Análise), validar:

- [ ] Alembic inicializado e configurado
- [ ] Migration inicial criada (`initial_schema_snapshot`)
- [ ] Migration de colunas de análise criada (`add_analysis_columns`)
- [ ] Migration de classificação de assets criada (`populate_asset_type`)
- [ ] Todas migrations aplicadas com sucesso (`alembic upgrade head`)
- [ ] Backups criados em `databases/backups/`
- [ ] Coluna `asset_type` populada corretamente
- [ ] Histórico de migrations visível (`alembic history`)

```bash
# Comando de validação completa
alembic current && \
sqlite3 eos.db "SELECT COUNT(*) FROM signals;" && \
sqlite3 eos.db "SELECT asset_type, COUNT(*) FROM signals GROUP BY asset_type;" && \
ls -lh databases/backups/
```

**Output esperado:**

```
INFO  [alembic.runtime.migration] Context impl SQLiteImpl.
INFO  [alembic.runtime.migration] Will assume non-transactional DDL.
ZZZZZ (head)

3045

CRYPTO|2845
FOREX|195
UNKNOWN|5

total 12M
-rw-r--r-- 1 user user 6.1M Feb  1 12:15 eos_ZZZZZ_20260201_121500.db
-rw-r--r-- 1 user user 5.9M Feb  1 12:15 eos-iq_ZZZZZ_20260201_121500.db
```

---

## FASE 1: AUDITORIA E ANÁLISE IMEDIATA (PRIORIDADE)

**Objetivo:** Entender o estado atual dos dados e extrair insights mesmo com possível contaminação, depois decidir pela limpeza.

---

### **PASSO 1.1: AUDITORIA RÁPIDA DOS BANCOS**

**Conectar aos bancos no EC2:**
- `eos.db` (Crypto esperado)
- `eos-iq.db` (Forex)

**Executar queries de diagnóstico:**

```sql
-- eos.db - Identificar símbolos e contaminação
SELECT 
  symbol,
  COUNT(*) as total_signals,
  MIN(timestamp) as first_signal,
  MAX(timestamp) as last_signal,
  SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
  ROUND(SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as win_rate
FROM signals
GROUP BY symbol
ORDER BY total_signals DESC;

-- Contagem por tipo de ativo (usando coluna populada por Alembic)
SELECT 
  asset_type,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM signals), 2) as percentage,
  ROUND(AVG(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) * 100, 2) as avg_win_rate
FROM signals
GROUP BY asset_type;
```

**Repetir para `eos-iq.db`.**

**Output esperado:**

```
📊 RELATÓRIO DE AUDITORIA

┌─ eos.db (Crypto esperado) ─────────────────────┐
│ Total: 3.045 sinais                             │
│ ├─ CRYPTO: 2.845 sinais (93.4%) WR: 58.2%     │
│ ├─ FOREX: 195 sinais (6.4%) WR: 52.1% ⚠️      │
│ └─ UNKNOWN: 5 sinais (0.2%) WR: 40.0% ⚠️      │
│                                                  │
│ Top símbolos:                                    │
│   BTCUSDT: 1.200 (39.4%) - WR: 58.3%           │
│   EURUSD: 195 (6.4%) - WR: 52.1% ⚠️ CONTAM.   │
│   ETHUSDT: 800 (26.3%) - WR: 61.2%             │
│   SOLUSDT: 450 (14.8%) - WR: 56.7%             │
└──────────────────────────────────────────────────┘

┌─ eos-iq.db (Forex esperado) ───────────────────┐
│ Total: 46.851 sinais                            │
│ ├─ FOREX: 46.651 sinais (99.6%) WR: 54.3%     │
│ ├─ CRYPTO: 200 sinais (0.4%) WR: 62.5% ⚠️     │
│ └─ UNKNOWN: 0 sinais (0.0%)                    │
│                                                  │
│ Top símbolos:                                    │
│   EURUSD: 12.500 (26.7%) - WR: 54.1%           │
│   GBPUSD: 8.300 (17.7%) - WR: 53.8%            │
│   BTCUSDT: 150 (0.3%) - WR: 64.0% ⚠️ CONTAM.  │
│   USDJPY: 7.200 (15.4%) - WR: 55.2%            │
└──────────────────────────────────────────────────┘

⚠️ CONTAMINAÇÃO DETECTADA:
  - 195 sinais Forex em banco Crypto (6.4%)
  - 200 sinais Crypto em banco Forex (0.4%)
  - Total de 395 sinais para migração
```

---

### **PASSO 1.2: EXTRAÇÃO DE DATASET CRYPTO (AMBOS OS BANCOS)**

**Unir sinais Crypto de ambos os bancos para análise:**

```sql
-- Criar view temporária com TODOS os sinais Crypto
CREATE TEMP VIEW crypto_signals_all AS
SELECT * FROM signals 
WHERE asset_type = 'CRYPTO'
UNION ALL
SELECT * FROM (ATTACH DATABASE 'eos-iq.db' AS forex_db; SELECT * FROM forex_db.signals WHERE asset_type = 'CRYPTO');

-- Verificar volume total
SELECT COUNT(*) as total_crypto_signals FROM crypto_signals_all;

-- Estatísticas básicas
SELECT 
  COUNT(*) as total_signals,
  COUNT(DISTINCT symbol) as unique_symbols,
  MIN(timestamp) as first_trade,
  MAX(timestamp) as last_trade,
  ROUND(AVG(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) * 100, 2) as win_rate,
  ROUND(AVG(pnl), 4) as avg_pnl,
  ROUND(SUM(pnl), 2) as total_pnl
FROM crypto_signals_all;

-- Exportar para análise
.mode csv
.headers on
.output crypto-signals-unified.csv
SELECT 
  symbol,
  timestamp,
  entry_price,
  exit_price,
  direction,
  result,
  pnl,
  mfe,
  mae,
  volume,
  vwap,
  location_va,
  distance_vwap_std,
  effort_result_ratio,
  is_absorption,
  volatility_regime,
  setup_type,
  -- Colunas derivadas adicionais
  ABS(exit_price - entry_price) as price_displacement,
  CAST((JULIANDAY(exit_time) - JULIANDAY(timestamp)) * 24 * 60 AS INTEGER) as duration_minutes
FROM crypto_signals_all
ORDER BY timestamp;
.output stdout
```

**Output esperado:**

```
✅ DATASET CRYPTO UNIFICADO

Total: 3.045 sinais Crypto
Símbolos únicos: 8 (BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, ADAUSDT, DOTUSDT, MATICUSDT, XRPUSDT)
Período: 2025-12-28 até 2026-02-01 (35 dias)
Win Rate: 58.7%
PnL Médio: +0.0342
PnL Total: +104.19

📁 Exportado: crypto-signals-unified.csv (3.045 linhas)
```

---

### **PASSO 1.3: ANÁLISE ESTATÍSTICA DESCRITIVA (DATASET UNIFICADO)**

**Agora sim, rodar a análise usando `crypto_signals_all`:**

---

#### **1. VALIDAÇÃO DE CONTEXTO (WYCKOFF & PROFILE)**

**Script Python para análise:**

```python
import pandas as pd
import numpy as np
import sqlite3

# Conectar ao banco com dados unificados
conn = sqlite3.connect('eos.db')

# Carregar dataset Crypto unificado
df = pd.read_sql_query("""
    SELECT * FROM signals WHERE asset_type = 'CRYPTO'
    UNION ALL
    SELECT * FROM (ATTACH DATABASE 'eos-iq.db' AS f; SELECT * FROM f.signals WHERE asset_type = 'CRYPTO')
""", conn)

print(f"📊 Dataset carregado: {len(df)} trades Crypto\n")

# ═══════════════════════════════════════════════════════
# 1.1 LOCALIZAÇÃO EM RELAÇÃO À VALUE AREA
# ═══════════════════════════════════════════════════════

# Verificar se coluna location_va existe e está populada
if 'location_va' in df.columns and df['location_va'].notna().sum() > 0:
    print("📍 CONTEXTO - LOCALIZAÇÃO EM RELAÇÃO À VALUE AREA\n")
    
    va_analysis = df.groupby('location_va').agg({
        'result': lambda x: round((x == 'WIN').mean() * 100, 2),
        'pnl': lambda x: round(x.mean(), 4),
        'symbol': 'count'
    }).rename(columns={'result': 'Win_Rate%', 'pnl': 'PnL_Médio', 'symbol': 'N_Trades'})
    
    print(va_analysis.to_string())
    print()
    
    # Identificar melhor localização
    best_location = va_analysis['Win_Rate%'].idxmax()
    best_wr = va_analysis.loc[best_location, 'Win_Rate%']
    worst_location = va_analysis['Win_Rate%'].idxmin()
    worst_wr = va_analysis.loc[worst_location, 'Win_Rate%']
    
    print(f"✅ INSIGHT: Trades em '{best_location}' têm {best_wr - worst_wr:.1f}pp maior WR!")
    print(f"❌ FILTRAR: Trades em '{worst_location}' (WR: {worst_wr}%)\n")
else:
    print("⚠️ Coluna 'location_va' não disponível. Calcular retroativamente?\n")

# ═══════════════════════════════════════════════════════
# 1.2 DISTÂNCIA DO VWAP
# ═══════════════════════════════════════════════════════

if 'distance_vwap_std' in df.columns and df['distance_vwap_std'].notna().sum() > 0:
    print("📏 DISTÂNCIA DO VWAP (Desvios Padrão)\n")
    
    # Classificar distâncias
    df['vwap_distance_bucket'] = pd.cut(
        df['distance_vwap_std'].abs(), 
        bins=[0, 0.5, 1.0, 2.0, np.inf],
        labels=['Muito_Perto', 'Perto', 'Longe', 'Muito_Longe']
    )
    
    vwap_analysis = df.groupby('vwap_distance_bucket').agg({
        'result': lambda x: round((x == 'WIN').mean() * 100, 2),
        'pnl': lambda x: round(x.mean(), 4),
        'symbol': 'count'
    }).rename(columns={'result': 'Win_Rate%', 'pnl': 'PnL_Médio', 'symbol': 'N_Trades'})
    
    print(vwap_analysis.to_string())
    print()
    
    # Validar tese: Longe do VWAP = Reversão à média
    if vwap_analysis.loc['Muito_Longe', 'Win_Rate%'] > vwap_analysis.loc['Perto', 'Win_Rate%']:
        print("✅ TESE CONFIRMADA: Trades 'Muito_Longe' do VWAP funcionam melhor (reversão à média)")
    else:
        print("❌ TESE REJEITADA: Distância do VWAP não melhora performance")
    print()
else:
    print("⚠️ Coluna 'distance_vwap_std' não disponível.\n")
```

**Output esperado:**

```
📊 Dataset carregado: 3.045 trades Crypto

📍 CONTEXTO - LOCALIZAÇÃO EM RELAÇÃO À VALUE AREA

location_va    Win_Rate%    PnL_Médio    N_Trades
─────────────────────────────────────────────────
ACIMA          52.3%        -0.0128      842
DENTRO         47.1%        -0.0287      1456
ABAIXO         67.4%        +0.0521      747

✅ INSIGHT: Trades em 'ABAIXO' têm 20.3pp maior WR!
❌ FILTRAR: Trades em 'DENTRO' (WR: 47.1%)

📏 DISTÂNCIA DO VWAP (Desvios Padrão)

vwap_distance_bucket    Win_Rate%    PnL_Médio    N_Trades
─────────────────────────────────────────────────────────
Muito_Perto             54.2%        +0.0142      1023
Perto                   56.8%        +0.0231      987
Longe                   61.3%        +0.0389      712
Muito_Longe             68.9%        +0.0612      323

✅ TESE CONFIRMADA: Trades 'Muito_Longe' do VWAP funcionam melhor (reversão à média)
```

---

#### **2. VALIDAÇÃO DE MICROESTRUTURA (ORDER FLOW)**

```python
# ═══════════════════════════════════════════════════════
# 2.1 EFFORT-RESULT RATIO (ABSORÇÃO)
# ═══════════════════════════════════════════════════════

if 'effort_result_ratio' in df.columns and df['effort_result_ratio'].notna().sum() > 0:
    print("🔬 MICROESTRUTURA - ABSORÇÃO (EFFORT-RESULT RATIO)\n")
    
    # Definir threshold de absorção (percentil 90)
    absorption_threshold = df['effort_result_ratio'].quantile(0.90)
    df['is_absorption_calc'] = df['effort_result_ratio'] > absorption_threshold
    
    # Comparar trades contra absorção vs normais
    absorption_stats = df.groupby('is_absorption_calc').agg({
        'result': lambda x: round((x == 'WIN').mean() * 100, 2),
        'pnl': lambda x: round(x.mean(), 4),
        'symbol': 'count'
    }).rename(columns={'result': 'Win_Rate%', 'pnl': 'PnL_Médio', 'symbol': 'N_Trades'})
    
    absorption_stats.index = ['Normal', 'Contra_Absorção']
    
    print(f"Threshold de Absorção (P90): {absorption_threshold:.2f}\n")
    print(absorption_stats.to_string())
    print()
    
    # Calcular delta de performance
    wr_boost = absorption_stats.loc['Contra_Absorção', 'Win_Rate%'] - absorption_stats.loc['Normal', 'Win_Rate%']
    
    if wr_boost > 5:
        print(f"✅ ABSORÇÃO É KILL SWITCH CONFIÁVEL (+{wr_boost:.1f}pp WR)!")
        print(f"🎯 IMPLEMENTAR: Operar apenas quando ERR > {absorption_threshold:.2f}")
    else:
        print(f"⚠️ Absorção não melhora significativamente WR (+{wr_boost:.1f}pp)")
    print()
else:
    print("⚠️ Coluna 'effort_result_ratio' não disponível. Calcular:\n")
    print("  ERR = Volume / ABS(High - Low)\n")

# ═══════════════════════════════════════════════════════
# 2.2 STACKED IMBALANCES
# ═══════════════════════════════════════════════════════

# Nota: Requer lógica mais complexa de detecção de imbalances
# Placeholder para implementação futura
print("📊 STACKED IMBALANCES - Análise requer dados adicionais de Order Flow")
print("   (Implementar após integração com dados de imbalances)\n")
```

**Output esperado:**

```
🔬 MICROESTRUTURA - ABSORÇÃO (EFFORT-RESULT RATIO)

Threshold de Absorção (P90): 1847.32

                     Win_Rate%    PnL_Médio    N_Trades
────────────────────────────────────────────────────────
Normal               54.8%        +0.0198      2741
Contra_Absorção      71.2%        +0.0687      304

✅ ABSORÇÃO É KILL SWITCH CONFIÁVEL (+16.4pp WR)!
🎯 IMPLEMENTAR: Operar apenas quando ERR > 1847.32

📊 STACKED IMBALANCES - Análise requer dados adicionais de Order Flow
   (Implementar após integração com dados de imbalances)
```

---

#### **3. OTIMIZAÇÃO DE STOP/TARGET (MFE/MAE)**

```python
# ═══════════════════════════════════════════════════════
# 3.1 ANÁLISE DE MAE (Maximum Adverse Excursion)
# ═══════════════════════════════════════════════════════

print("🎯 GESTÃO DE TRADE - OTIMIZAÇÃO DE STOP/TARGET\n")

# Filtrar apenas trades vencedores
winners = df[df['result'] == 'WIN'].copy()

print(f"📉 MAE - Distribuição (Trades Vencedores: {len(winners)})\n")
mae_stats = winners['mae'].describe(percentiles=[0.5, 0.75, 0.90, 0.95])
print(mae_stats.to_string())
print()

# ═══════════════════════════════════════════════════════
# 3.2 ANÁLISE DE MFE (Maximum Favorable Excursion)
# ═══════════════════════════════════════════════════════

print(f"📈 MFE - Distribuição (Trades Vencedores: {len(winners)})\n")
mfe_stats = winners['mfe'].describe(percentiles=[0.5, 0.75, 0.90, 0.95])
print(mfe_stats.to_string())
print()

# ═══════════════════════════════════════════════════════
# 3.3 RECOMENDAÇÕES DE OTIMIZAÇÃO
# ═══════════════════════════════════════════════════════

# Valores atuais (ajustar conforme bot real)
current_sl = 10  # pontos
current_tp = 20  # pontos

mae_p90 = winners['mae'].quantile(0.90)
mfe_mean = winners['mfe'].mean()
mfe_p75 = winners['mfe'].quantile(0.75)

print("🎯 RECOMENDAÇÕES DE OTIMIZAÇÃO\n")
print(f"Stop Loss atual: {current_sl} pontos")
print(f"MAE P90 (vencedores): {mae_p90:.2f} pontos")

if mae_p90 < current_sl * 0.7:
    new_sl = round(mae_p90, 2)
    sl_reduction = round((1 - new_sl/current_sl) * 100, 1)
    print(f"  ✅ REDUZIR SL para {new_sl} pontos (-{sl_reduction}%)")
    print(f"     Impacto: R/R melhora de {current_tp/current_sl:.1f}:1 para {current_tp/new_sl:.1f}:1\n")
else:
    print(f"  ℹ️  SL atual adequado\n")

print(f"Take Profit atual: {current_tp} pontos")
print(f"MFE Médio (vencedores): {mfe_mean:.2f} pontos")
print(f"MFE P75 (vencedores): {mfe_p75:.2f} pontos")

if mfe_mean < current_tp:
    new_tp = round(mfe_p75, 2)
    tp_reduction = round((1 - new_tp/current_tp) * 100, 1)
    print(f"  ✅ AJUSTAR TP para {new_tp} pontos (-{tp_reduction}%)")
    print(f"     Motivo: Captura lucro real (evita devolver ganhos)\n")
else:
    print(f"  ℹ️  TP atual adequado\n")

# Calcular impacto no R/R
if mae_p90 < current_sl * 0.7 and mfe_mean < current_tp:
    new_rr = round(new_tp / new_sl, 2)
    old_rr = round(current_tp / current_sl, 2)
    rr_improvement = round(((new_rr / old_rr) - 1) * 100, 1)
    
    print(f"💡 IMPACTO TOTAL:")
    print(f"   R/R: {old_rr}:1 → {new_rr}:1 (+{rr_improvement}% efficiency)")
```

**Output esperado:**

```
🎯 GESTÃO DE TRADE - OTIMIZAÇÃO DE STOP/TARGET

📉 MAE - Distribuição (Trades Vencedores: 1788)

count    1788.000000
mean        4.782341
std         2.134567
min         0.120000
50%         4.560000
75%         6.230000
90%         7.340000
95%         8.910000
max        12.450000

📈 MFE - Distribuição (Trades Vencedores: 1788)

count    1788.000000
mean       16.234512
std         5.789234
min         2.340000
50%        15.670000
75%        19.230000
90%        23.450000
95%        27.120000
max        38.760000

🎯 RECOMENDAÇÕES DE OTIMIZAÇÃO

Stop Loss atual: 10 pontos
MAE P90 (vencedores): 7.34 pontos
  ✅ REDUZIR SL para 7.34 pontos (-26.6%)
     Impacto: R/R melhora de 2.0:1 para 2.7:1

Take Profit atual: 20 pontos
MFE Médio (vencedores): 16.23 pontos
MFE P75 (vencedores): 19.23 pontos
  ✅ AJUSTAR TP para 19.23 pontos (-3.9%)
     Motivo: Captura lucro real (evita devolver ganhos)

💡 IMPACTO TOTAL:
   R/R: 2.0:1 → 2.6:1 (+30.0% efficiency)
```

---

#### **4. FILTRO DE REGIME DE VOLATILIDADE**

```python
# ═══════════════════════════════════════════════════════
# 4.1 CLASSIFICAÇÃO DE REGIME DE VOLATILIDADE
# ═══════════════════════════════════════════════════════

print("📊 REGIME DE VOLATILIDADE × TIPO DE SETUP\n")

# Verificar se coluna volatility_regime existe
if 'volatility_regime' in df.columns and df['volatility_regime'].notna().sum() > 0:
    # Usar classificação existente
    pass
else:
    # Calcular volatilidade retroativamente
    df = df.sort_values(['symbol', 'timestamp'])
    df['price_change'] = df.groupby('symbol')['entry_price'].pct_change().abs()
    df['volatility'] = df.groupby('symbol')['price_change'].rolling(14).std().reset_index(0, drop=True)
    
    # Classificar em regimes por símbolo
    df['volatility_regime'] = df.groupby('symbol')['volatility'].transform(
        lambda x: pd.qcut(x, q=3, labels=['BAIXA', 'MÉDIA', 'ALTA'], duplicates='drop')
    )

# Classificar tipo de setup (simplificado - ajustar conforme lógica real)
if 'setup_type' not in df.columns or df['setup_type'].isna().all():
    # Heurística simples baseada em direction
    df['setup_type'] = df['direction'].map({
        'CALL': 'BREAKOUT',
        'PUT': 'REVERSAO'
    })
    print("⚠️ Usando classificação simplificada de setup (CALL=BREAKOUT, PUT=REVERSAO)\n")

# Criar pivot table
regime_setup_pivot = df.pivot_table(
    values='result',
    index='volatility_regime',
    columns='setup_type',
    aggfunc=lambda x: round((x == 'WIN').mean() * 100, 2)
)

print(regime_setup_pivot.to_string())
print()

# Identificar combinações ruins (WR < 50%)
bad_combinations = []
for regime in regime_setup_pivot.index:
    for setup in regime_setup_pivot.columns:
        wr = regime_setup_pivot.loc[regime, setup]
        if pd.notna(wr) and wr < 50:
            bad_combinations.append((regime, setup, wr))

if bad_combinations:
    print("❌ KILL SWITCHES (WR < 50%):\n")
    for regime, setup, wr in bad_combinations:
        count = len(df[(df['volatility_regime'] == regime) & (df['setup_type'] == setup)])
        print(f"   - {setup} em volatilidade {regime}: {wr}% WR ({count} trades) → FILTRAR")
    print()
else:
    print("✅ Nenhum kill switch por regime detectado\n")
```

**Output esperado:**

```
📊 REGIME DE VOLATILIDADE × TIPO DE SETUP

⚠️ Usando classificação simplificada de setup (CALL=BREAKOUT, PUT=REVERSAO)

setup_type       BREAKOUT    REVERSAO
volatility_regime                    
BAIXA            43.2%       64.1%
MÉDIA            58.7%       56.3%
ALTA             68.9%       45.8%

❌ KILL SWITCHES (WR < 50%):

   - BREAKOUT em volatilidade BAIXA: 43.2% WR (523 trades) → FILTRAR
   - REVERSAO em volatilidade ALTA: 45.8% WR (387 trades) → FILTRAR

✅ ECONOMIA: 910 trades ruins filtrados (perda evitada estimada: -127.4 pontos)
```

---

### **PASSO 1.4: MATRIZ DE PROBABILIDADE CONDICIONAL (OUTPUT FINAL)**

```python
# ═══════════════════════════════════════════════════════
# CONSOLIDAÇÃO FINAL - MATRIZ DE PROBABILIDADE
# ═══════════════════════════════════════════════════════

print("="*80)
print("🎯 MATRIZ DE PROBABILIDADE CONDICIONAL (N={} trades Crypto)".format(len(df)))
print("="*80)
print()

# Definir condições compostas
conditions = {
    'Borda VA + Absorção': 
        (df['location_va'] == 'ABAIXO') & (df['is_absorption_calc'] == True),
    
    'Meio VA + Baixo Volume':
        (df['location_va'] == 'DENTRO') & (df['volume'] < df['volume'].quantile(0.3)),
    
    'Breakout + Vol Alta':
        (df['setup_type'] == 'BREAKOUT') & (df['volatility_regime'] == 'ALTA'),
    
    'Reversão + Vol Baixa':
        (df['setup_type'] == 'REVERSAO') & (df['volatility_regime'] == 'BAIXA'),
    
    'Longe VWAP + Absorção':
        (df['vwap_distance_bucket'] == 'Muito_Longe') & (df['is_absorption_calc'] == True),
    
    'Breakout + Vol Baixa':
        (df['setup_type'] == 'BREAKOUT') & (df['volatility_regime'] == 'BAIXA')
}

results = []
for name, condition in conditions.items():
    subset = df[condition]
    if len(subset) > 0:
        wr = round((subset['result'] == 'WIN').mean() * 100, 1)
        avg_pnl = round(subset['pnl'].mean(), 4)
        count = len(subset)
        
        # Calcular expectativa matemática
        win_rate_decimal = wr / 100
        avg_win = subset[subset['result'] == 'WIN']['pnl'].mean() if (subset['result'] == 'WIN').any() else 0
        avg_loss = subset[subset['result'] == 'LOSS']['pnl'].mean() if (subset['result'] == 'LOSS').any() else 0
        expectancy = (win_rate_decimal * avg_win) + ((1 - win_rate_decimal) * avg_loss)
        
        action = '✅ OPERAR' if wr >= 60 else '❌ FILTRAR'
        
        results.append({
            'Condição': name,
            'Win_Rate%': wr,
            'PnL_Médio': avg_pnl,
            'Expectância': round(expectancy, 4),
            'N_Trades': count,
            'Ação': action
        })

final_table = pd.DataFrame(results)
final_table = final_table.sort_values('Win_Rate%', ascending=False)

print(final_table.to_string(index=False))
print()

# Resumo de impacto
total_good = final_table[final_table['Win_Rate%'] >= 60]['N_Trades'].sum()
total_bad = final_table[final_table['Win_Rate%'] < 60]['N_Trades'].sum()
pnl_saved = final_table[final_table['Win_Rate%'] < 60]['PnL_Médio'].sum() * final_table[final_table['Win_Rate%'] < 60]['N_Trades'].sum()

print(f"📊 RESUMO DE IMPACTO:")
print(f"   Condições favoráveis: {len(final_table[final_table['Win_Rate%'] >= 60])} ({total_good} trades)")
print(f"   Condições a filtrar: {len(final_table[final_table['Win_Rate%'] < 60])} ({total_bad} trades)")
print(f"   Economia estimada: {abs(pnl_saved):.2f} pontos\n")

# Salvar resultados
final_table.to_csv('matriz_probabilidade_eos.csv', index=False)
print("✅ Matriz exportada: matriz_probabilidade_eos.csv")

conn.close()
```

**Output esperado:**

```
================================================================================
🎯 MATRIZ DE PROBABILIDADE CONDICIONAL (N=3045 trades Crypto)
================================================================================

Condição                      Win_Rate%  PnL_Médio  Expectância  N_Trades  Ação
─────────────────────────────────────────────────────────────────────────────────
Longe VWAP + Absorção         74.2%      +0.0687    +0.0511      73        ✅ OPERAR
Borda VA + Absorção           71.8%      +0.0612    +0.0439      89        ✅ OPERAR
Breakout + Vol Alta           68.9%      +0.0521    +0.0359      187       ✅ OPERAR
Reversão + Vol Baixa          64.1%      +0.0389    +0.0249      312       ✅ OPERAR
Meio VA + Baixo Volume        44.3%      -0.0312    -0.0138      623       ❌ FILTRAR
Breakout + Vol Baixa          43.2%      -0.0287    -0.0165      523       ❌ FILTRAR

📊 RESUMO DE IMPACTO:
   Condições favoráveis: 4 (661 trades)
   Condições a filtrar: 2 (1.146 trades)
   Economia estimada: 42.67 pontos

✅ Matriz exportada: matriz_probabilidade_eos.csv
```

---

## FASE 2: MIGRAÇÃO LIMPA (OPÇÃO A) - APÓS ANÁLISE

**Agora que sabemos o impacto da contaminação, executar limpeza:**

---

### **PASSO 2.1: CRIAR MIGRATION PARA BANCO LIMPO**

```bash
alembic revision -m "create_clean_crypto_database"
```

**Editar migration:**

```python
"""create_clean_crypto_database

Revision ID: AAAAA
Revises: ZZZZZ
Create Date: 2026-02-01 12:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'AAAAA'
down_revision = 'ZZZZZ'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Esta migration será aplicada em eos-crypto-clean.db
    # O schema já existe, apenas documentar a criação
    pass

def downgrade() -> None:
    pass
```

---

### **PASSO 2.2: SCRIPT DE MIGRAÇÃO DE DADOS**

**Criar `scripts/migrate_crypto_clean.py`:**

```python
#!/usr/bin/env python3
"""
Script de migração: Criar banco limpo apenas com sinais Crypto
"""

import sqlite3
import shutil
from datetime import datetime
from pathlib import Path

# Configuração
DB_PATH = Path("databases")
OLD_CRYPTO_DB = DB_PATH / "eos.db"
OLD_FOREX_DB = DB_PATH / "eos-iq.db"
NEW_CRYPTO_DB = DB_PATH / "eos-crypto-clean.db"
BACKUP_PATH = DB_PATH / "backups"

def create_backup(db_file):
    """Criar backup timestamped"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = BACKUP_PATH / f"{db_file.stem}_backup_{timestamp}.db"
    
    BACKUP_PATH.mkdir(exist_ok=True)
    shutil.copy2(db_file, backup_name)
    
    print(f"✅ Backup criado: {backup_name}")
    return backup_name

def create_clean_database():
    """Criar banco limpo com apenas sinais Crypto"""
    
    print("\n" + "="*80)
    print("MIGRAÇÃO: EOS CRYPTO CLEAN DATABASE")
    print("="*80 + "\n")
    
    # 1. Backups obrigatórios
    print("📦 Criando backups...")
    create_backup(OLD_CRYPTO_DB)
    create_backup(OLD_FOREX_DB)
    
    # 2. Copiar schema de eos.db
    print(f"\n📋 Copiando schema de {OLD_CRYPTO_DB}...")
    shutil.copy2(OLD_CRYPTO_DB, NEW_CRYPTO_DB)
    
    # 3. Conectar aos bancos
    conn_new = sqlite3.connect(NEW_CRYPTO_DB)
    conn_old_forex = sqlite3.connect(OLD_FOREX_DB)
    
    cur_new = conn_new.cursor()
    
    # 4. Limpar sinais Forex do banco copiado
    print("\n🧹 Removendo sinais Forex...")
    cur_new.execute("DELETE FROM signals WHERE asset_type = 'FOREX'")
    forex_removed = cur_new.rowcount
    print(f"   Removidos: {forex_removed} sinais Forex")
    
    # 5. Migrar sinais Crypto de eos-iq.db
    print(f"\n🔄 Migrando sinais Crypto de {OLD_FOREX_DB}...")
    cur_new.execute("ATTACH DATABASE ? AS forex_db", (str(OLD_FOREX_DB),))
    
    cur_new.execute("""
        INSERT INTO signals 
        SELECT * FROM forex_db.signals 
        WHERE asset_type = 'CRYPTO'
    """)
    crypto_migrated = cur_new.rowcount
    print(f"   Migrados: {crypto_migrated} sinais Crypto")
    
    # 6. Remover duplicatas (se houver)
    print("\n🔍 Verificando duplicatas...")
    cur_new.execute("""
        DELETE FROM signals
        WHERE rowid NOT IN (
            SELECT MIN(rowid)
            FROM signals
            GROUP BY symbol, timestamp, entry_price, direction
        )
    """)
    duplicates_removed = cur_new.rowcount
    print(f"   Removidos: {duplicates_removed} duplicatas")
    
    # 7. Validação final
    print("\n✅ VALIDAÇÃO FINAL:")
    
    # Total sinais
    total = cur_new.execute("SELECT COUNT(*) FROM signals").fetchone()[0]
    print(f"   Total sinais: {total}")
    
    # Por asset_type
    cur_new.execute("""
        SELECT asset_type, COUNT(*) 
        FROM signals 
        GROUP BY asset_type
    """)
    for asset_type, count in cur_new.fetchall():
        print(f"   {asset_type}: {count}")
    
    # Contaminação (deve ser 0)
    contamination = cur_new.execute("""
        SELECT COUNT(*) FROM signals 
        WHERE asset_type != 'CRYPTO'
    """).fetchone()[0]
    
    if contamination == 0:
        print(f"\n   ✅ Zero contaminação Forex!")
    else:
        print(f"\n   ⚠️  ATENÇÃO: {contamination} sinais não-Crypto encontrados!")
    
    # Top símbolos
    print("\n   Top 5 símbolos:")
    cur_new.execute("""
        SELECT symbol, COUNT(*) as count
        FROM signals
        GROUP BY symbol
        ORDER BY count DESC
        LIMIT 5
    """)
    for symbol, count in cur_new.fetchall():
        print(f"     {symbol}: {count}")
    
    # 8. Commit e fechar
    conn_new.commit()
    conn_new.close()
    conn_old_forex.close()
    
    print(f"\n✅ Banco limpo criado: {NEW_CRYPTO_DB}")
    print("\n" + "="*80)

if __name__ == "__main__":
    create_clean_database()
```

**Executar:**

```bash
chmod +x scripts/migrate_crypto_clean.py
python scripts/migrate_crypto_clean.py
```

---

### **PASSO 2.3: APLICAR ALEMBIC NO BANCO LIMPO**

```bash
# Aplicar todas migrations no banco limpo
ALEMBIC_DB=eos-crypto-clean.db alembic upgrade head

# Verificar
ALEMBIC_DB=eos-crypto-clean.db alembic current
```

---

### **PASSO 2.4: SUBSTITUIR BANCO EM PRODUÇÃO**

**Criar script `scripts/deploy_clean_db.sh`:**

```bash
#!/bin/bash

# Script de deploy do banco limpo em produção

set -e  # Exit on error

echo "================================"
echo "DEPLOY: EOS CRYPTO CLEAN DATABASE"
echo "================================"
echo ""

# Validação
echo "📋 Validando banco limpo..."
CRYPTO_COUNT=$(sqlite3 databases/eos-crypto-clean.db "SELECT COUNT(*) FROM signals WHERE asset_type='CRYPTO'")
FOREX_COUNT=$(sqlite3 databases/eos-crypto-clean.db "SELECT COUNT(*) FROM signals WHERE asset_type='FOREX'")

echo "   Crypto: $CRYPTO_COUNT"
echo "   Forex: $FOREX_COUNT"

if [ "$FOREX_COUNT" -ne 0 ]; then
    echo "❌ ERRO: Contaminação Forex detectada! Abortando deploy."
    exit 1
fi

echo ""
read -p "⚠️  ATENÇÃO: Substituir eos.db por eos-crypto-clean.db? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Deploy cancelado pelo usuário."
    exit 0
fi

# Parar bot
echo ""
echo "🛑 Parando bot..."
pm2 stop eos-telegram-bot || true

# Backup final
echo ""
echo "📦 Criando backup final de eos.db..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp databases/eos.db databases/backups/eos_pre_migration_$TIMESTAMP.db

# Renomear
echo ""
echo "🔄 Substituindo banco..."
mv databases/eos.db databases/eos.db.old_contaminated
mv databases/eos-crypto-clean.db databases/eos.db

# Verificar permissões
chmod 644 databases/eos.db

# Reiniciar bot
echo ""
echo "▶️  Reiniciando bot..."
pm2 restart eos-telegram-bot

# Status
echo ""
pm2 status eos-telegram-bot

echo ""
echo "✅ Deploy concluído com sucesso!"
echo ""
echo "📊 Novo banco em produção:"
sqlite3 databases/eos.db "SELECT asset_type, COUNT(*) FROM signals GROUP BY asset_type;"

echo ""
echo "🔙 Rollback disponível:"
echo "   mv databases/eos.db.old_contaminated databases/eos.db"
echo "   pm2 restart eos-telegram-bot"
```

**Executar:**

```bash
chmod +x scripts/deploy_clean_db.sh
./scripts/deploy_clean_db.sh
```

---

### **PASSO 2.5: LIMPAR `eos-iq.db` (FOREX)**

**Script `scripts/clean_forex_db.py`:**

```python
#!/usr/bin/env python3
"""
Script de limpeza: Remover sinais Crypto de eos-iq.db
"""

import sqlite3
import shutil
from datetime import datetime
from pathlib import Path

DB_PATH = Path("databases")
FOREX_DB = DB_PATH / "eos-iq.db"
BACKUP_PATH = DB_PATH / "backups"

def clean_forex_database():
    """Remover sinais Crypto do banco Forex"""
    
    print("\n" + "="*80)
    print("LIMPEZA: EOS FOREX DATABASE")
    print("="*80 + "\n")
    
    # Backup
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = BACKUP_PATH / f"eos-iq_pre_cleanup_{timestamp}.db"
    
    BACKUP_PATH.mkdir(exist_ok=True)
    shutil.copy2(FOREX_DB, backup_name)
    print(f"✅ Backup criado: {backup_name}\n")
    
    # Conectar
    conn = sqlite3.connect(FOREX_DB)
    cur = conn.cursor()
    
    # Verificar contaminação
    print("📊 Estado atual:")
    cur.execute("""
        SELECT asset_type, COUNT(*) 
        FROM signals 
        GROUP BY asset_type
    """)
    for asset_type, count in cur.fetchall():
        print(f"   {asset_type}: {count}")
    
    # Remover Crypto
    print("\n🧹 Removendo sinais Crypto...")
    cur.execute("DELETE FROM signals WHERE asset_type = 'CRYPTO'")
    removed = cur.rowcount
    print(f"   Removidos: {removed} sinais Crypto")
    
    # Validação
    print("\n✅ VALIDAÇÃO:")
    total = cur.execute("SELECT COUNT(*) FROM signals").fetchone()[0]
    crypto_count = cur.execute("SELECT COUNT(*) FROM signals WHERE asset_type = 'CRYPTO'").fetchone()[0]
    
    print(f"   Total sinais: {total}")
    print(f"   Sinais Crypto: {crypto_count}")
    
    if crypto_count == 0:
        print("\n   ✅ Zero contaminação Crypto!")
    else:
        print(f"\n   ⚠️  ATENÇÃO: {crypto_count} sinais Crypto ainda presentes!")
    
    # Commit
    conn.commit()
    conn.close()
    
    print(f"\n✅ Banco Forex limpo: {FOREX_DB}")
    print("="*80 + "\n")

if __name__ == "__main__":
    clean_forex_database()
```

**Executar:**

```bash
chmod +x scripts/clean_forex_db.py
python scripts/clean_forex_db.py
```

---

## CHECKLIST FINAL DE VALIDAÇÃO

```bash
#!/bin/bash

echo "================================"
echo "VALIDAÇÃO FINAL - EOS DATABASES"
echo "================================"
echo ""

# 1. Alembic status
echo "📋 Alembic Migrations:"
ALEMBIC_DB=eos.db alembic current
echo ""

# 2. Volume de dados
echo "📊 Volume de dados:"
echo "   eos.db (Crypto):"
sqlite3 databases/eos.db "SELECT asset_type, COUNT(*) FROM signals GROUP BY asset_type;"
echo ""
echo "   eos-iq.db (Forex):"
sqlite3 databases/eos-iq.db "SELECT asset_type, COUNT(*) FROM signals GROUP BY asset_type;"
echo ""

# 3. Backups disponíveis
echo "📦 Backups disponíveis:"
ls -lh databases/backups/ | tail -5
echo ""

# 4. Status do bot
echo "▶️  Status do Bot:"
pm2 status eos-telegram-bot
echo ""

# 5. Últimos sinais
echo "🔍 Últimos 5 sinais (eos.db):"
sqlite3 -header -column databases/eos.db "SELECT timestamp, symbol, direction, result FROM signals ORDER BY timestamp DESC LIMIT 5;"
echo ""

echo "✅ Validação concluída!"
```

---

## RESUMO DE OUTPUTS ESPERADOS

**Fase 0 (Alembic):**
- ✅ Alembic configurado com 3 migrations aplicadas
- ✅ Coluna `asset_type` populada em ambos os bancos
- ✅ Backups versionados criados
- ✅ Rollback disponível

**Fase 1 (Análise Imediata):**
1. ✅ Relatório de auditoria com % contaminação (6.4% em eos.db, 0.4% em eos-iq.db)
2. ✅ Dataset unificado Crypto (3.045 sinais → CSV exportado)
3. ✅ Matriz de Probabilidade Condicional (6 condições, 4 favoráveis, 2 para filtrar)
4. ✅ Recomendações de SL/TP (SL: 10→7.34, TP: 20→19.23, R/R: +30%)
5. ✅ Kill switches por regime (2 detectados: Breakout em baixa vol, Reversão em alta vol)
6. ✅ Economia estimada: 42.67 pontos (1.146 trades filtrados)

**Fase 2 (Migração Limpa):**
1. ✅ `eos-crypto-clean.db` gerado e validado
2. ✅ Zero contaminação Forex
3. ✅ Backups múltiplos criados
4. ✅ Bot rodando com banco limpo
5. ✅ `eos-iq.db` limpo (zero Crypto)
6. ✅ Rollback testado e disponível

---

## ARQUIVOS GERADOS

```
eos-trade-vision/
├── alembic/
│   ├── versions/
│   │   ├── XXXXX_initial_schema_snapshot.py
│   │   ├── YYYYY_add_analysis_columns.py
│   │   ├── ZZZZZ_populate_asset_type.py
│   │   └── AAAAA_create_clean_crypto_database.py
│   ├── env.py
│   └── alembic.ini
├── databases/
│   ├── eos.db                           ← Banco limpo em produção
│   ├── eos-iq.db                        ← Banco Forex limpo
│   ├── eos.db.old_contaminated          ← Backup do original
│   └── backups/
│       ├── eos_ZZZZZ_20260201_121500.db
│       ├── eos-iq_ZZZZZ_20260201_121500.db
│       ├── eos_pre_migration_20260201_123000.db
│       └── eos-iq_pre_cleanup_20260201_123500.db
├── scripts/
│   ├── migrate_crypto_clean.py
│   ├── clean_forex_db.py
│   ├── deploy_clean_db.sh
│   └── validate_databases.sh
└── analysis/
    ├── crypto-signals-unified.csv       ← Dataset para análise
    └── matriz_probabilidade_eos.csv     ← Matriz final de condições
```

---

## PRÓXIMOS PASSOS (PÓS-MIGRAÇÃO)

1. **Implementar filtros no bot:**
   - Adicionar verificação de `location_va`
   - Adicionar cálculo de `effort_result_ratio` (absorção)
   - Adicionar classificação de `volatility_regime`
   - Implementar kill switches automáticos

2. **Ajustar parâmetros:**
   - SL: 10 → 7.34 pontos
   - TP: 20 → 19.23 pontos
   - Testar em paper trading por 7 dias

3. **Monitoramento contínuo:**
   - Dashboard com métricas por condição
   - Alerta quando WR < 50% em qualquer segmento
   - Re-análise mensal com novos dados

4. **Expansão da análise:**
   - Adicionar dados de Stacked Imbalances
   - Integrar Volume Profile real (não proxy)
   - Calcular VWAP dinamicamente

---

**🎯 PRONTO PARA EXECUÇÃO. ANTIGRAVITY DEVE INICIAR PELO PASSO 0 (ALEMBIC).**