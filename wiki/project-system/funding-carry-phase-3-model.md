---
title: Funding Carry Phase 3 Model
aliases:
  - Funding Carry Phase 3 Model
tags:
  - backtest
  - carry
  - ncm
status: active
updated: 2026-11-13
---

# Funding Carry Phase 3 Model

Option 1 of [[Funding Carry Phase 1–2 Rotation]] (the user's choice) and phase 3 of `funding-ncm-carry.md`.
**The success criterion was not met.**

1. **Research question.** With a better capital structure, can a model that predicts each symbol's next-30-day
   funding run the carry rotation and beat the dollar rate?
2. **Hypotheses.**
   - H1: a model variant beats the T-bill **and** the fixed rule R1 in at least 4 of the 5 walk-forward years
     (2022–2026 H1), with max drawdown below 10% and Deflated Sharpe above 0.95. Fixed in the plan on 2026-11-12.
   - H0: it does not.
3. **Dataset and period.** The 30-symbol universe, 1h klines, funding and now 1h mark-price klines (46 MB,
   checksum-verified), 2020-01..2026-06. 62,112 symbol-day samples, 61,315 with a target. Jul–out 2026 not read.
4. **Data-quality audit.** As in phases 1–2. Mark price is missing before 2020-11 and for one SXP month; the
   last-price high is used there.
5. **Experimental configuration.**
   - All rules were committed before running (`33c7cd3`, `2d04636`).
   - `ncm/rotacao.py --opcao1`: leverage L in {1, 2, 3} × costs {C0 taker; C1 fees in BNB with a maker perp leg}.
     Liquidation is a real loss, checked on the hourly mark-price high: the margin is lost and the spot leg is sold
     at the next open.
   - `ncm/carry_modelo.py`: the portfolio is R1's (top 3 monthly, 1/3 each, forced exit) under L2·C0. Only the
     ranking changes: the model's predicted funding, taken only if above the T-bill.
   - 18 features known at 00 UTC of the decision day; target = funding of the next 30 days.
   - Walk-forward: for test year Y, fit only on samples whose target ends before 1 Jan Y.
   - M1: ridge, λ 10. M2: NCM-style value network (transformer, 2 layers, 64 dims, 4 heads, 90 daily tokens plus
     context; Huber; checkpoint on the last 90 days of the fit window; mean of seeds 0/1/2).
6. **Baselines.** T-bill (FRED DTB3); R1 under the same structure; the perfect-foresight oracle as a ceiling.
7. **Execution costs.** C0: spot 0.11%, perp 0.06% per leg. C1: spot 0.085%, perp 0.018%; the maker fill is assumed.
8. **Results.**

   Step A, oracle since 2022 (T-bill +19.9%); no liquidation and max drawdown under 2% in all six:

   | | L1 | L2 | L3 |
   |---|---|---|---|
   | C0 | +19.0% | **+25.1%** | +27.9% |
   | C1 | +22.1% | +29.9% | +33.7% |

   First structure with at least 5 points of room, in the registered order: **L2·C0**.

   Step B and phase 3, all under L2·C0, 2022..2026-06:

   | | Total | 2022 | 2023 | 2024 | 2025 | 2026 H1 | Max DD | Years won |
   |---|---|---|---|---|---|---|---|---|
   | T-bill | +19.9% | +2.1% | +5.3% | +5.2% | +4.2% | +1.8% | | |
   | R1 (last-30-day mean) | +16.2% | +0.1% | +5.3% | +7.8% | +2.1% | +0.6% | −1.9% | |
   | **M1 ridge** | **+21.8%** | +5.4% | +5.7% | +7.8% | +1.3% | +0.5% | −2.7% | **2 of 5** |
   | M2 NCM network | +19.7% | +5.5% | +4.1% | +7.0% | +1.5% | +0.9% | −2.8% | 1 of 5 |
   | Oracle (ceiling) | +25.1% | +3.6% | +6.5% | +9.2% | +3.0% | +1.3% | −1.6% | |

   - "Years won" = above both the T-bill and R1. M1's 2024 equals R1's (+7.8%), so it does not count.
   - Forecast quality out of sample (2022+), Spearman with the realized funding: R1's last-30-day mean 0.66, M1
     0.56, M2 0.45. R² is negative for all three (−0.23, −3.40, −31.8): the levels are badly calibrated.
   - M2 had 1 liquidation on mark price; M1 and R1 none.
   - Raw: `metricas-rotacao-opcao1.json`, `metricas-carry-modelo.json`; logs `fase2b-opcao1.log`,
     `fase3-carry-modelo.log`.
9. **Statistical uncertainty.**
   - M1's lead over the T-bill is 1.9 points in 4.5 years and comes from one year, 2022.
   - M1 ranks symbols *worse* than the plain 30-day mean (Spearman 0.56 vs 0.66) yet earns more. A better result
     from a worse forecast is not evidence of skill. A possible source, not verified, is the T-bill filter: a model
     that predicts low funding stays in cash, which pays the T-bill.
   - M1 and M2 beat the "oracle" in 2022. The oracle ranks by funding alone, so it is a ceiling for that ranking
     rule only, as stated in the phase 2 report.
   - DSR is 1.00 for both models, but it tests the Sharpe against zero, not against the T-bill.
10. **Failure analysis.**
    - **H1 fails on the years rule:** M1 wins 2 of 5, M2 1 of 5.
    - **2025 and 2026 are lost by every variant, and even by the oracle** in L2·C0 (+3.0% vs +4.2%; +1.3% vs +1.8%).
      Per-year oracle runs for L3·C0, L2·C1 and L3·C1 show the same, except L3·C1 in 2026 (+1.9% vs +1.8%). With
      two of five years out of reach, "4 of 5" cannot be met in this universe.
    - The models do not forecast funding better than its own 30-day mean. The predictability measured before the
      plan (correlation 0.77 on BTC and ETH) is already captured by that mean.
    - The network is worse than ridge and badly calibrated: 13–54k overlapping samples from 30 symbols are few
      independent observations.
11. **Limitations.**
    - One universe (2020 large caps), one horizon (30 days), monthly decisions.
    - The C1 structures were not used for the models: the registered order chose L2·C0. Their oracles have more
      room (+10 to +14 points), but the same per-year pattern.
    - Leverage raises liquidation risk that hourly mark-price highs may understate within the hour.
12. **Decision classification.**
    - H1: **REJECTED** for M1 and M2.
    - "M1 beats the T-bill in total since 2022" (+21.8% vs +19.9%): **INCONCLUSIVE**; small, from one year, and not
      backed by forecast skill.
    - "The funding premium of this universe is below the dollar rate since 2025": **SUPPORTED** (every rule, model
      and oracle).
    - Variants used: 7 of 20.
13. **Conclusion and next step.**
    - The plan ends here with the criterion not met. Nothing is frozen, and the jul–out 2026 test stays closed.
    - Funding carry in the 2020 large caps does not beat holding dollars in the current regime, with or without a
      model. It did in 2021, and partly in 2022–24 with leverage.
    - The remaining 13 variants are not spent on re-tuning this setup. A new attempt needs a different premise,
      decided by the user: a universe of newer listings (higher funding, higher crash risk), or carry as a
      regime-dependent strategy that is simply off while funding is below the dollar rate.

See also: [[Funding Carry Phase 1–2 Rotation]], [[Theory 1 Funding Carry]], [[NCM Exp 05 Value Model]].
