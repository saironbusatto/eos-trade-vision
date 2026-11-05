# Next-Concept Modeling (NCM) — paper notes + prior use in WoWcombabte

> Source: arXiv 2610.14162 (Kumbong, Khare et al., Stanford / Together AI), https://github.com/HazyResearch/ncm ; local: ~/PROJETOS/WoWcombabte/{NCM,ml/tools/ncm_*.py,agente/NCM-ESTUDO-DE-CASO.md}
> Collected: 2026-11-04
> Published: 2026-10-09

## Paper (key facts, verbatim numbers)
- Two stages: (1) multiscale residual VQ-VAE tokenizer: text -> K levels of discrete codes, l1<...<lK=L; nested dropout so coarse levels carry meaning; reconstruction acc 98.8–100%. (2) frozen tokenizer; transformer predicts all codes of level k in parallel conditioned on cumulative reconstruction z^(k-1) resized to l_k; p(r1:K)=prod_k prod_i p(r_k^i | z^(k-1)). K forward passes total.
- Block-diagonal attention best (PPL 15.41 vs block-causal 19.63, 1.4x faster). Prefix-LM for conditioning (prompt attends itself; target blocks attend prompt+self).
- Conditioning corruption: replace input codes uniformly at linearly decreasing per-level rate, mean ~0.5 best; too much hurts.
- Loss weight w_k ∝ l_k^-alpha; alpha barely changes quality.
- More levels K -> better, diminishing returns. Linear/cos/quad schedules best; log/sqrt worst.
- Results (~100M params): LM1B 21x faster than DUO at better PPL; XSum ROUGE-L 28.0 at 8 NFE (31x faster); Sudoku hard 86.1% at 12 NFE vs FMLM+ 81.3% (16 NFE), DUO 58.4%, AR 1.0%. Coarse-to-fine suits global-constraint planning; later levels correct earlier partial solutions.
- Test-time: sample many candidates, pick by MBR -> +~7% ROUGE-L at matched time. CFG supported.
- 4–5x fewer training tokens than diffusion baselines.
- Limitations: fixed K and l_k regardless of input; tokenizer trained separately (not end-to-end); occasional artifacts at coarse-level transitions; no training code in the public repo (eval only).

## Prior use (WoWcombabte arena coach, 2026-11-01..03)
- Input (prefix) = game "photo" of 79 (v1) / 89 (v2) bucketed numbers; output = 10 s plan of 3 bots = 60 tokens; levels [1,2,4,8,16,32,60], 64 codes/level; generator 8 layers x 512 (Sudoku-hard config). Own training script ncm_treino.py (repo has none). RTX 5060 8 GB.
- 39 ms per plan median; ~3.5 h from zero to live.
- Outcomes: focus right 69% vs 57% "keep target"; target-switch 50%; CC only 18% (disabled). NCM focus on bots did NOT win games (47% vs 58% without it).
- Biggest win was a by-product: P(win) value model (ncm_valor.py) from NCM v2 data; advantage = P(win in 10 s) - P(win now) used as example weights -> arm A 58% vs champion (+8 pts).
- Live "decisive moment" detector lost to a fixed-time guess (33/100 vs 40/100): signal visible only in hindsight (peak), not live.

## EOS data available locally (checked 2026-11-04)
- tmp/eos.prod.db: signals 16,834 and ml_training 16,820, 2026-02-06 → 2026-03-19 only; price_checkpoints 53,376. Features are per-signal aggregates (f_smart_money, f_price_context, f_imbalance, f_absorption, f_trend, f_momentum, f_volume, score, macro*, profit_5m..45m). No raw aggTrade/kline history stored.
- Full production DB through 2026-07-06 (18,207 closed) is on the orphaned Oracle boot volume farmei-prod (not recoverable now: no ARM/AMD capacity in sa-saopaulo-1).
