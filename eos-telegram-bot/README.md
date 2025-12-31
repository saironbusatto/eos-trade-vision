# EoS CRYPTO Bot 🔮

Sistema de trading algorítmico com **Order Flow Analysis (OFA) real** + **Machine Learning Ensemble** para criptomoedas.

---

## 🎯 Filosofia

> *"O que o Order Flow fornece ao trader é a capacidade de ficar fora do mercado quando não há razão para negociar."* — **Michael Valtos**

O modelo **não prevê preços**. Ele **filtra sinais ruins** usando Order Flow institucional.

---

## 📊 Por que OFA Real Funciona em Crypto

| Característica | Crypto (Binance) | Vantagem |
|----------------|------------------|----------|
| **Mercado** | Centralizado | Order Book público |
| **Order Book** | ✅ API Binance | Vemos TODAS as ordens |
| **Trades** | ✅ Tempo real | Buyer/Seller ID |
| **Volume** | ✅ Real (USD) | Podemos filtrar "Smart Money" |
| **Level 2** | ✅ Depth data | Imbalances, Absorption |

### Vantagem Competitiva

Porque temos acesso ao **Order Book real**, podemos calcular:

1. **Smart Money Filter** - Filtra trades por tamanho ($500-$100k+)
2. **Stacked Imbalances** - Detecta ordens agressivas (300%+ ratio)
3. **Absorption** - Identifica quando instituições estão defendendo níveis
4. **Delta** - Diferença entre compras e vendas agressivas

---

## 🧠 Machine Learning v3.0

### Ensemble de 4 Modelos

```
Sinal OFA → GMM (Regime) → Ensemble (4 modelos) → Threshold 70% → Executar/Rejeitar
```

| Modelo | Peso | Função |
|--------|------|--------|
| **XGBoost** | 2x | Gradient boosting otimizado |
| **LightGBM** | 2x | Versão rápida |
| **Random Forest** | 1x | Robusto a overfitting |
| **Gradient Boosting** | 1x | Sklearn clássico |

### Features (Order Flow Real)

| Feature | Fonte | Descrição |
|---------|-------|-----------|
| `f_smart_money` | Order Book | Bias institucional (grandes trades) |
| `f_imbalance` | Footprint | Força dos imbalances |
| `f_absorption` | Delta/Volume | Ordens passivas absorvendo |
| `f_price_context` | VWAP | Distância do preço justo |
| `f_trend` | EMA | Tendência |
| `f_momentum` | ROC | Velocidade |
| `f_volume` | Volume | Volume ratio |

### Decisões Técnicas

| Conceito | Fonte | Por quê? |
|----------|-------|----------|
| **Fractional Differentiation** | Kaabar | Estacionariedade sem perder memória |
| **Triple Barrier Labeling** | López de Prado | WIN=TP, LOSS=SL/Timeout |
| **TimeSeriesSplit** | Scikit-learn | Evitar look-ahead bias |
| **GMM Regime Detection** | Ruiz & Chan | Pausar em regimes ruins |
| **Ensemble Voting** | ML Best Practices | Reduzir variância |

---

## 📈 Métricas Atuais

| Score | Trades | Win Rate | Sharpe | Max DD |
|-------|--------|----------|--------|--------|
| 40+ | 2166 | 50.6% | 0.01 | 17.0% |
| 70+ | 591 | 51.3% | 0.53 | 9.8% |

**Com ML Filter (threshold 70%):** Precision ~60%

---

## 🏗️ Arquitetura

```
eos-telegram-bot/
├── src/
│   ├── ofa/
│   │   ├── smartMoneyFilter.ts   # Filtra trades grandes
│   │   ├── volumeProfile.ts      # VPOC, Value Area
│   │   ├── footprint.ts          # Bid/Ask analysis
│   │   ├── imbalanceDetector.ts  # Stacked imbalances
│   │   └── absorptionDetector.ts # Absorção passiva
│   ├── mlFilter.ts               # 🧠 Integração ML
│   ├── trendingScanner.ts        # Scanner principal
│   └── sqliteDatabase.ts         # Persistência
└── data/eos.db                   # SQLite
```

---

## 📚 Referências

- **Michael Valtos** - Order Flow Philosophy
- **López de Prado** - Triple Barrier, Meta-Labeling
- **Kaabar** - Fractional Differentiation
- **Ruiz & Chan** - Regime Detection

---

*Powered by s-iron.tech | Estratégia v3.0*
