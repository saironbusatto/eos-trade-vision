# Data Engine v2.1: Design & Critical Review
**Date:** 2026-02-01
**Status:** APPROVED FOR BUILD

## 1. Critical Review of v2 Plan

### "TradeId Sequential" Assumption
*   **Critique:** While Binance `aggTrade` IDs *are* strictly sequential per symbol, assuming `id+1` is fragile for *detection* because valid UDP packet drops or aggressive consolidating by Binance (rare but possible) could cause panic.
*   **Correction:** Use `id+1` as strict check for integrity, but treat gaps < N (configurable) as "warn & skip" rather than "panic & blocking fetch" if high frequency is not critical for simple indicators. However, for "Audit Grade" data, we MUST enforce strict sequentiality.
*   **Decision:** Strict sequential check. If `new_id > last_id + 1`, trigger GAP.

### "Delta Volume > 0.99 Correlation"
*   **Critique:** "Delta" is a derivative metric. It allows canceling errors (erroneous buy + erroneous sell = correct net).
*   **Correction:** Validate **Absolute Volume** and **OHLC**.
*   **Decision:** Compare `Buffer.aggregated_volume_1m` vs `Binance.kline_1m.volume`. Tolerance < 1%.

### "Reconnect < 5s"
*   **Critique:** Purely magical number. What if DNS is down?
*   **Correction:** Define backoff strategy (e.g., exponential up to 60s). Define `DEGRADED` state when offline, not just "fails".

## 2. v2.1 Architecture & States

### Core Logic: Queue-Based Stitching
To avoid race conditions during WarmUp:
1.  **State COLD:** Start WS Connection.
2.  **State WARMING:**
    *   Incoming WS messages go to `IncomingQueue` (memory).
    *   Capture `first_ws_id` from the first received message.
    *   Launch HTTP REST Fetcher: `GET aggTrades` from `NOW-60min` UP TO `first_ws_id - 1`.
3.  **Merge Phase:**
    *   Feed REST trades into `Buffer`.
    *   Feed `IncomingQueue` trades into `Buffer`.
    *   Clear Queue.
4.  **State LIVE_OK:** Directly feed WS to Buffer.

### Health State Machine
*   `COLD`: Initial state. No data.
*   `WARMING`: WS connected, buffering events, fetching historical.
*   `LIVE_OK`: Buffer covers >59min, Lag < 2s, no recent gaps.
*   `DEGRADED`: WS connected, but: Coverage < 59min OR Lag > 2s OR Recovering from Gap.
*   `BROKEN`: WS disconnected > threshold, requires full restart.

## 3. Gap Strategy (Deterministic)
*   **Detection:**
    *   **ID-based:** `msg.a > last.a + 1`.
    *   **Time-based:** `msg.T > last.T + 10s` (Warning only).
*   **Fill:**
    *   Identify `gap_start_id` (last known + 1) and `gap_end_id` (current msg - 1).
    *   If gap < 1000 trades: Fetch immediately via REST (`fromId` param).
    *   If gap > 1000 trades (Big gap): Consider Reset/Re-warmup.

## 4. Proposed APIs (Interfaces)

```typescript
type SymbolState = 'COLD' | 'WARMING' | 'LIVE_OK' | 'DEGRADED' | 'BROKEN';

interface EngineStatus {
    symbol: string;
    state: SymbolState;
    bufferSize: number;
    coverageSec: number;
    lagMs: number;
    gapCount: number;
}

interface DataEngineEvents {
    'signal_ready': (symbol: string) => void;
    'state_change': (symbol: string, old: SymbolState, new: SymbolState) => void;
    'gap_detected': (symbol: string, gapSize: number) => void;
}
```

## 5. Acceptance Tests (Must Pass)
1.  **Stitch Test:** Start Engine -> Wait WARMING -> Simulate WS message ID 5000 -> Mock REST return IDs 4000-4999 -> Verify Buffer has 4000-5000 strictly sequential.
2.  **Coverage Test:** Run 65 min. Verify `getBufferStats().coverageMin` is stable at 60.0.
3.  **Validation Test:** Every 5 min, fetch `kline_1m` from Binance and compare Vol/OHLC with `buffer.aggregate(last_1m)`. Diff must be practically zero.
4.  **Hard Disconnect:** Cut network -> Wait 10s -> Reconnect -> Verify GAP_DETECTED -> GAP_FILLED -> LIVE_OK.

## 6. Risks & Mitigation
1.  **Memory Pressure:** 60min of `aggTrade` for 20 pairs ~ 2GB RAM.
    *   *Mitigation:* Use `Float64Array` / struct-of-arrays instead of objects if heap > 1GB.
2.  **Binance Ban:** 1200 weight/min limit. WarmUp 20 pairs = 20 * 5 reqs = 100 weight (Low). GapFill is danger zone.
    *   *Mitigation:* RateLimiter token bucket implemented in `GapFiller`.
3.  **Process Crash:** Loses all buffer.
    *   *Mitigation:* Persist snapshots to disk (SQLite) every 5 min? (Future feature, not MVP).
