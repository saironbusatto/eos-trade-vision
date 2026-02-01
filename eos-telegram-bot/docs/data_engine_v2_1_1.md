# Data Engine v2.1.1: Specification & Design
**Date:** 2026-02-01
**Status:** DRAFT -> IMPLEMENTATION

## 1. Core Principles & Invariants

### 1.1 MarketDataBuffer Invariants
1.  **Strict Ordering:** Buffer must always be sorted by `(timestamp ASC, id ASC)`.
2.  **Uniqueness:** No two trades with same `id` can exist. If a duplicate arrives, it is ignored (deduplication).
3.  **Monotonicity (Integrity):** Ideally `id[i] = id[i-1] + 1`. Gaps > 1 trigger `GapDetected`.
4.  **Window Compliance:** All trades must satisfy `timestamp >= NOW - config.windowSizeMs`. Older trades are pruned.

### 1.2 Gap Policy
*   **HARD GAP (`id` discontinuity):**
    *   Occurs when `msg.id > last_id + 1`.
    *   **Action:**
        *   If `gapSize <= smallGapMaxTrades`: Trigger immediate `GapFiller`. State -> `DEGRADED`.
        *   If `gapSize > smallGapMaxTrades`: Trigger `RESET` (Clear buffer & Re-WarmUp). State -> `DEGRADED`.
    *   **Tolerance:** Receiving `id-1` after `id` (out-of-order) is NOT a gap. It is a re-order event handled by insertion logic.

*   **SILENCE GAP (Time lag):**
    *   Occurs when `msg.time - last_time > maxSilenceMs`.
    *   **Action:** State -> `DEGRADED`. Trigger `GapFiller` by Time Range check.

### 1.3 Health States
*   **COLD:** Starting up. No data.
*   **WARMING:** WS Connected. Events enqueueing. REST Fetching history.
*   **LIVE_OK:**
    *   WS Connected.
    *   Buffer Coverage >= `targetCoverageSec`.
    *   Lag <= `maxLagMs`.
    *   Pending Gaps = 0.
*   **DEGRADED:** WS Connected but failing validation (Gap filling, high lag, low coverage).
*   **OFFLINE:** WS Disconnected. Backoff retry active.

## 2. WarmUp Strategy (Deterministic Stitching)
1.  **Connect WS:** Start buffering events to `IncomingQueue`.
2.  **Watermark:** On first WS event, record `firstWsId`.
3.  **Fetch History:** Request REST `aggTrades` from `NOW - (Window + Margin)` UP TO `firstWsId - 1`.
4.  **Merge:**
    *   `Buffer.insert(HistoryTrades)`
    *   `Buffer.insert(IncomingQueue)` (Handles overlap if any)
5.  **Verify:** Check continuity at splice point.
6.  **Activate:** Clear Queue. Set State -> `LIVE_OK` (if coverage met).

## 3. Validation Plan
*   **Metric:** `coverage_ratio = (newest_ts - oldest_ts) / window_ms`.
*   **Metric:** `gap_count`.
*   **Periodic Check:** Every 5min, fetch Binance `kline_1m` for the last complete minute.
    *   Compare `kline.volume` vs `buffer.aggregate(1m).volume`.
    *   Difference > 1% => Alert/Degrade.

## 4. Interfaces & Architecture

### Global Types
See `src/engine/types.ts`

---
**Why not Zero Tolerance?**
Binance `aggTrades` are UDP-based (best effort) in some internal layers before websocket push. Occasional dropped packets are inevitable. Zero tolerance would cause constant resets. We aim for "Audit Grade" (99.9% complete) with transparent gap reporting.
