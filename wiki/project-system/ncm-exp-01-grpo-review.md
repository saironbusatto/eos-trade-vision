---
title: NCM Exp 01 GRPO Review
aliases:
  - NCM Exp 01 GRPO Review
tags:
  - ncm
  - experiment
status: active
updated: 2026-11-06
---

# NCM Exp 01 GRPO Review

A read-only check of whether the GRPO and the reward can mathematically learn to find good entries, done before
spending another training run. It loads the warm-up model from [[NCM Exp 00 GRPO Run 1]] and never takes an
optimizer step. The script was a scratch file; this page records its results.

1. **Research question.** Is the run 1 collapse caused by a bug, by the reward scale, or by the problem itself?
2. **Hypothesis.** H0: the implementation is correct and the collapse is the rational answer to the entries it
   samples. H1: there is an implementation or scale error.
3. **Dataset and period.** Train fev–mai only, with random batches. No June, no test.
4. **Data-quality audit.** Same as Exp 00.
5. **Experimental configuration.** Run 1 warm-up checkpoint (step 0) and tokenizer; batches of 16 groups x 16
   plans.
6. **Baseline.** Not applicable (audit).
7. **Execution costs.** Same reward as training: `rotulos.recompensa_lote`, taker and slippage on both legs.
   It is tested to equal `rotulos.posicoes`.
8. **Results.**

   | Check | Result |
   |---|---|
   | Sampling | full softmax (`top_k=0`, `top_p=1.0`): unbiased |
   | Training log-prob vs generation | argmax equal on 100% of the 58 tokens |
   | Entries sampled by the warm-up model | 35–39% of plans; mean −0.11% net, standard deviation 0.15–0.23%, 17% positive, median hold 9–11 min, 50% long |
   | Ceiling of the samples | best of 16 per group averages +0.057%; 56% of groups contain any positive entry |
   | Log-prob by level (1/3/9/45) | −3.8 / −7.4 / −13.4 / −36.8; entropy per token 3.83 / 2.38 / 1.31 / 0.70 |
   | Advantage | mean 0.65, max 5.3 (units of 0.1%) |
   | Gradient norm | 57.5 before clipping to 1.0 |
   | Resampling only level 1 | changes the entry side in 6.6% of plans |
   | Resampling only level 45 | changes the side in 16.8% and the hold time in 19.5% |

9. **Statistical uncertainty.** Batches of 256 plans, so the shares are rough to about ±3 points.
10. **Failure analysis.**
    - The implementation is correct.
    - The entries the warm-up model samples carry no edge: −0.11% is about the 0.12% round-trip cost. "Flat"
      therefore wins every group, and the policy is right to drift there.
    - Structural problem: the decision the bot executes (side at minute 0, hold time) lives in the fine tokens,
      not the coarse ones. The reward credit is spread over 58 tokens, and the 45 fine ones dominate the
      log-prob.
    - Scale: the gradient is clipped on every step and Adam normalizes the update, so the learning rate sets the
      step size, not the reward scale.
11. **Limitations.** A single checkpoint (the warm-up model); one random batch per check.
12. **Decision classification.**
    - Implementation correct: SUPPORTED.
    - Collapse explained by entries with no gross edge plus lost exploration: SUPPORTED.
    - "The decision lives in the fine tokens": SUPPORTED for this tokenizer.
13. **Recommended next experiment.** Add a KL brake to the warm-up model and change nothing else. See
    [[NCM Exp 02 KL Diagnostic]].

See also: [[NCM Handoff 2026-11-05]].
