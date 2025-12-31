# EOS Crypto Bot - Documentação Técnica

## Order Flow Analysis (OFA)

### Conceito

OFA é uma metodologia de análise que vai além do preço e volume tradicionais. Ela analisa:
- **Quem** está comprando/vendendo (varejo vs institucional)
- **Onde** o preço está em relação às zonas de volume
- **Como** os participantes estão agindo (agressivos vs passivos)

### Módulos

#### 1. Smart Money Filter (`smartMoneyFilter.ts`)

**O que faz:** Classifica trades por tamanho para separar varejo de institucionais.

**Thresholds:**
- `< $500` = IGNORE (ruído)
- `$500-$5k` = RETAIL (peso 1x)
- `$5k-$25k` = SMART MONEY (peso 3x)
- `> $100k` = WHALE (peso 10x)

**Saída:**
- `smartMoneyBias`: BULLISH/BEARISH/NEUTRAL
- `divergence`: true se varejo e smart money divergem
- `whaleTrades`: quantidade de trades whale

---

#### 2. Volume Profile (`volumeProfile.ts`)

**O que faz:** Calcula a distribuição de volume por preço (não por tempo).

**Conceitos:**
- **VPOC** (Volume Point of Control): Preço com mais volume
- **Value Area** (68.2%): Onde 68.2% do volume foi negociado
- **HVN** (High Volume Node): Zonas de suporte/resistência forte
- **LVN** (Low Volume Node): Zonas de rápido movimento

**Contexto:**
- `ABOVE_VA`: Preço acima da área de valor = bullish
- `INSIDE_VA`: Preço dentro = consolidação
- `BELOW_VA`: Preço abaixo = bearish

---

#### 3. Footprint (`footprint.ts`)

**O que faz:** Agrupa trades por candle separando Bid (venda agressiva) vs Ask (compra agressiva).

**Métricas:**
- `bidVolume`: Volume vendido (vendedor agrediu)
- `askVolume`: Volume comprado (comprador agrediu)
- `delta`: Ask - Bid (quem está ganhando)
- `percentBuy`: % do volume que foi compra

---

#### 4. Imbalance Detector (`imbalanceDetector.ts`)

**O que faz:** Detecta desequilíbrios de volume entre compradores e vendedores.

**Conceitos:**
- **Imbalance**: Volume de um lado 300%+ maior que o outro
- **Stacked Imbalance**: 3 ou mais imbalances consecutivos = sinal MUITO forte

**Comparação Diagonal (Trader Dale):**
- Compara Ask[i] vs Bid[i-1] (diagonal)
- Se ratio > 3.0 = imbalance detectado

---

#### 5. Absorption Detector (`absorptionDetector.ts`)

**O que faz:** Detecta quando grande volume não move o preço.

**Conceito:**
- Alto volume + baixo movimento = instituição absorvendo
- **ACCUMULATION**: Compra absorvida (bullish)
- **DISTRIBUTION**: Venda absorvida (bearish)

**Critérios:**
- Volume > 2x média
- Movimento de preço < 0.2%

---

## Machine Learning

### Features Normalizadas

Cada feature foi normalizada para 0-1 (ou -1 a 1) para facilitar ML:

| Feature | Range | Cálculo |
|---------|-------|---------|
| `f_smart_money` | -1 a 1 | BULLISH=1, NEUTRAL=0, BEARISH=-1 |
| `f_price_context` | 0 a 1 | BELOW=0, INSIDE=0.5, ABOVE=1 |
| `f_imbalance` | 0 a 1 | score/100 (capped) |
| `f_absorption` | 0 a 1 | score/100 (capped) |
| `f_trend` | 0 a 1 | (trend+1)/2 |
| `f_momentum` | 0 a 1 | (momentum+1)/2 |
| `f_volume` | 0 a 1 | volumeRatio/5 (capped) |

### Dados Coletados

```json
{
  "result": "WIN",
  "score": 75,
  "f_smart_money": 0.7,
  "f_price_context": 0.8,
  "f_imbalance": 0.6,
  "f_absorption": 0.3,
  "f_trend": 0.65,
  "f_momentum": 0.55,
  "f_volume": 0.4,
  "time_to_result_min": 45
}
```

### Análise Futura

Com ~100 trades poderemos:
1. Calcular win rate por faixa de score
2. Identificar features mais importantes
3. Ajustar pesos do scoring

Com ~500+ trades:
1. Treinar modelo de regressão
2. Otimizar thresholds
3. Backtesting

---

## Calculadora de Futures

### Conceito

Calcula posição ideal baseada em:
- Banca fixa ($1000)
- Risco por trade (2%)
- Stop loss (1%)
- Take profit (2%)

### Fórmulas

```
riskAmount = bankroll × riskPercent
positionSize = riskAmount / stopPercent
leverage = positionSize / bankroll
```

### Taxas Binance

| Tipo | Taxa |
|------|------|
| Maker (limite) | 0.02% |
| Taker (mercado) | 0.04% |
| Desconto BNB | -10% |

### Funding Rate

Buscado em tempo real da API:
```
GET https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1
```

Se funding > 0.03% = aviso ⚠️

---

## Fluxo de Execução

```
1. TrendingScanner.scan() [cada 10 min]
   └─> Busca top 10 coins por volume (Binance)

2. Para cada coin:
   └─> analyzeOFA(coin)
       ├─> getSmartMoneyDelta()
       ├─> calculateVolumeProfile()
       ├─> analyzeImbalances()
       └─> analyzeAbsorption()

3. Se score >= MIN_SCORE:
   ├─> Salva em SQLite (signals table)
   └─> Envia para Telegram (🔮 EoS CRYPTO)

4. Validation loop [cada 5 min]
   ├─> Busca sinais PENDING
   ├─> Verifica se bateu stop/target
   ├─> Atualiza resultado (WIN/LOSS)
   └─> Salva em ml_training table
```

---

## Configuração

### Variáveis de Ambiente

```
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHANNEL_ID=-100xxx
DATABASE_PATH=./data/eos.db
```

### Constantes

```typescript
// trendingScanner.ts
DATA_COLLECTION_MODE = true;  // true=40%, false=75%
MIN_SCORE = 40;               // Mínimo para enviar sinal
SCAN_INTERVAL = 10 * 60 * 1000;  // 10 minutos
VALIDATION_INTERVAL = 5 * 60 * 1000;  // 5 minutos

// leverageCalculator.ts
DEFAULT_BANKROLL = 1000;
RISK_PERCENT = 2;
MAKER_FEE = 0.0002;
TAKER_FEE = 0.0004;
```

---

*Eye of Sauron - Order Flow Analysis*
