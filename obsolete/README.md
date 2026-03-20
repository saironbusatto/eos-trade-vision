# Obsolete (5S)

Este diretório centraliza artefatos históricos que **não participam mais do runtime atual**.

Objetivo:
- manter rastreabilidade histórica;
- reduzir ruído no diretório raiz;
- separar claramente o que está em produção do que é legado.

## Estrutura

- `legacy_modules/`
  - `eos-iq-bot/`
  - `eos-ml/`
  - `eos-ofa-engine/`
  - `eos-website/` (frontend duplicado legado)
- `research_artifacts/`
  - scripts e relatórios de experimentos antigos (`analysis_*`, `backfill_*`, `inspect_*`, etc.)
  - documentação histórica de migração/estudo (`alembic-guide.md`, `prompt-antigravity-migracao-eos.md`)
- `study_material/`
  - materiais de estudo antigos (`Docs de estudo/`)
- `legacy_archives/`
  - pacotes e dumps históricos (`eos-iq-bot-deploy.tar.gz`)

## Política

- Nada aqui deve ser importado pelo runtime principal (`eos-telegram-bot`, `eos-gateway`).
- Se algum item voltar a ser necessário em produção, mova de volta para o módulo ativo correspondente.
