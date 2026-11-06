# Repository Audit — Changes Since 2026-05-14

> Source: Local repository `eos-trade-vision` (git log, git diff, docs/ALGORITHM_TCC.md §19, eos-telegram-bot/README.md, source files)
> Collected: 2026-11-04
> Published: 2026-07-08

## Commits after last wiki ingest (2026-05-14)

### e866a52 — 2026-07-06 — feat: filtro de recorte validado por walk-forward + corrige transparência de stats

Migração EC2->Oracle expôs histórico real de produção (18.207 sinais). Simulação
com capital real (2% risco/trade + taxa) mostrou ruína total operando sem seleção
(profit factor bruto de 1,03-1,11 não é suficiente em alto volume). Validação
walk-forward (treino fev-mar, teste mar-jul/2026) identificou recorte de
símbolo x dia x hora-direção que se sustenta fora da amostra.

- Novo ENABLE_VALIDATED_SUBSET_FILTER (trendingScanner.ts): só opera na
  interseção de VALIDATED_SUBSET_SYMBOLS x VALIDATED_SUBSET_DAYS_UTC x
  VALIDATED_SUBSET_HOUR_ACTION_CELLS
- DEFAULT_ORDER_TYPE trocado de TAKER (hardcoded) para MAKER
- getTotalClosedTrades() + bootstrap mode no filtro hora/direção (evita
  deadlock quando a base de trades fechados está zerada)
- /api/stats agora expõe phase_tag, baseline_at e campos all_time_*
- docs/ALGORITHM_TCC.md § 19 documenta a metodologia completa e os números

Files: eos-telegram-bot/{.env.example, README.md, docs/ALGORITHM_TCC.md, src/index.ts, src/sqliteDatabase.ts, src/trendingScanner.ts}

### 1fbe994 — 2026-07-08 — feat: Sauron image generation + gateway healthcheck fix

- Add generate-sauron.py script using DALL-E with quote interpretation
- Update telegram.ts with sendPhotoWithCaption support
- Update trendingScanner.ts to pass quotes to image generation
- Fix eos-gateway Dockerfile healthcheck (localhost -> 127.0.0.1)
- Add httpx to ML requirements for image generation
- Copy scripts/ directory in Dockerfile

Code facts: `src/telegram.ts` → `generateSauronImage(symbol, direction, score, quote)` runs `scripts/generate-sauron.py`, caches to `/tmp/eos-sauron/sauron-<symbol>-<ts>.jpg`; script reads `OPENAI_API_KEY`.

### 7ea2ef8 — 2026-07-08 — feat: Add RL trading module with PPO agent (last commit)

- rl/env.py: Custom Gymnasium trading environment (discrete Hold/Buy/Sell, transaction costs)
- rl/features.py: RSI, EMA, MACD, Bollinger Bands, ATR, OBV, momentum
- rl/train.py: PPO training pipeline, walk-forward validation, EvalCallback
- rl/infer.py: `RLTrader` live loop + ONNX export
- requirements.txt updated with RL dependencies

Code facts observed:
- `train.py::load_data` reads from table `signals` using `entry_price` as open/high/low/close and `volume_ratio` as volume (proxy, not real OHLCV); query built with f-string on `symbol`.
- No TypeScript file references `rl/` → module is standalone, not wired into the live bot.

## docs/ALGORITHM_TCC.md §19 — key numbers (Validated Subset Filter)

- 2026-07-06: infra migrated from EC2 (AWS sa-east-1) to an Oracle VPS. Production DB: 18.207 closed signals, 06/fev–06/jul/2026, WIN=8894 LOSS=9313, WR 48,85%.
- Raw edge per trade +0,0086%; aggregate PF 1,03–1,11. Chronological sim with RISK_PERCENT=2% and taxa taker 0,08% round-trip: capital final -99,9999997%; DD máx 99,9999999%; sem taxa DD 99,7%.
- Split 70/30 cronológico: treino 06/fev→09/mar (12.744), teste 09/mar→06/jul (5.463).
- Survivors: símbolos BTC, ZEC, ETH, XRP, DOGE, PEPE; dias UTC 3,5,6; células 12:SELL, 7:BUY, 9:SELL, 8:BUY. TRXUSDT overfit (PF 1,44 → 0,20).
- Test capital: baseline -100%; símbolos -94,1%; dias -94,1%; hora×direção -2,5% (n=912); interseção -0,2% (n=136); interseção + maker +18,4%. Treino (n=202) +58,1%.
- Limitações: n=136; regime único de 5 meses; paper trading 4–6 semanas recomendado; revisão trimestral obrigatória.

## Uncommitted working-tree changes (as of 2026-11-04)

Real content changes in 18 files (≈390 other files show only mode changes from a folder copy on 2026-07-23):

- `eos-telegram-bot/src/macroAnalyzer.ts`: Perplexity API removed; replaced by heuristic macro analyzer using public data (Binance `/api/v3/ticker/24hr`) + deterministic rules.
- `docs/ESTRATEGIA_ANALISE_ESTATISTICA.md`: "Adendo de Produção — 12/04/2026" — 17.634 signals; with_macro WR 53,23% / +0,0873 vs no_macro WR 27,56% / -0,3927 (root cause Perplexity 401 insufficient_quota); combined filter macro+good_hours+drop_bad_symbols: 4.601 trades, WR 57,27%, +0,1510. Decisions: remove paid macro, heuristic macro, BLOCKED_HOURS_UTC, BLOCKED_SYMBOLS, persist macro on every close. Also a typo introduced in heading 4.3 ("Scoredmnro").
- `docs/INFRASTRUCTURE.md`: deploy uses `--omit=dev` so `dist/` must be prebuilt; recommended `BLOCKED_HOURS_UTC=1,2,3,14,22,23`, `BLOCKED_SYMBOLS=SUIUSDT,TAOUSDT,BNBUSDT,ADAUSDT`; Perplexity removed from critical path. (Doc still describes AWS.)
- `eos-telegram-bot/.env.production.example`: Exit engine vars (USE_ML_EXIT=true, EXIT_ML_MIN_CONFIDENCE=0.75, EXIT_LLM_MIN_CONFIDENCE=0.70, EXIT_LLM_TIMEOUT_MS=8000, EXIT_LLM_MIN_TRADE_AGE_MIN=10, SIGNAL_MAX_AGE_MIN=45, TIMEOUT_LOSS_GRACE_ENABLED=true, SIGNAL_TIMEOUT_LOSS_GRACE_MIN=15); PERPLEXITY_API_KEY removed; blacklists added.
- `eos-telegram-bot/ml/README.md`: f_smart_money is categorical -1/0/1; macro features added (macro_confidence, fear_greed, macro_sentiment_encoded, sp500_trend_encoded, fed_stance_encoded, trade_recommendation_encoded).
- `agents.md`: LLM-Wiki policy — consult `wiki/` before changes; ingest after each interaction (what/why/validation evidence).
- Frontend: `src/App.tsx` route-level `React.lazy` + `Suspense`; `vite.config.ts` manualChunks (vendor-charts, vendor-radix, vendor-router, vendor-query, vendor); `package.json` adds browserslist/caniuse-lite; lint fixes per `lint-health-plan.md` (all tasks checked).
- Untracked: `wiki/`, `raw/`, `lint-health-plan.md`, `eos-telegram-bot/ml/__pycache__/`.
