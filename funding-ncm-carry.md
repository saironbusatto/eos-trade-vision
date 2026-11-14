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
- [x] 4. **Run under option 1 (L2·C0); criterion not met.** Phase 3, NCM: inputs are funding history, spot/perp basis, volatility and the T-bill; output is the
      predicted net carry per symbol over the holding horizon; weights follow from it. Walk-forward by year (fit to
      year N, decide year N+1).
      → Verify: the success criterion above.
- [ ] 5. If it passes: freeze the candidate and open the jul–out 2026 test once (`split.abre_teste`, with the
      user's explicit ok).
- [x] 6. A 13-item report per phase in `wiki/project-system/`.

## Status 2026-11-13: stopped at task 3

- R1 since 2022: +12.4% vs T-bill +19.9%. The stop rule fired.
- An oracle that ranks by the *next* 30 days of funding reaches only +19.0%, so a funding forecast cannot make this
  portfolio pass. Task 4 is not run.
- Report: `wiki/project-system/funding-carry-phase-1-2-rotation.md`. 4 of 20 variants used.
- Deviation: the "funding interval shortens" exit was replaced before running by "24 h funding below −0.3%".

## Option 1 (user's choice, 2026-11-13): new cost and capital structure

Registered before running anything.

- **Structures:** perp leverage L in {1, 2, 3} (share of capital earning funding: 50%, 67%, 75%) × costs {C0, C1}.
  - C0: spot 0.11%, perp 0.06% per leg (taker + slippage), as before.
  - C1: fees paid in BNB and the perp leg as a maker order. Spot 0.075% + 0.01% slippage; perp 0.018% (Binance
    fee pages: spot 0.1% with 25% BNB discount; USDⓈ-M maker 0.02% with 10% BNB discount). The maker fill is
    assumed, which is optimistic.
- **Liquidation becomes a real loss**, checked on the hourly **mark price** high (last-price high where mark data
  is missing): the margin is lost and the spot leg is sold at the next open.
- **Step A, diagnostic:** the perfect-foresight oracle (top 3 monthly) for each structure. A structure "has room"
  if the oracle beats the T-bill by at least 5 points over 2022..2026-06, with no liquidation and max drawdown
  below 10%.
- **Step B:** take the first structure with room in the order L1·C1, L2·C0, L2·C1, L3·C0, L3·C1 and run R1 under it
  (1 variant). Phase 3 (NCM) then runs under that structure only, with the original success criterion.
- **If no structure has room, funding carry is closed for good.**
- Cash outside positions already earns the T-bill, so there is no extra "idle cash yield" lever.

## Option 1 result (2026-11-13) and phase 3 design, registered before training

- Step A: oracle since 2022 vs T-bill +19.9%: L1·C0 +19.0%, L1·C1 +22.1%, L2·C0 +25.1%, L2·C1 +29.9%, L3·C0 +27.9%,
  L3·C1 +33.7%. No liquidation on mark price in any. First structure with room: **L2·C0**.
- Step B: R1 under L2·C0 = +16.2% since 2022, below the T-bill. Variants used so far: 5 of 20.
- **Phase 3 runs under L2·C0 only.** The portfolio rule is R1's (top 3 monthly, 1/3 each, forced exit); only the
  ranking changes: the model's predicted funding for the next 30 days replaces the last-30-day mean, and a symbol is
  taken only if the prediction exceeds the T-bill.
- Samples: one per symbol per day, 2020..2026-06; target = funding summed over the next 30 days.
- Features, all known at 00 UTC of the decision day: mean funding over 1/3/7/14/30/90 days, its 30-day standard
  deviation and share of negative days, spot/perp basis (now and 7-day mean), volatility and return over 7 and 30
  days, T-bill, the symbol's rank and gap to the universe's mean funding, and the universe's 7-day mean funding.
- Walk-forward: for each test year Y in 2022..2026, fit only on samples whose 30-day target ends before 1 Jan Y.
- Two model variants (total 7 of 20):
  - M1: ridge, λ = 10, fixed.
  - M2: the NCM-style value network, sized for ~60k samples: a transformer (2 layers, 64 dims, 4 heads) over the
    last 90 daily tokens (funding, basis, return, |return|) plus the context features; Huber loss; the checkpoint is
    chosen on the last 90 days of the fit window; prediction = mean of seeds 0, 1, 2.
- Success criterion unchanged: beats the T-bill and R1 (L2·C0) in at least 4 of the 5 years, max drawdown below 10%,
  Deflated Sharpe above 0.95.

## Final status 2026-11-13: criterion not met

- Under L2·C0 since 2022: T-bill +19.9%, R1 +16.2%, M1 ridge +21.8% (2 of 5 years won), M2 NCM network +19.7%
  (1 of 5), oracle +25.1%.
- 2025 and 2026 are lost even by the oracle, so "4 of 5 years" is out of reach in this universe.
- Task 4 is done and failed; task 5 is not run and the frozen test stays closed. 7 of 20 variants used.
- Report: `wiki/project-system/funding-carry-phase-3-model.md`.

## Option 2 (user's choice, 2026-11-13): carry as a regime strategy

Registered before running. Structure L2·C0, same simulator, data to 2026-06.

- **Regime signal,** checked every Monday 00 UTC: the universe's mean funding of the last 30 days (annualized),
  times the share of capital that earns it (2/3 at 2x), minus the T-bill.
  - Turn ON when it is above +2 percentage points; turn OFF when it is below 0.
  - OFF: everything in cash at the T-bill. ON: positions are re-ranked on the turn-on day and on the first Monday
    of each month. The forced exit stays.
- **Variants (3; total 10 of 20):**
  - G1: top 3 by last-30-day funding, each only if above the T-bill.
  - G2: BTC and ETH only, half each.
  - G3: all available symbols, equal weights.
- **Criterion, new,** because an OFF strategy earns the T-bill and cannot beat it in OFF years. Over 2022..2026-06:
  - total at least 5 points above the T-bill;
  - no year more than 0.5 point below the T-bill;
  - max drawdown below 10%;
  - Deflated Sharpe of the excess return above 0.95.
- With fewer than 10 separate ON episodes, a pass is classified PROMISING at most, not SUPPORTED.
- 2021 is reported as context and does not count for the criterion.

## Option 2 result (2026-11-13): criterion missed by 0.1 point

- Since 2022 (T-bill +19.9%): G1 +24.8% (margin +4.9, threshold +5.0), G2 +24.0%, G3 +23.1%. Worst year −0.2 point
  vs the T-bill; max drawdown 0.3%. G3 had 5 liquidations.
- Only 3 turn-ons since 2022, so the finding is PROMISING at most. 10 of 20 variants used.
- Report: `wiki/project-system/funding-carry-regime.md`.

## Paper monitor (2026-11-14)

- `ncm/monitor_carry.py` logs the regime decision every Monday (systemd user timer `eos-carry-monitor.timer`).
- It reads data from 2026-11-01 on; first signal 2026-12-07. No orders, no money.
- Details in `wiki/project-system/funding-carry-regime.md`.

## Done when

- [x] The criterion is met and the frozen test confirms it, or the failure is documented at the phase where it
      stopped.

## Notes

- Research data stops at 2026-06. Jul–out 2026 is never read before task 5.
- Risk rules (weight cap, forced exit) are fixed rules, not learned.
- Main risk: the funding premium may have shrunk market-wide since 2025. Task 3 answers that.
