# EOS OFA Engine Agent (Shared Lib)

> [!TIP]
> **Hub Central:** Consulte [`../agents.md`](../agents.md) para visão sistêmica e contratos globais.

## 🆔 Identidade
- **Sou:** Biblioteca de Núcleo Matemático e Lógica de Mercado. Contém cálculos puros de Order Flow, Volume Profile e indicadores.
- **Não sou:** Serviço executável. Sou uma dependência (library) importada por outros bots.

## 🔌 Interfaces
- **Public API:** [`src/index.ts`](./src/index.ts)
  - Exports: `VolumeProfile`, `ImbalanceDetector`, `AbsorptionCalculator`.
- **Utils:** Cálculos de Delta, VWAP, Z-Score.

## 💾 Dados
- **Stateless:** Não mantém estado, não conecta em banco de dados. Processa inputs e devolve outputs.

## 📡 Sinais (Contrato)
- **Input:** Arrays de Candles (OHLCV), Arrays de Trades (Price, Size, Side).
- **Output:** Estruturas de dados (ex: `PriceLevel[]`, `Zone[]`) consumidas pelos bots.

## 🤝 Dependências (Vizinhos)
- **Crypto Bot:** [`../eos-telegram-bot/agents.md`](../eos-telegram-bot/agents.md) (Importador).
- **IQ Bot:** [`../eos-iq-bot/agents.md`](../eos-iq-bot/agents.md) (Importador).

## ☑️ Checklist / Compatibilidade
- [ ] **Pureza:** Funções devem ser puras (sem side-effects) sempre que possível para facilitar testes unitários.
- [ ] Performance: Evitar loops pesados desnecessários; código usado em loop de alta frequência.
