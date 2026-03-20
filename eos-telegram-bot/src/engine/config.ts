function getEnvNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export const ENGINE_CONFIG = {
    // Window Settings
    WINDOW_SIZE_MS: 60 * 60 * 1000, // 60 minutes
    WARMUP_MARGIN_MS: 5 * 60 * 1000, // 5 min extra for safety

    // Integrity Thresholds
    TARGET_COVERAGE_SEC: getEnvNumber('ENGINE_TARGET_COVERAGE_SEC', 3300), // default mais tolerante (~55 min)
    MAX_LAG_MS: getEnvNumber('ENGINE_MAX_LAG_MS', 8000), // tolera picos curtos de latencia
    RECOVERY_LAG_MS: getEnvNumber('ENGINE_RECOVERY_LAG_MS', 3000),
    LAG_BREACHES_TO_DEGRADE: getEnvNumber('ENGINE_LAG_BREACHES_TO_DEGRADE', 3),
    HEALTHY_CHECKS_TO_RECOVER: getEnvNumber('ENGINE_HEALTHY_CHECKS_TO_RECOVER', 2),

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
