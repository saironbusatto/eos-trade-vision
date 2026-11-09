---
title: Theory 1 Funding Carry
aliases:
  - Theory 1 Funding Carry
tags:
  - backtest
  - theory
status: active
updated: 2026-11-08
---

# Theory 1 Funding Carry

1. **Research question.** Does a delta-neutral funding carry on BTCUSDT (long spot, short perpetual, same BTC
   amount) earn a positive, stable return after real fees, basis moves and margin needs?
2. **Hypotheses.**
   - H1: net return > 0 in most years, with small drawdowns and no liquidation.
   - H0: fees, negative funding and basis moves eat the funding income.
   - Theory source: He, Manela, Ross, von Wachter, *Fundamentals of Perpetual Futures*
     ([arXiv 2212.06888](https://arxiv.org/abs/2212.06888)), which describes this trade on Binance data and warns
     it is not risk-free. Carry as a general strategy class: Koijen, Moskowitz, Pedersen, Vrugt (2018), *Carry*,
     Journal of Financial Economics 127(2).
3. **Dataset and period.** BTCUSDT 2020-01..2026-06, hourly grid (56,952 h, 7,119 funding events) from
   [[Backtest Step 0 History Data]]. Jul–out 2026 (frozen test) not read.
4. **Data-quality audit.** Futures klines: 0 missing minutes. Spot: 2,325 missing minutes (0.06%), forward-filled
   at the hour level. Funding: every interval 8 h.
5. **Experimental configuration.**
   - Script `ncm/carry.py` (selftest: constant price → return = funding − entry cost; BTC triples → rebalances,
     equity unchanged within 1%; switch rule enters and exits once).
   - Prices: open of each hour, separately for spot and perp, so basis changes are in the P&L.
   - Funding at hour h is applied to the position held before h. Decisions use only settled rates; orders go at the
     next hour.
   - Rebalance to target when perp margin halves or doubles; liquidation counted if the hour's perp high would leave
     margin below 0.4% maintenance.
   - Variants registered before running (budget 4, no parameter fitted):
     V1 always in, 1x; V2 always in, 2x; V3 1x, in while mean of last 3 rates > 0;
     V4 1x, enter when mean of last 9 > 0.01% (Binance base rate), exit when < 0.
6. **Baselines.** Cash at 0% (no interest assumed on idle USDT; see item 11).
7. **Execution costs.** Spot 0.10% + 0.01% slippage per trade; perp taker 0.05% + 0.01%. The spot rate is Binance
   VIP0 as reported by third-party fee guides (not checked on Binance's own page); the perp rate is the Binance
   FAQ cited in [[NCM Exp 08 Pipeline Audit]]. Rebalances pay both legs on the traded amount.
8. **Results.**

   | Variant | Total | CAGR | Sharpe | Max DD | Trades / rebal. | Liquidations | Time in |
   |---|---|---|---|---|---|---|---|
   | V1 always 1x | **+49.9%** | +6.43% | 8.66 | −1.98% | 1 / 21 | 0 | 100% |
   | V2 always 2x | **+67.0%** | +8.21% | 8.41 | −3.24% | 1 / 48 | 0 | 100% |
   | V3 mean3 > 0 | +11.1% | +1.63% | 1.41 | −9.71% | 399 / 15 | 0 | 87% |
   | V4 mean9 hysteresis | +42.9% | +5.65% | 7.37 | −1.48% | 38 / 11 | 0 | 60% |

   By year (V1 / V2 / V4), with the gross funding of the year:

   | Year | Funding, annualized gross | Negative events | V1 | V2 | V4 |
   |---|---|---|---|---|---|
   | 2020 | 17.2% | 14% | +9.6% | +12.0% | +9.9% |
   | 2021 | 30.6% | 7% | +17.2% | +22.9% | +17.0% |
   | 2022 | 4.2% | 22% | +2.1% | +2.5% | −0.2% |
   | 2023 | 7.9% | 10% | +4.3% | +5.5% | +3.8% |
   | 2024 | 11.9% | 8% | +6.3% | +8.2% | +5.9% |
   | 2025 | 5.1% | 13% | +2.9% | +3.4% | +1.2% |
   | 2026 H1 | 1.1% | 38% | +0.2% | +0.2% | +0.0% |

   Raw: `~/.local/share/eos-ncm/diag-kl/metricas-carry.json`; log `logs/teoria1-carry.log`.
9. **Statistical uncertainty.**
   - Deflated Sharpe (Bailey & López de Prado 2014, N = 4 variants): V1, V2, V4 ≈ 1.000; V3 0.000.
   - The DSR only says the mean is not a selection artefact. It does not address the main risk seen here: the yield
     is a regime property (bull years pay, 2022 and 2026 almost nothing), and the trend is down.
10. **Failure analysis.**
    - V1 makes money in every year but its size follows the market: about half the gross funding at 1x, since only
      half the capital is in the short perp.
    - **V3 is the classic overtrading failure:** 399 entries and exits cost 0.40 of capital, nearly all of the 0.49
      of funding earned. Switching on a short window of rates is worse than doing nothing.
    - V4 (slow hysteresis) avoids most of that, but over the whole period it does not beat V1. It saves the bad
      stretches and also misses good ones.
    - 2026 H1: funding near zero and 38% of events negative, so the trade earned ~0.
11. **Limitations.**
    - Idle-cash return is set to 0. From mid-2023 to Sept 2024 the Federal Reserve target range was
      5.25–5.50%, and it stayed above 4% through 2025. So V1's +4.3% (2023) and +2.9% (2025) are likely below plain
      dollar cash, and 2024 (+6.3%) only slightly above. This still has to be measured with a real rate series. The fair benchmark is the dollar interest rate, not 0.
    - Not modelled: exchange/counterparty risk (the capital sits on Binance), funding computed on the perp
      price instead of the mark price, BNB fee discounts, portfolio margin.
    - Hourly checks: the real intrahour basis may be wider. The 2020–21 Binance archives may differ from what a
      trader saw live.
    - One symbol and one exchange.
12. **Decision classification.**
    - H1 for V1/V2 (always in): **SUPPORTED as a positive, low-drawdown return**, without a single liquidation.
      **Not supported as an edge over cash** in 2022–2026. That is the comparison that matters, and it still has to
      be run with a real interest-rate series.
    - V3: **REJECTED** (overtrading).
    - V4: **INCONCLUSIVE.** It cuts drawdown but not return versus V1.
13. **Conclusion and next step.**
    - The theory works as described: income comes from funding, with no price prediction, and the hedge held
      through 2020–2026 with no liquidation and drawdowns under 3.3%.
    - But the income is **mostly a bull-market phenomenon** and has fallen toward zero in 2025–2026.
    - Next, within this theory (adding to the 4-variant budget):
      - compare against a dollar rate series (US T-bill / Fed funds) instead of 0;
      - the same carry on other symbols (ETH, SOL), where funding is often higher. This needs only klines + funding.
    - It stays a research result. Nothing goes live, and the frozen test is not opened.

## Follow-up: dollar benchmark and other symbols (2026-11-08)

Two changes, the same 4 variants, nothing refit:
- **Benchmark:** the 3-month US T-bill, FRED series DTB3 (St. Louis Fed), downloaded to
  `~/.local/share/eos-ncm/raw/juros/DTB3.csv`. It is compounded daily on a 360-day basis and gives the excess
  Sharpe.
- **Symbols:** ETHUSDT (2020-01..2026-06) and SOLUSDT (2020-09..2026-06; the perpetual lists on 2020-09-14).
  - The SOL monthly futures archives lack 2022-02-26..28 and 2022-04-01..02. Those days were filled from Binance's
    daily files (checksum-verified, `futuros_klines_1m_diario/`).
  - `carry.py` now prints the longest forward-filled stretch. Perp: 0 h on all three symbols. Spot: at most 5 h.

Results (T-bill over the same window: +20.4%; SOL +20.0%):

| Symbol | V1 1x | V2 2x | V3 | V4 | V1 max DD | V1 excess Sharpe |
|---|---|---|---|---|---|---|
| BTC | +49.9% | +67.0% | +11.1% | +42.9% | −2.0% | 4.50 |
| ETH | +61.4% | +82.5% | +17.8% | +55.0% | −1.4% | 4.64 |
| SOL | **−6.3%** | **−10.7%** | −15.2% | +24.4% | **−26.7%** | −0.50 |

V1 by year against the T-bill:

| Year | T-bill | BTC | ETH | SOL |
|---|---|---|---|---|
| 2020 | +0.4% | +9.6% | +15.3% | −2.6% (from Sept) |
| 2021 | +0.0% | +17.2% | +21.9% | +12.9% |
| 2022 | +2.1% | +2.1% | +0.1% | **−20.0%** |
| 2023 | +5.3% | +4.3% | +4.4% | +0.1% |
| 2024 | +5.2% | +6.3% | +7.2% | +7.2% |
| 2025 | +4.2% | +2.9% | +2.3% | +0.2% |
| 2026 H1 | +1.8% | +0.2% | +0.1% | −0.8% |

**The SOL loss is real, not a data defect.**
- In the FTX collapse, Binance switched SOL funding to **every 2 hours**, and the rate sat at the **−2% floor per
  event** from 2022-11-09 20:00 to 11-10 12:00. November summed to −35.5% of notional.
- The V1 drawdown runs from 2022-11-09 to 2023-01-14 (−26.7%).
- This is the tail risk of the carry: when the asset itself crashes, shorts pay instead of receiving.

**Revised classification.**
- **Against cash, the carry wins only in 2020–21.** From 2022 to 2026 H1, V1 beat the T-bill in only 1 of 5 years
  on each symbol (2024), with BTC tying in 2022. Over the whole period it beats cash on BTC and ETH thanks to
  2020–21.
- H1 "positive and stable": **SUPPORTED for BTC and ETH** as low-drawdown income. **REJECTED for SOL**, where one
  event wiped out years of income.
- H1 "edge over the dollar rate since 2022": **REJECTED** on all three symbols.
- V4 (slow hysteresis) is the only variant positive on SOL (+24.4%, DSR 0.81), because it was out when the
  funding turned. That is one event, so it counts as INCONCLUSIVE, not as evidence.
- Variants used so far: 4 rules × 3 symbols = 12, within the budget.

**What would be worth testing next for this theory** (each a new hypothesis):
- Rotating to the symbol with the highest recent funding.
- An exit rule written explicitly for the tail risk, such as leaving when the funding interval shortens or a rate
  hits the floor.
- Combining it with dollar cash, for example holding T-bills when funding is below the rate.

**Correction: liquidation count.** The ETH runs flagged 1 liquidation; it was left out of the first summary by
mistake.
- It was a single 1-minute last-price print at 323 on 2020-03-13 02:39 (open 109; spot high that hour 120.2).
- Binance liquidates on the mark price, which peaked at 119.47 that hour (checksum-verified `markPriceKlines`).
- So it was **not a real liquidation**. The flag is only a counter and changes no P&L number.
- With the mark price there are 0 liquidations on all three symbols.

## Final test: V5 "carry only when funding beats the dollar rate" (2026-11-08)

- **Rule, registered before running:**
  - enter when the mean of the last 9 rates, annualized, exceeds the T-bill + 2 percentage points;
  - exit when it falls below the T-bill;
  - while out, the cash earns the T-bill;
  - each decision uses the previous day's T-bill.
- It is one variant on 3 symbols, so the theory 1 total is 15.

| Symbol | V1 always | V5 | T-bill | V5 trades | V5 cost | V5 years beating T-bill, 2022–26H1 |
|---|---|---|---|---|---|---|
| BTC | +49.9% | +39.9% | +20.4% | 175 | 0.19 | 1 of 5 (2024) |
| ETH | +61.4% | +54.7% | +20.4% | 140 | 0.17 | 1 of 5 (2024) |
| SOL | −6.3% | +28.3% | +20.0% | 164 | 0.18 | 1 of 5 (2024) |

- On BTC and ETH, V5 is **worse than always-in**. Funding crosses the T-bill line often, so V5 enters and exits
  140–175 times, and costs take 0.17–0.19 of capital.
- It still loses to cash in 2022, 2023, 2025 and 2026 H1.
- On SOL it avoids the FTX crash, as V4 did, and ends above cash only thanks to 2021.
- **V5: REJECTED** as an edge over the dollar rate.

## Final verdict on theory 1

- **The mechanism is confirmed.** Delta-neutral carry earns funding with no price prediction and no real
  liquidation in 2020–2026 H1.
- **As a strategy against holding dollars, it is rejected.** Since 2022 the 1x variants beat the T-bill in at most
  1 year out of 5 on any symbol. The best case is V2 (2x) on BTC, which beat it in 3 of 5 years (2022–24) by only
  0.2–3 percentage points, and lost in 2025 and 2026 H1. The always-in version also carries crash risk on altcoins (SOL
  −27%).
- The only regime where it clearly paid was 2020–21: near-zero rates and euphoric leverage. Its return is a bet
  that such a regime comes back.
- The only remaining use is income on USDT that sits idle on the exchange anyway (BTC/ETH only). There, the
  comparison is 0%, not the T-bill, and the exchange counterparty risk applies.
- Theory 1 is closed. Budget used: 15 variants.

Raw: `metricas-carry-{BTCUSDT,ETHUSDT,SOLUSDT}.json`, logs `teoria1-carry-*.log`. The first BTC run's
`metricas-carry.json` is superseded by `metricas-carry-BTCUSDT.json` (same numbers).

See also: [[Backtest Step 0 History Data]], [[NCM Exp 08 Pipeline Audit]].
