---
title: RL PPO Trading Module
aliases:
  - RL PPO Trading Module
tags:
  - ml
  - reinforcement-learning
  - experimental
status: experimental
updated: 2026-11-04
---

# RL PPO Trading Module

> Sources: commit 7ea2ef8, 2026-07-08; Local Repository Audit, 2026-11-04
> Raw: [repo-audit-jul-2026-changes](../../raw/project-system/2026-11-04-repo-audit-jul-2026-changes.md)

## Overview

Last commit in the repo (2026-07-08). A PPO reinforcement-learning agent under `eos-telegram-bot/ml/rl/`. **Not integrated** — no TypeScript code calls it.

## Files

- `env.py` — Gymnasium env, discrete actions Hold/Buy/Sell, transaction costs.
- `features.py` — RSI, EMA, MACD, Bollinger, ATR, OBV, momentum.
- `train.py` — PPO training, walk-forward validation, EvalCallback.
- `infer.py` — `RLTrader` live loop + ONNX export.

## Known issues

> [!warning]
> - `train.py::load_data` reads table `signals` using `entry_price` for open/high/low/close and `volume_ratio` as volume. That is **not OHLCV** — the indicators computed on it are degenerate. Needs real candle data (e.g. Binance klines).
> - SQL is built with an f-string on `symbol`; switch to a parameterized query.
> - Must be judged with the same fee-aware compounded simulation as [[Validated Subset Filter]] before any use.

## See Also

- [[EOS Trade Vision System Baseline]]
- [[Project State and Open Items]]
