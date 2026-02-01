# EOS Frontend Agent ✅ REVISADO

> [!TIP]
> **Hub Central:** Consulte [`../agents.md`](../agents.md) para visão sistêmica e contratos globais.

## 🆔 Identidade
- **Sou:** Dashboard Visual (SPA React). Exibo sinais, gráficos interativos e gerenciamento de estado da UI.
- **Não sou:** Servidor, worker, bot. Não acesso BD diretamente, não processo pagamentos, não executo cron jobs.

## 🔌 Interfaces
- **Roteamento:** [`src/App.tsx`](./src/App.tsx)
  - Rotas: `/` (Dashboard), `/signals` (Lista), `/settings` (Configurações)
- **API Client:** [`src/services/api.ts`](./src/services/api.ts) (wrapper Axios)
- **State Management:** Hooks customizados (ex.: `useSignals`) + Zustand/Context para estado global

## 💾 Dados
- **Persistência local (Browser):**
  - `localStorage`: tema (Dark/Light), filtros ativos, preferências do usuário
- **Estado volátil (memória):** sinais em tempo real, conexão WS

## 📡 Contrato (Fonte da Verdade)
- **Definição:** Interface `TradingSignal` em [`src/lib/signalApi.ts`](./src/lib/signalApi.ts)
- **Input:**
  - REST inicial: `GET /api/signals` (histórico)
  - WebSocket incremental: evento `new_signal` (tempo real)
- **Regras de estado:**
  1. Carregar histórico via REST no mount
  2. Aplicar updates via WS
  3. Deduplicar por `symbol + timestamp` ou `id` (se existir)

## 🤝 Dependências (Vizinhos)
- **Gateway:** [`../eos-gateway/agents.md`](../eos-gateway/agents.md) (único backend; sem acesso direto ao DB)

## ☑️ Checklist / Compatibilidade
- [ ] UI Responsiva: testar mobile view ao alterar componentes de tabela/gráfico
- [ ] Types: manter `TradingSignal` em `src/lib/signalApi.ts` sincronizado com payload do Gateway
- [ ] WS Reconnect: garantir reconexão automática em caso de queda (Socket.io client config)
- [ ] Error Handling: exibir feedback visual quando REST ou WS falhar
