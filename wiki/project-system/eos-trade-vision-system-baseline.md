---
title: EOS Trade Vision System Baseline
aliases:
  - EOS Trade Vision System Baseline
tags:
  - architecture
  - trading-system
  - baseline
status: active
updated: 2026-11-04
---

# EOS Trade Vision System Baseline

> Sources: Local Repository Docs, 2026-05-14; Local Repository Audit (git + docs), 2026-11-04
> Raw: [eos-trade-vision-baseline-sources](../../raw/project-system/2026-05-14-eos-trade-vision-baseline-sources.md); [repo-audit-jul-2026-changes](../../raw/project-system/2026-11-04-repo-audit-jul-2026-changes.md)

## Overview

EOS Trade Vision is a multi-module crypto trading system: a React frontend, an Express gateway, and a Telegram trading engine with OFA + ML logic and SQLite persistence. The bot backend is the operational center; gateway and frontend provide observability and integration surfaces.

## System Composition

- Frontend (`src/`): React + Vite dashboard and analytics. Routes are lazy-loaded (`React.lazy` + `Suspense`) and vendors split into chunks (`vendor-charts`, `vendor-radix`, `vendor-router`, `vendor-query`) — *uncommitted as of 2026-11-04*.
- Gateway (`eos-gateway/`): API hub. Docker healthcheck uses `127.0.0.1` (fixed 2026-07-08).
- Trading Engine (`eos-telegram-bot/`): signal generation, filtering, ML inference, Telegram delivery, lifecycle management.
- Sauron images (`eos-telegram-bot/scripts/generate-sauron.py`): DALL-E scene generated from the signal quote, sent via `sendPhotoWithCaption`. Requires `OPENAI_API_KEY`. See [[Sauron Image Generation]].
- RL module (`eos-telegram-bot/ml/rl/`): PPO agent, **standalone / not wired into the bot**. See [[RL PPO Trading Module]].
- Documentation: `docs/`, `eos-telegram-bot/docs/` (ALGORITHM_TCC.md is the technical reference), and this wiki.

## Contracts and Data Flow

- Canonical signal payload is defined in frontend contract references and consumed across modules.
- Primary persistence: SQLite at `eos-telegram-bot/data/eos.db`.
- WebSocket broadcast (`new_signal`) for downstream consumers.
- `/api/stats` exposes `phase_tag`, `baseline_at` and `all_time_*` fields (since 2026-07-06), driven by `STATS_PHASE_TAG`.
- Cross-module changes require coordinated updates across payload types, ML feature schemas and DB queries/migrations.

## Trading Intelligence Stack

1. OFA-derived features and directional scoring.
2. Hard blacklists: `BLOCKED_HOURS_UTC`, `BLOCKED_SYMBOLS`.
3. [[Validated Subset Filter]] — symbol × day × hour-direction intersection (default on).
4. ML gate + direction models; macro features supplied by the heuristic macro analyzer (Perplexity removed).
5. Exit Decision Engine (ML → LLM → deterministic HOLD). See [[Code-Derived Decision Proof]].
6. Execution assumption `DEFAULT_ORDER_TYPE=MAKER` (was TAKER until 2026-07-06).

Strategic stance: maximize `E[profit | valid context]`, not signal volume.

## Operational Baseline

- **Infra:** migrated 2026-07-06 from AWS EC2 (`sa-east-1`) to an **Oracle VPS**.
- PM2-managed bot process (`eos-bot`), Nginx fronting services, Docker Compose available.
- Deploy runs with `--omit=dev` → `dist/` must be prebuilt (CI or build env).

> [!warning] Conflict
> `docs/INFRASTRUCTURE.md` and `.github/workflows/deploy.yml` still describe AWS/EC2, while ALGORITHM_TCC.md §19 and the bot README record the move to Oracle (2026-07-06). Confirm the live target before deploying.

## See Also

- [[Project State and Open Items]]
- [[Validated Subset Filter]]
- [[Code-Derived Decision Proof]]
- [[RL PPO Trading Module]]
- [[Global Skills Registry]]
- [[Obsidian Wiki Style Profile]]
