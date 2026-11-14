---
title: Funding Carry Regime
aliases:
  - Funding Carry Regime
tags:
  - backtest
  - carry
status: active
updated: 2026-11-13
---

# Funding Carry Regime

Option 2 of [[Funding Carry Phase 3 Model]], the user's choice: carry as a regime strategy that is off while
funding is below the dollar rate. **The registered criterion was missed by 0.1 point.**

1. **Research question.** If the carry only runs while the whole universe's funding pays more than the dollar
   rate, and sits in cash otherwise, does it beat the T-bill without bad years?
2. **Hypotheses.** H1, the criterion registered before running (commit `587c085`), over 2022..2026-06:
   - total at least 5 points above the T-bill;
   - no year more than 0.5 point below the T-bill;
   - max drawdown below 10%;
   - Deflated Sharpe of the excess return above 0.95.
   - With fewer than 10 separate ON episodes, a pass is PROMISING at most.
3. **Dataset and period.** As in phase 3: 30 symbols, 1h klines, funding, mark price, to 2026-06. Trading from
   2021-01; 2021 is context only. Jul–out 2026 not read.
4. **Data-quality audit.** As in phases 1–3.
5. **Experimental configuration.**
   - `ncm/rotacao.py --opcao2`, structure L2·C0 (2x perp, taker costs, mark-price liquidation as a real loss).
   - Signal, every Monday 00 UTC: universe mean funding of the last 30 days (annualized) × 2/3 − T-bill. ON above
     +2 points, OFF below 0.
   - OFF: all cash at the T-bill. ON: re-rank on the turn-on day and on the first Monday of each month.
   - Selftest added: one ON episode, three entries, flat equity while OFF.
   - Variants (3; total 10 of 20): G1 top 3 by last-30-day funding; G2 BTC and ETH only; G3 all symbols, equal
     weights.
6. **Baselines.** T-bill; R1 always-on under the same structure (+16.2% since 2022).
7. **Execution costs.** Spot 0.11%, perp 0.06% per leg.
8. **Results.**

   | | Since 2022 | Margin over T-bill (+19.9%) | Worst year vs T-bill | Max DD | Costs | Liquidations |
   |---|---|---|---|---|---|---|
   | **G1 top 3** | **+24.8%** | **+4.9** | −0.2 | −0.3% | 0.056 | 0 |
   | G2 BTC + ETH | +24.0% | +4.1 | 0.0 | −0.2% | 0.021 | 0 |
   | G3 all, equal | +23.1% | +3.2 | 0.0 | −0.2% | 0.030 | 5 |

   G1 by year against the T-bill:

   | 2021 (context) | 2022 | 2023 | 2024 | 2025 | 2026 H1 |
   |---|---|---|---|---|---|
   | +32.0% vs 0.0% | +2.2% vs 2.1% | +6.5% vs 5.3% | +8.3% vs 5.2% | +4.0% vs 4.2% | +1.8% vs 1.8% |

   ON episodes (the same for the three variants; ON 27% of the time since 2021):

   | Turn on | Turn off | Days |
   |---|---|---|
   | 2021-01-04 | 2021-06-14 | 161 |
   | 2021-08-09 | 2022-02-07 | 182 |
   | 2023-11-20 | 2024-02-12 | 84 |
   | 2024-02-26 | 2024-05-06 | 70 |
   | 2024-12-02 | 2025-01-13 | 42 |

   Raw: `~/.local/share/eos-ncm/diag-kl/metricas-rotacao-opcao2.json`; log `logs/opcao2-regime.log`.
9. **Statistical uncertainty.**
   - Since 2022 there are **3 turn-ons** plus the tail of the 2021 episode. The whole excess over the T-bill comes
     from about 200 days in two bull phases (Nov 2023–May 2024, Dec 2024–Jan 2025).
   - DSR of the excess return is 1.00 for all three. The series is nearly flat while OFF, so the Sharpe is very
     high; with 3 episodes it says little.
   - G1's margin is +4.9 against a threshold of +5.0. A difference of 0.1 point is noise, in either direction.
10. **Failure analysis.**
    - **By the letter, H1 is not met:** G1 misses the 5-point margin by 0.1; G2 and G3 by more. The three other
      conditions are met by all variants.
    - What changed versus every earlier rule: no bad year. The worst is 2025, 0.2 point below the T-bill (G1), with
      max drawdown of 0.3%. The always-on R1 lost to the T-bill in 3 of 5 years.
    - G3 had 5 liquidations on mark price: at 2x, small symbols in a euphoric market can jump enough in an hour.
      G1 and G2 had none.
    - G2 (BTC + ETH only) gets most of G1's result (+4.1 vs +4.9) with 11 entries and the lowest cost.
11. **Limitations.**
    - Very few episodes. The rule was written after seeing, in earlier phases, that 2021 and 2024 paid and 2025–26
      did not. The thresholds (+2, 0) were not tuned, but the idea itself is informed by this same data.
    - The OFF state assumes the capital earns the T-bill. USDT sitting on the exchange earns 0 unless it is moved
      to a dollar instrument, which adds transfers and delays that are not modelled.
    - 2x leverage and the taker-cost assumptions are as in phase 3.
12. **Decision classification.**
    - H1 as registered: **NOT MET** (G1 +4.9 vs the +5.0 threshold).
    - "A regime switch removes the bad years of the carry": **PROMISING**, not SUPPORTED. It holds in this sample,
      which has 3 turn-ons since 2022.
    - Variants used: 10 of 20.
13. **Conclusion and next step.**
    - The carry is a regime trade. Run as one, since 2022 it was never more than 0.2 point below the dollar rate in
      a year, and it made 4–5 points more in total. That is the best result of the whole research line. It is
      still short of the registered bar and built on very few episodes.
    - It cannot be confirmed with the data we have. Two honest ways to add evidence:
      - **The frozen test (jul–out 2026), once.** It would show whether the signal was ON in those four months and
        what it earned. Four months may contain no episode at all, in which case it proves nothing. Needs the
        user's explicit ok.
      - **A live paper monitor:** compute the Monday signal each week and log what G1/G2 would do. It costs
        nothing and accumulates out-of-sample evidence.
    - Nothing goes live with money on this result.

## Paper monitor (2026-11-14)

The user chose the paper monitor. It places no orders; it logs the weekly decision in real time.

- Script: `ncm/monitor_carry.py` (selftest for the Monday date, the 30-day window, the hysteresis and the top 3).
- Rule: the same as `rotacao.py --opcao2`. It logs the state (ON/OFF), the signal, and what G1 and G2 would hold.
- Sources: Binance public API (funding history, spot pairs) and FRED DTB3.
- Log: `~/.local/share/eos-ncm/monitor/carry-regime.csv`, one row per Monday.
- Schedule: systemd user timer `eos-carry-monitor.timer`, Mondays 00:10 UTC (Sunday 21:10 in São Paulo),
  `Persistent=true`. If the PC was off, missed Mondays are logged in order on the next run, and `registrado_em`
  shows the delay. A desktop notification fires when the state changes.
  - Disable with `systemctl --user disable --now eos-carry-monitor.timer`.
- **It only reads funding from 2026-11-01 on,** so the frozen test (jul–out 2026) stays closed. The first signal is
  on Monday 2026-12-07; until then the rows say `AQUECENDO`.
- The money result is not computed by the monitor. It is computed later by the backtest on the Binance archives,
  which also applies the hourly forced exit. The log proves which decision was made at the time.
- Review after 10 turn-ons, or after 12 months if fewer: compare the logged decisions with the backtest.

See also: [[Funding Carry Phase 3 Model]], [[Funding Carry Phase 1–2 Rotation]], [[Theory 1 Funding Carry]].
