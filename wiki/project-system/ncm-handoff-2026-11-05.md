---
title: NCM Handoff 2026-11-05
aliases:
  - NCM Handoff 2026-11-05
  - NCM Handoff
tags:
  - ncm
  - handoff
status: active
updated: 2026-11-05
---

# NCM Handoff 2026-11-05

Where the NCM rebase stopped on the night of 04→05/11/2026. The plan is `ncm-live-trading.md` (repo root); the theory is in [[NCM Next-Concept Modeling]].

## Status per task

| # | Task | Status |
|---|------|--------|
| 1 | Raw Binance data (futures klines 1m, aggTrades, funding; spot klines) | done, checksums ok, 28/10 missing at the source |
| 2 | No-future replay (`ncm/replay.py`) | code + 3 tests ok; **full run was in progress** |
| 3 | Honest simulator (`ncm/rotulos.py`) | done, self-test ok |
| 4 | Fix bot windows (`trendingScanner.ts`) | not started; touches the live bot, wait for the user's ok |
| 5–9 | Split, theory retests, NCM training, out-of-sample proof, paper live | not started |

## Running when the session ended

`ncm/replay.py --de 2026-02 --ate 2026-10` (BTCUSDT), about 4 h, sequential (only ~3 GB of free RAM; one month peaks ~2.8 GB).
- Log: `~/.local/share/eos-ncm/logs/replay-btc.log` (one line per month with valid minutes and ms/min).
- Output: `~/.local/share/eos-ncm/fotos/BTCUSDT-YYYY-MM.npz` with `t_ms`, `valido`, `preco`, `X` (float32, 205 features), `nomes`.
- If the log doesn't reach `2026-10`, rerun with `--de <month that failed>`. The previous month's tail is only used for warm-up, so a restart loses ~25 h of valid minutes at the start of that month. Accept that, or start one month earlier.
- When it finishes, mark task 2 `[x]` in the plan.

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

## Next step

1. Check that the replay finished (log) and mark task 2.
2. Task 5 (split fev–jun / test 07/jul–out, 45 min embargo) and task 6 (retest the theories in the simulator; the "sem filtro" column has to reproduce the July ruin).
3. Task 4 only with the user's ok.

## Loose ends

- `~/Jogos-tmp` (contains `pendrive_backup` 1.6 GB and `opencode` 3.8 GB) waiting for the user's confirmation before deletion.
- `uv cache prune` failed because of another uv's lock; try again.
- `eos-telegram-bot/data/eos.db-shm/-wal` and `tmp/eos.prod.db*` stay out of git (local databases).
