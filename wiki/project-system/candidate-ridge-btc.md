---
title: Candidate Ridge BTC
aliases:
  - Candidate Ridge BTC
tags:
  - ncm
  - candidate
status: frozen
updated: 2026-11-07
---

# Candidate Ridge BTC

The ridge rule from [[Signal Check BTC]], frozen on 2026-11-07 as a candidate for the task 8 frozen test
(07/jul–out). It is frozen before that test is opened. Nothing here may change after the test opens.

## What is frozen

- File: `ncm/candidatos/ridge-btc.npz`, SHA-256 `5b5e7cb1d81d6fedbd2b33bc67c9b7df6412da46c351841b44e1b08694c1bf36`.
- Contents:
  - `W` (206 x 8 ridge weights including bias, λ = 100, fit on fev–mai);
  - `media` / `desvio` (feature normalization from fev–mai) and `corte_z` = 5;
  - `nomes` (the 205 features, in order);
  - `acoes` (the 8 entries: long/short x 5/15/30/45 min);
  - `limiar` = 0.001.
- Decision rule (`sinal.aplica_congelado`):
  1. normalize the raw photo and clip to ±5;
  2. predict the net result of the 8 entries;
  3. take the best one, and enter only if its prediction is at least 0.10%;
  4. hold for its duration, one position at a time (`treino.opera`).
- Execution assumptions: taker on both legs (0.05%), slippage 0.01% per leg, funding charged, entry at the open
  of the candle after the decision.
- Regenerate and check with `~/.local/share/wow-voz/venv/bin/python -I ncm/sinal.py --congela`.

## Reproduction check

The frozen file, applied to the **raw** June photos (the path the test will use), reproduces the Signal Check
result exactly: 15 trades (15 long, 0 short), PF 6.48, +6.95% compounded, 0.6% max drawdown.

## Honest status

- **Update 2026-11-07, [[NCM Exp 05 Value Model]]:**
  - The same formula, refit on fev–abr and checked on mai, loses: 10 trades at 0.10%, PF 0.32. Its May loss does not beat a constant prediction.
  - Classification is downgraded to **INCONCLUSIVE leaning REJECTED**.
  - The frozen file is unchanged.
- **Update 2026-11-08:** BTC work stopped by the user; the frozen test was kept closed, so this candidate is **not** going to be tested ([[NCM BTC Closing]]).
- Original classification: PROMISING. It is not SUPPORTED.
  - 15 trades in one month is a tiny sample.
  - 22 of 38 episodes positive in the confident 1% could be luck.
  - The 0.10% threshold was chosen by looking at June.
- It counts against the 180 versions already seen in June (170 from NCM run 1, 10 from the signal check), and the
  task 8 report must deflate for them.
- It is long-only, so the task 8 requirement of LONG and SHORT measured separately applies: it has no short side
  to measure.

See also: [[NCM Handoff 2026-11-05]], [[NCM Exp 03 Executed Trade Plan]].
