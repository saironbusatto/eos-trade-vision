# EOS Trade Vision

Algorithmic trading system with Order Flow Analysis (OFA) + ML for crypto, with execution and monitoring on AWS.

## Active modules

- `eos-telegram-bot/`: main signal engine, validation, ML and Telegram integration.
- `eos-gateway/`: support API for the dashboard and operational integration.
- `src/` + `public/` (root): main static frontend used by `docker-compose` via `./dist`.
- `docs/`: operational/infra documentation.

## Legacy modules

Everything that was historical and does not take part in the current runtime was moved to:

- `obsolete/legacy_modules/`
- `obsolete/research_artifacts/`
- `obsolete/study_material/`
- `obsolete/legacy_archives/`

It also includes the duplicated legacy frontend (`eos-website`) and old migration documentation.

## Deploy (production)

Automatic deploy lives in:

- `.github/workflows/deploy.yml`

It updates the repository on EC2 and restarts the PM2 process `eos-bot`.

## Recommended documentation

- AWS infra: [docs/INFRASTRUCTURE.md](./docs/INFRASTRUCTURE.md)
- Main bot (overview): [eos-telegram-bot/README.md](./eos-telegram-bot/README.md)
- Technical document (thesis, formulas and thresholds): [eos-telegram-bot/docs/ALGORITHM_TCC.md](./eos-telegram-bot/docs/ALGORITHM_TCC.md)
- Legacy moved to 5S: [obsolete/README.md](./obsolete/README.md)

## Important notes

- IQ Option is not part of the active stack.
- Performance counting segmentation (wins/losses) is now per phase in the backend via `STATS_PHASE_TAG`.
- Current default phase: `fase jim compound v1`.
