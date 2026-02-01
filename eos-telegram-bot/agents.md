# EOS Crypto Bot Agent

> [!TIP]
> **Hub Central:** Consulte [`../agents.md`](../agents.md) para visão sistêmica e contratos globais.

## 🆔 Identidade
- **Sou:** Bot principal de sinais de cripto (Binance). Gero sinais, faço inferência (ML score) e comunico via Telegram.
- **Não sou:** Não executo ordens de compra/venda automaticamente; não opero Forex/IQ Option/B3 (isso é legado do `eos-iq-bot`).

## 🔌 Interfaces
- **Telegram Command Handler:** [`src/telegram.ts`](./src/telegram.ts)
  - Comandos: `/start`, `/report`, `/ml_status`, `/force_update`.
- **Inference Runtime:** [`src/mlService.ts`](./src/mlService.ts) → chama runtime Python interno.
- **Scheduler/Loops:** definidos em `index.ts` (scan de preço/candles).

## 📊 Data Engine v2.1.1

> [!IMPORTANT]
> **Refatorado em Fev/2026:** O sistema de dados foi completamente refeito para usar WebSocket + buffer local em vez de REST com limite de 1000 trades.

### Componentes Core (`src/engine/`)

| Componente | Responsabilidade |
|------------|------------------|
| `StreamManager` | Conexão WebSocket persistente com Binance (heartbeat, backoff, watchdog) |
| `GapFiller` | Preenchimento de gaps via REST paginado com rate limiting |
| `MarketDataBuffer` | Buffer rolling 60min com dedup, ordering e gap detection |
| `DataEngine` | Orquestrador com state machine (COLD→WARMING→LIVE_OK→DEGRADED→OFFLINE) |
| `DataService` | Adapter singleton que expõe dados do buffer para módulos OFA |

### Fluxo de Dados
```
Binance WS → StreamManager → DataEngine → MarketDataBuffer
                                   ↓
                              DataService → SmartMoneyFilter / Footprint
```

### Estados de Saúde
- **COLD:** Símbolo registrado mas não inicializado
- **WARMING:** WarmUp em progresso (buscando histórico + enfileirando WS)
- **LIVE_OK:** Buffer completo, streaming ativo, pronto para análise
- **DEGRADED:** Gap detectado ou cobertura insuficiente
- **OFFLINE:** WebSocket desconectado

## 💾 Dados
- **SQLite:** `data/eos.db`
- **Acesso/Schema:** [`src/sqliteDatabase.ts`](./src/sqliteDatabase.ts)
  - Tabelas críticas (fonte da verdade = models/migrations/queries no código): `signals`, `training_data`, `price_checkpoints`.
- **Buffer em Memória:** 60 minutos de aggTrades por símbolo (gerenciado pelo DataEngine)

## 📡 Sinais (Contrato)
- **Canal:** Telegram (CHAT_ID via `.env`).
- **Payload mínimo do sinal:** par/ativo, direção, entrada, timestamp, ML score, contexto OFA/resumo.
- **Fonte de dados OFA:** Buffer do DataEngine (não mais REST direto)

## 🔗 Endpoints HTTP
- `GET /health` - Status do sistema incluindo DataEngine
- `POST /api/signal` - Envia sinal para Telegram
- `POST /api/alert` - Envia alerta para Telegram

## 🤝 Dependências (Vizinhos)
- **OFA Engine:** [`../eos-ofa-engine/src/agents.md`](../eos-ofa-engine/src/agents.md)
- **Gateway:** [`../eos-gateway/agents.md`](../eos-gateway/agents.md)
- **ML Service:** [`../eos-ml/src/agents.md`](../eos-ml/src/agents.md)

## ☑️ Checklist / Compatibilidade
- [ ] Se alterar o contrato de resultado de ML (ex.: `MLResult`), atualizar também o consumidor correspondente no `eos-ml` (ex.: `infer.py`) e ajustar documentação do contrato.
- [ ] Manter `eos.db` compatível com o Gateway (volume compartilhado), com migração/rotina de compatibilidade quando necessário.
- [ ] Se adicionar novos símbolos ao DataEngine, verificar limite de 20 conexões simultâneas.
- [ ] DataService é singleton - não instanciar múltiplas vezes.
