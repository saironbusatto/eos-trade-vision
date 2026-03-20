# 🔗 Guia de Integração: Bot Binárias + eos-trade-vision

## Cenário Atual
Você tem um projeto existente `eos-trade-vision` (em `github.com/saironbusatto/eos-trade-vision` e `eos.s-iron.tech`).

Vamos integrar o **novo bot de operações binárias com OFA** de forma modular e escalável.

---

## 1️⃣ Opção A: Módulo Dentro do Projeto Existente (Recomendado)

### Estrutura Resultante

```
eos-trade-vision/
├── src/
│   ├── core/                    # Seu código original
│   │   ├── models/
│   │   ├── services/
│   │   └── utils/
│   │
│   └── modules/
│       ├── trading/             # Seu módulo atual de trading
│       │
│       └── bot_binarias/        # 🆕 NOVO MÓDULO
│           ├── __init__.py
│           ├── bot.py           # Bot Telegram
│           ├── ofa/
│           │   ├── analyzer.py
│           │   └── models.py
│           ├── trading/
│           │   ├── platform.py
│           │   └── manager.py
│           └── risk/
│               └── calculator.py
│
├── docker/
│   └── docker-compose.yml
│
└── README.md
```

### Passo 1: Criar Estrutura de Diretórios

```bash
cd eos-trade-vision

# Criar módulo
mkdir -p src/modules/bot_binarias/{ofa,trading,risk}
touch src/modules/bot_binarias/__init__.py

# Criar subdirs
touch src/modules/bot_binarias/bot.py
touch src/modules/bot_binarias/ofa/{__init__.py,analyzer.py,models.py}
touch src/modules/bot_binarias/trading/{__init__.py,platform.py,manager.py}
touch src/modules/bot_binarias/risk/{__init__.py,calculator.py}
```

### Passo 2: Arquivos Iniciais

**`src/modules/bot_binarias/__init__.py`**
```python
"""Módulo Bot de Operações Binárias com OFA"""

from .bot import BotOperacoesBinarias
from .ofa.analyzer import AnalisadorOFA
from .trading.manager import GerenciadorOperacoes

__all__ = [
    "BotOperacoesBinarias",
    "AnalisadorOFA",
    "GerenciadorOperacoes",
]
```

**`src/modules/bot_binarias/bot.py`** (Simplificado)
```python
"""Bot Telegram para Operações Binárias"""

import logging
from telegram.ext import Application, CommandHandler, MessageHandler, filters
from .ofa.analyzer import AnalisadorOFA
from .trading.manager import GerenciadorOperacoes

logger = logging.getLogger(__name__)

class BotOperacoesBinarias:
    def __init__(self, telegram_token: str, admin_id: int, capital_inicial: float = 1000.0):
        self.telegram_token = telegram_token
        self.admin_id = admin_id
        self.app = None
        
        # Componentes
        self.ofa = AnalisadorOFA()
        self.gerenciador = GerenciadorOperacoes(capital_inicial)
        
    def register_handlers(self):
        """Registra handlers do Telegram"""
        self.app.add_handler(CommandHandler("start", self.cmd_start))
        self.app.add_handler(MessageHandler(filters.TEXT, self.handle_signal))
        
    async def cmd_start(self, update, context):
        await update.message.reply_text(
            "🤖 Bot OFA Binarias iniciado!\n"
            "Envie sinais no formato: GBP/CAD VENDA 09:20"
        )
    
    async def handle_signal(self, update, context):
        """Processa sinal recebido"""
        if update.message.from_user.id != self.admin_id:
            return
        
        try:
            # Parse sinal
            partes = update.message.text.split()
            par, tipo, horario = partes[0], partes[1], partes[2]
            
            # Analisar com OFA
            score = self.ofa.calcular_score_ofa(par)
            
            # Validar
            pode_operar, motivo = self.gerenciador.validar_operacao(
                par, tipo, 100.0, score
            )
            
            if pode_operar:
                await update.message.reply_text(f"✅ {motivo}")
            else:
                await update.message.reply_text(f"⛔ {motivo}")
                
        except Exception as e:
            logger.error(f"Erro: {e}")
            await update.message.reply_text(f"❌ Erro: {str(e)}")
    
    async def start(self):
        """Inicia o bot"""
        self.app = Application.builder().token(self.telegram_token).build()
        self.register_handlers()
        await self.app.start()
        logger.info("Bot iniciado com sucesso!")
```

### Passo 3: Integrar ao Main

**`src/main.py`** (Adaptar seu main atual)

```python
from src.modules.bot_binarias import BotOperacoesBinarias
import asyncio
import os

async def main():
    # Seu setup atual...
    
    # 🆕 Inicializar Bot Binárias
    bot = BotOperacoesBinarias(
        telegram_token=os.getenv("TELEGRAM_TOKEN"),
        admin_id=int(os.getenv("ADMIN_ID")),
        capital_inicial=1000.0
    )
    
    await bot.start()
    
    # Manter rodando
    await asyncio.sleep(86400)

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 2️⃣ Opção B: Repositório Separado (Mais Modular)

Se preferir manter **totalmente separado**:

```bash
# Criar novo repo
git clone https://github.com/saironbusatto/eos-bot-binarias
cd eos-bot-binarias

# Estrutura simples
mkdir -p src/{bot,ofa,trading,risk,database,api}
```

Depois, seu `docker-compose.yml` principal pode orquestrar ambos:

```yaml
version: '3.8'

services:
  # Seu projeto original
  eos-trade-vision:
    build:
      context: ./eos-trade-vision
    ports:
      - "8001:8001"
    networks:
      - eos_network

  # Novo bot binárias
  eos-bot-binarias:
    build:
      context: ./eos-bot-binarias
    environment:
      - TELEGRAM_TOKEN=${TELEGRAM_TOKEN}
    networks:
      - eos_network
    depends_on:
      - postgres

  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    networks:
      - eos_network

networks:
  eos_network:
```

---

## 3️⃣ Configuração Unificada

**`.env.example`** (Compartilhado)

```env
# Telegram
TELEGRAM_TOKEN=seu_token_aqui
ADMIN_ID=seu_id

# Plataforma
PLATAFORMA_TIPO=quotex
PLATAFORMA_EMAIL=seu_email@exemplo.com
PLATAFORMA_SENHA=sua_senha

# Capital
CAPITAL_INICIAL=1000.0

# Database
DATABASE_URL=postgresql://user:password@postgres:5432/eos_bot

# OFA
OFA_MIN_CONFIANCA=60.0
OFA_THRESHOLD_IMBALANCE=1.5

# Debug
DEBUG=false
```

---

## 4️⃣ Adicionar ao seu `requirements.txt`

```txt
# Existentes do seu projeto...

# Bot Binárias - OFA
python-telegram-bot>=20.0
aiohttp>=3.9.0
numpy>=1.24.0
pandas>=2.0.0

# Trading
sqlalchemy>=2.0.0
psycopg2-binary>=2.9.0

# API (para dashboard)
fastapi>=0.104.0
uvicorn>=0.24.0
```

---

## 5️⃣ Fluxo de Dados

```
Telegram (Sinal)
    ↓
BotOperacoesBinarias.handle_signal()
    ├─ Parse: "GBP/CAD VENDA 09:20"
    ├─ Coleta dados: AnalisadorOFA
    └─ Valida: GerenciadorOperacoes
        ├─ Score OFA > threshold?
        ├─ Stop Win/Loss OK?
        ├─ Capital disponível?
        └─ SIM → Executa via Platform
           NÃO → Rejeita com motivo
    ↓
Platform (Quotex/IQ/Pocket)
    ├─ Executa operação
    └─ Retorna resultado
    ↓
Database
    ├─ Registra em operacoes
    ├─ Atualiza stats
    └─ Calcula próximo martingale
    ↓
Dashboard (WebSocket)
    └─ Update em tempo real
```

---

## 6️⃣ Testes de Integração

**`tests/test_integration.py`**

```python
import pytest
from src.modules.bot_binarias import BotOperacoesBinarias, AnalisadorOFA

@pytest.fixture
def bot():
    return BotOperacoesBinarias(
        telegram_token="test_token",
        admin_id=123,
        capital_inicial=1000
    )

def test_analisa_sinal(bot):
    """Testa análise de sinal"""
    score = bot.ofa.calcular_score_ofa("GBP/CAD")
    assert 0 <= score <= 100

def test_valida_operacao(bot):
    """Testa validação de operação"""
    pode, motivo = bot.gerenciador.validar_operacao(
        "GBP/CAD", "PUT", 100, 75
    )
    assert isinstance(pode, bool)

def test_calcula_martingale(bot):
    """Testa cálculo de Martingale"""
    valor = bot.gerenciador.calcular_proximo_valor_aposta()
    assert valor > 0
```

---

## 7️⃣ Deploy em Produção

### Com Docker

```bash
# Build tudo
docker-compose build

# Start serviços
docker-compose up -d

# Verificar
docker-compose logs -f
```

### Em VPS/Linux

```bash
# Setup
git clone seu_repo
cd seu_repo
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Usando systemd
sudo nano /etc/systemd/system/eos-bot.service
```

**`/etc/systemd/system/eos-bot.service`**

```ini
[Unit]
Description=EOS Bot Operações Binárias
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/eos-bot-binarias
ExecStart=/home/ubuntu/eos-bot-binarias/venv/bin/python -m src.main
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl start eos-bot
sudo systemctl enable eos-bot
```

---

## 8️⃣ Monitoramento

Adicionar healthcheck:

```python
# src/health.py
async def healthcheck():
    return {
        "status": "ok",
        "bot_running": bot.is_running,
        "operations_count": gerenciador.total_operacoes,
        "capital": gerenciador.capital_atual,
        "last_signal": gerenciador.ultimo_sinal
    }
```

---

## ✅ Checklist de Implementação

- [ ] Estrutura de diretórios criada
- [ ] Módulo OFA implementado
- [ ] Bot Telegram funcionando
- [ ] Trading manager pronto
- [ ] Database configurada
- [ ] API rodando
- [ ] Dashboard acessível
- [ ] Docker funcionando
- [ ] Testes passando
- [ ] Deploy realizado

---

## 📞 Próximas Ações

1. **Hoje:** Criar estrutura de diretórios
2. **Amanhã:** Implementar módulo OFA
3. **Próxima semana:** Bot + Trading funcionando
4. **Duas semanas:** Deploy em produção

**Quer que eu crie o código específico de qualquer um desses arquivos?**
