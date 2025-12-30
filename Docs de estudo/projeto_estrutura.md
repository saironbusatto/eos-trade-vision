# 📦 Projeto: EOS Bot Binárias com OFA
## Estrutura Profissional de Repositório

```
eos-bot-binarias/
│
├── 📁 src/
│   ├── 📁 bot/
│   │   ├── __init__.py
│   │   ├── telegram_bot.py          # Bot Telegram principal
│   │   ├── signal_handler.py         # Handler de sinais
│   │   └── scheduler.py              # Agendador de tarefas
│   │
│   ├── 📁 ofa/
│   │   ├── __init__.py
│   │   ├── analyzer.py               # Analisador OFA
│   │   ├── models.py                 # Modelos (Vela, NivelPreco, etc)
│   │   └── validators.py             # Validadores de sinal
│   │
│   ├── 📁 trading/
│   │   ├── __init__.py
│   │   ├── platform.py               # Interface abstrata de plataforma
│   │   ├── quotex.py                 # Implementação Quotex
│   │   ├── iq_option.py              # Implementação IQ Option
│   │   ├── pocket_option.py          # Implementação Pocket Option
│   │   └── manager.py                # Gerenciador de operações
│   │
│   ├── 📁 risk/
│   │   ├── __init__.py
│   │   ├── calculator.py             # Cálculos de risco
│   │   ├── martingale.py             # Lógica de Martingale
│   │   └── stops.py                  # Stop Win/Loss
│   │
│   ├── 📁 database/
│   │   ├── __init__.py
│   │   ├── models.py                 # Modelos de BD (SQLAlchemy)
│   │   ├── operations.py             # Operações em BD
│   │   └── queries.py                # Queries customizadas
│   │
│   ├── 📁 api/
│   │   ├── __init__.py
│   │   ├── routes.py                 # Rotas FastAPI
│   │   ├── schemas.py                # Schemas Pydantic
│   │   └── websocket.py              # WebSocket para dashboard real-time
│   │
│   ├── 📁 dashboard/
│   │   ├── index.html
│   │   ├── css/
│   │   │   └── styles.css
│   │   ├── js/
│   │   │   ├── app.js
│   │   │   ├── ofa.js
│   │   │   └── chart.js
│   │   └── assets/
│   │
│   ├── config.py                     # Configuração centralizada
│   ├── logger.py                     # Sistema de logging
│   └── main.py                       # Ponto de entrada principal
│
├── 📁 tests/
│   ├── test_ofa.py
│   ├── test_trading.py
│   ├── test_risk.py
│   └── conftest.py
│
├── 📁 docs/
│   ├── API.md
│   ├── SETUP.md
│   ├── OFA_GUIDE.md
│   └── DEPLOYMENT.md
│
├── 📁 docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── .dockerignore
│
├── 📁 scripts/
│   ├── init_db.py
│   ├── migrate.py
│   ├── backup.py
│   └── healthcheck.py
│
├── .env.example
├── requirements.txt
├── setup.py
├── README.md
├── .gitignore
└── CHANGELOG.md
```

---

## 🔧 Configuração de Dependências

### `requirements.txt`

```txt
# Telegram Bot
python-telegram-bot>=20.0
telegram-bot-calendar>=1.2.0

# Async & HTTP
aiohttp>=3.9.0
asyncio-contextmanager>=1.0.0

# Database
sqlalchemy>=2.0.0
psycopg2-binary>=2.9.0
alembic>=1.13.0

# API
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
pydantic>=2.0.0
pydantic-settings>=2.0.0

# Data & Math
numpy>=1.24.0
pandas>=2.0.0
scipy>=1.11.0

# Charts & Visualization
matplotlib>=3.7.0
plotly>=5.17.0

# Utilities
python-dotenv>=1.0.0
pytz>=2023.3
schedule>=1.2.0
requests>=2.31.0

# Security & Crypto
cryptography>=41.0.0
python-jose[cryptography]>=3.3.0

# Monitoring & Logging
python-json-logger>=2.0.0
sentry-sdk>=1.32.0

# Development
black>=23.0.0
flake8>=6.0.0
pytest>=7.4.0
pytest-asyncio>=0.21.0
pytest-cov>=4.1.0
```

---

## 📝 Arquivo Principal: `src/main.py`

```python
import asyncio
import logging
from typing import Optional

from dotenv import load_dotenv
from telegram.ext import Application

from src.config import settings
from src.bot.telegram_bot import BotOperacoesBinarias
from src.database.models import init_db
from src.logger import setup_logger
from src.api.routes import setup_routes

# Carregar variáveis de ambiente
load_dotenv()

# Setup logging
logger = setup_logger(__name__)

async def main():
    """Função principal que inicia o sistema"""
    
    logger.info("🚀 Iniciando EOS Bot Binárias com OFA...")
    
    # Inicializar banco de dados
    logger.info("📊 Inicializando banco de dados...")
    init_db()
    
    # Criar aplicação Telegram
    logger.info("🤖 Configurando bot Telegram...")
    telegram_app = Application.builder().token(settings.TELEGRAM_TOKEN).build()
    
    # Instanciar bot
    bot = BotOperacoesBinarias(
        telegram_app=telegram_app,
        plataforma_tipo=settings.PLATAFORMA_TIPO,
        capital_inicial=settings.CAPITAL_INICIAL
    )
    
    # Registrar handlers
    bot.register_handlers()
    
    # Setup FastAPI para API e Dashboard
    logger.info("🌐 Configurando API/Dashboard...")
    api_app = setup_routes()
    
    # Iniciar bot
    logger.info("✅ Bot iniciado com sucesso!")
    await telegram_app.start()
    
    # Manter rodando
    logger.info("📡 Sistema em operação...")
    await asyncio.sleep(86400)  # Rodar por 24h

if __name__ == "__main__":
    asyncio.run(main())
```

---

## ⚙️ Config Centralizado: `src/config.py`

```python
from pydantic_settings import BaseSettings
from enum import Enum
import os

class TipoPlataforma(str, Enum):
    QUOTEX = "quotex"
    IQ_OPTION = "iq_option"
    POCKET_OPTION = "pocket_option"

class Settings(BaseSettings):
    # Telegram
    TELEGRAM_TOKEN: str = os.getenv("TELEGRAM_TOKEN", "seu_token")
    ADMIN_ID: int = int(os.getenv("ADMIN_ID", "123456789"))
    
    # Plataforma Trading
    PLATAFORMA_TIPO: TipoPlataforma = TipoPlataforma.QUOTEX
    PLATAFORMA_EMAIL: str = os.getenv("PLATAFORMA_EMAIL", "")
    PLATAFORMA_SENHA: str = os.getenv("PLATAFORMA_SENHA", "")
    
    # Capital & Risco
    CAPITAL_INICIAL: float = float(os.getenv("CAPITAL_INICIAL", "1000.0"))
    PERCENTUAL_RISCO: float = 0.01  # 1%
    MAX_WINS_CONSECUTIVOS: int = 4
    MAX_LOSSES_CONSECUTIVAS: int = 5
    
    # OFA Thresholds
    OFA_THRESHOLD_IMBALANCE: float = 1.5
    OFA_MIN_CONFIANCA: float = 60.0
    OFA_MIN_SCORE_CALL: float = 55.0
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite:///./eos_bot.db"
    )
    
    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

settings = Settings()
```

---

## 📦 Docker: `docker/docker-compose.yml`

```yaml
version: '3.8'

services:
  # Bot Telegram + OFA
  bot:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    environment:
      - TELEGRAM_TOKEN=${TELEGRAM_TOKEN}
      - ADMIN_ID=${ADMIN_ID}
      - PLATAFORMA_TIPO=quotex
      - DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/eos_bot
    depends_on:
      - postgres
    volumes:
      - ./logs:/app/logs
    networks:
      - eos_network

  # API + Dashboard
  api:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    command: uvicorn src.api.routes:app --host 0.0.0.0 --port 8000
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/eos_bot
    depends_on:
      - postgres
    networks:
      - eos_network

  # Banco de Dados
  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=eos_bot
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - eos_network

  # Redis para cache (opcional)
  redis:
    image: redis:7-alpine
    networks:
      - eos_network

volumes:
  postgres_data:

networks:
  eos_network:
    driver: bridge
```

---

## 🚀 Como Usar

### Setup Rápido (Local)

```bash
# 1. Clone e setup
git clone https://github.com/saironbusatto/eos-bot-binarias
cd eos-bot-binarias

# 2. Criar virtual env
python -m venv venv
source venv/bin/activate  # Linux/Mac
# ou
venv\Scripts\activate  # Windows

# 3. Instalar deps
pip install -r requirements.txt

# 4. Configurar .env
cp .env.example .env
# Editar .env com seus valores

# 5. Inicializar BD
python scripts/init_db.py

# 6. Executar
python -m src.main
```

### Setup com Docker

```bash
# 1. Build e start
docker-compose -f docker/docker-compose.yml up -d

# 2. Verificar logs
docker-compose logs -f bot

# 3. Acessar Dashboard
open http://localhost:8000
```

---

## 📊 Endpoints da API

```
GET  /health              # Verificar saúde do bot
GET  /stats               # Estatísticas gerais
GET  /operations          # Lista de operações
POST /operations          # Criar nova operação
GET  /ofa-analysis        # Análise OFA atual
POST /signal              # Enviar sinal manualmente
WebSocket /ws/updates     # Updates em tempo real
```

---

## 🔗 Integração com seu projeto `eos-trade-vision`

Seu projeto atual pode ser expandido assim:

```
eos-trade-vision/
├── core/                 # Seu código atual
├── modules/
│   └── bot-binarias/     # Novo módulo de bot
│       ├── src/
│       ├── tests/
│       ├── docker/
│       └── README.md
└── docker-compose.yml    # Orquestra tudo
```

---

## ✅ Próximos Passos

1. **Estruturar repositório** conforme acima
2. **Implementar módulos OFA** (já preparamos o código)
3. **Criar testes** automatizados
4. **Setup CI/CD** (GitHub Actions)
5. **Deploy** em produção
