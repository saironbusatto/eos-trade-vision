# EOS Gateway Agent ✅ REVISADO

> [!TIP]
> **Hub Central:** Consulte [`../agents.md`](../agents.md) para visão sistêmica e contratos globais.

## 🆔 Identidade
- **Sou:** Hub Central de API e Proxy Reverso. Exponho dados dos bots para o Frontend, gerencio broadcast via WebSocket.
- **Não sou:** Não tomo decisões de trade, não gravo sinais (apenas leio), não opero diretamente na exchange, não faço autenticação complexa (por ora).

## 🔌 Interfaces
- **API REST (Express):** [`server.js`](./server.js)
  - `GET /api/signals`: retorna histórico de sinais (query SQL no DB do Bot)
  - `GET /api/stats`: agrega estatísticas de performance (cálculos simples sobre sinais)
- **WebSocket (Socket.io):** [`server.js`](./server.js)
  - Evento `connection`: novo cliente conectado
  - Evento `new_signal` (broadcast): envia sinal recém-criado para todos os clientes

## 💾 Dados
- **Leitura (Read-Only):**
  - `../eos-telegram-bot/data/eos.db` (tabela `signals` principal)
  - `../eos-iq-bot/data/eos-iq.db` (legado, tabela `signals` histórica, opcional)
- **Acesso:** Queries SQL diretas via `sqlite3` driver (não há ORM por enquanto)

## 📡 Contrato (Adaptação)
- **Fonte da verdade:** Interface `TradingSignal` em [`../src/lib/signalApi.ts`](../src/lib/signalApi.ts) (Frontend define o contrato)
- **Responsabilidade do Gateway:** transformar `DB row` → `JSON TradingSignal`
- **Ponto único de adaptação (recomendado):** criar função `mapSignalRow(row): TradingSignal` em `server.js` para evitar SQL/JSON espalhado
- **Output:** JSON compatível com a interface + timestamp (ISO 8601 ou Unix)

## 🤝 Dependências (Vizinhos)
- **Frontend:** [`../src/agents.md`](../src/agents.md) (consumidor REST + WS)
- **Crypto Bot:** [`../eos-telegram-bot/agents.md`](../eos-telegram-bot/agents.md) (produtor de dados no DB)
- **IQ Bot (legado):** [`../eos-iq-bot/agents.md`](../eos-iq-bot/agents.md) (leitura histórica opcional)

## 🔒 Riscos & Guardrails
- **SQL Injection:** queries SQL são diretas (sem prepared statements ainda); não expor parâmetros de query externa sem sanitização
- **Exposição:** porta 3000 deve estar fechada externamente (acesso via Nginx reverse proxy ou localhost-only)
- **Rate Limiting:** não implementado ainda; considerar se expor externamente

## ☑️ Checklist / Compatibilidade
- [ ] Schema DB mudou no Bot: atualizar queries SQL e função `mapSignalRow` imediatamente
- [ ] Novo campo em `TradingSignal`: garantir que o mapper preenche ou retorna null/valor padrão
- [ ] Segurança: validar que porta 3000 não está exposta publicamente (firewall/Nginx)
- [ ] Legacy IQ DB: se `eos-iq.db` não estiver disponível, Gateway deve funcionar normalmente (best-effort)
