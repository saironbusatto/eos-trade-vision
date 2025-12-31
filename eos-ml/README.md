# EoS Machine Learning v2.1 🧠

Modelo de Machine Learning para **filtrar sinais ruins** do EoS Trading Bot.

## Filosofia

> *"O que o Order Flow fornece ao trader é a capacidade de ficar fora do mercado quando não há razão para negociar."* — Michael Valtos

O modelo **não prevê preços**. Ele **classifica sinais** como WIN/LOSS para filtrar operações de baixa qualidade.

---

## Pipeline

```
Dados → FracDiff → Triple Barrier → GMM (regime) → XGBoost (prob) → Trade
```

### Fundamentos Técnicos

| Conceito | Fonte | Implementação |
|----------|-------|---------------|
| Fractional Differentiation | Kaabar | Estacionariedade preservando memória |
| Triple Barrier Labeling | López de Prado | WIN=TP, LOSS=SL ou Timeout |
| TimeSeriesSplit | Scikit-learn | Evitar look-ahead bias |
| GMM Regime Detection | Ruiz & Chan | "Ficar de fora" em regimes ruins |
| Probability Threshold | Kaabar | Só operar se prob > threshold |

---

## Quick Start

```bash
# Criar ambiente
python -m venv .venv
.venv\Scripts\activate  # Windows

# Instalar dependências
pip install -r requirements.txt

# Executar pipeline completo
python src/train_pipeline.py

# Validar métricas
python src/validate.py

# Iniciar API
python src/api_server.py
```

---

## Estrutura

```
eos-ml/
├── src/
│   ├── export_data.py      # SQLite → Parquet
│   ├── fracdiff.py         # Diferenciação fracionária
│   ├── train_pipeline.py   # Pipeline completo
│   ├── inference.py        # Classe EoSMLPredictor
│   ├── api_server.py       # API Flask (porta 5000)
│   └── validate.py         # Validação de métricas
├── models/
│   ├── gmm_regime.pkl      # GMM (5 clusters)
│   └── xgboost_v1.pkl      # XGBoost Classifier
├── data/
│   ├── signals.parquet     # 2166 sinais
│   └── features.pkl        # Features processadas
├── notebooks/              # 6 notebooks de análise
└── requirements.txt
```

---

## Features

### X_regime (GMM)
Alimentado com StandardScaler, detecta regime de mercado.

| Feature | Descrição |
|---------|-----------|
| f_volume | Volume ratio |
| f_momentum | Proxy volatilidade |
| f_trend | Tendência |
| hour_utc | Sessão |

### X_signal (XGBoost)
Classificação WIN/LOSS. FracDiff **apenas em features de preço**.

| Feature | Descrição |
|---------|-----------|
| f_price_context_frac | Distância VWAP (FracDiff) |
| f_smart_money | Bias institucional |
| f_imbalance | Força imbalances |
| f_absorption | Absorção |
| score | Score OFA |

---

## Métricas (2166 sinais)

| Score | Trades | Win Rate | Sharpe | Max DD |
|-------|--------|----------|--------|--------|
| 40+ | 2166 | 50.6% | 0.01 | 17.0% |
| 70+ | 591 | 51.3% | 0.53 | 9.8% |

---

## API

### Health Check
```bash
curl http://localhost:5000/health
```

### Predict
```bash
curl -X POST http://localhost:5000/predict \
  -H "Content-Type: application/json" \
  -d '{"score": 75, "f_volume": 0.8, "f_smart_money": 0.7}'
```

Response:
```json
{
  "should_execute": true,
  "probability": 0.65,
  "regime_ok": true,
  "cluster": 2,
  "reason": "Aprovado (prob=65%)"
}
```

---

## Integração com Bot

O bot usa `mlFilter.ts` que chama a API:

```typescript
import { mlFilter } from './mlFilter';

const result = await mlFilter.shouldExecute(features);
if (result.should_execute) {
    // Executar trade
}
```

---

*Powered by Kaabar, López de Prado, Ruiz & Chan*
