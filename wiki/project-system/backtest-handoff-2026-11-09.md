---
title: Backtest Research Handoff 2026-11-09
aliases:
  - Backtest Research Handoff 2026-11-09
  - Backtest Handoff
tags:
  - backtest
  - handoff
status: active
updated: 2026-11-09
---

# Backtest Research Handoff 2026-11-09

Where the project stands after the change of direction on 2026-11-08, and how to resume.

## Direction

- **NCM/ML on BTC is stopped** (option d, 2026-11-08). Exp 00–07 found no repeatable edge. The Exp 08 audit showed
  the pipeline is sound: direction is not predictable from our features, but volatility is (R² 0.36). See
  [[NCM BTC Closing]] and [[NCM Exp 08 Pipeline Audit]].
- **No Telegram signal channel for now**, by the user's decision ("vamos deixar isso para depois").
- **The goal now is research.** Each step takes a published strategy or theory and tests it on our data under the
  same protocol:
  - no look-ahead and real fees;
  - one change at a time;
  - a 13-item report per step;
  - a variation budget fixed before running, with Deflated Sharpe.
- **The frozen test (jul–out 2026) stays closed.** No lock was written, and research data stops at 2026-06.

## What was done

| Step | Result | Page |
|---|---|---|
| Step 0: history | BTC/ETH 2020-01.., SOL 2020-09.. klines (spot + futures 1m) and funding, checksum-verified; 5 SOL days filled from daily files; FRED DTB3 T-bill series | [[Backtest Step 0 History Data]] |
| Theory 1: funding carry | **Closed.** The mechanism is confirmed (no real liquidation, DD < 3.3% on BTC/ETH), but it loses to the T-bill since 2022 in every 1x variant; SOL −27% in the FTX funding crash; 15 variants used | [[Theory 1 Funding Carry]] |

## Code and data

- `ncm/carry.py`:
  - delta-neutral carry backtest, hourly grid;
  - selftest: `~/.local/share/wow-voz/venv/bin/python -I ncm/carry.py --selftest`;
  - run: `... ncm/carry.py --simbolo ETHUSDT`.
- `ncm/dados_binance.py --simbolo X --de AAAA-MM --ate AAAA-MM --sem-aggtrades` downloads more data. It resumes
  after a network timeout, so a failed download is simply rerun.
- Data: `~/.local/share/eos-ncm/raw/`:
  - `futuros_klines_1m`, `spot_klines_1m`, `futuros_funding`;
  - `futuros_klines_1m_diario` (SOL gap days);
  - `futuros_markprice_1m` (ETH 2020-03 only);
  - `juros/DTB3.csv`.
- Results: `~/.local/share/eos-ncm/diag-kl/metricas-carry-<SYMBOL>.json`. Logs:
  `~/.local/share/eos-ncm/logs/teoria1-carry-*.log`.
- Data quirks to remember:
  - spot files from 2025 use microsecond timestamps; `agregados.klines_1m` converts them;
  - SOL funding switched to 2-hourly in Nov 2022, and `carry.py` applies events as they come;
  - liquidation checks should use mark price, not the last-price high. One false flag happened: the ETH wick on
    2020-03-13.

## Lessons that carry over

- **Fees decide everything.** Every rule that switches often loses to the slow one (carry V3: 399 trades; V5:
  140–175 trades).
- **The benchmark is dollar cash, not 0%.** Anything that does not beat the T-bill is not an edge.
- **Check every outlier in the raw data before believing it.** The SOL loss was real (FTX); the ETH liquidation was
  a false last-price wick.

## Next step (user to choose)

- **Theory 3: volatility-managed exposure.** Moreira & Muir 2017, *Volatility-Managed Portfolios*, Journal of
  Finance 72(4). It scales exposure inversely to forecast volatility and uses the one signal that worked in Exp 08.
  This is my recommendation.
- **Theory 2: time-series momentum.** Moskowitz, Ooi, Pedersen 2012, Journal of Financial Economics 104(2). For
  crypto, Liu & Tsyvinski 2021, Review of Financial Studies 34(6). Daily/weekly trend following.
- Before running either: fix the walk-forward folds over 2020-01..2026-06 and the variation budget.

## Other state

- Branch `chore/resume-nov-2026`. Push via HTTPS with `gh auth git-credential` (the SSH key does not work). Never
  commit `eos-telegram-bot/data/eos.db-shm` / `-wal` or `tmp/`.
- The live bot fix (task 4) is done; the bot was not restarted. It is not part of the research.

See also: [[NCM Handoff 2026-11-05]], [[Theory 1 Funding Carry]].
