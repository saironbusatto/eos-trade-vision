# EOS Trade Vision

Sistema de trading algorítmico com Order Flow Analysis (OFA) + ML para cripto, com execução e monitoramento em AWS.

## Módulos ativos

- `eos-telegram-bot/`: motor principal de sinais, validação, ML e integração Telegram.
- `eos-gateway/`: API de apoio para dashboard e integração operacional.
- `src/` + `public/` (raiz): frontend estático principal usado pelo `docker-compose` via `./dist`.
- `docs/`: documentação operacional/infra.

## Módulos legados

Tudo que era histórico e não participa do runtime atual foi movido para:

- `obsolete/legacy_modules/`
- `obsolete/research_artifacts/`
- `obsolete/study_material/`
- `obsolete/legacy_archives/`

Inclui também o frontend duplicado legado (`eos-website`) e documentação de migração antiga.

## Deploy (produção)

O deploy automático está em:

- `.github/workflows/deploy.yml`

Ele atualiza o repositório no EC2 e reinicia o processo PM2 `eos-bot`.

## Documentação recomendada

- Infra AWS: [docs/INFRASTRUCTURE.md](./docs/INFRASTRUCTURE.md)
- Bot principal (visão geral): [eos-telegram-bot/README.md](./eos-telegram-bot/README.md)
- Documento técnico (TCC, fórmulas e thresholds): [eos-telegram-bot/docs/ALGORITHM_TCC.md](./eos-telegram-bot/docs/ALGORITHM_TCC.md)
- Legado movido para 5S: [obsolete/README.md](./obsolete/README.md)

## Observações importantes

- IQ Option não faz parte da stack ativa.
- A segmentação de contagem de performance (wins/losses) agora é por fase no backend via `STATS_PHASE_TAG`.
- Fase padrão atual: `fase jim compound v1`.
