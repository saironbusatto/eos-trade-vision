# Code-derived Decision Math Verification

> Source: Local backend code (`eos-telegram-bot/src/*.ts`, `eos-telegram-bot/ml/infer.py`) and local DB check (`eos-telegram-bot/data/eos.db`)
> Collected: 2026-05-14
> Published: Unknown

## Evidence Commands and Outputs

1) Wilson + edge score reproductions (same constants from code):
- `WILSON_EX1 wins=49 n=100 low/high= 0.3942199893044113 0.5865198806597283`
- `WILSON_EX2 wins=157 n=300 low/high= 0.466878323217167 0.5791983381256874`
- `EDGE_SCORE_EX= 0.45315`

2) Local DB availability:
- `DB_FOUND=eos-telegram-bot/data/eos.db`
- `CLOSED_SIGNALS= 0`
- `ROWS= 0`

Interpretation:
- Formula-level verification is reproducible from code constants and equations.
- Empirical validation against local historical trades is not possible in this environment right now because there are no closed signals in the local DB snapshot.

## Code Anchors Used

- `eos-telegram-bot/src/sqliteDatabase.ts`
  - Wilson constant and function (`Z_95`, `wilson95`)
  - Edge matrix expectancy/CI95/std-dev calculations
- `eos-telegram-bot/src/trendingScanner.ts`
  - Risk and target deterministic equations
  - Edge score and unified score equations
  - Deterministic gating thresholds
- `eos-telegram-bot/ml/infer.py`
  - `should_trade = score_check AND gate_pass AND direction != NO-TRADE`
- `eos-telegram-bot/src/exitDecisionEngine.ts`
  - Exit arbitration thresholds for ML/LLM confidence and fallback HOLD
