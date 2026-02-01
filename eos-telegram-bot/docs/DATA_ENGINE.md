# Data Engine v2.1.1 - Documentacao Completa

> Refatoracao do sistema de ingestao de dados para trading em tempo real.

## Indice

1. [Visao Geral](#visao-geral)
2. [Arquitetura](#arquitetura)
3. [Componentes](#componentes)
4. [Configuracao](#configuracao)
5. [Estados de Saude](#estados-de-saude)
6. [Uso Pratico](#uso-pratico)
7. [Monitoramento](#monitoramento)
8. [Troubleshooting](#troubleshooting)

---

## Visao Geral

O Data Engine v2.1.1 substitui a abordagem legada de fetch REST (limitada a 1000 trades) por um sistema de streaming via WebSocket com buffer local de 60 minutos.

### Problema Resolvido
- **Antes:** REST API com `limit=1000` = ~17 segundos de dados em periodos de alta volatilidade
- **Depois:** WebSocket + Buffer = 60 minutos completos de dados em tempo real

### Beneficios
- Janela de analise 200x maior (3600s vs ~17s)
- Latencia reduzida (streaming vs polling)
- Gap detection e recovery automatico
- State machine robusta para lidar com falhas

---

## Arquitetura

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                       DataEngine                        │
                    │  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐  │
 Binance WS ───────►│  │StreamManager │──►│MarketDataBuf.│◄──│ GapFiller   │  │
                    │  └──────────────┘   └──────────────┘   └─────────────┘  │
                    │         │                  │                  ▲         │
                    │         ▼                  ▼                  │         │
                    │  ┌─────────────────────────────────────────────┐        │
                    │  │            State Machine                     │        │
                    │  │  COLD → WARMING → LIVE_OK ⇌ DEGRADED        │        │
                    │  │                       ↓                      │        │
                    │  │                   OFFLINE                    │        │
                    │  └─────────────────────────────────────────────┘        │
                    └─────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                    ┌─────────────────────────────────────────────────────────┐
                    │                     DataService                          │
                    │  getTrades(symbol, minutes) → TradeData[]                │
                    │  isReady(symbol) → boolean                               │
                    │  getStatus(symbol) → { state, coverage, count }          │
                    └─────────────────────────────────────────────────────────┘
                                              │
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
                    │SmartMoney    │  │ Footprint    │  │   Outros     │
                    │Filter        │  │ Analyzer     │  │   Modulos    │
                    └──────────────┘  └──────────────┘  └──────────────┘
```

---

## Componentes

### StreamManager (`src/engine/StreamManager.ts`)

Gerencia conexao WebSocket persistente com Binance.

**Funcionalidades:**
- Conexao multi-stream (ex: `btcusdt@aggTrade`, `ethusdt@aggTrade`)
- Heartbeat automatico (ping cada 3 minutos)
- Watchdog de silencio (30s sem dados = reconexao forcada)
- Backoff exponencial (1s, 2s, 4s... ate 30s max)
- Subscribe/Unsubscribe dinamico

**Eventos emitidos:**
- `connected` - WebSocket conectado
- `disconnected` - WebSocket desconectado
- `message` - Novo aggTrade recebido
- `reconnecting` - Tentando reconexao

### MarketDataBuffer (`src/engine/MarketDataBuffer.ts`)

Buffer circular de 60 minutos com integridade garantida.

**Funcionalidades:**
- Ordenacao por (time, id) mantida automaticamente
- Deduplicacao por `aggTradeId`
- Trim automatico de trades antigos (> 60min)
- Gap detection estrito (`id != last_id + 1`)
- Suporte a out-of-order (late arrivals)

**API:**
```typescript
insertRealtime(trade: BinanceAggTrade): boolean  // false = gap detectado
insertMany(trades: BinanceAggTrade[]): void      // batch insert (warmup/gap fill)
getStats(): BufferStats                          // cobertura, contagem, lag
getTradesInWindow(minutes: number): MarketTrade[]// trades filtrados
```

### GapFiller (`src/engine/GapFiller.ts`)

Preenche gaps via REST API com paginacao e rate limiting.

**Funcionalidades:**
- Fetch por range de IDs (`fillByIdRange`)
- Fetch por range de tempo (`fillByTimeRange`)
- Token bucket rate limiting (100 req/min)
- Paginacao automatica (limite 1000 por request)

### DataEngine (`src/engine/DataEngine.ts`)

Orquestrador principal com state machine.

**Responsabilidades:**
- Gerenciar contextos por simbolo
- Controlar transicoes de estado
- Coordenar WarmUp (history + WS queue stitching)
- Disparar gap recovery automatico
- Health check periodico (cada 5s)

**WarmUp Strategy:**
1. Primeiro evento WS chega → enfileira
2. Fetch historico via REST (ultimos 60min)
3. Merge historico + fila WS (dedup automatico)
4. Verificar cobertura → LIVE_OK ou DEGRADED

### DataService (`src/engine/DataService.ts`)

Adapter singleton para modulos OFA.

**API:**
```typescript
const dataService = getDataService();

await dataService.initialize(['BTCUSDT', 'ETHUSDT']);
await dataService.waitForReady('BTCUSDT', 60000);

const trades = dataService.getTrades('BTCUSDT', 15);  // ultimos 15min
const ready = dataService.isReady('BTCUSDT');
const status = dataService.getStatus('BTCUSDT');
```

---

## Configuracao

`src/engine/config.ts`:

```typescript
export const ENGINE_CONFIG = {
    // Janela de dados
    WINDOW_SIZE_MS: 3_600_000,        // 60 minutos
    TARGET_COVERAGE_SEC: 3000,         // 50 min minimo para LIVE_OK
    WARMUP_MARGIN_MS: 60_000,          // Margem extra no warmup

    // Thresholds de integridade
    MAX_LAG_MS: 2_000,                 // Lag maximo aceitavel
    MAX_SILENCE_MS: 10_000,            // Silencio maximo antes de alerta

    // Politica de gaps
    SMALL_GAP_MAX_TRADES: 5_000,       // Gap pequeno (fill via REST)
                                        // Gap grande = reset + re-warmup

    // Reconexao
    INITIAL_RECONNECT_DELAY_MS: 1_000, // Delay inicial
    MAX_BACKOFF_MS: 30_000,            // Backoff maximo

    // Rate limiting
    MAX_GAP_FILL_REQUESTS_PER_MIN: 100,// Limite de requests REST

    // Capacidade
    MAX_SYMBOLS: 20                     // Maximo de simbolos simultaneos
};
```

---

## Estados de Saude

| Estado | Descricao | Transicoes |
|--------|-----------|------------|
| `COLD` | Simbolo registrado, nao inicializado | → WARMING (ao iniciar) |
| `WARMING` | WarmUp em progresso | → LIVE_OK, DEGRADED |
| `LIVE_OK` | Operacional, dados completos | → DEGRADED, OFFLINE |
| `DEGRADED` | Gap detectado ou cobertura baixa | → LIVE_OK, OFFLINE |
| `OFFLINE` | WebSocket desconectado | → WARMING (ao reconectar) |

### Condicoes de Transicao

**WARMING → LIVE_OK:**
- Cobertura >= 50 minutos (3000s)
- Buffer contigo (sem gaps)

**LIVE_OK → DEGRADED:**
- Gap detectado no realtime
- Lag > 2 segundos
- Cobertura caiu abaixo do threshold

**DEGRADED → LIVE_OK:**
- Gap preenchido com sucesso
- Lag normalizado (< 500ms)
- Cobertura restaurada

---

## Uso Pratico

### Inicializacao no Boot (index.ts / trendingScanner.ts)

```typescript
import { getDataService } from './engine';

const dataService = getDataService();

// Inicializar com simbolos populares
await dataService.initialize([
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT',
    'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT'
]);

// Aguardar warmup (pelo menos 3 simbolos prontos)
while (readyCount < 3) {
    await new Promise(r => setTimeout(r, 2000));
    readyCount = symbols.filter(s => dataService.isReady(s)).length;
}

// Iniciar logica de trading
```

### Consumindo Dados no SmartMoneyFilter

```typescript
import { getDataService, TradeData } from '../engine/DataService';

export async function getSmartMoneyDelta(symbol: string, minutes = 15) {
    const dataService = getDataService();
    
    if (!dataService.isReady(symbol)) {
        return createNeutralDelta();
    }
    
    const trades = dataService.getTrades(symbol, minutes);
    return calculateSmartMoneyDelta(trades);
}
```

---

## Monitoramento

### Endpoint /health

```json
GET /health

{
  "status": "ok",
  "timestamp": "2026-02-01T21:00:00Z",
  "telegram": { "connected": true },
  "engine": {
    "liveSymbols": 8,
    "totalSymbols": 10,
    "symbols": {
      "BTCUSDT": { "state": "LIVE_OK", "coverage": 3600, "trades": 45123 },
      "ETHUSDT": { "state": "LIVE_OK", "coverage": 3598, "trades": 38456 },
      "SOLUSDT": { "state": "WARMING", "coverage": 1200, "trades": 15000 }
    }
  }
}
```

### Logs de Operacao

```
[StreamManager] Connecting to wss://stream.binance.com:9443/ws/...
[StreamManager] Connected
[DataEngine] First WS event for BTCUSDT: ID=123456789
[DataEngine] Starting warmup for BTCUSDT
[GapFiller] Filling by time: BTCUSDT [2026-02-01T17:00:00Z -> 2026-02-01T18:00:00Z]
[GapFiller] Fetched 45000 trades for time range
[DataEngine] Warmup complete for BTCUSDT: 45123 trades, 3600.0s coverage
[DataEngine] BTCUSDT: WARMING -> LIVE_OK
```

---

## Troubleshooting

### Simbolo nao sai de WARMING

**Causas possiveis:**
1. Rate limiting da Binance (muitos requests)
2. Simbolo com baixo volume (poucos trades historicos)
3. Erro de rede durante fetch

**Solucao:**
- Verificar logs do GapFiller
- Aumentar timeout do warmup
- Verificar conectividade com api.binance.com

### Gap detectado com frequencia

**Causas possiveis:**
1. Conexao WebSocket instavel
2. Lag de processamento local
3. Simbolo com volume extremo

**Solucao:**
- Verificar watchdog do StreamManager
- Monitorar CPU/memoria do servidor
- Considerar aumentar `SMALL_GAP_MAX_TRADES`

### DataService retorna array vazio

**Causas possiveis:**
1. Simbolo nao foi inicializado
2. Estado != LIVE_OK
3. Janela de tempo maior que buffer

**Solucao:**
```typescript
const status = dataService.getStatus(symbol);
console.log(status); // Verificar state e coverage
```

---

## Changelog

### v2.1.1 (2026-02-01)
- Implementacao inicial do Data Engine
- StreamManager com WebSocket persistente
- MarketDataBuffer com rolling window 60min
- GapFiller com rate limiting
- DataService como adapter para modulos OFA
- Integracao com TrendingScanner
- Endpoint /health expandido

### v2.0 (Especificacao)
- Documento de requisitos original
- Nao implementado (substituido por v2.1.1)
