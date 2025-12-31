# EoS IQ Bot 🎯

Sistema de trading algorítmico para **Forex/Opções Binárias** com **Volume Profile Proxy** + **ML Inference**.

---

## 🎯 Por que Forex é Diferente

> *"O Forex não é uma bolsa centralizada. É um mercado OTC (Over The Counter) onde cada broker tem seu próprio order book."* — **Trader Dale**

### O Problema do Forex

| Característica | Crypto (Binance) | Forex |
|----------------|------------------|-------|
| **Mercado** | Centralizado | Descentralizado |
| **Order Book** | ✅ Público | ❌ Privado (cada broker) |
| **Volume** | ✅ Real (USD) | ⚠️ Tick Volume |
| **Smart Money** | ✅ Visível | ❌ Invisível |
| **Level 2** | ✅ Disponível | ❌ Não disponível |

**Conclusão:** Não podemos usar OFA tradicional. Precisamos de **proxies inteligentes**.

---

## 🔧 Solução: 3 Métodos Combinados

### 1. Volume Profile Proxy (Trader Dale)

> *"O Volume Profile funciona bem com Tick Volume. O que não funciona é Delta e Imbalances."* — **Trader Dale**

**O que usamos:**
- **VPOC** (Volume Point of Control) - Nível de maior volume
- **Value Area** (VA High/Low) - Onde 70% do volume ocorreu
- **HVN** (High Volume Nodes) - Zonas de acumulação
- **LVN** (Low Volume Nodes) - Zonas de baixa liquidez

**Estratégia:**
- 📈 **Comprar** em rejeição de LVN + confirmação no VA
- 📉 **Vender** em rejeição de VPOC + momentum negativo

---

### 2. ML Inference (Kaabar/Ruiz)

> *"Se você não tem o Order Book real, pode usar o comportamento do preço para estimar a agressividade."* — **Sofien Kaabar**

**Features Proxy:**

| Feature | Proxy Para | Cálculo |
|---------|------------|---------|
| `tick_velocity` | Agressividade | `abs(close-open) / volume` |
| `absorption_proxy` | Absorção | Alto volume + baixo range |
| `liquidity_proxy` | Liquidez | `volume / volatility` |
| `price_to_vwap` | Contexto | Distância do VWAP simulado |
| `body_ratio` | Iniciativa | % do corpo vs range |

**GMM Regime Detection (Ruiz & Chan):**
- **Regime 0:** Trending - Operar a favor
- **Regime 1:** Ranging - Aguardar breakout
- **Regime 2:** Volatile - Evitar (baixa liquidez)

---

### 3. Cross-Market Analysis (Villahermosa) [Futuro]

> *"A correlação entre Futuros (CME) e Spot é virtualmente 100%."* — **Rubén Villahermosa**

**Conceito:**
- Analisar Order Flow do **Futuro CME** (6E, 6B)
- Executar no **Spot** (EUR/USD, GBP/USD)

**Mapeamento:**
| Futuro CME | Par Forex |
|------------|-----------|
| 6E | EUR/USD |
| 6B | GBP/USD |
| 6J | USD/JPY |
| 6A | AUD/USD |

*Ainda não implementado - requer API de futuros*

---

## 🧠 Machine Learning v2.0

### Pipeline

```
Dados Yahoo → Features Kaabar → GMM (Regime) → XGBoost → Threshold 60% → Sinal
```

### Resultados do Treinamento

**~41.000 candles** (5 pares x 30 dias de 5min)

| Threshold | Precision | Trades/fold |
|-----------|-----------|-------------|
| 55% | 53.1% | 1718 |
| 60% | 54.9% | 883 |
| 65% | 55% | ~400 |

### Melhores Horários UTC

| Hora | Win Rate | Samples |
|------|----------|---------|
| 22:00 | 52.9% | 1506 |
| 12:00 | 52.0% | 1764 |
| 17:00 | 51.4% | 1764 |

---

## 📁 Estrutura

```
eos-iq-bot/
├── src/
│   ├── ofa/analyzer.ts      # OFA simplificado
│   ├── forexData.ts         # API gratuita
│   ├── sqliteDatabase.ts    # Persistência
│   └── telegram.ts          # Notificações
├── ml/
│   ├── advanced_features.py # Volume Profile + Kaabar
│   ├── train_forex_v2.py    # Pipeline ML
│   └── fetch_forex_data.py  # Yahoo Finance
└── models/
    └── forex_xgboost_v2.pkl # Modelo treinado
```

---

## ⚠️ Limitações

1. **Tick Volume ≠ Volume Real** - É apenas contagem de ticks
2. **Sem Delta/Imbalance Real** - Usamos proxies
3. **Correlação CME** - Ainda não implementada
4. **Mercado fechado fim de semana** - Bot pausa automaticamente

---

## 📚 Referências

| Autor | Contribuição |
|-------|--------------|
| **Trader Dale** | Volume Profile com Tick Volume |
| **Rubén Villahermosa** | Cross-Market Analysis |
| **Sofien Kaabar** | ML Inference, Tick Velocity |
| **Ruiz & Chan** | GMM Regime Detection |

---

*Powered by s-iron.tech | Estratégia v2.0 (Kaabar Method)*
