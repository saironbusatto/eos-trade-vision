---
title: NCM BTC Closing
aliases:
  - NCM BTC Closing
tags:
  - ncm
  - decision
status: active
updated: 2026-11-08
---

# NCM BTC Closing

Decision of 2026-11-08, by the user (option (d) of [[NCM Exp 05 Value Model]] item 13): **stop the NCM/ML work on BTC
with the current data, and keep the frozen test (07/jul–out) closed.**

## Why

Experiments 00–07 changed one thing at a time. None found a repeatable edge with the 205 photo features:

| Exp | What changed | Result |
|---|---|---|
| [[NCM Exp 00 GRPO Run 1]] – [[NCM Exp 04 Exact Expected Reward]] | NCM as a policy (GRPO, KL brake, executed-trade plan, exact expectation) | every variant learns "trading loses" and stops, or trades at about the cost (−0.11%/entry) |
| [[NCM Exp 05 Value Model]] | NCM as a value model vs ridge, 5–45 min, taker | neither beats a constant prediction in May; the ridge June edge does not repeat |
| [[NCM Exp 06 Maker Costs]] | maker costs (realistic 0.08%, ceiling 0.04%) | cost falls as expected; the selections still lose |
| [[NCM Exp 07 Long Horizons]] | horizons 1–8 h, two folds | some May positives, all April negatives; models follow the fit-period trend |

[[Theory Retest BTC]] (task 6) had already shown the old rules lose after fees.

## What stays as it is

- **The frozen test is not opened.** `split.abre_teste` was never called for BTCUSDT (no lock in
  `~/.local/share/eos-ncm/teste-aberto/`). It stays available, once, for a future candidate frozen before opening it.
- **The ridge candidate stays frozen and is not tested.**
  - It is [[Candidate Ridge BTC]], `ncm/candidatos/ridge-btc.npz`, SHA-256 `5b5e7cb1…94c1bf36`.
  - Its status is INCONCLUSIVE leaning REJECTED: it did well in June, lost in May (Exp 05), and lost in April at hour
    scale (Exp 07).
  - Spending the one-shot test on it was judged not worth it.
- **Versions seen in June: 180.** Exp 05–07 used train months only and added none. Any future task 8 report must
  still deflate for these 180.
- **Data, photos, simulator, split and experiment scripts are kept** (`ncm/`, `~/.local/share/eos-ncm/`). They are
  the base for any later attempt.
- **The live bot fix (task 4) is done and independent.** The bot can keep running in paper mode. It decides on the
  15m close, checks stop/target on the stream and labels WIN net of costs.

## What would justify reopening

New information that the current photos lack, frozen as a candidate on train/validation months before the test is
opened:

- order book depth;
- liquidations;
- open interest;
- cross-exchange basis.

Option (c) needs live collection, because the Binance archives used here have no order book. Then the same protocol:
one change at a time, an internal fold check, June only for the final choice, and the test once.

## Plan status (`ncm-live-trading.md`)

- Tasks 1–6 done.
- Task 7 closed for BTC without a model that trades.
- Task 8 not run, test kept closed.
- Task 9 not started.
- ETH (planned after BTC) not started: the same features and method would be expected to fail the same way.

See also: [[NCM Handoff 2026-11-05]].
