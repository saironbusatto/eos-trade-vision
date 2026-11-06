---
title: NCM Next-Concept Modeling
aliases:
  - NCM Next-Concept Modeling
  - NCM
tags:
  - ml
  - ncm
  - research
status: active
updated: 2026-11-04
---

# NCM Next-Concept Modeling

> Sources: Kumbong et al., Stanford, arXiv 2610.14162, 2026-10-09; WoWcombabte NCM case study, 2026-11-03
> Raw: [ncm-paper-and-wow-prior-use](../../raw/project-system/2026-11-04-ncm-paper-and-wow-prior-use.md)

## Overview

Candidate tech for rebasing EOS's ML / decision layer (user plan, 2026-11-04). NCM generates a **discrete sequence coarse-to-fine**: a multiscale residual VQ-VAE compresses the output into K levels of codes, then a transformer predicts each level fully in parallel, conditioned on the sum of earlier levels. K forward passes instead of L (AR) or many (diffusion).

## How it works

1. **Tokenizer (stage 1):** encoder → residual quantization at growing lengths ℓ₁<…<ℓ_K=L; nested dropout forces coarse levels to hold the "concept". Reconstruction ≈ 99–100%.
2. **Generator (stage 2, tokenizer frozen):** prefix (the condition) + one block per level; block-diagonal attention; all codes of a level sampled at once. Trained in one pass over all levels with cross-entropy and **code corruption** (~50% mean, decreasing per level) so it tolerates its own errors.
3. **Inference:** ẑ⁽⁰⁾=0 → for each level predict, add, refine → decode. Cheap enough to sample many candidates and pick by **MBR** (consensus).

## What it is good at

- Outputs with **global structure / constraints**, where later levels fix earlier rough choices: Sudoku hard 86.1% at 12 NFE vs best diffusion 81.3%, AR 1%.
- **Speed:** 10–31× faster than diffusion LMs at equal quality; 39 ms per plan on an RTX 5060 in the WoW coach.
- **Data efficiency:** 4–5× fewer training tokens than diffusion baselines.

## Limits

- Fixed depth and lengths; tokenizer not trained end-to-end; artifacts between coarse levels.
- Public repo has **no training code** — the WoW project wrote its own (`ml/tools/ncm_treino.py`), reusable.

## Lessons from the WoW coach (same user, 2026-11-01..03)

- Imitating winners' plans gave a correct focus 69% vs 57% baseline, **but did not raise win rate** (47% vs 58%).
- The most valuable output was a by-product: a **value model** P(win) whose 10 s change weighted training examples (+8 pts).
- A live detector lost to a fixed guess: signal visible in hindsight ≠ usable live. Same trap applies to trading (look-ahead).

## Fit questions for EOS

- EOS decisions today are small classifications (trade / no-trade, direction, EXIT/HOLD/MOVE_STOP). NCM pays off when the **output is a structured sequence** — e.g. a coarse-to-fine **price-path / scenario** over the next N minutes, or a full trade plan (entry → stop moves → exit) — then MBR over many sampled scenarios gives a distribution.
- Any model must pass the fee-aware compounded walk-forward of [[Validated Subset Filter]]; raw edge was ~0.
- Data: local snapshot has only 16,834 signals (Feb 6–Mar 19) as per-signal aggregates; no raw order-flow sequences stored. Full DB to Jul 6 sits on the unreachable Oracle disk. Sequence data would need collecting (e.g. Binance public historical aggTrades/klines).

## See Also

- [[EOS Trade Vision System Baseline]]
- [[Validated Subset Filter]]
- [[RL PPO Trading Module]]
- [[Project State and Open Items]]
