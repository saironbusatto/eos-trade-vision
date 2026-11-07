---
title: NCM Exp 04 Exact Expected Reward
aliases:
  - NCM Exp 04 Exact Expected Reward
tags:
  - ncm
  - experiment
status: active
updated: 2026-11-07
---

# NCM Exp 04 Exact Expected Reward

[[NCM Exp 03 Executed Trade Plan]] with one change: the sampled GRPO is replaced by the exact expected reward over
the 91 possible plans.

1. **Research question.** Exp 02 and 03 hit the same plateau. Was the cause sampling noise? With full information
   (the exact result of every plan on every minute), does the NCM learn better entries?
2. **Hypotheses.**
   - H1: the net result per entry of sampled plans rises during training.
   - H0: it does not.
3. **Dataset and period.** Train fev–mai only. No June and no test.
4. **Data-quality audit.** Same as [[NCM Exp 00 GRPO Run 1]].
5. **Experimental configuration.**
   - Script `ncm/exp_esperanca.py`, commit `7bb7b4e`, seed 0.
   - Starting point: `modelo-op` warm-up, the same as Exp 03.
   - For each minute, log p of the canonical codes of all 91 plans, renormalized into π.
   - Loss = −Σ π(plan)·R(plan) + β·KL(π ‖ π_warm-up), with R exact from `rotulos.recompensa_lote` (x1000) and
     β = 0.1.
   - 8 minutes per step (two passes of 4 x 91 sequences), LR 3e-5 on the same curve, 1000 steps.
   - Every 50 steps, 32 x 8 plans are also sampled to measure what the bot would execute.
6. **Baseline.** Exp 03: sampled entries flat at −0.11% per entry.
7. **Execution costs.** Same reward (taker + slippage on both legs).
8. **Results.**

   | Step | Exact: P(enter) | Exact: expected per entry | KL | Canonical mass | Gradient norm | Sampled: entry rate | Sampled: net per entry |
   |---|---|---|---|---|---|---|---|
   | 1 | 94.4% | −0.144% | 0.00 | 0.52 | 11.6 | 87.1% | −0.058% |
   | 100 | 51.2% | −0.116% | 1.06 | 0.54 | 7.8 | 41.0% | −0.098% |
   | 150 | 1.7% | −0.111% | 3.67 | 0.67 | 1.4 | 21.9% | −0.180% |
   | 200 | 0.1% | −0.123% | 3.68 | 0.73 | 0.1 | 21.1% | −0.127% |
   | 500 | 0.0% | −0.134% | 3.91 | 0.76 | 0.0 | 19.1% | −0.141% |
   | 1000 | 0.0% | −0.143% | 3.79 | 0.77 | 0.0 | 15.2% | −0.121% |

   Run time 357 s. Raw data: `~/.local/share/eos-ncm/diag-kl/metricas-exp04-esperanca.json`, log
   `logs/exp4-esperanca.log`.
9. **Statistical uncertainty.** Each sampled measurement is a single batch of 256 plans with about 40 entries, so
   it carries about ±0.03%. The sampled per-entry numbers (−0.04% to −0.25%) are noise around the cost; no trend
   is visible.
10. **Failure analysis.**
    - Same collapse, now with the exact gradient: π(flat) goes to 1 by step 150–200.
    - Then the gradient vanishes (norm 0.0). Under a saturated softmax, ∂/∂logit of Σπ·R is π(a)·(R(a) − E[R]),
      which is about 0 for every plan.
    - The closed-form optimum of this loss is π ∝ π_warm-up·exp(R/β). Average entries lose about −0.12%, which is
      −1.2 in scaled units, so every entry gets a factor of about e^−12. The policy can only keep an entry where
      it already predicts a positive R.
    - It reaches that point after seeing only about 1,200 minutes, learning the global prior that trading loses,
      and saturates before it can learn the rare exceptions.
    - Design flaw found: the renormalized π only controls the canonical codes. 23% of the probability mass sits on
      other code sequences (canonical mass 0.77). Those still decode to entries, which is why the sampled policy
      keeps entering 15–20% of the time with uncontrolled quality.
11. **Limitations.**
    - The design flaw above.
    - 8,000 minutes seen in total, against the 171,240 available (ridge uses all of them).
    - One seed and one β.
12. **Decision classification.**
    - H1: REJECTED in this form.
    - Partly INVALID TEST for the sampled metric, because of the uncontrolled non-canonical mass.
    - The collapse mechanism (softmax saturation after learning the "trading loses" prior): SUPPORTED.
13. **Conclusion across Exp 02–04.** Three policy-style objectives (sampled with KL, sampled with a new
    representation, exact) all learn the global prior "trading loses" and stop. Ridge found its signal with a
    different formulation: value regression, predicting the result of every action and trading only above a
    threshold. Regression does not saturate.

    **Recommended next experiment (Exp 05):** use the NCM as a value model instead of a policy.
    - Same photo encoder and transformer.
    - Supervised regression of the exact result of each action over all training minutes.
    - Then act only above a threshold, exactly as ridge does.
    - Compare against ridge on an internal split (train fev–abr, check on mai), so June stays untouched.

See also: [[NCM Exp 02 KL Diagnostic]], [[Signal Check BTC]], [[Candidate Ridge BTC]], [[NCM Handoff 2026-11-05]].
