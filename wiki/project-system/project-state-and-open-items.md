---
title: Project State and Open Items
aliases:
  - Project State and Open Items
tags:
  - status
  - roadmap
status: active
updated: 2026-11-04
---

# Project State and Open Items

> Sources: Local Repository Audit, 2026-11-04
> Raw: [repo-audit-jul-2026-changes](../../raw/project-system/2026-11-04-repo-audit-jul-2026-changes.md)

## Timeline

| Date | Event |
|---|---|
| 2026-04-02 | Exit Decision Engine phases 1–4 + docs |
| 2026-04-12 | Production addendum: macro gap analysis, Perplexity removal decided |
| 2026-05-14 | Wiki initialized |
| 2026-07-06 | EC2 → Oracle migration; [[Validated Subset Filter]]; MAKER default; `/api/stats` phase fields |
| 2026-07-08 | [[Sauron Image Generation]]; gateway healthcheck fix; [[RL PPO Trading Module]] (**last commit**) |
| 2026-07-23 | Folder copied to current machine (all mtimes reset) |
| 2026-11-04 | Project resumed; wiki refreshed |

## Uncommitted work (pending decision)

18 files with real changes, never committed (~390 others only show file-mode diffs — run `git config core.fileMode false`):

- **`eos-telegram-bot/src/macroAnalyzer.ts`** — heuristic macro (Binance 24h public data) replacing Perplexity.
- Docs: April production addendum, infra notes, ML feature table, env examples (exit engine vars, blacklists).
- Frontend: lazy routes, chunk splitting, lint fixes (`lint-health-plan.md` all checked).
- `agents.md` LLM-Wiki policy.
- Untracked: `wiki/`, `raw/`, `lint-health-plan.md`.

> [!warning] Conflict
> The docs say the heuristic macro was *implanted* in April, but the code change is **only in the working tree**. The last commits on `main` (July) still contain the Perplexity analyzer — unless production runs from a different copy. Verify what is actually deployed on the Oracle VPS.

## Open items

1. Decide on and commit (or discard) the 18 pending files.
2. Confirm live infra (Oracle) and update `docs/INFRASTRUCTURE.md` + deploy workflows still pointing at EC2.
3. **Quarterly re-validation of the [[Validated Subset Filter]] is overdue** (last: 2026-07-06).
4. Check paper-trading results since July before trusting the n=136 result.
5. [[RL PPO Trading Module]]: real OHLCV input, parameterized SQL, fee-aware evaluation — or archive it.
6. Fix typo in `docs/ESTRATEGIA_ANALISE_ESTATISTICA.md` heading 4.3 ("Scoredmnro").
7. Remove `eos-telegram-bot/ml/__pycache__/` from the tree / add to `.gitignore`.

## See Also

- [[EOS Trade Vision System Baseline]]
- [[Validated Subset Filter]]
- [[Code-Derived Decision Proof]]
