# EoS Crypto Bot

Backend de sinais cripto com OFA real, filtros estatísticos, ML em produção e recalibração automática.

## Stack ativa

- Node.js + TypeScript
- SQLite (`data/eos.db`)
- Telegram Bot API
- Python ML (`ml/`)

## Pipeline de decisão (alto nível)

1. Coleta de microestrutura e candles (Binance)
2. Pontuação OFA (LONG/SHORT)
3. Filtro horário-direcional por estatística (win rate + IC95 + expectancy)
4. Inferência ML (gate + direção)
5. Score unificado (OFA + ML + Edge + Regime + Sentimento)
6. Definição de risco dinâmico (stop/target)
7. Envio do sinal e validação posterior (WIN/LOSS/timeout)

## Controle de fase de performance

Contadores de `wins/losses/win_rate` são segmentados por fase no backend:

- env: `STATS_PHASE_TAG`
- padrão atual: `fase jim compound v1`

Isso mantém histórico completo no DB, mas zera a leitura exibida para a fase nova.
O identificador de fase fica no backend (não é exposto como campo no payload público de `/api/stats`).

## Recalibração automática de modelos

Serviço `MLRecalibrationService` roda em janela configurável e aplica guardrails:

- mínimo de dados (`ML_RECALIBRATION_MIN_ML_RECORDS`)
- métricas mínimas (`ML_RECALIBRATION_MIN_GATE_F1`, `ML_RECALIBRATION_MIN_DIRECTION_F1`)
- limite de degradação (`ML_RECALIBRATION_MAX_F1_DROP`)
- rollback automático em falha

## Documentação técnica (TCC)

Para o racional matemático completo, fórmulas e thresholds:

- [docs/ALGORITHM_TCC.md](./docs/ALGORITHM_TCC.md)
- [docs/DATA_ENGINE.md](./docs/DATA_ENGINE.md)

## Execução local

```bash
npm install
npm run build
npm run dev
```

## Endpoints principais

- `GET /health`
- `GET /api/stats`
- `POST /api/stats/reset`
- `POST /api/signal`
- `POST /api/alert`
