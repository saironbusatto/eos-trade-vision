# EoS Machine Learning v3.0 🧠

Sistema de Machine Learning com **Ensemble (4 modelos)** + **Cross-Validation** para filtrar sinais do EoS Bot.

---

## 🎯 Filosofia

> *"O que o Order Flow fornece ao trader é a capacidade de ficar fora do mercado quando não há razão para negociar."* — **Michael Valtos**

O modelo **não prevê preços**. Ele **classifica sinais** como WIN/LOSS para filtrar operações de baixa qualidade.

---

## 🔧 Arquitetura v3.0

### Ensemble de 4 Modelos (Voting Classifier)

| Modelo | Peso | Descrição |
|--------|------|-----------|
| **XGBoost** | 2x | Gradient boosting otimizado para tabular data |
| **LightGBM** | 2x | Versão mais rápida e eficiente do GBM |
| **Random Forest** | 1x | Ensemble de árvores com bagging (robusto a overfitting) |
| **Gradient Boosting** | 1x | Implementação clássica do sklearn |

### Por que Ensemble?

```
Modelo único = bias alto + variância alta
Ensemble = reduz variância + média dos erros
```

**Votação Suave (Soft Voting):**
- Cada modelo retorna uma **probabilidade** (0.0 a 1.0)
- A probabilidade final é a **média ponderada** dos 4 modelos
- Se probabilidade ≥ 70%: **APROVAR** sinal
- Se probabilidade < 70%: **REJEITAR** sinal

---

## 📊 Features Explicadas (Para Leigos)

### O que são Features?

Features são **características numéricas** que descrevem cada sinal de trading. O modelo usa essas características para aprender padrões entre sinais que deram WIN e sinais que deram LOSS.

### Lista de Features

#### 1. `f_smart_money` (Dinheiro Inteligente)
**O que é:** Mede se os "grandes jogadores" (instituições, fundos) estão comprando ou vendendo.

**Como funciona:**
- Filtra apenas trades grandes ($500 a $100.000+)
- Ignora trades pequenos (ruído de varejo)
- Se os "big players" estão comprando: valor positivo
- Se os "big players" estão vendendo: valor negativo

**Por que importa:** Instituições têm mais informação que varejo. Seguir o "smart money" aumenta as chances de sucesso.

---

#### 2. `f_price_context` (Contexto de Preço)
**O que é:** Mede onde o preço atual está em relação a níveis importantes (VWAP, VPOC).

**Como funciona:**
- **VWAP** = Preço Médio Ponderado por Volume (onde a maioria do dinheiro trocou de mãos)
- Se preço está **acima** do VWAP: bullish (compradores dominando)
- Se preço está **abaixo** do VWAP: bearish (vendedores dominando)

**Por que importa:** Preço tende a reverter para o VWAP. Comprar muito acima = risco de queda.

---

#### 3. `f_imbalance` (Desequilíbrio)
**O que é:** Mede a diferença entre ordens de compra e venda em cada nível de preço.

**Como funciona:**
- Em cada candle, conta quantas ordens foram de compra vs venda
- Se há **3x mais** compradores que vendedores: imbalance bullish
- Se há **3x mais** vendedores que compradores: imbalance bearish

**Por que importa:** Imbalances fortes indicam urgência - alguém precisa entrar ou sair rapidamente.

---

#### 4. `f_absorption` (Absorção)
**O que é:** Detecta quando grandes ordens limitadas estão "absorvendo" a pressão do lado oposto.

**Como funciona:**
- Preço tenta subir mas há uma parede de vendas no topo
- Volume é alto, mas preço não move = alguém está absorvendo
- Indica possível reversão

**Por que importa:** Absorção é sinal de que grandes players estão defendendo um nível.

---

#### 5. `f_trend` (Tendência)
**O que é:** Direção geral do preço nos últimos 50 candles.

**Como funciona:**
- Calcula média móvel exponencial (EMA)
- Se preço está acima da EMA: tendência de alta
- Se preço está abaixo da EMA: tendência de baixa

**Por que importa:** "The trend is your friend" - operar a favor da tendência tem maior probabilidade.

---

#### 6. `f_momentum` (Momentum)
**O que é:** Velocidade da mudança de preço.

**Como funciona:**
- Compara preço atual com preço de 10 períodos atrás
- Se subindo rápido: momentum positivo
- Se caindo rápido: momentum negativo

**Por que importa:** Momentum forte indica continuação do movimento. Momentum fraco indica possível reversão.

---

#### 7. `f_volume` (Volume Ratio)
**O que é:** Volume atual comparado com a média.

**Como funciona:**
- Volume atual ÷ Média de volume dos últimos 20 períodos
- Se ratio > 1: volume acima do normal
- Se ratio < 1: volume abaixo do normal

**Por que importa:** Movimentos com alto volume são mais significativos e tendem a continuar.

---

#### 8. `score` (Score OFA)
**O que é:** Pontuação final do sistema de Order Flow Analysis.

**Como funciona:**
- Combina todos os indicadores OFA
- Quanto maior, mais sinais estão alinhados
- Mínimo atual: 40 (modo coleta) / 70 (produção)

**Por que importa:** É o "resumo" de todos os outros indicadores.

---

## 🔬 Técnicas Avançadas

### 1. Fractional Differentiation (FracDiff)

**Problema:** Séries de preço não são estacionárias (média e variância mudam no tempo).

**Solução Tradicional:** Diferenciar (preço[t] - preço[t-1]). Mas isso **perde memória**.

**Solução Kaabar:** Diferenciar **fracionariamente** (d=0.4 por exemplo). Mantém parte da memória.

**Aplicamos FracDiff apenas em:**
- `f_price_context` (baseada em preço)

**NÃO aplicamos em:**
- `f_imbalance`, `f_absorption` (já são estacionários por natureza)

---

### 2. Triple Barrier Labeling

**Como definimos WIN e LOSS:**

```
     Take Profit ────────────────→ WIN
         │
         │
     Entry ──────────────────────→ ?
         │
         │
     Stop Loss ──────────────────→ LOSS
         
         │─────── Timeout 45min ─→ LOSS
```

- **WIN:** Preço atingiu Take Profit antes de qualquer outra barreira
- **LOSS:** Preço atingiu Stop Loss OU passou 45 minutos sem atingir TP

---

### 3. TimeSeriesSplit (Cross-Validation Temporal)

**Problema:** Dados de trading são temporais. Não podemos misturar passado com futuro.

**Solução:** Dividir os dados em "janelas" temporais:

```
Fold 1: Treina [0-100]  → Testa [100-150]
Fold 2: Treina [0-150]  → Testa [150-200]
Fold 3: Treina [0-200]  → Testa [200-250]
...
```

Isso evita "look-ahead bias" (usar informação do futuro para prever o passado).

---

### 4. GMM (Gaussian Mixture Model) - Regime Detection

**O que faz:** Identifica "regimes" de mercado (tendência, consolidação, volatilidade alta).

**Como funciona:**
1. Agrupa sinais com características similares em clusters
2. Calcula win rate de cada cluster
3. Se um cluster tem win rate < 45%: **BLOQUEIA** todos os sinais desse cluster

**Por que importa:** Alguns momentos do mercado são simplesmente ruins para operar. GMM detecta e evita.

---

## 📈 Métricas de Sucesso

| Métrica | Target | Descrição |
|---------|--------|-----------|
| **Precision** | > 70% | % de sinais aprovados que são WIN |
| **Sharpe Ratio** | > 2.0 | Retorno ajustado pelo risco |
| **Max Drawdown** | < 15% | Máxima queda do pico |

---

## 🚀 Quick Start

```bash
# Criar ambiente
python -m venv .venv
.venv\Scripts\activate

# Instalar dependências
pip install -r requirements.txt

# Treinar Ensemble v3.0
python src/train_ensemble.py

# Validar métricas
python src/validate.py

# Iniciar API
python src/api_server.py
```

---

## 📁 Estrutura

```
eos-ml/
├── src/
│   ├── train_ensemble.py   # 🆕 Ensemble (XGB+LGB+RF+GB)
│   ├── train_pipeline.py   # Pipeline v2.1
│   ├── api_server.py       # API Flask
│   ├── inference.py        # Classe EoSMLPredictor
│   ├── validate.py         # Validação de métricas
│   └── fracdiff.py         # Diferenciação fracionária
├── models/
│   ├── ensemble_v3.pkl     # 🆕 Modelo Ensemble
│   ├── gmm_regime.pkl      # Detector de regime
│   └── xgboost_v1.pkl      # Modelo v2.1
└── data/
    └── *.parquet           # Dados processados
```

---

## 📚 Referências

| Autor | Técnica | Livro/Paper |
|-------|---------|-------------|
| **Kaabar** | Fractional Differentiation | *Quantitative Trading Strategies* |
| **López de Prado** | Triple Barrier, Meta-Labeling | *Advances in Financial ML* |
| **Ruiz & Chan** | GMM Regime Detection | *Regime Switching in Financial Markets* |
| **Michael Valtos** | Order Flow Philosophy | *Order Flow Trading* |

---

*Powered by s-iron.tech | Estratégia v3.0*
