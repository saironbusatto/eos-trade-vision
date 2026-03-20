# Algoritmo EoS (Guia Técnico para TCC)

Este documento descreve, de forma didática e auditável, as regras matemáticas do algoritmo usado em produção no `eos-telegram-bot`.

## 1. Objetivo quantitativo

O sistema não tenta prever preço absoluto. Ele resolve um problema de decisão binária em sequência:

1. `devo operar agora?` (gate)
2. `se operar, qual direção?` (LONG/SHORT)

A meta é maximizar expectativa com controle de risco e estabilidade operacional.

## 2. Universo e janelas

- Símbolos monitorados (default): `BTC, ETH, SOL, XRP, BNB, DOGE, ADA, AVAX, LINK, DOT` (pares `USDT`).
- Janela principal de microestrutura: 15 minutos.
- Candles para contexto: 20 candles de 15m.

## 3. Pontuação OFA (Order Flow)

Para cada ativo, o bot calcula pontos LONG e SHORT:

- Smart Money bias:
  - BULLISH: `LONG += 25`
  - BEARISH: `SHORT += 25`
- Volume Profile context:
  - ABOVE_VA: `LONG += 20`
  - BELOW_VA: `SHORT += 20`
- Imbalance dominante:
  - BUY: `LONG += 30`
  - SELL: `SHORT += 30`
- Stacked imbalance significativo:
  - se BUY: `LONG += 15`
  - se SELL: `SHORT += 15`
- Absorption:
  - ACCUMULATION: `LONG += 10`
  - DISTRIBUTION: `SHORT += 10`
- Tendência (backup):
  - `trend > 0`: `LONG += 10`
  - `trend < 0`: `SHORT += 10`
- Momentum (backup):
  - `momentum > 0`: `LONG += 5`
  - `momentum < 0`: `SHORT += 5`

Regra de decisão OFA:

- Se `LONG > SHORT` e `LONG >= 40` => direção LONG
- Se `SHORT > LONG` e `SHORT >= 40` => direção SHORT
- Caso contrário: sem sinal

Score OFA usado no pipeline:

- `score = min(max(LONG, SHORT), 100)`

## 4. Features e normalização

Features normalizadas para ML/decisão:

- `f_smart_money ∈ {-1,0,1}`
- `f_price_context ∈ {0,0.5,1}`
- `f_imbalance = min(imbalance_score/100, 1)`
- `f_absorption = min(absorption_score/100, 1)`
- `f_trend = clamp((trend+1)/2, 0, 1)`
- `f_momentum = clamp((momentum+1)/2, 0, 1)`
- `f_volume = min(volume_ratio/5, 1)`

Cálculos auxiliares:

- `volume_ratio = volume_ultimo_candle / média(volume_candles_anteriores)`
- `trend = (close_ultimo - close_primeiro) / close_primeiro`
- `momentum = (média(closes_recentes_5) - média(closes_anteriores_5)) / média(closes_anteriores_5)`

## 5. Volatilidade e risco dinâmico

Volatilidade local (15m):

- `r_i = |(close_i - close_{i-1}) / close_{i-1}|`
- `volatility15m = clamp(mean(r_i), 0.0025, 0.02)`

Stop dinâmico (%):

- `baseStop = clamp(volatility15m * 100 * RISK_VOL_TO_STOP_MULTIPLIER, RISK_STOP_MIN_PERCENT, RISK_STOP_MAX_PERCENT)`

Target ratio adaptativo:

- inicia em `RISK_TARGET_STOP_RATIO`
- se `score >= 85` e `|momentum| >= 0.003`: `ratio += 0.1` (máx 1.0)
- se `|momentum| <= 0.0015`: `ratio -= 0.1` (mín 0.65)

Target dinâmico (%):

- `targetPercent = clamp(baseStop * ratio, RISK_TARGET_MIN_PERCENT, RISK_TARGET_MAX_PERCENT)`

## 6. Filtro horário-direcional (Edge Matrix)

O bot estima desempenho por `(hora UTC, direção)` usando histórico fechado (`WIN/LOSS`):

- `win_rate = wins / n`
- `expectancy = mean(final_profit)`
- `std_dev` amostral
- `IC95(expectancy) = expectancy ± z * (std_dev / sqrt(n))`, com `z = 1.9599639845`

Wilson para IC95 do win rate:

- `p = wins/n`
- `z² = z*z`
- `den = 1 + z²/n`
- `center = (p + z²/(2n)) / den`
- `margin = z * sqrt((p(1-p) + z²/(4n))/n) / den`
- `IC95_low = max(0, center - margin)`

Condição mínima para passar no filtro:

- `n >= HOUR_DIRECTION_MIN_TRADES`
- `win_rate >= HOUR_DIRECTION_MIN_WINRATE`
- `win_rate_ci95_low >= HOUR_DIRECTION_MIN_WINRATE_CI95_LOW`
- se `ENABLE_EXPECTANCY_GATE=true`: `expectancy_ci95_low > HOUR_DIRECTION_MIN_EXPECTANCY_CI95_LOW`

## 7. Score unificado (Q-Score)

Componentes (todos em `[0,1]`):

- `ofa = clamp(score/100, 0, 1)`
- `ml = 0.45*gateProb + 0.40*directionProb + 0.15*agreement`
  - `agreement = 1` se direção ML = direção OFA
  - `agreement = 0.30` se ML = NO-TRADE
  - `agreement = 0` caso contrário
- `edge` (histórico horário-direcional):
  - `ciWinrateScore = clamp((win_rate_ci95_low - 35)/25, 0, 1)`
  - `winrateScore = clamp((win_rate - 45)/20, 0, 1)`
  - `expectancyScore = clamp((expectancy_ci95_low + 0.2)/0.4, 0, 1)`
  - `sampleSizeScore = clamp((n - minTrades)/(2*minTrades), 0, 1)`
  - `edge = 0.35*ciWinrateScore + 0.25*winrateScore + 0.25*expectancyScore + 0.15*sampleSizeScore`
- `regime = 0.7*marketRegime + 0.3*infraRegime`
- `sentiment`: média ponderada por impacto/notícia-alvo convertida para `[0,1]`

Regime de mercado:

- `trendScore = clamp(0.5 + directionalTrend*45, 0, 1)`
- `momentumScore = clamp(0.5 + directionalMomentum*60, 0, 1)`
- `volatilityScore = clamp(1 - ((volatility15m - 0.004)/0.02), 0, 1)`
- `marketRegime = 0.45*trendScore + 0.35*momentumScore + 0.20*volatilityScore`

Regime de infraestrutura:

- score por estado (`LIVE_OK=1`, `DEGRADED=0.6`, `WARMING=0.35`, `OFFLINE=0.15`, fallback `0.25`)
- `infraRegime = 0.7*stateScore + 0.3*coverageScore`
- `coverageScore = clamp(coverage / ENGINE_TARGET_COVERAGE_SEC, 0, 1)`

Score final:

- `Q = Σ (w_i * component_i)` com pesos normalizados
- default: `OFA=0.30, ML=0.30, Edge=0.20, Regime=0.10, Sentiment=0.10`

Critério:

- rejeita se `Q < UNIFIED_DECISION_MIN_SCORE`
- se `UNIFIED_SCORE_REQUIRE_ML_APPROVAL=true`, exige `ml.should_trade=true`

## 8. Inferência ML online

No `infer.py`:

- Gate: `P(trade) >= gate_threshold` (threshold treinado e salvo em metadata)
- Direção: classe máxima em `{SHORT, NO-TRADE, LONG}`
- Regra final:

`should_trade = (score >= min_score) AND (gate_pass) AND (direction != NO-TRADE)`

## 9. Dataset de treino e labels

Fonte: `ml_training` + `signals` no SQLite.

Target base:

- `profit_target = profit_15m` (fallback: `profit_10m`, `profit_30m`, `final_profit`)
- `signed_profit_target = profit_target` para BUY
- `signed_profit_target = -profit_target` para SELL

Labels:

- `y_direction = 1` se `signed_profit_target > threshold`
- `y_direction = -1` se `signed_profit_target < -threshold`
- `y_direction = 0` caso contrário
- `y_trade`:
  - modo `win`: `result == WIN`
  - modo `movement`: `|signed_profit_target| > threshold`

Split temporal:

- treino `70%`, validação `15%`, teste `15%` (sem shuffle)

## 10. Recalibração automática com guardrails

Serviço: `MLRecalibrationService`.

Fluxo:

1. Verifica mínimo de dados (`ML_RECALIBRATION_MIN_ML_RECORDS`)
2. Executa scripts `build_dataset.py`, `train_gate.py`, `train_direction.py`
3. Lê métricas de metadata
4. Aplica critérios de aceitação
5. Se falhar, restaura backup de modelos

Critérios de aceitação:

- `gate_test_f1 >= ML_RECALIBRATION_MIN_GATE_F1`
- `direction_test_f1_macro >= ML_RECALIBRATION_MIN_DIRECTION_F1`
- não pode degradar além de `ML_RECALIBRATION_MAX_F1_DROP` versus baseline armazenado

## 11. Segmentação de performance por fase

O backend segmenta estatísticas por fase sem apagar histórico bruto:

- chave: `STATS_PHASE_TAG` (default `fase jim compound v1`)
- baseline persistido em `app_settings` como `stats_baseline_at:<tag>`
- contagens de `wins/losses/win_rate` filtram por `baseline_at` da fase

Resultado prático:

- banco histórico continua íntegro;
- leitura operacional pode recomeçar de zero por fase.

## 12. Parâmetros de produção (defaults principais)

- Score OFA mínimo: `MIN_SCORE=70`
- Q-score mínimo: `UNIFIED_DECISION_MIN_SCORE=0.62`
- Min trades para edge matrix: `80`
- Min win rate horário: `52%`
- Min IC95 low win rate: `45%`
- Engine target coverage: `3300s`
- Engine max lag: `8000ms`
- Recalibração: intervalo `168h`, mínimo `400` registros

## 13. Justificativa metodológica (por que funciona)

- OFA reduz assimetria informacional em microestrutura.
- Filtro horário-direcional evita operar em janelas historicamente ruins.
- ML gate separa “operar vs não operar”, reduzindo trades marginais.
- Q-score combina sinais heterogêneos com pesos controláveis.
- Recalibração com rollback evita regressão silenciosa em produção.
- Segmentação por fase permite avaliação limpa de estratégia sem destruir histórico.

## 14. AutoTrader (regras formais de execução)

O AutoTrader opera em ciclos (default: 60s) com sequência fixa:

1. fecha posições abertas por TP/SL;
2. lê usuários com AutoTrader habilitado;
3. coleta sinais técnicos pendentes;
4. opcionalmente aplica confluência com notícias/sentimento;
5. executa entrada apenas se o usuário não tiver posição aberta no mesmo par.

Regras:

- idade mínima do sinal: `AUTO_TRADER_MIN_SIGNAL_AGE_MIN`
- score técnico mínimo para execução automática: `|score| >= 70`
- sem conta ativa (`/iniciar`) => não executa
- um par por conta (sem duplicar posição no mesmo símbolo)

Confluência técnica + notícia:

- direção notícia:
  - `sentiment_score > 0` => BUY
  - `sentiment_score < 0` => SELL
- só aceita notícia se direção combinar com a direção técnica;
- se notícia mencionar explicitamente outro token (e não o token alvo), rejeita;
- notícia macro (sem token específico) pode ser aceita.

## 15. Alavancagem, sizing e juros compostos (paper trading)

### 15.1 Alavancagem

- sem notícia de confluência: `2x`
- com notícia:
  - `|sentiment_score| >= 0.9` => `10x`
  - `|sentiment_score| >= 0.75` => `5x`
  - caso contrário => `3x`

### 15.2 Tamanho da posição

Para cada entrada:

- `marginAmount = balance * 0.10`
- `notionalValue = marginAmount * leverage`
- `size = notionalValue / entryPrice`

Interpretação:
- o modelo reinveste sempre 10% do saldo corrente (dinâmico),
- isso implementa crescimento/contração proporcional ao capital (efeito composto).

### 15.3 PnL e custos

Constantes de simulação:

- `FEE_RATE = 0.0005` (0.05%)
- `SLIPPAGE_RATE = 0.0002` (0.02%)

PnL bruto:

- LONG: `priceDiff = exit - entry`
- SHORT: `priceDiff = entry - exit`
- `pnlGross = priceDiff * size`

Margem inicial:

- `initialMargin = (entryPrice * size) / leverage`

Regra de liquidação simplificada:

- se `pnlGross <= -initialMargin`, então:
  - `pnlGross = -initialMargin`
  - motivo de saída: `LIQUIDATION`

Custos:

- `notionalExit = exitPrice * size`
- `slippageCost = notionalExit * SLIPPAGE_RATE`
- `feeCost = notionalExit * FEE_RATE`
- `pnlNet = pnlGross - slippageCost - feeCost`

ROI sobre margem:

- `pnlPercent = (pnlNet / initialMargin) * 100`

Atualização da banca:

- `newBalance = oldBalance + pnlNet`
- piso de segurança: `finalBalance = max(newBalance, 0)`

## 16. Interpretação quantitativa para TCC

Este desenho separa três camadas estatísticas:

1. **Sinal microestrutural (OFA):** captura assimetria local do fluxo;
2. **Controle probabilístico (ML + IC95):** evita trades de baixa confiança;
3. **Gestão de capital dinâmica:** risco proporcional ao saldo e custos explícitos.

Em termos de pesquisa:

- variável resposta operacional: `pnlNet` e `win/loss`;
- variável resposta de robustez: `expectancy_ci95_low` por célula (hora,direção);
- variável de sobrevivência: trajetória do saldo sob regime de perdas (drawdown).

## 17. Limitações explícitas (estado atual)

- modelagem de liquidação é simplificada (não usa maintenance margin real por exchange);
- custos usam taxa fixa (não distingue maker/taker dinâmico por ativo/hora);
- filtro de notícias depende de classificação semântica e pode ter latência de ingestão;
- controle de risco é por regra fixa (10% da banca por entrada), ainda sem otimização por volatilidade da carteira.
