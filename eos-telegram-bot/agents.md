# EOS Crypto Bot Agent

> [!TIP]
> **Hub Central:** Consulte [`../agents.md`](../agents.md) para visão sistêmica e contratos globais.

## Identidade

- **Sou:** Bot principal de sinais de cripto (Binance). Gero sinais, faço inferência (ML score) e comunico via Telegram.
- **Não sou:** Não executo ordens de compra/venda automaticamente; não opero Forex/IQ Option/B3 (legado do `eos-iq-bot`).

## Interfaces

- **Telegram Command Handler:** [`src/telegram.ts`](./src/telegram.ts) — comandos `/start`, `/report`, `/ml_status`, `/force_update`
- **Inference Runtime:** [`src/mlService.ts`](./src/mlService.ts) → runtime Python interno
- **Exit Decision Engine:** [`src/exitDecisionEngine.ts`](./src/exitDecisionEngine.ts) → gestão de saída ML + LLM
- **Scheduler/Loops:** definidos em `index.ts` (scan de preço/candles + validation loop 5 min)

## Data Engine v2.1.1

> [!IMPORTANT]
> **Refatorado em Fev/2026:** WebSocket + buffer local em vez de REST com limite de 1000 trades.

### Componentes Core (`src/engine/`)

| Componente | Responsabilidade |
| ---------- | ---------------- |
| `StreamManager` | Conexão WebSocket persistente com Binance (heartbeat, backoff, watchdog) |
| `GapFiller` | Preenchimento de gaps via REST paginado com rate limiting |
| `MarketDataBuffer` | Buffer rolling 60min com dedup, ordering e gap detection |
| `DataEngine` | Orquestrador com state machine (COLD→WARMING→LIVE_OK→DEGRADED→OFFLINE) |
| `DataService` | Adapter singleton que expõe dados do buffer para módulos OFA |

### Fluxo de Dados

```text
Binance WS → StreamManager → DataEngine → MarketDataBuffer
                                   ↓
                              DataService → SmartMoneyFilter / Footprint
```

### Estados de Saúde

- **COLD:** Símbolo registrado mas não inicializado
- **WARMING:** WarmUp em progresso (buscando histórico + enfileirando WS)
- **LIVE_OK:** Buffer completo, streaming ativo, pronto para análise
- **DEGRADED:** Gap detectado ou cobertura insuficiente
- **OFFLINE:** WebSocket desconectado — recupera automaticamente ao reconectar

## Exit Decision Engine (Fases 1–4)

Gerencia a decisão de saída de cada operação aberta a cada 5 minutos.

| Fase | Mecanismo | Confiança mínima |
| ---- | --------- | ---------------- |
| 1 | Coleta de features + log (dados para treino) | — |
| 2 | LightGBM (`ml/exitDecisionModel.py`) | 75% (`EXIT_ML_MIN_CONFIDENCE`) |
| 3 | GPT-4o-mini (se ML < 75% e trade ≥ 10 min) | 70% (`EXIT_LLM_MIN_CONFIDENCE`) |
| 4 | Auto-retreino (`ExitModelRecalibrationService`) a cada 30 novas ops | — |

**Features coletadas (14):** `pnl_pct`, `time_in_trade_seconds`, `distance_to_stop_pct`, `distance_to_target_pct`, `volume_ratio`, `volatility_5m`, `volatility_15m`, `volatility_ratio`, `rsi_current`, `rsi_slope`, `candles_in_favor`, `candles_against`, `original_signal_score`, `bid_ask_spread_pct`.

Tabela de log: `exit_decisions_log` — uma linha por ciclo de 5 min por operação aberta.

Counterfactual: PnL hipotético +5m/+10m/+15m preenchido 16 min após o fechamento.

## Dados

- **SQLite:** `data/eos.db`
- **Acesso/Schema:** [`src/sqliteDatabase.ts`](./src/sqliteDatabase.ts)
  - Tabelas: `signals`, `training_data`, `price_checkpoints`, `exit_decisions_log`, `app_settings`
- **Buffer em Memória:** 60 minutos de aggTrades por símbolo (gerenciado pelo DataEngine)

## Sinais (Contrato)

- **Canal:** Telegram (CHAT_ID via `.env`)
- **Payload mínimo:** par/ativo, direção, entrada, timestamp, ML score, contexto OFA
- **Fonte de dados OFA:** Buffer do DataEngine (não mais REST direto)

## Endpoints HTTP

- `GET /health` — Status do sistema incluindo DataEngine
- `GET /api/stats` — Win rate, expectancy, contagens por fase
- `POST /api/signal` — Envia sinal para Telegram
- `POST /api/alert` — Envia alerta para Telegram

## Dependências (Vizinhos)

- **Gateway:** [`../eos-gateway/agents.md`](../eos-gateway/agents.md)
- **ML Service:** [`../eos-ml/src/agents.md`](../eos-ml/src/agents.md)

## Checklist / Compatibilidade

- [ ] Se alterar o contrato de resultado de ML (`MLResult`), atualizar `eos-ml/infer.py` e documentação.
- [ ] Manter `eos.db` compatível com o Gateway (volume compartilhado).
- [ ] Se adicionar novos símbolos ao DataEngine, verificar limite de 20 conexões simultâneas.
- [ ] `DataService` é singleton — não instanciar múltiplas vezes.
- [ ] Se adicionar features ao Exit Model, retreinar e atualizar `EXIT_FEATURE_COLS` em `exitDecisionModel.py`.
