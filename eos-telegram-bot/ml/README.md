# EOS Crypto Bot - ML Pipeline

Pipeline de Machine Learning para melhorar a performance do bot de trading.

## Estrutura

```
ml/
├── build_dataset.py    # Exporta dados do SQLite para treino
├── train_direction.py  # Treina modelo de direção (LONG/SHORT/NO-TRADE)
├── train_gate.py       # Treina gating model (TRADE vs NO-TRADE)
├── infer.py            # Inferência em produção
└── requirements.txt    # Dependências Python
```

## Fluxo de Treinamento

```bash
# 1. Instalar dependências
pip install -r requirements.txt

# 2. Exportar dataset
python build_dataset.py

# 3. Treinar modelo de direção (XGBoost multiclass)
python train_direction.py

# 4. Treinar gating model (binário)
python train_gate.py
```

### Opções úteis via env

```bash
# Usar um banco específico (ex.: dump de produção)
export EOS_DB_PATH=/caminho/para/eos.db

# Label do gate: win (default) ou movement
export ML_GATE_LABEL_MODE=win

# Threshold da label de direção em %
export ML_LABEL_THRESHOLD_PCT=0.5
```

## Uso em Produção

```typescript
// No trendingScanner.ts
import { shouldExecuteTrade } from './ml/infer';

const mlResult = shouldExecuteTrade({
    f_smart_money: signal.f_smart_money,
    f_trend: signal.f_trend,
    f_momentum: signal.f_momentum,
    f_volume: signal.f_volume,
    f_imbalance: signal.f_imbalance,
    f_absorption: signal.f_absorption,
    score: signal.score,
    hour_utc: new Date().getUTCHours(),
    day_of_week: new Date().getUTCDay()
});

if (mlResult.should_trade) {
    // Executar trade na direção indicada
    executeSignal(mlResult.direction);
}
```

### Recalibração automática (walk-forward)

O bot pode executar `build_dataset.py` + `train_gate.py` + `train_direction.py` automaticamente em produção (ciclo semanal por padrão), com rollback caso as métricas piorem.

```bash
ML_RECALIBRATION_ENABLED=true
ML_RECALIBRATION_INTERVAL_HOURS=168
ML_RECALIBRATION_MIN_ML_RECORDS=400
ML_RECALIBRATION_MAX_F1_DROP=0.03
```

## Labels

- **`y_direction`**
  - `1 (LONG)`: movimento favorece LONG
  - `-1 (SHORT)`: movimento favorece SHORT
  - `0 (NO-TRADE)`: movimento pequeno
- O cálculo ajusta o sinal usando `action` (BUY/SELL), evitando inversão semântica nos exemplos SELL.
- **`y_trade`** (gate) é configurável:
  - `win` (default): `1` quando `result == WIN`
  - `movement`: `1` quando `|signed_profit_target| > threshold`

## Features

| Feature | Tipo | Range |
|---------|------|-------|
| f_smart_money | Contínua | 0-1 |
| f_trend | Contínua | -1 a 1 |
| f_momentum | Contínua | -1 a 1 |
| f_volume | Contínua | 0-1 |
| f_imbalance | Contínua | 0-1 |
| f_absorption | Contínua | 0-1 |
| score | Discreta | 0-100 |
| hour_sin/cos | Cíclica | -1 a 1 |
| dow_sin/cos | Cíclica | -1 a 1 |

## Validação

- Split temporal (não aleatório) para evitar data leakage
- Walk-forward validation para simular produção
- Métricas: F1 por classe, AUC-ROC, Precision/Recall
