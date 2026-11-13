---
title: Funding Carry Phase 1–2 Rotation
aliases:
  - Funding Carry Phase 1–2 Rotation
tags:
  - backtest
  - carry
status: active
updated: 2026-11-13
---

# Funding Carry Phase 1–2 Rotation

Phases 1 and 2 of the plan `funding-ncm-carry.md` (repo root). **The plan's stop rule fired at phase 2.**

1. **Research question.** Across 30 perpetuals, does a fixed rotation into the highest-funding symbols beat the
   dollar rate after costs? This is the gate before spending effort on an NCM that predicts funding.
2. **Hypotheses.**
   - H1: rule R1 beats the T-bill in total over 2022..2026-06 (the stop criterion fixed in the plan).
   - H0: it does not.
3. **Dataset and period.**
   - Universe fixed by rule before looking at any funding (`ncm/universo.py`, `ncm/universo-carry.json`): USDT
     perpetuals with futures and spot klines in 2020-12, top 30 by futures quote volume that month. 918 USDT
     symbols in the archive, 79 qualified.
   - The 30: BTC, ETH, XRP, LTC, LINK, BCH, YFI, SUSHI, XLM, ADA, GRT, EOS, BNB, DOT, UNI, ZIL, AAVE, EGLD, THETA,
     TRX, ETC, COMP, WAVES, FIL, CRV, VET, YFII, XMR, SNX, SXP.
   - 1h klines (spot + futures) and funding, 2020-01..2026-06, checksum-verified, 164 MB. Trading runs 2021-01 to
     2026-06. Jul–out 2026 is not read.
4. **Data-quality audit.**
   - 30 symbols available at the start, 25 at the end.
   - Delistings are in the data: YFII (futures end 2022-04), EOS (2025-05), SXP (spot ends 2026-04), WAVES spot
     (2024-06), XMR spot (2024-02).
   - Gaps up to 24 h are forward-filled; longer means the symbol is unavailable and any position is closed at the
     last price.
5. **Experimental configuration.**
   - Script `ncm/rotacao.py`. Selftest: funding minus entry cost; no entry when the rate beats funding; forced
     exit; delisting close; price quadrupling leaves equity unchanged.
   - Each position is a 1x carry (half spot, half short-perp margin), rebalanced when margin halves or doubles.
   - Rules registered before running (4 of the 20-variant budget):
     - R1 (primary): monthly, top 3 by mean funding of the last 30 days, 1/3 each, only if annualized funding
       exceeds the T-bill; the rest in cash at the T-bill.
     - R2: top 5. R3: R1 weekly. B0: all available symbols, equal weights, no filter.
   - Forced exit: funding summed over the last 24 h below −0.3% closes the position at the next hour.
   - **Deviation from the plan text:** the plan said "exit when the funding interval shortens". That was dropped
     before running, because Binance moved many altcoins to 4-hour funding permanently, so the interval is no
     longer a crisis signal.
6. **Baselines.** T-bill (FRED DTB3) and B0.
7. **Execution costs.** Spot 0.11% and perp 0.06% per leg, on entries, exits and rebalances.
8. **Results.**

   | Rule | Total 2021–26H1 | Since 2022 | T-bill since 2022 | Max DD | Entries | Costs |
   |---|---|---|---|---|---|---|
   | R1 top 3 monthly | +41.1% | **+12.4%** | +19.9% | −6.5% | 131 | 0.11 |
   | R2 top 5 monthly | +36.4% | +12.8% | +19.9% | −9.5% | 199 | 0.10 |
   | R3 top 3 weekly | +33.9% | +8.3% | +19.9% | −7.1% | 274 | 0.21 |
   | B0 all, equal | +33.4% | +11.8% | +19.9% | −3.5% | 174 | 0.03 |
   | *Ceiling: oracle top 3 monthly* | +56.8% | *+19.0%* | +19.9% | −2.1% | 131 | 0.12 |
   | *Ceiling: oracle top 3 weekly* | +17.4% | −4.9% | +19.9% | −11.2% | 574 | 0.40 |

   R1 by year against the T-bill:

   | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 H1 |
   |---|---|---|---|---|---|
   | +25.8% vs 0.0% | +0.3% vs 2.1% | +4.0% vs 5.3% | +5.9% vs 5.2% | +1.6% vs 4.2% | +0.5% vs 1.8% |

   - Liquidation flags: 0 for R1; 1 each for R2 and B0, on the last-price high, not checked against mark price.
   - Raw: `~/.local/share/eos-ncm/diag-kl/metricas-rotacao.json`; log `logs/fase2-rotacao.log`.
9. **Statistical uncertainty.**
   - DSR over the 4 rules: R1 0.98, B0 1.00. As in theory 1, that reflects 2021, not an edge over cash.
   - Since 2022 every rule loses to the T-bill in at least 4 of the 5 years; the only winning year is 2024.
10. **Failure analysis.**
    - **The stop rule fired:** R1 loses to the T-bill since 2022, and so do R2, R3 and B0.
    - **The oracle is the decisive number.** It is a diagnostic, not a strategy: it ranks symbols by the funding of
      the *next* 30 days. With perfect foresight, the same portfolio earns +19.0% since 2022, still below the
      T-bill's +19.9%. It beats the T-bill in 2 of 5 years (2022 and 2024).
    - So the limit is not the forecast. A 1x carry puts only half the capital on the funding leg, and since 2022
      even the best three symbols each month do not pay enough to cover that and the costs.
    - Rotating picks symbols whose funding then falls back: R1 held 2.9 positions on average, so the filter was
      almost always satisfied at entry, yet the realized result was close to B0's.
    - Weekly switching is worse even with foresight (−4.9%): costs of 0.40 of capital.
    - The premium was a 2021 phenomenon in the whole universe, not only in BTC and ETH.
11. **Limitations.**
    - The universe is the 2020 large caps. Symbols listed later (often with higher funding and higher crash risk)
      are out by construction.
    - Leverage is fixed at 1x. A higher perp leverage raises the share of capital earning funding and the
      liquidation risk. It was not part of the registered rules.
    - VIP0 taker fees on every trade; no maker orders, BNB discount or on-exchange yield for idle cash.
    - The oracle ranks by funding only. It ignores costs and basis, so it is a ceiling for this ranking rule, not a
      mathematical upper bound for every possible policy.
12. **Decision classification.**
    - H1: **REJECTED.** R1 +12.4% vs T-bill +19.9% since 2022.
    - "A funding forecast (the NCM of phase 3) can make this portfolio beat the T-bill": **REJECTED** for this
      structure, by the oracle ceiling (+19.0% < +19.9%).
    - Variants used: 4 of 20 (the two oracle runs are diagnostics).
13. **Conclusion and next step.**
    - Per the plan, the work **stops at phase 2**. Phase 3 (NCM) is not run: under this structure even a perfect
      funding forecast fails the success criterion.
    - What would have to change for a new plan, each a different hypothesis that needs the user's decision:
      - a different cost and capital structure (maker fees, higher perp leverage with a mark-price liquidation
        model, yield on idle cash);
      - a different universe (newer listings), with the crash risk measured first;
      - or accepting carry only as income on idle exchange balances, compared with 0% and not with the T-bill.
    - Nothing goes live. The frozen test stays closed.

See also: [[Theory 1 Funding Carry]], [[Theory 3 Volatility-Managed Exposure]],
[[Backtest Research Handoff 2026-11-09]].
