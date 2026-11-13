# Knowledge Base Index

## project-system

Baseline architecture, contracts, runtime modules, strategy evidence and operating model for EOS Trade Vision.

| Article | Summary | Updated |
|---------|---------|---------|
| [NCM Handoff 2026-11-05](project-system/ncm-handoff-2026-11-05.md) | Where the NCM rebase stopped: tasks 1–3, 5, 6 done; task 7 controlled experiments 00–03; how to resume. | 2026-11-07 |
| [Backtest Research Handoff 2026-11-09](project-system/backtest-handoff-2026-11-09.md) | Where backtest research stands: step 0 data, theory 1 carry closed; how to resume; next = theory 3 or 2. | 2026-11-09 |
| [Theory Retest BTC](project-system/theory-retest-btc.md) | Old EOS rules in the honest simulator (fev–jun + 01–06/jul): all lose after fees. | 2026-11-05 |
| [Signal Check BTC](project-system/signal-check-btc.md) | Ridge/MLP predicting each entry's net result: MLP overfits, ridge shows a weak long-only contrarian edge in June. NCM GRPO run 1 collapsed to never trade. | 2026-11-06 |
| [NCM Exp 00 GRPO Run 1](project-system/ncm-exp-00-grpo-run-1.md) | First NCM training by net PnL: collapsed to never trade by step 200 (INVALID TEST for edge). | 2026-11-06 |
| [NCM Exp 01 GRPO Review](project-system/ncm-exp-01-grpo-review.md) | Read-only audit: GRPO and reward are correct; entries carry no gross edge; the trade decision lives in the fine tokens. | 2026-11-06 |
| [NCM Exp 02 KL Diagnostic](project-system/ncm-exp-02-kl-diagnostic.md) | 1000 steps + KL brake: no collapse (2.8% entry) but per-entry result unchanged at -0.11%. | 2026-11-06 |
| [NCM Exp 03 Executed Trade Plan](project-system/ncm-exp-03-executed-trade-plan.md) | Plan = executed trade only: decision moves to coarse tokens, but per-entry result still flat at -0.11%. | 2026-11-07 |
| [NCM Exp 04 Exact Expected Reward](project-system/ncm-exp-04-exact-expected-reward.md) | Exact expected reward over 91 plans: collapses to flat by step 200, gradient vanishes (softmax saturation). | 2026-11-07 |
| [NCM Exp 05 Value Model](project-system/ncm-exp-05-value-model.md) | NCM-sized value model vs ridge, fev–abr → mai: neither beats a constant; ridge June edge does not repeat. | 2026-11-07 |
| [NCM Exp 06 Maker Costs](project-system/ncm-exp-06-maker-costs.md) | Exp 05 with maker costs (realistic and ceiling): still no profitable trading in May. | 2026-11-08 |
| [NCM Exp 07 Long Horizons](project-system/ncm-exp-07-long-horizons.md) | Horizons 1–8 h on two folds: May positives do not repeat in April; models learn the fit-period trend. | 2026-11-08 |
| [NCM Exp 08 Pipeline Audit](project-system/ncm-exp-08-pipeline-audit.md) | Pipeline audit with sources: no defect; volatility predictable, direction not; why the rules fail. | 2026-11-08 |
| [Backtest Step 0 History Data](project-system/backtest-step-0-history.md) | BTCUSDT 2020-01..2026-10 downloaded and checked (klines spot/futures, funding); start of backtest research. | 2026-11-08 |
| [Theory 1 Funding Carry](project-system/theory-1-funding-carry.md) | Funding carry BTC/ETH/SOL 2020–2026H1, closed: mechanism confirmed, but loses to the T-bill since 2022 in every variant (incl. funding>T-bill rule); SOL −27% in FTX crash. | 2026-11-08 |
| [Theory 3 Volatility-Managed Exposure](project-system/theory-3-volatility-managed.md) | Vol-scaled long BTC/ETH 2020–26H1: no variant beats buy & hold in both halves; H1 rejected. | 2026-11-12 |
| [Funding Carry Phase 1–2 Rotation](project-system/funding-carry-phase-1-2-rotation.md) | 30-symbol funding rotation: loses to the T-bill since 2022; even a perfect-foresight oracle does not beat it; plan stopped at phase 2. | 2026-11-13 |
| [Funding Carry Phase 3 Model](project-system/funding-carry-phase-3-model.md) | Option 1 (2x perp) + ridge and NCM network deciding the rotation: criterion not met (2 of 5 and 1 of 5 years); 2025–26 lost even by the oracle. | 2026-11-13 |
| [NCM BTC Closing](project-system/ncm-btc-closing.md) | Decision 08/11: BTC NCM work stopped after Exp 00–07; frozen test kept closed. | 2026-11-08 |
| [Candidate Ridge BTC](project-system/candidate-ridge-btc.md) | Frozen ridge rule for the task 8 test (sha256 5b5e7cb1…); reproduces June from raw photos. PROMISING. | 2026-11-07 |
| [Project State and Open Items](project-system/project-state-and-open-items.md) | Timeline, uncommitted work, conflicts and next actions — start here when resuming. | 2026-11-04 |
| [EOS Trade Vision System Baseline](project-system/eos-trade-vision-system-baseline.md) | Modules, data flow, decision stack and infra (AWS → Oracle since 2026-07-06). | 2026-11-04 |
| [Validated Subset Filter](project-system/validated-subset-filter.md) | Walk-forward-validated symbol × day × hour-direction gate; why unfiltered trading is ruinous. | 2026-11-04 |
| [Code-Derived Decision Proof](project-system/code-derived-decision-proof.md) | Backend-anchored formulas for entry/exit decisions and gates. | 2026-11-04 |
| [NCM Next-Concept Modeling](project-system/ncm-next-concept-modeling.md) | Paper (Stanford, 2026) + lessons from the WoW coach; candidate to rebase EOS ML. | 2026-11-04 |
| [RL PPO Trading Module](project-system/rl-ppo-trading-module.md) | Experimental PPO agent (not integrated) and its known data issues. | 2026-11-04 |
| [Sauron Image Generation](project-system/sauron-image-generation.md) | DALL-E Sauron images attached to Telegram signals. | 2026-11-04 |
| [Global Skills Registry](project-system/global-skills-registry.md) | Globally installed skill packs (Codex old machine vs Claude Code current). | 2026-11-04 |
| [Obsidian Wiki Style Profile](project-system/obsidian-wiki-style-profile.md) | Obsidian-oriented note conventions for this project's LLM wiki. | 2026-11-04 |
