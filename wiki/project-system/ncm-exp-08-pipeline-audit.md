---
title: NCM Exp 08 Pipeline Audit
aliases:
  - NCM Exp 08 Pipeline Audit
tags:
  - ncm
  - experiment
  - audit
status: active
updated: 2026-11-08
---

# NCM Exp 08 Pipeline Audit

The user asked what inside our own rules could be causing the failures of Exp 00–07, with sources for every claim.
This audit tests our pipeline against facts with known answers before blaming the market.

1. **Research question.** Is the "no signal" result of Exp 00–07 real, or produced by a defect in our pipeline
   (misaligned time, broken features, a leak)?
2. **Hypotheses.**
   - H1 (pipeline defect): the photos do not describe even the just-closed minute, or they cannot predict something
     known to be predictable.
   - H0 (pipeline sound): the photos describe the present well, and a known-predictable quantity is predicted out of
     sample, but direction is not.
3. **Dataset and period.** BTCUSDT train part only: fit fev–abr, check mai (the Exp 05 split). June and the test
   untouched.
4. **Data-quality audit.** This experiment is the audit; see items 8.1 and 8.3.
5. **Experimental configuration.**
   - Script `ncm/auditoria.py`, read-only.
   - Returns come from futures 1m opens. "prev1" is the minute that just closed (the photo's own minute); "next k" is
     from the entry open to k minutes later.
   - Feature correlations are Pearson, on fev–abr normalized photos.
   - Out-of-sample R² uses ridge λ 100 fit on fev–abr and scored on May against the fev–abr mean; 0 = no better than
     a constant.
6. **Baselines.** A constant prediction (R² 0).
7. **Execution costs.** Not applicable here. Used only in item 10 to compute the break-even hit rate.
8. **Results.**

   8.1 Time alignment (fev–abr):

   | Target | Largest feature correlation | Median |
   |---|---|---|
   | prev1 (just-closed minute) | **0.986** (`raw_r1m_14`, the last 1-min return) | 0.002 |
   | next1 | 0.013 | 0.002 |
   | next5 | 0.016 | 0.004 |
   | next15 | 0.024 (`leg_ind_momento`, negative) | 0.007 |

   The photo's own last-minute return matches the price data almost exactly (0.986), so the alignment is right.
   Nothing correlates with the future more than with the past, so there is no leak. The flow features
   (`raw_fl_14_*`) correlate about 0.19–0.20 with the same minute's return and about 0 with the next one.

   8.2 Positive control, out-of-sample R² in May:

   | Target | R²_mai |
   |---|---|
   | prev1 (describe the just-closed minute) | **+0.987** |
   | size of the last 15 min | +0.596 |
   | **size of the next 15 min (volatility)** | **+0.361** |
   | direction, next 1 min | −0.004 |
   | direction, next 5 min | −0.008 |
   | direction, next 15 min | −0.016 |

   8.3 Feature health:
   - 1 constant feature.
   - 20 features have more than half of their rows at a single value (sparse event features).
   - 12 near-duplicate pairs (|r| > 0.98, mostly legacy vs corrected OFA).
   - None has more than 5% of its rows at the ±5 clip.

   8.4 Simple known effects (fev–abr):
   - Volatility clustering: corr(|last 15 min|, |next 15 min|) = **0.284**.
   - Short-term reversal is tiny: corr(last 1 min, next 1 min) = −0.012; for 15 min, −0.017.
   - The standard deviation of a 15-min return is 0.289%. The 0.12% taker round trip is 0.42 of it.
9. **Statistical uncertainty.**
   - With about 126k fit minutes, a correlation of ±0.01 is statistically distinguishable from zero.
   - But overlapping windows shrink the effective sample, and R² below 0 out of sample means none of the directional
     correlation carried from fev–abr to mai.
   - The volatility R² of 0.36 is far outside any noise level.
10. **Failure analysis: the patterns behind Exp 00–07.**

    1. **The pipeline is sound (H1 rejected).**
       - The photo describes the just-closed minute almost perfectly (R² 0.987).
       - It predicts the size of the next 15 min out of sample (R² 0.36).
       - Our sources: items 8.1–8.2. This matches the volatility-clustering stylized fact (Cont 2001; Mandelbrot 1963
         as cited there) and GARCH-type persistence in Bitcoin (Katsiampa 2017).
    2. **Our features measure what already happened, and it is already in the price.**
       - Flow correlates with the same minute's move (~0.2) and with the next minute's move at ~0 (item 8.1).
       - This is what the order-flow literature reports: order flow imbalance explains *contemporaneous* price changes
         (Cont, Kukanov & Stoikov 2014). For BitMEX XBTUSD, trade-flow imbalance explains contemporaneous changes
         (Silantyev 2019).
       - The OFA "smart money / imbalance / absorption" ideas in the bot are this same kind of flow measure. The bot
         decides after the minute closes and enters at the next open, which is after that effect.
    3. **The rules demand a hit rate the information cannot give.**
       - At 15 min, the expected size of a move is about 0.23%. This is an approximation: σ·√(2/π) with σ = 0.289%
         from item 8.4.
       - To beat a 0.12% taker round trip, the direction must be right about **76%** of the time (break-even
         p = 0.5 + 0.12 / (2 × 0.23)). Even at the 0.04% maker ceiling it must be about 59%.
       - The features' best directional correlation is 0.024 (item 8.1), which does not carry to May (R² < 0).
       - The 0.05% taker and 0.02% maker fees are Binance's published VIP0 USDⓈ-M rates.
    4. **At hour scale the models follow the fit period's trend.**
       - The fev–mar models leaned short in a +12% April and lost.
       - Our source: [[NCM Exp 07 Long Horizons]], item 10.
    5. **Selection on June produced the only "edge".**
       - The ridge PF 6.48 in June came after 180 versions had been looked at in June, with the threshold chosen
         there. It did not repeat in May or April (Exp 05, Exp 07).
       - The literature on this effect: selection bias inflates the best backtest under multiple testing (Bailey &
         López de Prado 2014). Bailey, Borwein, Salehipour & Zhu (2016) suggest at most about 45 variations for a
         given dataset.
    6. **Minor defects that are not the cause.**
       - The constant, sparse and duplicate features (item 8.3) add noise.
       - But ridge with λ 100 tolerates them, and the volatility control works on the same features.
11. **Limitations.**
    - Pearson correlation and a linear R² check; a nonlinear dependence could exist. The Exp 05 value network is the
      nonlinear check, and it also did not beat a constant.
    - The break-even hit rate uses a normal approximation of |return|.
    - One symbol, one check month.
12. **Decision classification.**
    - H1 (pipeline defect): **REJECTED.**
    - "Direction is not predictable from these features at 1–15 min": **SUPPORTED** (out-of-sample R² < 0 for all
      three horizons).
    - "Volatility is predictable from these features": **SUPPORTED** (R² 0.36).
13. **Conclusion and next step.**
    - What fails is not the learning: it is the rule that asks for *direction* from *after-the-fact flow*, at a
      horizon where fees need about 76% accuracy.
    - What the data does support is **when the market will move, not which way**.
    - Directions consistent with that, each a new hypothesis to be tested under the same protocol:
      - use the volatility forecast to decide when not to trade or how far to put stops;
      - strategies whose edge is not direction, such as market making, which is exposed to the adverse selection Cont
        et al. measure with OFI;
      - faster or richer information (order book), per option (c).

## Sources

- Cont, R., Kukanov, A., Stoikov, S. (2014). *The Price Impact of Order Book Events*. Journal of Financial
  Econometrics 12(1), 47–88. [arXiv:1011.6402](https://arxiv.org/abs/1011.6402)
- Cont, R. (2001). *Empirical properties of asset returns: stylized facts and statistical issues*. Quantitative
  Finance 1(2), 223–236. [RePEc](https://ideas.repec.org/a/taf/quantf/v1y2001i2p223-236.html)
- Katsiampa, P. (2017). *Volatility estimation for Bitcoin: A comparison of GARCH models*. Economics Letters 158, 3–6.
  [SHURA](https://shura.shu.ac.uk/16526)
- Silantyev, E. (2019). *Order flow analysis of cryptocurrency markets*. Digital Finance 1(1), 191–218.
  [RePEc](https://ideas.repec.org/a/spr/digfin/v1y2019i1d10.1007_s42521-019-00007-w.html)
- Bailey, D. H., López de Prado, M. (2014). *The Deflated Sharpe Ratio*. Journal of Portfolio Management 40(5), 94–107.
  [SSRN](https://papers.ssrn.com/abstract=2460551)
- Bailey, D. H., Borwein, J., Salehipour, A., López de Prado, M., Zhu, Q. (2016). *Backtest overfitting demonstration
  tool*. [PDF](https://www.davidhbailey.com/dhbpapers/overfit-tools-at.pdf)
- Binance. *Futures fee structure* (VIP0 USDⓈ-M 0.02% maker / 0.05% taker).
  [Binance FAQ](https://www.binance.com/support/faq/360033544231)

See also: [[NCM BTC Closing]], [[NCM Exp 05 Value Model]], [[NCM Exp 07 Long Horizons]].
