# Lint Health Stabilization

## Goal
Eliminar falhas de lint do frontend principal sem carregar código legado/artefatos e manter saúde técnica validada.

## Tasks
- [x] Ajustar escopo do ESLint Flat Config para ignorar artefatos e módulos fora do frontend ativo (`dist/`, `obsolete/`, `eos-telegram-bot/`, `*.d.ts`) -> Verify: `npm run lint` sem erros.
- [x] Corrigir erros de tipagem e regras no frontend ativo (`src/`) -> Verify: `npm run lint` retorna 0 errors.
- [x] Revalidar build do frontend após ajustes -> Verify: `npm run build` conclui com sucesso.
- [x] Revalidar backend bot para confirmar estado técnico declarado -> Verify: `eos-telegram-bot npm run build` e `npm test -- --runInBand` passam.

## Done When
- [x] Frontend root com lint sem erros.
- [x] Frontend root com build OK.
- [x] `eos-telegram-bot` com build e testes OK.
