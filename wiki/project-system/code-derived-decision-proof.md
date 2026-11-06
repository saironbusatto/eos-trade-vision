---
title: Code-Derived Decision Proof
aliases:
  - Code-Derived Decision Proof
tags:
  - backend
  - verification
  - statistics
  - deterministic-rules
status: active
updated: 2026-11-04
---

# Code-Derived Decision Proof

> Sources: Backend Codebase, 2026-05-14; Local Repository Audit, 2026-11-04
> Raw: [code-derived-decision-math-verification](../../raw/project-system/2026-05-14-code-derived-decision-math-verification.md); [repo-audit-jul-2026-changes](../../raw/project-system/2026-11-04-repo-audit-jul-2026-changes.md)

## Overview

This note replaces trust in prior notation with code-derived verification. All formulas below are anchored in backend implementation and were checked with reproducible calculations.

## Entry Decision (from code)

- ML entry approval is explicitly:
  - `should_trade = score_check AND gate_pass AND (direction != NO-TRADE)`
- Deterministic pre-conditions include:
  - score floor (`min_score`),
  - hourly edge thresholds (`win_rate`, `win_rate_ci95_low`, `expectancy_ci95_low`),
  - context gates (`f_smart_money` alignment, SELL volume cap),
  - blocked symbols/hours (`BLOCKED_HOURS_UTC=1,2,3,14,22,23`, `BLOCKED_SYMBOLS=SUIUSDT,TAOUSDT,BNBUSDT,ADAUSDT` recommended),
  - [[Validated Subset Filter]] intersection gate (since 2026-07-06, default on),
  - hour/direction filter bootstrap mode when closed-trade count is zero.

## Statistical Core (from code)

- Wilson 95% interval uses:
  - `Z_95 = 1.959963984540054`
  - exact function implementation in backend.
- Hour-direction edge metrics use:
  - `expectancy = AVG(final_profit)`
  - sample variance and `CI95(expectancy) = mean ± Z_95 * (std_dev / sqrt(n))`
- Edge score normalization uses weighted terms:
  - `ciWinrateScore`, `winrateScore`, `expectancyScore`, `sampleSizeScore`
  - weighted sum `0.35/0.25/0.25/0.15`.

## Deterministic Risk and Unified Score (from code)

- `baseStop = clamp(volatility15m*100*RISK_VOL_TO_STOP_MULTIPLIER, RISK_STOP_MIN_PERCENT, RISK_STOP_MAX_PERCENT)`
- `targetPercent = clamp(baseStop*targetRatio, RISK_TARGET_MIN_PERCENT, RISK_TARGET_MAX_PERCENT)`
- Unified decision score:
  - `Q = ofa*w1 + ml*w2 + edge*w3 + regime*w4 + sentiment*w5`
  - default threshold gate: `Q >= UNIFIED_DECISION_MIN_SCORE`.

## Exit Arbitration (from code)

- Exit states: `EXIT`, `HOLD`, `MOVE_STOP`
- Decision flow:
  - ML decides directly if confidence >= `EXIT_ML_MIN_CONFIDENCE`.
  - If ML uncertain and trade age is sufficient, escalate to LLM.
  - If uncertainty remains, fallback is deterministic `HOLD`.
- Production example defaults: `EXIT_ML_MIN_CONFIDENCE=0.75`, `EXIT_LLM_MIN_CONFIDENCE=0.70`, `EXIT_LLM_TIMEOUT_MS=8000`, `EXIT_LLM_MIN_TRADE_AGE_MIN=10`, `SIGNAL_MAX_AGE_MIN=45`, `SIGNAL_TIMEOUT_LOSS_GRACE_MIN=15`.

## Reproducible Calculation Evidence

- Wilson examples and edge-score example were executed using code constants and matched expected behavior.
- Local empirical replay could not be completed in this workspace snapshot because `CLOSED_SIGNALS=0` in local DB.

> [!note] Update 2026-11-04
> Empirical data now exists: the July walk-forward used 18.207 closed production trades and showed the unfiltered strategy is ruinous under fees + compounding. See [[Validated Subset Filter]]. Formula correctness ≠ profitability.

## See Also

- [[EOS Trade Vision System Baseline]]
- [[Validated Subset Filter]]
- [[Obsidian Wiki Style Profile]]
