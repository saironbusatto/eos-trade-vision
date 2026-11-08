---
title: NCM Exp 00 GRPO Run 1
aliases:
  - NCM Exp 00 GRPO Run 1
tags:
  - ncm
  - experiment
status: active
updated: 2026-11-06
---

# NCM Exp 00 GRPO Run 1

First full NCM training by net PnL (task 7 of `ncm-live-trading.md`). Validation report in the `eos-validation`
format.

1. **Research question.** Can the NCM, trained by reward (GRPO) instead of imitation, learn when to enter BTCUSDT
   futures trades that pay the fees?
2. **Hypothesis.** H0: the policy does no better than "never trade" in June. H1: it beats "never trade" net of
   fees.
3. **Dataset and period.** Train fev–mai 2026 (171,240 minutes); validation June (43,156). The frozen test
   (07/jul–out) is not touched. 01–06/jul is excluded.
4. **Data-quality audit.** Photos have no look-ahead (`ncm/teste_replay.py`); 0 NaN; every minute has a full
   46-open window.
5. **Experimental configuration.** `ncm/treino.py` at commit `a9aa2aa`, seed 0. Stages:
   - VQ-VAE tokenizer, 6000 steps;
   - imitation warm-up of `melhor_plano`, 3000 steps;
   - GRPO, 8000 steps, 32 groups x 8 plans, LR 3e-5, reward x1000.

   Photo compressed to 16 prefix tokens. June evaluated every 500 steps: two modes x five thresholds.
6. **Baseline.** "Never trade" (0%) and the task 6 rules (all lose after fees).
7. **Execution costs.** Taker 0.05% per leg, slippage 0.01% per leg, funding charged in the June evaluation.
   Entry at the open of the candle after the decision.
8. **Results.**
   - Tokenizer: 100% reconstruction.
   - Warm-up model in June: PF 0.28–0.46, from −9% to −91% at thresholds 0.5–0.7. The one positive cell was 11
     trades, +1.0%, at threshold 0.8.
   - GRPO entry rate: 33% at step 0, 5% at step 100, 0% at step 200. From then on there were zero trades in
     June at every evaluation (16 of them).
9. **Statistical uncertainty.** The only positive June cell has 11 trades and was selected among 10 cells. That is
   noise.
10. **Failure analysis.** Once all K plans of a group are "flat", every reward is identical, the advantage is 0 and
    the gradient is gone. The policy collapsed and never explored again. The log shows reward +0.0000% for the
    remaining 7800 steps.
11. **Limitations.** One seed. No KL or entropy term. Evaluation was in June only.
12. **Decision classification.** INVALID TEST for the question "does the NCM find an edge". The training process
    stopped learning; it did not choose not to trade on evidence.
13. **Recommended next experiment.** Review the GRPO math, then run a controlled diagnostic with a KL brake. See
    [[NCM Exp 01 GRPO Review]].

Versions seen in June: 170. Artifacts: `~/.local/share/eos-ncm/modelo/`, log `logs/treino-btc.log`.

See also: [[NCM Handoff 2026-11-05]], [[Signal Check BTC]].
