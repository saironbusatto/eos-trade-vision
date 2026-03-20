# Guia Completo de Alembic para Projetos Python

## 📚 Índice

1. [O que é Alembic?](#o-que-é-alembic)
2. [Por que usar Alembic?](#por-que-usar-alembic)
3. [Instalação](#instalação)
4. [Configuração Inicial](#configuração-inicial)
5. [Estrutura de Diretórios](#estrutura-de-diretórios)
6. [Comandos Essenciais](#comandos-essenciais)
7. [Criando Migrações](#criando-migrações)
8. [Aplicando Migrações](#aplicando-migrações)
9. [Rollback de Migrações](#rollback-de-migrações)
10. [Boas Práticas](#boas-práticas)
11. [Integração com Flask](#integração-com-flask)
12. [Exemplos Práticos](#exemplos-práticos)
13. [Troubleshooting](#troubleshooting)

---

## O que é Alembic?

**Alembic** é uma ferramenta de migração de banco de dados leve para uso com **SQLAlchemy**. Criada por Mike Bayer (o mesmo autor do SQLAlchemy), ela fornece:

- ✅ Controle de versão para schemas de banco de dados
- ✅ Geração automática de scripts de migração
- ✅ Histórico completo de mudanças no banco
- ✅ Suporte a upgrade e downgrade
- ✅ Compatibilidade com múltiplos bancos de dados

## Por que usar Alembic?

### Antes do Alembic ❌
```python
# Você tinha que fazer manualmente:
db.create_all()  # Cria todas as tabelas
# Problema: Como atualizar o schema em produção?
# Problema: Como reverter mudanças?
# Problema: Como manter histórico?
```

### Com Alembic ✅
```bash
# Gera migração automaticamente
alembic revision --autogenerate -m "adiciona coluna email"

# Aplica mudanças
alembic upgrade head

# Reverte se necessário
alembic downgrade -1
```

---

## Instalação

### Instalação Básica

```bash
pip install alembic
```

### Com Flask-Migrate (Recomendado para Flask)

```bash
pip install Flask-Migrate
```

### Verificar Instalação

```bash
alembic --version
```

---

## Configuração Inicial

### 1. Inicializar Alembic no Projeto

```bash
# Na raiz do projeto
alembic init alembic
```

Isso cria:
```
seu-projeto/
├── alembic/
│   ├── versions/        # Arquivos de migração
│   ├── env.py          # Configuração do ambiente
│   ├── script.py.mako  # Template para migrações
│   └── README
├── alembic.ini         # Arquivo de configuração
└── ...
```

### 2. Configurar `alembic.ini`

```ini
# alembic.ini

[alembic]
# Caminho para os scripts de migração
script_location = alembic

# String de conexão do banco
# IMPORTANTE: Configure de acordo com seu banco
sqlalchemy.url = postgresql://usuario:senha@localhost/nome_db

# Ou use variável de ambiente (mais seguro)
# sqlalchemy.url = %(DB_URL)s

# Formato do nome dos arquivos de migração
file_template = %%(year)d_%%(month).2d_%%(day).2d_%%(hour).2d%%(minute).2d-%%(rev)s_%%(slug)s
```

### 3. Configurar `env.py`

```python
# alembic/env.py

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import os

# Importar seus modelos aqui
from app.models import Base  # Seu Base do SQLAlchemy

# Configuração do Alembic
config = context.config

# Interpretar o arquivo de log
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadados dos seus modelos
target_metadata = Base.metadata

# Opção: Ler URL do banco de variável de ambiente
def get_url():
    return os.getenv("DATABASE_URL", "sqlite:///./app.db")

def run_migrations_offline() -> None:
    """Executar migrações no modo 'offline'."""
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
    """Executar migrações no modo 'online'."""
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

## Estrutura de Diretórios

```
projeto/
├── alembic/
│   ├── versions/
│   │   ├── 2024_01_15_1430-abc123_create_users.py
│   │   ├── 2024_01_16_0900-def456_add_email_column.py
│   │   └── 2024_01_20_1100-ghi789_create_trades_table.py
│   ├── env.py
│   ├── script.py.mako
│   └── README
├── alembic.ini
├── app/
│   ├── __init__.py
│   ├── models.py     # Seus modelos SQLAlchemy
│   └── database.py
└── main.py
```

---

## Comandos Essenciais

### Comandos Básicos

```bash
# 1. Criar migração manualmente
alembic revision -m "descrição da mudança"

# 2. Criar migração automática (detecta mudanças nos models)
alembic revision --autogenerate -m "descrição da mudança"

# 3. Aplicar todas as migrações pendentes
alembic upgrade head

# 4. Voltar uma migração
alembic downgrade -1

# 5. Voltar para revisão específica
alembic downgrade abc123

# 6. Ver histórico de migrações
alembic history

# 7. Ver migração atual
alembic current

# 8. Ver migrações pendentes
alembic heads
```

### Comandos Avançados

```bash
# Aplicar até revisão específica
alembic upgrade abc123

# Voltar para base (remover todas migrações)
alembic downgrade base

# Ver SQL que será executado (sem executar)
alembic upgrade head --sql

# Marcar banco como migrado sem executar
alembic stamp head

# Mesclar branches de migração
alembic merge -m "merge branches" rev1 rev2
```

---

## Criando Migrações

### Migração Automática (Recomendado)

```bash
# Alembic detecta mudanças automaticamente
alembic revision --autogenerate -m "adiciona tabela de trades"
```

**Exemplo de arquivo gerado:**

```python
# alembic/versions/2024_01_15_abc123_adiciona_tabela_trades.py

"""adiciona tabela de trades

Revision ID: abc123def456
Revises: xyz789
Create Date: 2024-01-15 14:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# Identificadores de revisão
revision = 'abc123def456'
down_revision = 'xyz789'  # Migração anterior
branch_labels = None
depends_on = None

def upgrade() -> None:
    """Aplicar mudanças."""
    op.create_table(
        'trades',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('symbol', sa.String(10), nullable=False),
        sa.Column('price', sa.Float(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_trades_symbol', 'trades', ['symbol'])

def downgrade() -> None:
    """Reverter mudanças."""
    op.drop_index('ix_trades_symbol', table_name='trades')
    op.drop_table('trades')
```

### Migração Manual

```bash
alembic revision -m "migração customizada"
```

```python
def upgrade() -> None:
    # Adicionar coluna
    op.add_column('users', sa.Column('email', sa.String(255), nullable=True))
    
    # Adicionar índice
    op.create_index('ix_users_email', 'users', ['email'])
    
    # Executar SQL raw
    op.execute("UPDATE users SET email = 'default@example.com' WHERE email IS NULL")
    
    # Tornar coluna NOT NULL
    op.alter_column('users', 'email', nullable=False)

def downgrade() -> None:
    op.drop_index('ix_users_email', table_name='users')
    op.drop_column('users', 'email')
```

---

## Aplicando Migrações

### Ambientes de Desenvolvimento

```bash
# 1. Criar migração
alembic revision --autogenerate -m "nova feature"

# 2. Revisar arquivo gerado em alembic/versions/

# 3. Aplicar
alembic upgrade head
```

### Ambientes de Produção

```bash
# 1. Fazer backup do banco
pg_dump nome_db > backup_$(date +%Y%m%d).sql

# 2. Testar em staging primeiro
alembic upgrade head

# 3. Se OK, aplicar em produção
alembic upgrade head

# 4. Verificar
alembic current
```

---

## Rollback de Migrações

### Voltar Uma Migração

```bash
alembic downgrade -1
```

### Voltar para Revisão Específica

```bash
# Ver histórico
alembic history --verbose

# Voltar para revisão
alembic downgrade abc123
```

### Voltar para Base (Remover Tudo)

```bash
alembic downgrade base
```

---

## Boas Práticas

### ✅ DO (Faça)

1. **Sempre revisar migrações autogenerate**
   ```bash
   alembic revision --autogenerate -m "descrição"
   # REVISAR arquivo gerado antes de aplicar!
   ```

2. **Fazer backup antes de migrar produção**
   ```bash
   pg_dump nome_db > backup.sql
   ```

3. **Testar rollback em dev**
   ```bash
   alembic upgrade head
   alembic downgrade -1
   alembic upgrade head
   ```

4. **Usar mensagens descritivas**
   ```bash
   # ❌ Ruim
   alembic revision -m "update"
   
   # ✅ Bom
   alembic revision -m "add email verification to users table"
   ```

5. **Commitar migrações no git**
   ```bash
   git add alembic/versions/*
   git commit -m "Add user email verification migration"
   ```

### ❌ DON'T (Não faça)

1. **Não editar migrações já aplicadas**
   - Crie nova migração em vez disso

2. **Não deletar arquivos de migração**
   - Histórico é importante

3. **Não confiar 100% no autogenerate**
   - Sempre revisar o código gerado

4. **Não hardcodear credenciais**
   ```python
   # ❌ Ruim
   sqlalchemy.url = postgresql://user:senha123@localhost/db
   
   # ✅ Bom
   sqlalchemy.url = %(DATABASE_URL)s
   ```

---

## Integração com Flask

### Usando Flask-Migrate

```python
# app/__init__.py

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

db = SQLAlchemy()
migrate = Migrate()

def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'
    
    db.init_app(app)
    migrate.init_app(app, db)
    
    return app
```

### Comandos Flask-Migrate

```bash
# Inicializar (substitui 'alembic init')
flask db init

# Criar migração
flask db migrate -m "descrição"

# Aplicar migrações
flask db upgrade

# Voltar migração
flask db downgrade

# Ver histórico
flask db history
```

---

## Exemplos Práticos

### Exemplo 1: Sistema de Trading

```python
# models.py

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Trade(Base):
    __tablename__ = 'trades'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    symbol = Column(String(10), nullable=False)
    action = Column(String(10), nullable=False)  # BUY/SELL
    quantity = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
```

### Passo a Passo

```bash
# 1. Criar primeira migração
alembic revision --autogenerate -m "create users and trades tables"

# 2. Aplicar
alembic upgrade head

# 3. Adicionar nova coluna ao User
# Editar models.py:
# risk_tolerance = Column(String(20), default='MODERATE')

# 4. Criar migração para nova coluna
alembic revision --autogenerate -m "add risk_tolerance to users"

# 5. Aplicar
alembic upgrade head
```

### Exemplo 2: Migração com Dados

```python
# Migração que adiciona coluna e preenche dados
def upgrade() -> None:
    # Adicionar coluna
    op.add_column('users', sa.Column('status', sa.String(20), nullable=True))
    
    # Preencher dados existentes
    op.execute("UPDATE users SET status = 'ACTIVE'")
    
    # Tornar NOT NULL após preencher
    op.alter_column('users', 'status', nullable=False)

def downgrade() -> None:
    op.drop_column('users', 'status')
```

---

## Troubleshooting

### Erro: "Target database is not up to date"

```bash
# Verificar versão atual
alembic current

# Ver migrações pendentes
alembic heads

# Aplicar migrações
alembic upgrade head
```

### Erro: "Can't locate revision identified by"

```bash
# Marcar banco com revisão correta
alembic stamp head

# Ou com revisão específica
alembic stamp abc123
```

### Autogenerate não detecta mudanças

```python
# Verificar env.py
target_metadata = Base.metadata  # Certifique-se de que está correto

# Importar TODOS os modelos
from app.models import User, Trade, Order  # Importar explicitamente
```

### Conflitos de Branch

```bash
# Listar branches
alembic branches

# Mesclar branches
alembic merge -m "merge branches" abc123 def456
```

### Resetar Migrações (Apenas Dev!)

```bash
# ⚠️ CUIDADO: Isso apaga tudo!

# 1. Voltar para base
alembic downgrade base

# 2. Deletar arquivos de migração
rm alembic/versions/*.py

# 3. Criar nova migração inicial
alembic revision --autogenerate -m "initial migration"

# 4. Aplicar
alembic upgrade head
```

---

## Checklist para Migração em Produção

- [ ] Backup do banco de dados criado
- [ ] Migração testada em ambiente de staging
- [ ] Rollback testado em staging
- [ ] Tempo de manutenção agendado (se necessário)
- [ ] Equipe notificada sobre deploy
- [ ] Monitoramento ativo durante migração
- [ ] Plano de rollback documentado
- [ ] Verificação pós-migração planejada

---

## Recursos Adicionais

- 📖 [Documentação Oficial do Alembic](https://alembic.sqlalchemy.org/)
- 📖 [Flask-Migrate Docs](https://flask-migrate.readthedocs.io/)
- 📖 [SQLAlchemy Docs](https://docs.sqlalchemy.org/)
- 🎥 [Tutorial em Vídeo](https://www.youtube.com/results?search_query=alembic+tutorial)

---

## Conclusão

**Alembic** é uma ferramenta essencial para qualquer projeto Python que usa SQLAlchemy. Ela garante:

- ✅ Controle de versão do schema
- ✅ Histórico completo de mudanças
- ✅ Deploy seguro em produção
- ✅ Reversão fácil de mudanças
- ✅ Colaboração em equipe

**Próximos Passos:**
1. Inicialize Alembic no seu projeto
2. Configure `env.py` e `alembic.ini`
3. Crie sua primeira migração
4. Teste upgrade e downgrade
5. Integre no seu pipeline de CI/CD

---

**Data de Criação:** 01/02/2026  
**Autor:** Perplexity AI Assistant  
**Versão:** 1.0