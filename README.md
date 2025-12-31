# EOS - Eye of Sauron 🔴

Sistema de trading algorítmico com **Order Flow Analysis (OFA)** + **Machine Learning** para criptomoedas e Forex.

## 🎯 Overview

| Bot | Prefixo | Mercado | Status |
|-----|---------|---------|--------|
| **EoS CRYPTO** | 🔮 | Criptomoedas (Binance) | ✅ Ativo |
| **EoS IQ** | 🎯 | Forex (IQ Option) | ✅ Ativo |
| **EoS ML** | 🧠 | Filtro Inteligente | ✅ Integrado |

---

## 🧠 Machine Learning v2.1

### Filosofia do Modelo

> *"O que o Order Flow fornece ao trader é a capacidade de ficar fora do mercado quando não há razão para negociar."* — Michael Valtos

O modelo ML **não tenta prever preços** — ele **filtra sinais ruins**.

### Pipeline de Decisão

```
Sinal OFA → GMM (Regime) → XGBoost (Probabilidade) → Threshold → Executar/Rejeitar
```

### Decisões Técnicas (Kaabar + Ruiz & Chan)

| Conceito | Implementação | Fonte |
|----------|---------------|-------|
| **Fractional Differentiation** | Estacionariedade sem perder memória | Kaabar |
| **Triple Barrier Method** | WIN=TP, LOSS=SL/Timeout | López de Prado |
| **TimeSeriesSplit** | Evitar look-ahead bias | Scikit-learn |
| **GMM Regime Detection** | Pausar em regimes desconhecidos | Ruiz & Chan |
| **Probability Threshold** | Só operar se prob > 65% | Kaabar |

### Features Utilizadas

**X_regime (GMM - Macro):**
- `f_volume` - Volume ratio
- `f_momentum` - Proxy de volatilidade  
- `f_trend` - Tendência
- `hour_utc` - Sessão de mercado

**X_signal (XGBoost - Direcional):**
- `f_price_context_frac` - Distância VWAP (com FracDiff)
- `f_smart_money` - Bias institucional
- `f_imbalance` - Força imbalances
- `f_absorption` - Absorção passiva
- `score` - Score OFA

### Modos de Operação

| Modo | MIN_SCORE | ML Filter | Descrição |
|------|-----------|-----------|-----------|
| **Coleta (Atual)** | 40 | Log only | Coletar dados para treinar |
| **Produção** | 75 | Ativo | Filtrar sinais ruins |

### Métricas Atuais (2166 sinais)

| Score | Trades | Win Rate | Sharpe | Max DD |
|-------|--------|----------|--------|--------|
| 40+ | 2166 | 50.6% | 0.01 | 17.0% |
| 60+ | 1160 | 51.3% | 0.30 | 13.2% |
| 70+ | 591 | 51.3% | 0.53 | 9.8% |

### Estrutura do Projeto ML

```
eos-ml/
├── src/
│   ├── export_data.py      # SQLite → Parquet
│   ├── fracdiff.py         # Diferenciação fracionária
│   ├── train_pipeline.py   # Pipeline completo
│   ├── inference.py        # Classe EoSMLPredictor
│   ├── api_server.py       # API Flask
│   └── validate.py         # Validação de métricas
├── models/
│   ├── gmm_regime.pkl      # Detector de regime
│   └── xgboost_v1.pkl      # Classificador
├── data/
│   └── *.parquet           # Dados processados
└── notebooks/              # 6 notebooks de análise
```

---

## 📊 EoS CRYPTO Bot

### Features
- **TrendingScanner** - Monitora top 10 moedas por volume a cada 10 min
- **5 Módulos OFA** - Smart Money, Volume Profile, Footprint, Imbalance, Absorption
- **SQLite Database** - Persistência de sinais e dados para ML
- **ML Filter** - Integração com modelo de filtro (mlFilter.ts)
- **Binance Futures** - Cálculo de alavancagem, taxas, funding rate
- **Validação Automática** - Acompanha sinais por 45 min, reporta WIN/LOSS

### Database (SQLite)

```
data/eos.db
├── signals         # Sinais ativos (PENDING/WIN/LOSS)
├── ml_training     # Dados validados para ML
└── price_checkpoints # Checkpoints de preço (5/10/15/30 min)
```

---

## 🎯 EoS IQ Bot

### Features
- **10 Pares Forex** - EUR/USD, GBP/USD, USD/JPY, etc
- **10 Indicadores OFA** - Análise completa
- **API Gratuita** - Usa open.er-api.com (sem API key)
- **Auto-start** - Liga quando mercado Forex abre

---

## 🔮 Order Flow Analysis (OFA)

### Módulos Implementados

| Módulo | Função |
|--------|--------|
| **Smart Money Filter** | Filtra trades por tamanho ($500-$100k+) |
| **Volume Profile** | VPOC, Value Area, HVN/LVN |
| **Footprint** | Analisa Bid/Ask por candle |
| **Imbalance Detector** | Stacked Imbalances (300%+) |
| **Absorption Detector** | Acumulação/Distribuição |

### Sistema de Scoring

```
Mínimo para sinal: 40 pts (coleta) ou 75 pts (produção)

Smart Money Bias:    25 pts
Imbalance Dominance: 30 pts
Stacked Imbalance:   15 pts
Volume Profile:      20 pts
Absorption:          10 pts
```

---

## 🏗️ Arquitetura

```
AWS EC2 (54.232.17.9)
│
├── eos-bot (PM2)           # EoS CRYPTO
│   ├── src/
│   │   ├── ofa/            # Módulos OFA
│   │   ├── mlFilter.ts     # 🧠 Integração ML
│   │   ├── trendingScanner.ts
│   │   ├── sqliteDatabase.ts
│   │   └── telegram.ts
│   └── data/eos.db         # SQLite
│
├── eos-iq-bot (PM2)        # EoS IQ
│   ├── src/
│   │   ├── ofa/analyzer.ts
│   │   ├── forexData.ts    # API gratuita
│   │   └── telegram.ts
│   └── data/eos-iq.db
│
├── eos-ml/                 # 🧠 Machine Learning
│   ├── src/api_server.py   # API Flask
│   └── models/             # GMM + XGBoost
│
└── Frontend (Nginx)        # https://eos.s-iron.tech
```

---

## 📱 Telegram

| Bot | Username | Canal |
|-----|----------|-------|
| EoS CRYPTO | @EoS_Evilbot | Sinais Crypto |
| EoS IQ | @EoS_iqBot | Sinais Forex |

---

## � Deploy

### ML API (Flask)
```bash
cd eos-ml
.venv/Scripts/python src/api_server.py
```

### Crypto Bot
```bash
cd eos-telegram-bot
npm run build
scp -i sirontech_key.pem -r dist/* ec2-user@54.232.17.9:/home/ec2-user/eos-bot/dist/
ssh -i sirontech_key.pem ec2-user@54.232.17.9 "pm2 restart eos-bot"
```

### IQ Bot
```bash
cd eos-iq-bot
npm run build
scp -i sirontech_key.pem -r dist/* ec2-user@54.232.17.9:/home/ec2-user/eos-iq-bot/dist/
ssh -i sirontech_key.pem ec2-user@54.232.17.9 "pm2 restart eos-iq"
```

---

## 📈 Roadmap

- [x] Smart Money Filter
- [x] Volume Profile (VPOC, VA)
- [x] Stacked Imbalances
- [x] Absorption Detection
- [x] SQLite Database
- [x] Validação automática WIN/LOSS
- [x] API Forex gratuita
- [x] Identificadores EoS CRYPTO / EoS IQ
- [x] **Machine Learning v2.1**
  - [x] Fractional Differentiation (Kaabar)
  - [x] Triple Barrier Labeling
  - [x] GMM Regime Detection
  - [x] XGBoost Classifier
  - [x] Integração com Bot (mlFilter.ts)
- [ ] Dashboard Web para KPIs
- [ ] Deploy ML API no EC2

---

## 🔗 URLs

- **Site:** https://eos.s-iron.tech
- **EC2:** 54.232.17.9

---

*"One Ring to rule them all"* - Powered by s-iron.tech

*Última atualização: 31/12/2024*
