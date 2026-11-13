---
title: Theory 3 Volatility-Managed Exposure
aliases:
  - Theory 3 Volatility-Managed Exposure
tags:
  - backtest
  - theory
status: active
updated: 2026-11-12
---

# Theory 3 Volatility-Managed Exposure

1. **Research question.** Does scaling a long BTC/ETH position inversely to recent volatility improve the
   risk-adjusted return (Sharpe in excess of the T-bill) versus simply holding?
2. **Hypotheses.**
   - H1: at least one pre-registered variant has a higher excess Sharpe than buy & hold in **both** halves,
     2020-02..2022 and 2023..2026-06, on BTC and on ETH.
   - H0: it does not, or the gain shows in one half only.
   - Sources:
     - Moreira & Muir 2017, *Volatility-Managed Portfolios*, Journal of Finance 72(4): the gain exists because
       volatility moves more than expected return.
     - Harvey et al. 2018, *The Impact of Volatility Targeting*, Journal of Portfolio Management 45(1).
     - Counterpoint: Cederburg, O'Doherty, Wang & Yan 2020, Journal of Financial Economics 138(1). Most of the gain
       disappears out of sample.
3. **Dataset and period.** BTCUSDT and ETHUSDT, 2020-01-31..2026-06 hourly (the first 30 days only warm up the
   volatility window), from [[Backtest Step 0 History Data]]. The frozen test is not read.
4. **Data-quality audit.** As in [[Theory 1 Funding Carry]]. Perp 0 forward-filled hours; spot at most 5 in a row.
5. **Experimental configuration.**
   - Script `ncm/volgestao.py`. It reuses the `carry.py` loader, metrics and DSR.
   - Selftest checks the σ value, the cost being charged once, the 0.10 no-trade band, and idle cash earning the
     T-bill.
   - σ is the standard deviation of hourly log spot returns over the window, annualized.
   - Decision at 00 UTC with data up to that hour; trade only if the weight changes by more than 0.10.
   - Fixed target 50% a year, chosen before running.
   - Variants registered before running, 4 per symbol, 8 in total:
     - V1: 50%/σ30d, cap 1x, spot;
     - V2: 50%/σ7d, cap 1x;
     - V3: (50%/σ30d)², cap 1x (Moreira & Muir form);
     - V4: V1 with cap 2x via the perpetual, paying funding, margin earning 0.
   - Spot variants: idle cash earns the T-bill (FRED DTB3, previous day).
6. **Baselines.** Buy & hold spot, weight 1, no interest.
7. **Execution costs.** Spot 0.11% per unit of weight traded; perp 0.06% plus funding.
8. **Results.** Excess Sharpe (annualized) and max drawdown:

   | | BTC total | BTC Sharpe 20–22 | BTC Sharpe 23–26 | BTC max DD | ETH total | ETH Sharpe 20–22 | ETH Sharpe 23–26 | ETH max DD |
   |---|---|---|---|---|---|---|---|---|
   | Buy & hold | +516% | **0.62** | 0.91 | −77% | +749% | **1.15** | 0.36 | −81% |
   | V1 σ30d | +285% | 0.32 | **0.93** | −73% | +537% | 1.10 | 0.46 | −68% |
   | V2 σ7d | +238% | 0.36 | 0.82 | −72% | +432% | 1.11 | 0.35 | −68% |
   | V3 squared | +130% | −0.05 | 0.90 | −71% | +339% | 0.95 | **0.53** | **−60%** |
   | V4 2x perp | +155% | 0.19 | 0.75 | −76% | +242% | 0.88 | 0.33 | −69% |

   - Mean weight 0.57–0.87; trades 57–325 over 6.4 years.
   - Costs 0.02–0.10 of capital on BTC and 0.05–0.32 on ETH; V2, the fast window, is always the most expensive.
   - Raw: `~/.local/share/eos-ncm/diag-kl/metricas-volgestao-{BTCUSDT,ETHUSDT}.json`; logs
     `logs/teoria3-volgestao-*.log`.
9. **Statistical uncertainty.**
   - DSR 0.87–0.97 says each variant's Sharpe is positive given 4 trials. That reflects the market going up, not an
     edge over holding.
   - The pre-registered test is the halves comparison. Sharpe differences of ±0.1 on 3 years of a 60–80%
     volatility asset are well inside noise.
10. **Failure analysis.**
    - **No variant beats buy & hold in both halves on either symbol.** On BTC, every variant is clearly worse in
      2020–22 (0.32 vs 0.62) and only ties in 2023–26. On ETH the pattern flips: slightly worse in 2020–22 and
      slightly better in 2023–26.
    - **Why it does not work here:**
      - In 2020–21 the highest-volatility weeks were the big up moves. Cutting exposure when volatility rose cut
        the upside.
      - The 2022 crash was a slow grind (−64% BTC) without extreme volatility, so the weights stayed near the cap
        and the drawdown was barely reduced (−73% vs −77% on BTC).
      - This is our own observation on two assets, not a published result for crypto.
    - It is consistent with Cederburg et al. 2020: the in-sample gain of Moreira & Muir does not reliably survive
      out of sample.
    - The only real benefit is a smaller drawdown on ETH with V3 (−60% vs −81%), paid for by less than half the
      total return.
11. **Limitations.**
    - Two symbols, one 50% target. A lower target would cut drawdown more, but the target is a free parameter that
      was deliberately not tuned.
    - Volatility from past realized returns only. The Exp 08 model forecasts 15-min volatility (R² 0.36), not daily,
      and it was not used here.
    - Long-only. A short side or a trend filter would be a different theory (theory 2).
12. **Decision classification.**
    - H1: **REJECTED** on BTC and on ETH, for all 4 variants.
    - "Vol scaling reduces drawdown": **INCONCLUSIVE.** It shows a clear reduction only on ETH with V3, and it costs
      most of the return.
    - Variants used: 8.
13. **Conclusion and next step.**
    - In BTC/ETH 2020–2026, volatility management does not improve the risk-return of simply holding.
    - Predictable volatility is not, by itself, a source of return: the volatility forecast that works (Exp 08) is
      not enough to beat holding.
    - It stays a research result; nothing goes live and the frozen test stays closed.
    - Next: theory 2, time-series momentum (Moskowitz, Ooi & Pedersen 2012; for crypto, Liu & Tsyvinski 2021).

See also: [[Theory 1 Funding Carry]], [[NCM Exp 08 Pipeline Audit]], [[Backtest Research Handoff 2026-11-09]].
