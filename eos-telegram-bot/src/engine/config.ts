export const ENGINE_CONFIG = {
    // Window Settings
    WINDOW_SIZE_MS: 60 * 60 * 1000, // 60 minutes
    WARMUP_MARGIN_MS: 5 * 60 * 1000, // 5 min extra for safety

    // Integrity Thresholds
    TARGET_COVERAGE_SEC: 3500, // 58+ minutes to consider LIVE_OK
    MAX_LAG_MS: 2000, // 2s max lag

    // Gaps
    MAX_SILENCE_MS: 10000, // 10s silence = Warning/Check
    SMALL_GAP_MAX_TRADES: 5000, // If gap < 5000 trades, try fill. Else reset.

    // Backoff / Reconnect
    INITIAL_RECONNECT_DELAY_MS: 1000, // 1s initial
    MAX_BACKOFF_MS: 30000, // 30s max between retries

    // Rate Limits
    MAX_GAP_FILL_REQUESTS_PER_MIN: 100,

    // System
    MAX_SYMBOLS: 20
};
