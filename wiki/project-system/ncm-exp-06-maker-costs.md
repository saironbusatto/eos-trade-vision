---
title: NCM Exp 06 Maker Costs
aliases:
  - NCM Exp 06 Maker Costs
tags:
  - ncm
  - experiment
status: active
updated: 2026-11-08
---

# NCM Exp 06 Maker Costs

[[NCM Exp 05 Value Model]] with one change: execution costs. Option (a) from Exp 05 item 13, chosen by the user.

1. **Research question.** Exp 05 lost about −0.12% per entry, almost exactly the taker round trip. With maker fills,
   does the same kind of model trade profitably?
2. **Hypotheses.**
   - H1: with maker entry (realistic, A), the models' selected entries are profitable in May.
   - H0: they still lose, or the result does not hold across seeds and thresholds.
   - Ceiling check: if even the optimistic B does not profit, maker cannot rescue these predictions.
3. **Dataset and period.**
   - Same split as Exp 05: fit fev–abr (126,600 minutes), check mai (44,596), 45-min embargo.
   - **June and the test untouched.** Adds no version to the 180 seen in June.
4. **Data-quality audit.**
   - Same photos and windows as Exp 05.
   - Highs and lows for the entry window come from the same futures 1m klines. A check stops the run if any is
     missing; none was.
5. **Experimental configuration.**
   - Script `ncm/exp_maker.py`, commit `3e6eb06` + this script.
   - Models: the same as Exp 05 (ridge λ 100; NCM-sized value network, seeds 0/1/2, checkpoint by May loss), but
     they learn the **gross** move of the 8 entries. The cost is subtracted at decision time.
   - Three cost levels (round trip):

     | Level | Entry | Exit | Cost |
     |---|---|---|---|
     | T | taker + slippage at the open | taker + slippage | 0.12% |
     | A | maker limit at the open, filled only if price **trades through** it within 3 min, else no trade | taker + slippage at the same exit minute | 0.08% |
     | B | maker, always filled, no slippage (optimistic ceiling) | maker, always filled | 0.04% |

   - Decision: take the action with the best predicted gross. Enter if (prediction − cost of the level) ≥ the
     threshold. One position at a time. An unfilled order blocks only its 3-min wait.
   - Funding is not charged here: at most one charge per trade, the same for every level.
6. **Baselines.** "Never trade" = 0%; a constant prediction (the fev–abr mean, which never passes a threshold);
   "every entry" averages.
7. **Execution costs.** See item 5. B is deliberately unrealistic: it is a ceiling, not a strategy.
8. **Results (May).**

   Every possible entry, averaged:

   | Level | Mean per entry | Fill rate | Minutes with a positive entry in hindsight |
   |---|---|---|---|
   | T | −0.120% | 100% | 71% |
   | A | −0.086% | 91% | 76% |
   | B | −0.040% | 100% | 98% |

   Most confident 1% of minutes (mean net per filled entry, share positive):

   | Model | T | A | B |
   |---|---|---|---|
   | constant | −0.123% (27%) | −0.089% (33%) | −0.043% (42%) |
   | ridge | −0.124% (32%) | −0.090% (36%) | −0.044% (42%) |
   | network s0 | −0.097% (33%) | −0.062% (35%) | −0.017% (40%) |
   | network s1 | −0.044% (39%) | −0.006% (45%) | +0.036% (54%) |
   | network s2 | −0.004% (52%) | +0.034% (56%) | +0.076% (61%) |

   Simulated trading, one position at a time (trades, PF, compounded):

   | Model | Level | thr 0% | thr 0.05% | thr 0.10% | thr 0.20% | thr 0.30% |
   |---|---|---|---|---|---|---|
   | ridge | T | 254, 0.36, −22.5% | 37, 0.39, −4.4% | 10, 0.28, −1.9% | 2, 1.80, +0.2% | 0 |
   | ridge | A | 642, 0.46, −37.7% | 172, 0.54, −10.3% | 22, 0.55, −2.2% | 2, 3.07, +0.4% | 0 |
   | ridge | B | 985, 0.58, −38.8% | 552, 0.78, −12.5% | 136, 1.25, +3.1% | 5, 0.34, −0.8% | 2, 2.08, +0.3% |
   | network s0 | T | 440, 0.40, −36.8% | 209, 0.54, −14.6% | 114, 0.45, −10.7% | 34, 0.30, −5.3% | 9, 0.41, −1.6% |
   | network s0 | A | 743, 0.50, −41.0% | 377, 0.59, −20.1% | 178, 0.58, −11.3% | 56, 0.72, −2.8% | 12, 0.15, −3.0% |
   | network s0 | B | 1240, 0.63, −38.0% | 659, 0.76, −17.3% | 331, 0.98, −0.9% | 91, 0.96, −0.6% | 25, 0.30, −3.9% |
   | network s1 | T | 387, 0.33, −37.2% | 170, 0.55, −12.3% | 67, 0.49, −6.8% | 7, 0.75, −0.2% | 4, 0.33, −0.5% |
   | network s1 | A | 650, 0.49, −37.7% | 325, 0.55, −20.0% | 136, 0.74, −5.4% | 23, 0.66, −1.3% | 4, 0.76, −0.2% |
   | network s1 | B | 990, 0.65, −32.9% | 588, 0.72, −17.9% | 288, 0.86, −5.0% | 48, 0.81, −1.6% | 6, 6.12, +0.8% |
   | network s2 | T | 143, 0.49, −11.8% | 29, 1.43, +1.4% | 7, 0.88, −0.2% | 0 | 0 |
   | network s2 | A | 687, 0.39, −43.8% | 88, 0.58, −5.9% | 22, 1.86, +1.9% | 1, –, −0.4% | 0 |
   | network s2 | B | 1286, 0.64, −38.4% | 500, 0.71, −14.6% | 69, 0.92, −0.8% | 6, 0.93, −0.1% | 0 |

   The network checkpoints were again epochs 1–2 (May loss 0.940–0.952, the same as Exp 05).

   Raw data: `~/.local/share/eos-ncm/diag-kl/metricas-exp06-maker.json`, log `logs/exp6-maker.log`.
9. **Statistical uncertainty.**
   - The most confident 1% is about 446 heavily overlapping minutes per model, far fewer independent episodes.
   - The seeds disagree: s0 is at or below cost everywhere, s2 is the only one positive at A. Three seeds of one
     configuration span −0.06% to +0.03% at A, which is about the size of the effect being looked for.
   - The positive threshold cells are 22–136 trades in different cells for each model, out of 60 cells. A handful
     of positive cells is what chance alone gives.
10. **Failure analysis.**
    - **Maker lowers the cost as expected** (−0.12% → −0.086% → −0.04% per average entry). Adverse selection in A
      is small: 91% fill and only ~0.006% worse than the fee saving.
    - **But the gross move the models select is still about zero.** Because the models learn the gross move, the
      cost level only shifts the threshold. The same weak ranking is evaluated three times, and it does not carry
      a usable edge at realistic costs.
    - Network seed 2's most confident 1% has a gross of about +0.12%, the best seen so far. It is one seed out of
      three, and it does not survive into the one-position-at-a-time trading at any threshold with enough trades.
    - The trading simulation loses more than the top 1% suggests because, below the top 1%, the models' confidence
      is noise. Every threshold low enough to trade often lets in mostly noise entries.
11. **Limitations.**
    - One month, one symbol, 8 fixed actions.
    - A uses a maker entry at the open with a 3-min wait. Smarter placement (inside the spread, at a level) was not
      tested. That would be a new strategy, not a cost change.
    - The exit stays taker in A. A maker exit at a fixed time is not guaranteed to fill.
    - No funding (the same for every level).
12. **Decision classification.**
    - H1 (maker makes the selections profitable): **REJECTED.** At A, every model loses at every threshold with
      usable sample size.
    - Ceiling B: **REJECTED** as a rescue. Even with free fills it loses at every threshold except scattered cells.
    - Network seed 2's top 1% (positive at A and B): **INCONCLUSIVE.** It is one seed and does not hold across
      seeds or thresholds. It is not acted on, and no June or test data is used to follow it up.
13. **Conclusion and next step.** Costs were not the whole problem: lowering them to the realistic maker level, or
    even to an impossible ceiling, does not make these predictions pay. The bottleneck is the predictability of
    the next 5–45 min with the current 205 features. That points to Exp 05 item 13, options (b) longer horizons or
    (c) new information, or (d) stopping BTC-minutes. Maker execution stays useful for any future strategy (it
    saves about 0.035% per trade at 91% fill) and can be combined with (b) or (c).

See also: [[NCM Exp 05 Value Model]], [[Candidate Ridge BTC]], [[NCM Handoff 2026-11-05]].
