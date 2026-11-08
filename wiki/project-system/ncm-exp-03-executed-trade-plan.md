---
title: NCM Exp 03 Executed Trade Plan
aliases:
  - NCM Exp 03 Executed Trade Plan
tags:
  - ncm
  - experiment
status: active
updated: 2026-11-07
---

# NCM Exp 03 Executed Trade Plan

[[NCM Exp 02 KL Diagnostic]] with one structural change: the 45-minute plan represents only the trade the bot
executes.

1. **Research question.** If the plan encodes only the executed trade, does the entry decision move to the coarse
   tokens, and does the policy then learn better entries?
2. **Hypotheses.**
   - H1a: level-1 entropy changes during GRPO, meaning the coarse concept now carries the decision.
   - H1b: the mean net result per entry rises during training.
   - H0: neither happens.
3. **Dataset and period.** Train fev–mai for the tokenizer, warm-up and GRPO. June is used only to measure
   tokenizer reconstruction (as in run 1); no trading evaluation in June, so no version is spent. The test is
   untouched.
4. **Data-quality audit.** Same as [[NCM Exp 00 GRPO Run 1]].
5. **Experimental configuration.**
   - Scripts `ncm/exp_operacao.py` and then `ncm/diagnostico_grpo.py --partida modelo-op`, commit `ea55394`, seed 0.
   - Plan = `[side]*dur + [0]*(45-dur)`: 91 possible plans.
   - Warm-up target = the best single entry in hindsight, over every side × hold of 1..45 min net of fees,
     "flat" if none pays.
   - Tokenizer trained on the 91 plans, 6000 steps.
   - Warm-up 3000 steps.
   - GRPO exactly as in Exp 02: 32 groups × 8 plans, LR 3e-5, β = 0.1, 1000 steps.
6. **Baseline.** Exp 02 (old plan representation, same GRPO). Its result per entry stayed at −0.11%.
7. **Execution costs.** Same reward (taker + slippage on both legs).
8. **Results.**
   - Warm-up target: some entry pays the fees in hindsight in 92.8% of minutes; 50% long; median hold 33 min.
   - Tokenizer: 91/91 plans reconstructed exactly; 100% per position on the June targets.

   | Step | Entry rate | All-flat groups | Net per entry | KL | Entropy L1 / L45 | Gradient norm |
   |---|---|---|---|---|---|---|
   | 1 | 89.5% | 0% | −0.187% | 0.0 | 1.64 / 0.06 | 280 |
   | 200 | 85.8% | 0% | −0.113% | 3.8 | 1.61 / 0.06 | 201 |
   | 350 | 47.3% | 11% | −0.108% | 56.0 | 1.16 / 0.22 | 135 |
   | 400 | 27.9% | 25% | −0.113% | 90.6 | 0.81 / 0.24 | 165 |
   | 600 | 16.7% | 34% | −0.119% | 82.2 | 0.46 / 0.17 | 89 |
   | 1000 | 17.2% | 30% | −0.113% | 86.6 | 0.49 / 0.36 | 67 |

   Raw data: `~/.local/share/eos-ncm/diag-kl/metricas-modelo-op-beta0.1.json`, log `logs/exp3-operacao.log`,
   models in `modelo-op/`.
9. **Statistical uncertainty.** Late in the run each 50-step window holds about 2,700 entries, so the per-entry mean
   is accurate to about ±0.005%. A flat −0.11% is a real plateau, not noise.
10. **Failure analysis.**
    - H1a holds. Level-1 entropy fell from 1.64 to 0.49, so the policy now changes its coarse concept. In Exp 02
      it stayed at 3.81.
    - H1b fails again. After the first 50 steps (where it went from −0.19% to −0.11%), the result per entry stays
      at −0.11% to −0.12%, while the entry rate falls from 90% to 17%. Same pattern as Exp 02: the policy trades
      less, not better.
    - The KL brake did not hold here. KL went from 0 to about 85 nats: with advantages of about 2 (three times
      Exp 02), β = 0.1 is too weak, and the policy moved far from the warm-up model.
    - Interpretation: two different plan representations give the same plateau. The bottleneck is likely the
      learning signal, not the representation. A per-entry standard deviation of about 0.2% against an edge
      that exists only in rare minutes is too noisy for policy gradients built from 8 samples per minute. Ridge
      found that edge by regressing the exact result of every action on every minute.
11. **Limitations.**
    - One seed, one β, 1000 steps.
    - The warm-up target enters 93% of the time, which is still very far from a selective policy.
12. **Decision classification.**
    - H1a, decision moved to coarse tokens: SUPPORTED.
    - H1b, better entries: REJECTED within 1000 steps under this setup. That makes two structures with the same
      plateau.
    - KL β = 0.1 adequate for this representation: REJECTED.
13. **Recommended next experiment.** Use full information instead of sampling. The plan space is now only 91
    plans, and the simulator gives the exact result of each.
    - Replace the sampled GRPO with the exact expected reward, Σ π(plan)·R(plan) over the 91 plans, plus KL.
    - Every minute then gives a gradient for every action, with no sampling noise.
    - This tests whether the NCM can learn the signal at all.
    - Keep the same 1000 steps, train data only, and the same primary metric (net result per entry).

See also: [[NCM Exp 01 GRPO Review]], [[Signal Check BTC]], [[NCM Handoff 2026-11-05]].
