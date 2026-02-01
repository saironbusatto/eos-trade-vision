# EOS - Eye of Sauron 🔴

Sistema de trading algorítmico com **Order Flow Analysis** + **Machine Learning** para criptomoedas e Forex.

---

### 🚀 Atalhos Rápidos
- 🛡️ **Infraestrutura AWS (IPs, Deploy, SSH):** [docs/INFRASTRUCTURE.md](./docs/INFRASTRUCTURE.md)
- ⚙️ **Regras do Projeto em IA:** [.agent/rules.md](./.agent/rules.md)
- 📝 **Guia de Comparação Local vs GitHub:** [walkthrough.md](file:///C:/Users/sairo/.gemini/antigravity/brain/f456636b-70d3-480c-acd0-86d83a7c58fe/walkthrough.md)

---

## 🎯 Overview

| Bot | Mercado | Estratégia | Status |
|-----|---------|------------|--------|
| **EoS CRYPTO** 🔮 | Binance Futures | OFA Real + Ensemble ML | ✅ v3.0 |
| **EoS IQ** 🎯 | Forex (IQ Option) | Volume Profile + Kaabar ML | ✅ v2.0 |

---

## 📊 Diferença Fundamental

### Por que estratégias diferentes?

| Aspecto | Crypto (Binance) | Forex |
|---------|------------------|-------|
| **Mercado** | Centralizado | Descentralizado (OTC) |
| **Order Book** | ✅ Público | ❌ Privado |
| **Volume** | ✅ Real (USD) | ⚠️ Tick Volume |
| **Smart Money** | ✅ Visível | ❌ Invisível |
| **Level 2** | ✅ Disponível | ❌ Não disponível |

> *"O Forex não é uma bolsa. É um mercado OTC onde cada broker tem seu próprio order book."* — **Trader Dale**

---

## 🔮 EoS CRYPTO

**Filosofia:** OFA Real → Order Flow institucional é visível na Binance.

### Módulos OFA
- Smart Money Filter (trades $500-$100k+)
- Stacked Imbalances (300%+ ratio)
- Absorption Detection
- Volume Profile (VPOC, VA)

### Machine Learning v3.0
- **Ensemble:** XGBoost + LightGBM + Random Forest + GB
- **GMM:** Regime Detection (Ruiz & Chan)
- **Threshold:** 70% para maior precisão

📖 [Documentação completa →](./eos-telegram-bot/README.md)

---

## 🎯 EoS IQ

**Filosofia:** Volume Profile Proxy → Sem acesso a Order Book, usamos proxies inteligentes.

### Métodos Implementados

| Método | Autor | O que faz |
|--------|-------|-----------|
| **Volume Profile** | Trader Dale | VPOC, VA, HVN/LVN com Tick Volume |
| **ML Inference** | Kaabar | Features proxy (absorption, tick velocity) |
| **Regime Detection** | Ruiz & Chan | GMM para classificar mercado |

### Machine Learning v2.0
- **XGBoost** com features proxy
- **GMM** para regime detection
- **Precision:** 54.9% com threshold 60%

📖 [Documentação completa →](./eos-iq-bot/README.md)

---

## 🏗️ Arquitetura

```
AWS EC2 (54.232.17.9)
│
├── eos-bot (PM2)           # EoS CRYPTO
│   ├── src/ofa/            # OFA Real
│   ├── src/mlFilter.ts     # Ensemble ML
│   └── data/eos.db         # SQLite
│
├── eos-iq-bot (PM2)        # EoS IQ
│   ├── src/ofa/            # OFA Proxy
│   ├── ml/                 # Kaabar Features
│   └── data/eos-iq.db      # SQLite
│
└── eos-ml/                 # Training Pipeline
    ├── src/                # Scripts Python
    └── models/             # Modelos PKL
```

---

## 📚 Referências Técnicas

| Autor | Contribuição |
|-------|--------------|
| **Michael Valtos** | Order Flow Philosophy |
| **Trader Dale** | Volume Profile com Tick Volume |
| **Rubén Villahermosa** | Cross-Market Analysis |
| **Sofien Kaabar** | ML Inference, Fractional Diff |
| **López de Prado** | Triple Barrier, Meta-Labeling |
| **Ruiz & Chan** | GMM Regime Detection |

---

## 📱 Telegram

| Bot | Username |
|-----|----------|
| EoS CRYPTO | @EoS_Evilbot |
| EoS IQ | @EoS_iqBot |

---

## 🔗 URLs

- **Site:** https://eos.s-iron.tech
- **EC2:** 54.232.17.9

---

*"One Ring to rule them all"* - Powered by s-iron.tech

*Última atualização: 31/12/2024*
