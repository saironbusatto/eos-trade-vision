---
title: NCM Exp 07 Long Horizons
aliases:
  - NCM Exp 07 Long Horizons
tags:
  - ncm
  - experiment
status: active
updated: 2026-11-08
---

# NCM Exp 07 Long Horizons

[[NCM Exp 06 Maker Costs]] with one change: the action horizons go from 5–45 min to 1, 2, 4 and 8 h. Option (b)
from Exp 05 item 13, chosen by the user. Repeated on a second fold to check the result.

1. **Research question.** Over hours, costs are small relative to the move. Do the same photos and models predict
   hour-scale moves well enough to trade?
2. **Hypotheses.**
   - H1: at realistic cost (A), the selected entries are profitable, and this holds in two different check months.
   - H0: they lose, or the result does not repeat across months and seeds.
3. **Dataset and period.**
   - Fold mai: fit fev–abr (126,165 minutes), check mai (44,160).
   - Fold abr: fit fev–mar (82,965), check abr (42,720), normalization from fev–mar only. May is not used.
   - **8-h embargo** in both folds: fit only where t + 8 h ≤ the check start. In the check, only minutes whose 8-h
     window ends before the next month.
   - **June and the test untouched** (fold mai's windows end before 01/06). Adds no version to the 180 seen in June.
4. **Data-quality audit.** Same photos as Exp 05. 0 windows with gaps in either fold. A check stops the run if any
   window crosses the embargo or the June cut.
5. **Experimental configuration.**
   - Script `ncm/exp_horizonte.py` (`--abr` for the second fold), commit `6decfb0` + this script.
   - Actions: long/short x 1/2/4/8 h, exit at the open of the candle at the horizon.
   - Models and decision rule as in Exp 06: ridge and the NCM-sized value network (seeds 0/1/2, checkpoint by
     check-month loss) learn the gross move; enter if (prediction − cost) ≥ threshold; one position at a time.
   - Thresholds raised to 0, 0.25, 0.5, 1, 2% (hour-scale moves are larger).
   - Cost levels T / A / B as in Exp 06. **Funding is now charged** on every action.
6. **Baselines.** "Never trade" = 0%; a constant prediction (fit-period mean, which always picks one side and never
   passes a threshold).
7. **Execution costs.** T 0.12%, A 0.08% (maker entry filled only if price trades through within 3 min), B 0.04%
   (ceiling), plus funding.
8. **Results.**

   Context: BTC −3.5% in the May check, **+12.0% in the April check**. The network checkpoint was epoch 1 in every
   run, i.e. barely trained.

   Most confident 1% of minutes, mean net per entry at A (share of long entries):

   | Model | Fold mai | Fold abr |
   |---|---|---|
   | constant | −0.133% (100% long) | −0.223% (0% long) |
   | ridge | **+0.084%** (37%) | −0.341% (41%) |
   | network s0 | −0.209% (73%) | −0.870% (12%) |
   | network s1 | +0.034% (96%) | −1.227% (20%) |
   | network s2 | **+0.331%** (79%) | −0.822% (57%) |

   Simulated trading at A, one position at a time (trades, PF, compounded):

   | Model | Fold | thr 0% | thr 0.25% | thr 0.5% | thr 1% | thr 2% |
   |---|---|---|---|---|---|---|
   | ridge | mai | 110, 0.82, −6.4% | 94, 1.37, +8.5% | 67, 1.07, +1.1% | 14, 0.92, −0.4% | 0 |
   | ridge | abr | 97, 0.60, −17.7% | 94, 0.75, −10.8% | 85, 0.52, −20.1% | 58, 0.51, −12.3% | 2, 0.08, −0.6% |
   | network s0 | mai | 118, 0.70, −10.7% | 93, 0.83, −5.0% | 80, 1.17, +4.1% | 34, 1.11, +1.0% | 0 |
   | network s0 | abr | 108, 0.50, −24.7% | 94, 0.62, −16.8% | 78, 0.44, −20.9% | 56, 0.62, −11.1% | 29, 0.47, −8.9% |
   | network s1 | mai | 103, 0.78, −7.3% | 93, 0.80, −5.7% | 84, 0.45, −19.1% | 56, 1.02, +0.1% | 4, 2.69, +0.8% |
   | network s1 | abr | 112, 0.54, −20.6% | 95, 0.38, −27.5% | 79, 0.45, −22.8% | 52, 0.46, −15.1% | 15, 0.11, −8.5% |
   | network s2 | mai | 105, 1.17, +4.1% | 94, 0.62, −12.0% | 79, 1.20, +4.2% | 34, 1.27, +2.8% | 1, –, +0.8% |
   | network s2 | abr | 129, 0.78, −9.4% | 98, 0.43, −24.3% | 70, 0.37, −24.0% | 47, 0.53, −12.8% | 13, 0.76, −0.9% |

   T and B move every number by about the cost difference and change no conclusion. They are in the raw files.

   Raw data: `~/.local/share/eos-ncm/diag-kl/metricas-exp07-horizonte.json` and `…-abr.json`; logs
   `logs/exp7-horizonte.log` and `logs/exp7-horizonte-abr.log`.
9. **Statistical uncertainty.**
   - Hour-scale trades allow only about 100 one-at-a-time trades per month. The top 1% (~440 minutes) covers a few
     overlapping multi-hour episodes, so the effective sample is very small.
   - In fold mai, the models disagree on the side (ridge 37% long, network s1 96% long) and on the sign of the
     result. The positive cells sit next to negative ones at the neighbouring threshold.
10. **Failure analysis.**
    - **The May positives do not repeat in April.** In April every model loses at every threshold, with PF 0.11–0.78.
    - The mechanism is visible in the side columns: at hour scale the models mostly learn the **trend of the fit
      period**. Fit fev–mar (falling), they lean short and lose in a +12% April. Fit fev–abr, the mix of sides
      happened to suit a −3.5% May for some models. That is regime-following, not a repeatable prediction from the
      photo.
    - The network stops at epoch 1 in every run: anything trained longer gets worse on the check month. The features
      carry no stable hour-scale information beyond the period's drift.
11. **Limitations.**
    - Two check months, one symbol, 8 fixed actions.
    - The photo features were built for minute-scale order flow. Hour-scale features (daily structure, funding
      trends, open interest) are not in it; that is option (c).
    - No walk-forward with more folds; with two months already contradicting each other, more folds would not
      rescue H1.
12. **Decision classification.**
    - H1: **REJECTED.** Positive in one month for some models, negative for all models in the other.
    - The fold mai positives (ridge, network s2): **REJECTED** as signal. They do not survive the second fold.
    - "At hour scale the models learn the fit-period trend": **SUPPORTED** by the side shares in both folds.
13. **Conclusion and next step.**
    - Across Exp 02–07, nothing built on these 205 photo features has shown a repeatable edge in BTC:
      - minutes or hours;
      - taker or maker;
      - policy or value models.
    - The remaining options:
      - **(c) New information:** order book depth, liquidations, open interest, cross-exchange basis. This needs new
        data collection, because the archives used so far do not have the book.
      - **(d) Stop BTC here:** decide what, if anything, goes to the frozen test, and record that nothing found so
        far is a candidate except the downgraded ridge.
    - The live bot (task 4 done) can keep running in paper mode meanwhile; it does not depend on this.

See also: [[NCM Exp 06 Maker Costs]], [[NCM Exp 05 Value Model]], [[Candidate Ridge BTC]],
[[NCM Handoff 2026-11-05]].
