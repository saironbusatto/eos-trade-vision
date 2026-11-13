# Funding NCM Carry

Approved by the user on 2026-11-12. Replaces the direction-prediction goal of `ncm-live-trading.md`.

## Goal

The NCM decides a delta-neutral funding carry (long spot, short perpetual) across many symbols: which symbols, how
much in each, how much in cash. It must beat the dollar rate after real costs.

## Why

- Direction is not predictable from our data (Exp 00–08, out-of-sample R² < 0).
- Funding is: the last 3 days correlate 0.77 with the next 7 days on BTC and ETH (0.26 on SOL), data to 2026-06.
- The simple carry rules lost to the T-bill since 2022 ([[Theory 1 Funding Carry]]) for four reasons, each addressed
  below: only BTC/ETH, switching costs, the FTX-type crash, and idle cash at 0%.

## Success criterion (fixed before any result)

- Beats the T-bill **and** the phase 2 fixed rule in at least 4 of the 5 walk-forward years (2022–2026 H1).
- Max drawdown below 10%.
- Deflated Sharpe above 0.95.
- Budget: 20 variants in total for phases 2 and 3.
- Tuning until the backtest turns positive is not allowed. If the criterion fails, the result is reported as failed.

## Tasks

- [x] 1. Universe by rule, before looking at any funding: USDT perpetuals with futures and spot klines in 2020-12,
      top 30 by futures quote volume in 2020-12. Delisted symbols stay in.
      → Verify: `ncm/universo-carry.json` lists 30 symbols with the volume used.
- [x] 2. Download 1h klines (spot + futures) and funding for the universe, 2020-01..2026-06, checksum-verified.
      → Verify: per-symbol table of months and gaps in the phase 1 report.
- [x] 3. Phase 2, no model: hold the 3 symbols with the highest recent funding, monthly switch, cash at the T-bill,
      weight cap per symbol, forced exit when the funding interval shortens or a rate hits the floor.
      → Verify: yearly table vs T-bill. **Stop here if it does not beat the T-bill after costs.**
- [ ] 4. **Not run (stop rule fired).** Phase 3, NCM: inputs are funding history, spot/perp basis, volatility and the T-bill; output is the
      predicted net carry per symbol over the holding horizon; weights follow from it. Walk-forward by year (fit to
      year N, decide year N+1).
      → Verify: the success criterion above.
- [ ] 5. If it passes: freeze the candidate and open the jul–out 2026 test once (`split.abre_teste`, with the
      user's explicit ok).
- [ ] 6. A 13-item report per phase in `wiki/project-system/`.

## Status 2026-11-13: stopped at task 3

- R1 since 2022: +12.4% vs T-bill +19.9%. The stop rule fired.
- An oracle that ranks by the *next* 30 days of funding reaches only +19.0%, so a funding forecast cannot make this
  portfolio pass. Task 4 is not run.
- Report: `wiki/project-system/funding-carry-phase-1-2-rotation.md`. 4 of 20 variants used.
- Deviation: the "funding interval shortens" exit was replaced before running by "24 h funding below −0.3%".

## Done when

- [ ] The criterion is met and the frozen test confirms it, or the failure is documented at the phase where it
      stopped.

## Notes

- Research data stops at 2026-06. Jul–out 2026 is never read before task 5.
- Risk rules (weight cap, forced exit) are fixed rules, not learned.
- Main risk: the funding premium may have shrunk market-wide since 2025. Task 3 answers that.
