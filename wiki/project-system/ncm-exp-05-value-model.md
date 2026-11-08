---
title: NCM Exp 05 Value Model
aliases:
  - NCM Exp 05 Value Model
tags:
  - ncm
  - experiment
status: active
updated: 2026-11-07
---

# NCM Exp 05 Value Model

The NCM-sized transformer used as a **value model** (predict the result of each action, trade above a threshold)
instead of a policy, compared with ridge on an internal split. Proposed in [[NCM Exp 04 Exact Expected Reward]].

1. **Research question.** Policy objectives collapse (Exp 02–04), and ridge found its June signal by value
   regression. With the same value formulation, does the NCM's photo encoder and transformer predict the result of
   an entry better than ridge, out of sample?
2. **Hypotheses.**
   - H1: the network's predictions beat ridge in May (lower loss, better result in the most confident 1%, better
     result at the thresholds).
   - H0: no difference, or neither beats a constant prediction.
   - Implicit H2, tested on the side: the ridge edge seen in June shows up again in a different month.
3. **Dataset and period.**
   - BTCUSDT train part only.
   - Fit on fev–abr: 126,600 minutes.
   - Check on mai: 44,596 minutes.
   - Embargo: 44 minutes removed (45-min windows crossing 01/05).
   - **June and the test (07/jul–out) untouched.** Adds no version to the 180 seen in June.
4. **Data-quality audit.**
   - Same photos as [[NCM Exp 00 GRPO Run 1]]: no-future replay, 0 NaN; windows with gaps already dropped by
     `treino.dados`.
   - Raw photos are matched to the training minutes by timestamp. A check stops the run if the order differs.
   - Normalization (mean/std, clip ±5) is computed on fev–abr only, so May does not leak into the scaling.
5. **Experimental configuration.**
   - Script `ncm/exp_valor.py` (written on top of commit `1d43d73`, committed with this report).
   - Targets: `sinal.resultados`, the exact net log result of 8 entries (long/short x 5/15/30/45 min, taker and
     slippage on both legs), x1000.
   - Network:
     - front-end: `treino.Foto` (205 features → 16 tokens of 256);
     - body: TransformerEncoder with 6 layers, 4 heads, ff 1024, dropout 0.1, pre-norm;
     - head: mean pool → 8 outputs.
   - Training: Huber loss, AdamW (LR 3e-4, wd 1e-2), batch 512, bf16, grad clip 1.0, 10 epochs, seeds 0/1/2.
   - Checkpoint: the epoch with the lowest **May loss**, not the best profit.
   - Ridge: `sinal.pesos_ridge` (λ 100) on the same fev–abr data.
   - Decision, the same for both models:
     - take the best predicted entry;
     - enter if the prediction is at or above the threshold (0, 0.05, 0.10, 0.20, 0.30%);
     - one position at a time with funding charged (`treino.opera`).
6. **Baselines.**
   - "Never trade" = 0%.
   - A constant prediction (fev–abr mean of each action) for the loss.
   - Ridge.
7. **Execution costs.** Taker 0.05% + slippage 0.01% per leg, funding charged, entry at the next candle's open.
8. **Results (May).**

   May loss (Huber, lower is better):

   | Predictor | May loss |
   |---|---|
   | zero | 1.299 |
   | **constant: fev–abr mean** | **0.919** |
   | network seed 2 (epoch 1) | 0.938 |
   | network seed 1 (epoch 1) | 0.946 |
   | ridge | 0.949 |
   | network seed 0 (epoch 2) | 0.956 |

   Simulated trading:

   | Model | 1% most confident: per entry | positive | long | thr 0% | thr 0.05% | thr 0.10% | thr 0.20% | thr 0.30% |
   |---|---|---|---|---|---|---|---|---|
   | ridge | −0.120% | 32% | 78% | 252t PF 0.36 −22.2% | 36t PF 0.35 −4.8% | 10t PF 0.32 −1.6% | 2t PF 1.80 +0.2% | 0t |
   | network s0 | −0.089% | 39% | 63% | 461t PF 0.38 −39.2% | 247t PF 0.52 −17.7% | 129t PF 0.52 −10.0% | 37t PF 0.70 −2.0% | 8t PF 0.26 −1.6% |
   | network s1 | −0.074% | 35% | 53% | 295t PF 0.44 −25.0% | 129t PF 0.53 −9.7% | 51t PF 0.53 −5.1% | 12t PF 0.30 −1.3% | 3t PF 2.75 +0.1% |
   | network s2 | −0.050% | 44% | 48% | 126t PF 0.50 −8.9% | 17t PF 1.27 +0.5% | 3t PF 0.93 −0.0% | 0t | 0t |

   Context:
   - The average May entry loses −0.12% (about the round-trip cost), with no difference between long and short.
   - BTC fell 3.1% in May.
   - In hindsight a positive entry existed in 71% of May minutes.
   - Total run time 265 s on the RTX 5060.

   Raw data: `~/.local/share/eos-ncm/diag-kl/metricas-exp05-valor.json`, log `logs/exp5-valor.log`.
9. **Statistical uncertainty.**
   - The most confident 1% is about 446 minutes per model. Those minutes overlap heavily (45-min windows), so the
     effective sample is far smaller.
   - Every model's 1% sits at or below the cost line. The −0.05% to −0.12% spread across models is within the seed
     noise: the three network seeds alone span −0.05% to −0.09%.
   - The few positive cells (ridge 0.20%: 2 trades; s1 0.30%: 3 trades; s2 0.05%: 17 trades) are too small to mean
     anything, and they do not agree across seeds.
10. **Failure analysis.**
    - **No model beats the constant prediction in May.** The fev–abr mean (0.919) has a lower loss than ridge and
      all three seeds. The features carry no out-of-sample information about the next-45-min result that survives
      from fev–abr to mai.
    - The network overfits from epoch 2: May loss rises steadily to ~1.13 by epoch 10, while train loss keeps
      falling. The chosen checkpoints are epochs 1–2, which are almost a constant.
    - The network's predictions are spread more widely than ridge's, so it crosses the thresholds more often and
      loses more money. Its "confidence" is noise.
    - The ridge signal seen in June does **not** repeat in May, with the same formula, a slightly shorter fit window
      and a different check month. The June result in [[Signal Check BTC]] is most likely luck or a June-specific
      regime.
11. **Limitations.**
    - One check month (May), one symbol, one action set (8 entries).
    - May (−3.1%) differs from June (−20.5%) in regime. A signal could exist only in strong trends, but that would
      be a new hypothesis chosen after looking.
    - The network was not tuned (LR, depth, regularization), on purpose, to keep one variable. More regularization
      would push it toward the constant, which already does not trade.
    - The photo encoder is the same linear projection as in the NCM runs, so this does not test other encoders.
12. **Decision classification.**
    - H1 (network beats ridge): **REJECTED.** Both models are at or below the constant baseline, and neither trades
      profitably.
    - H2 (the ridge edge repeats in another month): **REJECTED** in May. [[Candidate Ridge BTC]] is downgraded from
      PROMISING to **INCONCLUSIVE leaning REJECTED**. It stays frozen as it was; it is not changed or retuned.
    - The combined reading of Exp 02–05: with these 205 features and this cost model, there is no detectable signal
      in the next 5–45 minutes of BTC. The learning methods are not what is blocking.
13. **Conclusion and next step.** The bottleneck is the input, not the model. Before more NCM training, the next
    useful question is about information and costs, not architecture. Options for the user to choose from:
    - **(a) Maker entry/exit costs.** −0.12% per entry is almost exactly the taker round trip. With maker fills
      (the honest simulator already supports them), the same zero-edge predictions would sit near break-even, and a
      small edge could become visible.
    - **(b) Longer horizons** (hours instead of minutes), where costs weigh less relative to the move.
    - **(c) New information** in the photo: order book depth, liquidations, open interest, cross-exchange basis. Not
      in the current 205 features.
    - **(d) Stop here** for BTC on minutes, and take the frozen test only with whatever candidate the user wants to
      measure. The ridge candidate could still be measured honestly, with the May result recorded first.

See also: [[NCM Exp 04 Exact Expected Reward]], [[Signal Check BTC]], [[Candidate Ridge BTC]],
[[NCM Handoff 2026-11-05]].
