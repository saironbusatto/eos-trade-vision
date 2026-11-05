---
title: Validated Subset Filter
aliases:
  - Validated Subset Filter
tags:
  - strategy
  - statistics
  - walk-forward
  - risk
status: active
updated: 2026-11-04
---

# Validated Subset Filter

> Sources: docs/ALGORITHM_TCC.md §19, 2026-07-06; Local Repository Audit, 2026-11-04
> Raw: [repo-audit-jul-2026-changes](../../raw/project-system/2026-11-04-repo-audit-jul-2026-changes.md)

## Overview

Entry gate introduced 2026-07-06 (commit `e866a52`). The bot only trades when a signal falls in the **intersection** of validated symbols × UTC weekdays × hour-direction cells. It exists because the unfiltered strategy is ruinous once fees and compounding are simulated.

## Why — the ruin finding

- Production history after the Oracle migration: **18.207 closed signals** (06/fev–06/jul/2026), WR 48,85%.
- Raw edge +0,0086%/trade, aggregate PF 1,03–1,11.
- Chronological sim, 2% fixed risk + taker fee 0,08% round-trip: **capital -99,9999997%**. Without fees, max DD still 99,7%.
- Cause: fixed per-trade fee at ~121 signals/day eats a thin edge under compounding. PF > 1 is not enough.

## Method

- Chronological 70/30 split (no shuffling): train 06/fev→09/mar (12.744), test 09/mar→06/jul (5.463).
- Candidates chosen on train only, evaluated on unseen test.
- Overfit example: TRXUSDT PF 1,44 → 0,20 out of sample.

## Out-of-sample result (test period)

| Filter | n | Final capital |
|---|---|---|
| None | 5.463 | -100% |
| Symbols only | 2.208 | -94,1% |
| Days only | 2.152 | -94,1% |
| Hour×direction only | 912 | -2,5% |
| **Intersection** | **136** | **-0,2%** |
| Intersection + maker fee | 136 | **+18,4%** |

Train with same filter (n=202): +58,1%.

## Configuration (`src/trendingScanner.ts`)

```
ENABLE_VALIDATED_SUBSET_FILTER=true
VALIDATED_SUBSET_SYMBOLS=BTCUSDT,ZECUSDT,ETHUSDT,XRPUSDT,DOGEUSDT,PEPEUSDT
VALIDATED_SUBSET_DAYS_UTC=3,5,6
VALIDATED_SUBSET_HOUR_ACTION_CELLS=12:SELL,7:BUY,9:SELL,8:BUY
DEFAULT_ORDER_TYPE=MAKER
```

Hour/direction filter has a **bootstrap mode** via `getTotalClosedTrades()` to avoid deadlock on an empty closed-trade base.

## Limitations

> [!warning]
> - n=136 in test → wide confidence interval.
> - Single 5-month regime.
> - Paper trade 4–6 weeks before real capital.
> - **Quarterly re-validation required.** Last validation 2026-07-06 → review was due ~2026-10. **Overdue as of 2026-11-04.**

## Relation to earlier analysis

The April addendum (docs/ESTRATEGIA_ANALISE_ESTATISTICA.md, 17.634 signals) found a macro+good-hours+drop-bad-symbols combo at WR 57,27%, but measured **average profit, not fee-aware compounded capital**. The July analysis supersedes it for go/no-go decisions.

## See Also

- [[EOS Trade Vision System Baseline]]
- [[Code-Derived Decision Proof]]
- [[Project State and Open Items]]
