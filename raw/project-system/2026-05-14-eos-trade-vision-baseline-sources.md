# EOS Trade Vision Baseline Sources

> Source: Local repository documentation and manifests (README.md, agents.md, docs/*.md, package manifests)
> Collected: 2026-05-14
> Published: Unknown

README.md (excerpt)
- Project name: EOS Trade Vision
- Active modules: eos-telegram-bot, eos-gateway, frontend in src/
- Legacy material moved to obsolete/

agents.md (excerpt)
- Canonical signal contract references src/lib/signalApi.ts
- Main database path: eos-telegram-bot/data/eos.db
- WebSocket event: new_signal
- Cross-module compatibility checklist for signal, ML features, and DB schema

package.json (root) (excerpt)
- Frontend stack: React 18 + Vite 5 + TypeScript
- Scripts: dev, build, build:dev, lint, preview

eos-gateway/package.json (excerpt)
- Express + better-sqlite3 + dotenv
- Scripts: start, dev

eos-telegram-bot/package.json (excerpt)
- Node/TS backend with express, telegram bot api, sqlite, ws, openai
- Scripts: dev, build, start, test

docs/INFRASTRUCTURE.md (excerpt)
- Production region: sa-east-1
- Main runtime: eos-telegram-bot via PM2
- Gateway: eos-gateway
- Frontend served by Nginx

docs/ESTRATEGIA_ANALISE_ESTATISTICA.md (excerpt)
- Statistical analysis report for strategy calibration
- Emphasis on conditional expectancy and context filtering

eos-telegram-bot/docs/DATA_ENGINE.md (excerpt)
- Data Engine v2.1.1 using WebSocket streaming and local buffering
- State machine with resilience/recovery paths

eos-telegram-bot/docs/ALGORITHM_TCC.md (excerpt)
- OFA scoring pipeline + ML gating + direction logic
- Dynamic risk management and hour-direction edge filtering
