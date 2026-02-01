# Regras do Antigravity (Workspace)

Gate obrigatório:
- Antes de iniciar qualquer tarefa, consultar o arquivo global `skills_index.jsonl` e declarar:
  - Skills aplicados (ids): [...]
  - Por que estes skills (1 linha)

1) Planejamento
- Não execute mudanças sem um plano curto em `task.md` ou `implementation_plan.md` (3–8 passos; arquivos impactados; riscos).
- Se a tarefa for "só análise", registre explicitamente “Sem mudanças de código”.

2) Documentação por módulo
- Ao modificar um módulo, atualizar o `agents.md` do módulo na mesma PR/commit.
- `agents.md` deve apontar para "fontes da verdade" (arquivos/paths), evitando listar coisas que mudam toda hora.

3) Referências cruzadas
- Usar apenas links relativos do repo (ex.: `../eos-ml/agents.md`).
- Evitar `file:///` e caminhos absolutos.

4) Skills
- Sempre listar skills no início quando solicitado; para tarefas longas, repetir no começo de cada grande fase.

5) Verificação
- Ao final de cada bloco de execução: propor verificação (manual e/ou automatizada) e registrar o resultado quando executada.
- Não inventar comandos; se não estiver claro no repo, perguntar.

6) Idioma
- Todo conteúdo em pt-BR.
