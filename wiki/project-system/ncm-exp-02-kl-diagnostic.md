---
title: NCM Exp 02 KL Diagnostic
aliases:
  - NCM Exp 02 KL Diagnostic
tags:
  - ncm
  - experiment
status: active
updated: 2026-11-06
---

# NCM Exp 02 KL Diagnostic

A controlled 1000-step GRPO diagnostic. It is run 1 with one change: a KL brake to the warm-up model.

1. **Research question.** Does a KL term stop the collapse to "never trade", and does the policy then learn to
   pick better entries?
2. **Hypotheses.**
   - H1a: the entry rate stays above 0.
   - H1b: the mean net result per entry rises during training.
   - H0: the entry rate falls to 0, or the result per entry does not improve.
3. **Dataset and period.** Train fev–mai only. June is not evaluated, so no version is spent, and the test is
   untouched.
4. **Data-quality audit.** Same as [[NCM Exp 00 GRPO Run 1]].
5. **Experimental configuration.**
   - Script `ncm/diagnostico_grpo.py`, written on top of commit `5475033`, seed 0.
   - Same starting point as run 1: warm-up checkpoint and tokenizer.
   - Same batch (32 groups x 8 plans), LR 3e-5 with the same cosine curve, reward x1000, gradient clip 1.0.
   - The only change: the loss adds β·KL, with β = 0.1, k3 estimator per token, summed over the 58 tokens,
     measured against the frozen warm-up model.
   - Metrics are averaged over every 50 steps.
6. **Baseline.** Run 1, which had the same setup without KL: 33% entry at step 0, 5% at step 100, 0% at step 200.
7. **Execution costs.** Same reward as run 1 (taker + slippage on both legs).
8. **Results.**

   | Step | Entry rate | All-flat groups | Net per entry | KL | Entropy L1 / L45 | Gradient norm |
   |---|---|---|---|---|---|---|
   | 1 | 32.0% | 9% | −0.103% | 0.00 | 3.81 / 0.65 | 59 |
   | 100 | 20.2% | 24% | −0.114% | 1.21 | 3.83 / 0.69 | 52 |
   | 200 | 7.9% | 55% | −0.115% | 1.93 | 3.80 / 0.74 | 34 |
   | 400 | 2.9% | 81% | −0.118% | 2.35 | 3.82 / 0.74 | 20 |
   | 700 | 3.6% | 76% | −0.114% | 2.81 | 3.82 / 0.71 | 24 |
   | 1000 | 2.8% | 80% | −0.108% | 2.66 | 3.81 / 0.72 | 22 |

   Run time was 276 s on the RTX 5060. Raw data: `~/.local/share/eos-ncm/diag-kl/metricas-beta0.1.json` and
   log `logs/diag-kl-beta0.1.log`.
9. **Statistical uncertainty.** Late in the run each 50-step window holds about 550 entries. With a standard
   deviation of about 0.2%, the error on the per-entry mean is about ±0.01%, so a rise of 0.05% or more would
   have been visible.
10. **Failure analysis.**
    - The KL holds the entry rate at about 2.8% from step 400 on, so the policy did not collapse.
    - The net result per entry stays at −0.11% from start to end. The policy learned to trade less, not to trade
      better.
    - Level-1 entropy did not move (3.81), so the coarse concept is unchanged. The decision keeps living in the
      fine tokens, as [[NCM Exp 01 GRPO Review]] found.
    - For reference, on the same training data the ridge model's 1% most confident minutes average +0.19% per
      entry ([[Signal Check BTC]]), so selective entries do exist.
11. **Limitations.**
    - One β value and one seed.
    - 1000 steps, about 12% of a full run.
    - The learning rate is still in warm-up for the first 300 steps.
12. **Decision classification.**
    - H1a, the KL prevents collapse: SUPPORTED.
    - H1b, the policy learns better entries: INCONCLUSIVE, with evidence against (no change in 1000 steps).
13. **Recommended next experiment.** One variable again: make the plan represent only the executed trade. See
    [[NCM Exp 03 Executed Trade Plan]].

See also: [[NCM Handoff 2026-11-05]].
