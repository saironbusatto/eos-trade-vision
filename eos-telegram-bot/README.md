# EoS Crypto Bot

Backend de sinais cripto com OFA real, filtros estatísticos, ML em produção e recalibração automática.

## Stack ativa

- Node.js + TypeScript
- SQLite (`data/eos.db`)
- Telegram Bot API
- Python ML (`ml/`)
- Macro regime heurístico via dados públicos (sem dependência paga de Perplexity)

## Pipeline de decisão (alto nível)

**Entrada (sinal novo):**
1. Coleta de microestrutura e candles (Binance — Data Engine v2.1.1)
2. Pontuação OFA (LONG/SHORT)
3. Filtro horário-direcional por estatística (win rate + IC95 + expectancy)
4. Filtro hard de blacklist:
   - hora UTC bloqueada (`BLOCKED_HOURS_UTC`)
   - símbolo bloqueado (`BLOCKED_SYMBOLS`)
5. Inferência ML gate + direção (`ml/infer.py`)
6. Score unificado Q (OFA + ML + Edge + Regime + Sentimento)
7. Definição de risco dinâmico (stop/target via volatilidade)
8. Envio do sinal via Telegram e persistência no SQLite

**Gestão de saída (a cada 5 min por operação aberta — Exit Decision Engine):**
1. Coleta de features de saída (RSI-14, volatilidade 5m/15m, PnL, spread, candles a favor/contra)
2. ML de saída (`ml/exitDecisionModel.py`): EXIT/HOLD/MOVE_STOP
3. Hard stop/target como fallback final
4. Counterfactual preenchido ~16 min após o fechamento (+5m/+10m/+15m PnL hipotético)
5. Macro sempre persistido no fechamento (`WIN/LOSS`) para evitar `no_macro` em `ml_training`

## Novos recursos (abril/2026)

### 1) Macro heurístico (Perplexity removido)

**Por que:** em produção, o provedor externo passou a retornar `401` por cota (`insufficient_quota`), gerando `trade_recommendation = NULL` e degradando o modelo.

**Como funciona agora:**
- consulta pública Binance de `BTCUSDT` e `ETHUSDT` (variação 24h)
- calcula sentimento por limiar:
  - `BULLISH` se `change >= +1.25%`
  - `BEARISH` se `change <= -1.25%`
  - `NEUTRAL` caso contrário
- confiança:
  - `confidence = clamp(0.45 + |avg_change| / 8, 0.45, 0.82)`
- fear/greed sintético:
  - `fear_greed = clamp(50 + avg_change * 7, 5, 95)`
- recommendation:
  - `AVOID` em bear forte
  - `AGGRESSIVE` em bull forte + risk-on
  - `NORMAL` em bull moderado
  - `CONSERVATIVE` no restante

**Quando atualiza:** nas janelas UTC definidas em `SP500_FETCH_HOURS` (`13,16,18,20`) e cache por hora.

### 2) Hard Blacklist (hora + símbolo)

**Por que:** análise histórica mostrou zonas estruturalmente fracas.

Defaults atuais:
- `BLOCKED_HOURS_UTC=1,2,3,14,22,23`
- `BLOCKED_SYMBOLS=SUIUSDT,TAOUSDT,BNBUSDT,ADAUSDT`

**Regra operacional:**
- se hora atual estiver bloqueada: não gera novos sinais
- se símbolo estiver bloqueado: ignora o ativo antes de rodar OFA/ML

### 3) Integridade do dataset de treino

Antes, parte dos fechamentos por stop/target podia entrar com macro nulo.
Agora, todo caminho de fechamento usa macro unificado e grava:
- `macro_confidence`
- `macro_sentiment`
- `fear_greed`
- `trade_recommendation`
- `sp500_trend`
- `fed_stance`

## Controle de fase de performance

Contadores de `wins/losses/win_rate` são segmentados por fase no backend:

- env: `STATS_PHASE_TAG`
- padrão atual: `fase jim compound v1`

Isso mantém histórico completo no DB, mas zera a leitura exibida para a fase nova.
Desde 06/07/2026, `/api/stats` expõe `phase_tag`, `baseline_at` e os campos `all_time_*`
(contagens sem filtro de fase) — o reset de fase não fica mais invisível para quem consulta a API.

## Novos recursos (julho/2026)

### Validated Subset Filter

**Por que:** migração de infra (EC2 → Oracle) expôs pela primeira vez o histórico completo de
produção (18.207 sinais). Simulação com capital real (2% de risco/trade + taxa Binance) mostrou
**ruína total** operando sem seleção — profit factor bruto agregado de 1,03–1,11 não é suficiente
quando o volume de trades é alto, porque a taxa cobrada em todo trade consome o edge marginal.

Validação walk-forward (treino 06/fev–09/mar, teste 09/mar–06/jul/2026) identificou um recorte de
símbolo × dia da semana × célula hora×direção que se sustenta fora da amostra e escapa da ruína
apenas quando os três critérios são satisfeitos simultaneamente. Metodologia e números completos:
[docs/ALGORITHM_TCC.md § 19](./docs/ALGORITHM_TCC.md#19-validated-subset-filter--validação-walk-forward-com-dado-real-jul2026).

Defaults atuais:
- `VALIDATED_SUBSET_SYMBOLS=BTCUSDT,ZECUSDT,ETHUSDT,XRPUSDT,DOGEUSDT,PEPEUSDT`
- `VALIDATED_SUBSET_DAYS_UTC=3,5,6` (quarta, sexta, sábado)
- `VALIDATED_SUBSET_HOUR_ACTION_CELLS=12:SELL,7:BUY,9:SELL,8:BUY`
- `DEFAULT_ORDER_TYPE=MAKER` (era `TAKER` hardcoded — taxa maker é o que tira o filtro validado
  do empate e leva a resultado positivo fora da amostra)

**Revisão trimestral obrigatória** — ver limitações em ALGORITHM_TCC.md § 19.6.

## Recalibração automática de modelos

**Modelo de entrada** (`MLRecalibrationService`) — semanal, com guardrails:
- mínimo de dados (`ML_RECALIBRATION_MIN_ML_RECORDS`)
- métricas mínimas (`ML_RECALIBRATION_MIN_GATE_F1`, `ML_RECALIBRATION_MIN_DIRECTION_F1`)
- limite de degradação (`ML_RECALIBRATION_MAX_F1_DROP`)
- rollback automático em falha

**Modelo de saída** (`ExitModelRecalibrationService`) — por incremento de operações fechadas:
- trigger: `EXIT_MODEL_RETRAIN_MIN_NEW_OPS` (default 30)
- mínimo absoluto: `EXIT_MODEL_RETRAIN_MIN_TOTAL_OPS` (default 300)
- rejeita se F1 cair > `EXIT_MODEL_RETRAIN_MAX_F1_DROP` (default 2%) vs baseline
- rollback automático + notificação Telegram em sucesso/falha

## Variáveis de ambiente novas/relevantes

- `BLOCKED_HOURS_UTC`
- `BLOCKED_SYMBOLS`
- `ENABLE_HOUR_DIRECTION_FILTER`
- `HOUR_DIRECTION_MIN_TRADES`
- `HOUR_DIRECTION_MIN_WINRATE`
- `HOUR_DIRECTION_MIN_WINRATE_CI95_LOW`
- `ENABLE_EXPECTANCY_GATE`
- `HOUR_DIRECTION_MIN_EXPECTANCY_CI95_LOW`
- `ENABLE_VALIDATED_SUBSET_FILTER`
- `VALIDATED_SUBSET_SYMBOLS`
- `VALIDATED_SUBSET_DAYS_UTC`
- `VALIDATED_SUBSET_HOUR_ACTION_CELLS`
- `DEFAULT_ORDER_TYPE`

## Documentação técnica

- [docs/ALGORITHM_TCC.md](./docs/ALGORITHM_TCC.md) — racional matemático completo (inclui macro heurístico e filtros hard)
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
