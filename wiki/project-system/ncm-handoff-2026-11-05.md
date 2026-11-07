---
title: NCM Handoff 2026-11-05
aliases:
  - NCM Handoff 2026-11-05
  - NCM Handoff
tags:
  - ncm
  - handoff
status: active
updated: 2026-11-07
---

# NCM Handoff 2026-11-05

Where the NCM rebase stopped on the night of 04→05/11/2026. The plan is `ncm-live-trading.md` (repo root); the theory is in [[NCM Next-Concept Modeling]].

## Status per task

| # | Task | Status |
|---|------|--------|
| 1 | Raw Binance data (futures klines 1m, aggTrades, funding; spot klines) | done, checksums ok, 28/10 missing at the source |
| 2 | No-future replay (`ncm/replay.py`) | done 05/11: 9 months, 0 NaN |
| 3 | Honest simulator (`ncm/rotulos.py`) | done, self-test ok |
| 4 | Fix bot windows (`trendingScanner.ts`) | not started; touches the live bot, wait for the user's ok |
| 5 | Split (`ncm/split.py`) | done |
| 6 | Theory retests (`ncm/teorias.py`) | done: all lose after fees, see [[Theory Retest BTC]] |
| 7 | NCM training by net PnL (`ncm/treino.py`) | in progress: run 1 collapsed to "never trade"; signal check done, see below |
| 8–9 | Out-of-sample proof, paper live | not started |

## Task 7 state (06/11/2026)

- Task 7 was rewritten at the user's request: train **by money**, not by imitating the hindsight plan. The bot executes the plan's first run (enter, hold while the plan keeps the side, exit at the first change). Reward = log of capital after that trade (`rotulos.primeira_operacao` + `recompensa_lote`). Stages: VQ-VAE tokenizer, short imitation warm-up, GRPO. Checkpoint and threshold picked by June simulated like live.
- Run 1 (`~/.local/share/eos-ncm/modelo/`, log `logs/treino-btc.log`, ~1h45 on the RTX 5060):
  - tokenizer reached 100% reconstruction;
  - GRPO stopped trading by step 200 of 8000. When all K samples are flat, the advantage is 0 and there is no gradient. Method failure, not evidence.
  - The saved `gerador.pt` is the step-0 warm-up model; it is worthless.
- Photo prefix compressed to 16 tokens (one token per feature was ~10x slower).
- `ncm/sinal.py` asked whether there is money in the photos at all. See [[Signal Check BTC]].
  - The MLP overfits.
  - Ridge shows a weak long-only contrarian edge in June: 15 trades at the 0.10% threshold, PF 6.5. Not proven.
- Versions seen in June so far: 180. These count toward the task 8 deflated Sharpe. The controlled experiments below use train data only and add none.

## Controlled experiments (07/11/2026)

Each experiment has its own report in the `eos-validation` format and changes one variable at a time.

| Exp | Change | Result |
|---|---|---|
| [[NCM Exp 00 GRPO Run 1]] | first GRPO run | collapsed to never trade by step 200: INVALID TEST for edge |
| [[NCM Exp 01 GRPO Review]] | read-only audit | implementation correct; sampled entries have no gross edge; the decision lives in the fine tokens |
| [[NCM Exp 02 KL Diagnostic]] | + KL brake (β 0.1) | no collapse (2.8% entry), but the result per entry is flat at −0.11% |
| [[NCM Exp 03 Executed Trade Plan]] | plan = only the executed trade | the decision moved to the coarse tokens, but the result per entry is still flat at −0.11%; KL ran away (~85) |
| [[NCM Exp 04 Exact Expected Reward]] | exact Σπ·R over the 91 plans instead of sampling | π(flat) → 1 by step 200 and the gradient vanishes (softmax saturation); 23% of the mass on non-canonical codes is a design flaw |

| [[NCM Exp 05 Value Model]] | NCM-sized transformer as a value model vs ridge, fit fev–abr, check mai | neither beats a constant prediction in May; both lose at every threshold; the ridge June edge does not repeat |

- Conclusion so far:
  - Three policy-style objectives (Exp 02–04) learn the global prior "trading loses" and stop.
  - The value formulation (Exp 05) shows why: with these 205 features and taker costs, there is no out-of-sample signal in the next 5–45 min of BTC for either model.
  - The bottleneck is the input and costs, not the model.
- [[Candidate Ridge BTC]] frozen on 07/11: `ncm/candidatos/ridge-btc.npz`, SHA-256 `5b5e7cb1…94c1bf36`. It reproduces June from the raw photos (15 trades, PF 6.48). After Exp 05 it is downgraded to INCONCLUSIVE leaning REJECTED; it is still frozen and unchanged.
- Next, waiting for the user's choice (Exp 05 item 13): (a) maker costs, (b) longer horizons, (c) new information in the photo, (d) stop BTC-minutes and decide what goes to the frozen test.

## How to run

```bash
PY=~/.local/share/wow-voz/venv/bin/python   # Python 3.11, numpy, pandas, torch+CUDA (no pytest)
cd eos-trade-vision
$PY -I ncm/teste_replay.py   # OFA parity vs the bot's JS, no-future test, corrected OFA
$PY -I ncm/rotulos.py        # simulator: stop×target in the same candle, maker, gap, funding, Viterbi
```

Raw data in `~/.local/share/eos-ncm/raw/` (~4.8 GB, outside the repo).

## Modules (`ncm/`)

- `dados_binance.py`: monthly download from data.binance.vision with SHA-256 and gap check.
- `agregados.py`: aggTrades → per-minute tables (OHLC, flow by size class, tick-level footprint). Spot timestamps are in µs, futures in ms.
- `ofa_legado.py`: faithful port of the bot's OFA, **with the defects**: open 15m candle, reversed diagonal, stacks across candles, 1-tick levels.
- `ofa_corrigido.py`: same ideas without the defects; continuous values.
- `replay.py`: the "photo" of minute m = only data with `ts < (m+1)*60s`; legacy + corrected + raw features. `FRACAO_PASSO` is a knob for the level size.
- `rotulos.py`:
  - `ordem`: stop/target/time limit for the task 6 rules.
  - `posicoes`: one position per minute, the NCM's 45 tokens.
  - `melhor_plano`: best plan in hindsight, the task 7 target.
  - VIP0 fees, slippage 0.01% also covers latency (`ponytail` knob).

## Decisions already made by the user

- Old theories enter as **information** (features), not as filters.
- Keep **both** OFA versions (legacy and corrected) as inputs.
- Keep **both** decoding modes (MBR consensus and deterministic + threshold). Neither is eliminated before the frozen test.
- BTC first, then ETH. No Perplexity macro, Fear & Greed or news.
- Runs on the user's PC; there's no money for hosting. Oracle has been given up (the `farmei-prod` disk is kept).

- `split.py`: train fev–mai, validation jun, frozen test 07/jul–out in thirds; `abre_teste` opens once per symbol.
- `teorias.py`: task 6 rule retest.
- `treino.py`: NCM training by net PnL (`--rapido` = quick pass to measure time).
- `sinal.py`: ridge/MLP signal check.

## Next step

1. The user chooses a direction from [[NCM Exp 05 Value Model]] item 13 (maker costs, longer horizons, new information, or stop).
2. Task 8 only after the candidates are frozen; `split.abre_teste` opens the test once.
3. Task 4 only with the user's ok.

## Loose ends

- `~/Jogos-tmp` (contains `pendrive_backup` 1.6 GB and `opencode` 3.8 GB) waiting for the user's confirmation before deletion.
- `uv cache prune` failed because of another uv's lock; try again.
- `eos-telegram-bot/data/eos.db-shm/-wal` and `tmp/eos.prod.db*` stay out of git (local databases).
