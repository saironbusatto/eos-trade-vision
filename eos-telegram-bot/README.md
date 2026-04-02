# EoS Crypto Bot

Backend de sinais cripto com OFA real, filtros estatísticos, ML em produção e recalibração automática.

## Stack ativa

- Node.js + TypeScript
- SQLite (`data/eos.db`)
- Telegram Bot API
- Python ML (`ml/`)

## Pipeline de decisão (alto nível)

**Entrada (sinal novo):**
1. Coleta de microestrutura e candles (Binance — Data Engine v2.1.1)
2. Pontuação OFA (LONG/SHORT)
3. Filtro horário-direcional por estatística (win rate + IC95 + expectancy)
4. Inferência ML gate + direção (`ml/infer.py`)
5. Score unificado Q (OFA + ML + Edge + Regime + Sentimento)
6. Definição de risco dinâmico (stop/target via volatilidade)
7. Envio do sinal via Telegram e persistência no SQLite

**Gestão de saída (a cada 5 min por operação aberta — Exit Decision Engine):**

1. Coleta de features de saída: RSI-14, volatilidade 5m/15m, PnL, spread bid-ask, candles a favor/contra
2. **ML** (`ml/exitDecisionModel.py` — LightGBM): conf ≥ 75% → EXIT/HOLD/MOVE_STOP imediato
3. **LLM** (GPT-4o-mini, se ML < 75% e trade ≥ 10 min): análise contextual → conf ≥ 70% → age
4. Hard stop/target como fallback final (comportamento original)
5. Counterfactual preenchido ~16 min após o fechamento (+5m/+10m/+15m PnL hipotético)

## Controle de fase de performance

Contadores de `wins/losses/win_rate` são segmentados por fase no backend:

- env: `STATS_PHASE_TAG`
- padrão atual: `fase jim compound v1`

Isso mantém histórico completo no DB, mas zera a leitura exibida para a fase nova.
O identificador de fase fica no backend (não é exposto como campo no payload público de `/api/stats`).

## Recalibração automática de modelos

**Modelo de entrada** (`MLRecalibrationService`) — semanal, com guardrails:

- mínimo de dados (`ML_RECALIBRATION_MIN_ML_RECORDS`)
- métricas mínimas (`ML_RECALIBRATION_MIN_GATE_F1`, `ML_RECALIBRATION_MIN_DIRECTION_F1`)
- limite de degradação (`ML_RECALIBRATION_MAX_F1_DROP`)
- rollback automático em falha

**Modelo de saída** (`ExitModelRecalibrationService`) — a cada 30 novas operações fechadas:

- trigger: `EXIT_MODEL_RETRAIN_MIN_NEW_OPS` (default 30) novas ops desde o último treino
- mínimo absoluto: `EXIT_MODEL_RETRAIN_MIN_TOTAL_OPS` (default 300)
- rejeita se F1 cair > `EXIT_MODEL_RETRAIN_MAX_F1_DROP` (default 2%) vs baseline
- rollback automático + notificação Telegram em sucesso e falha

## Exit Decision Engine (Fases 1–4)

| Fase | Descrição | Variável de controle |
| ---- | --------- | -------------------- |
| 1 | Coleta de features e observações (dados para treino) | `USE_ML_EXIT=false` |
| 2 | LightGBM decide EXIT/HOLD/MOVE_STOP em tempo real | `USE_ML_EXIT=true` |
| 3 | GPT-4o-mini arbitra quando ML < 75% de confiança | `EXIT_LLM_MODEL`, `EXIT_LLM_MIN_CONFIDENCE` |
| 4 | Retreino automático a cada 30 novas ops fechadas | `EXIT_MODEL_RETRAIN_ENABLED` |

Features coletadas por ciclo (14 no total): `pnl_pct`, `time_in_trade_seconds`, `distance_to_stop_pct`, `distance_to_target_pct`, `volume_ratio`, `volatility_5m`, `volatility_15m`, `volatility_ratio`, `rsi_current`, `rsi_slope`, `candles_in_favor`, `candles_against`, `original_signal_score`, `bid_ask_spread_pct`.

Treino manual: `python ml/trainExitModel.py`
Verificar modelo: `python ml/exitDecisionModel.py --action info`

## Documentação técnica

- [docs/ALGORITHM_TCC.md](./docs/ALGORITHM_TCC.md) — racional matemático completo (TCC)
- [docs/DATA_ENGINE.md](./docs/DATA_ENGINE.md) — Data Engine v2.1.1
- [ml/README.md](./ml/README.md) — pipeline ML de entrada (gate + direção)

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
