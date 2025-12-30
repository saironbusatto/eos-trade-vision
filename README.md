# EOS - Eye of Sauron 🔴

Sistema de trading algorítmico com **Order Flow Analysis (OFA)** profissional para criptomoedas e Forex.

## 🎯 Features Principais

### Crypto Bot (eos-telegram-bot)
- **TrendingScanner** - Monitora top 10 moedas por volume a cada 10 min
- **OFA Profissional** - 5 módulos de análise (90% capacidade)
- **ML Ready** - 7 features normalizadas para machine learning
- **Binance Futures** - Cálculo de alavancagem, taxas, funding rate

### Forex Bot (eos-iq-bot)
- **10 Pares Forex** - EUR/USD, GBP/USD, etc
- **10 Indicadores OFA** - Análise completa
- **Auto-start** - Liga automaticamente quando mercado abre
- **Database JSON** - Histórico para análise

---

## 🧠 Order Flow Analysis (OFA)

### Módulos Implementados

| Módulo | Arquivo | O Que Faz |
|--------|---------|-----------|
| **Smart Money Filter** | `ofa/smartMoneyFilter.ts` | Filtra trades por tamanho ($500-$100k+) |
| **Volume Profile** | `ofa/volumeProfile.ts` | Calcula VPOC, Value Area, HVN/LVN |
| **Footprint** | `ofa/footprint.ts` | Analisa Bid/Ask por candle |
| **Imbalance Detector** | `ofa/imbalanceDetector.ts` | Detecta Stacked Imbalances (300%+) |
| **Absorption Detector** | `ofa/absorptionDetector.ts` | Identifica acumulação/distribuição |

### Sistema de Scoring

```
LONG Points / SHORT Points

Smart Money Bias:    25 pts (BULLISH/BEARISH)
Imbalance Dominance: 30 pts (BUY/SELL)
Stacked Imbalance:   15 pts (bônus se 3+ consecutivos)
Volume Profile:      20 pts (ABOVE/INSIDE/BELOW VA)
Absorption:          10 pts (ACCUMULATION/DISTRIBUTION)
Trend + Momentum:    15 pts

Mínimo para sinal: 40 pts (coleta) ou 75 pts (produção)
```

---

## 📊 Machine Learning

### Features Normalizadas (0-1)

| Feature | Valor | Significado |
|---------|-------|-------------|
| `f_smart_money` | -1 a 1 | BEARISH/NEUTRAL/BULLISH |
| `f_price_context` | 0-1 | BELOW/INSIDE/ABOVE VA |
| `f_imbalance` | 0-1 | Força das imbalances |
| `f_absorption` | 0-1 | Força da absorção |
| `f_trend` | 0-1 | Tendência normalizada |
| `f_momentum` | 0-1 | Momentum normalizado |
| `f_volume` | 0-1 | Volume ratio normalizado |

### Databases

```
data/
├── crypto_signals.json   # Sinais ativos (PENDING/WIN/LOSS)
└── ml_training.json      # Dados validados para ML
```

### Exportação CSV

```typescript
cryptoDatabase.exportForML()
// timestamp,symbol,result,score,f_smart_money,f_price_context,...
```

---

## 💰 Calculadora de Futures

### Features
- Cálculo de alavancagem baseado em risco (2%)
- Preço limite sugerido (50% menos taxa)
- Funding rate em tempo real da Binance
- Win/Loss esperado com taxas incluídas
- Risk:Reward ratio

### Configuração Default
```
Banca: $1000
Risco por trade: 2%
Stop Loss: 1%
Take Profit: 2%
Taxas Maker: 0.02%
Taxas Taker: 0.04%
```

---

## 🏗️ Arquitetura

```
eos.s-iron.tech (AWS EC2 - t2.micro)
│
├── Frontend (Nginx + HTTPS)
│   ├── React + Vite + TypeScript
│   └── Dashboard de sinais
│
├── EOS Crypto Bot (PM2: eos-bot)
│   ├── src/
│   │   ├── ofa/
│   │   │   ├── smartMoneyFilter.ts
│   │   │   ├── volumeProfile.ts
│   │   │   ├── footprint.ts
│   │   │   ├── imbalanceDetector.ts
│   │   │   ├── absorptionDetector.ts
│   │   │   └── index.ts
│   │   ├── trendingScanner.ts
│   │   ├── leverageCalculator.ts
│   │   ├── database.ts
│   │   └── telegram.ts
│   └── data/
│       ├── crypto_signals.json
│       └── ml_training.json
│
└── EOS IQ Bot (PM2: eos-iq)
    └── src/
        ├── index.ts (OFA + Telegram)
        └── quotes.ts (120 frases Tolkien)
```

---

## 📱 Telegram Bots

| Bot | Username | Função |
|-----|----------|--------|
| EOS Crypto | @EoS_Evilbot | Top 10 Trending + OFA |
| EOS IQ | @EoS_IQbot | Forex OFA + Sinais Binárias |

### Formato do Sinal

```
Sinal Palantir!

2 oportunidade(s) detectada(s):

*BTC* COMPRA
Entry: $94523.00
Stop: $93577.77 | Alvo: $96413.46
Prob: 82% | 24h: +2.34%
R:R = 2.0:1

━━━━━ Binance Futures ━━━━━
Banca: $1000 | Risco: 2%
Alavancagem: 2x
Limite: $94475.74 (50% menos taxa)
WIN: +$39.84 | LOSS: -$20.16
Taxa: $1.60 | Fund: 0.0100%
Pague com BNB = -10% extra
━━━━━━━━━━━━━━━━━━━━━━

"Sou inevitavel."
```

---

## 🚀 Deploy

### Frontend
```bash
npm run build
scp -r dist/* ec2-user@54.232.17.9:/var/www/eos/
```

### EOS Crypto Bot
```bash
cd eos-telegram-bot
npm run build
scp -r dist/* ec2-user@54.232.17.9:/home/ec2-user/eos-bot/dist/
ssh ec2-user@54.232.17.9 "pm2 restart eos-bot"
```

### EOS IQ Bot
```bash
cd eos-iq-bot
npm run build
scp -r dist/* ec2-user@54.232.17.9:/home/ec2-user/eos-iq-bot/dist/
ssh ec2-user@54.232.17.9 "pm2 restart eos-iq"
```

---

## ⚙️ Variáveis de Ambiente

### EOS Crypto Bot (.env)
```
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHANNEL_ID=-100xxx
API_SECRET=xxx
DATABASE_PATH=./data/crypto_signals.json
```

### EOS IQ Bot (.env)
```
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_ADMIN_ID=xxx
TELEGRAM_CHANNEL_ID=-100xxx
TWELVE_DATA_API_KEY=xxx
```

---

## 🎮 Modos de Operação

### Modo Coleta (DATA_COLLECTION_MODE = true)
- Threshold: 40%
- Mais sinais, mais dados
- Aviso no canal: "NÃO OPERE COM DINHEIRO REAL"

### Modo Produção (DATA_COLLECTION_MODE = false)
- Threshold: 75%
- Sinais de alta qualidade
- Para trading real

---

## 📈 Roadmap

- [x] Smart Money Filter
- [x] Volume Profile (VPOC, VA)
- [x] Stacked Imbalances
- [x] Absorption Detection
- [x] Footprint Simplificado
- [x] ML Features Normalizadas
- [x] Calculadora Futures
- [ ] Testes Automatizados
- [ ] Dashboard Web para KPIs
- [ ] Modelo ML com dados coletados

---

## 🔗 URLs

- **Site:** https://eos.s-iron.tech
- **Dashboard:** https://eos.s-iron.tech/dashboard
- **Health:** https://eos.s-iron.tech/health

---

*"One Ring to rule them all"* - Powered by s-iron.tech
