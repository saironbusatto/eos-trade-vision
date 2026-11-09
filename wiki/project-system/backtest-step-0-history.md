---
title: Backtest Step 0 History Data
aliases:
  - Backtest Step 0 History Data
tags:
  - backtest
  - data
status: active
updated: 2026-11-08
---

# Backtest Step 0 History Data

First step of the backtest-research direction chosen on 2026-11-08: the project now studies published strategies
and theories, not a Telegram signal channel. Nine months of data (2026-02..10) were too few: one trending month
decided Exp 07. This step extends BTCUSDT history back to 2020.

## What was done

- Ran the existing `ncm/dados_binance.py --de 2020-01 --ate 2026-01 --sem-aggtrades`. No code change. A
  read timeout made the first try stop; the script resumes, so it was rerun until complete.
- Every zip is kept only if its SHA-256 matches the `.CHECKSUM` Binance publishes next to it.
- aggTrades skipped: six years would be tens of GB, and none of the planned theories (carry, time-series
  momentum, volatility management) needs them.
- Stored in `~/.local/share/eos-ncm/raw/` as before. Log: `~/.local/share/eos-ncm/logs/passo0-download.log`.

## Result: BTCUSDT, 2020-01..2026-10 (82 months)

| Set | Months | Quality |
|---|---|---|
| Futures 1m klines | 82 | 0 missing minutes |
| Spot 1m klines | 82 | 15 gaps, 2,325 minutes (0.06%), all 2020–2021 plus 2023-03-24 12:40–14:00, matching Binance maintenance/outage windows |
| Funding | 82 (7,488 events, 2020-01-01..2026-10-31) | every interval exactly 8 h |

Note: the 2025+ spot files use microsecond timestamps; anything that joins spot and futures must convert.

## A first descriptive number (not a backtest)

Over 2020-01..2026-06 (test months excluded; 7,119 events): mean funding 0.0109% per 8 h, about 11.9% a year
**gross**, with 14.5% of events negative. A first computation over all months including jul–out 2026 (0.0106%) was
discarded because it touched the test period; it is descriptive only and chose nothing. This is the raw income a
long-spot / short-perp carry would receive before fees on four legs, the price gap between the legs and capital
cost. Whether anything is left after that is the question of theory 1.

## Split for the research

- Fev–out 2026 keeps its roles: the jul–out 2026 frozen test stays closed.
- 2020-01..2026-01 is new research history. Walk-forward folds inside it are defined per theory, before looking
  at results, with a variation budget set in advance (Bailey et al. 2016, as in [[NCM Exp 08 Pipeline Audit]]).

See also: [[NCM BTC Closing]], [[NCM Exp 08 Pipeline Audit]].
