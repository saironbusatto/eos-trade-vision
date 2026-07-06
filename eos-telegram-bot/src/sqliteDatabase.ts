import Database from 'better-sqlite3';
import path from 'path';

// Initialize SQLite database
const DB_PATH = process.env.DATABASE_PATH || './data/eos.db';
console.log(`[DEBUG] Loading sqliteDatabase.ts... DB_PATH=${DB_PATH}`);
const db = new Database(path.resolve(DB_PATH));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
// ponytail: checkpoint mais proativo (default do SQLite é 1000 páginas) + teto de 8MB no WAL,
// só como blindagem preventiva contra crescimento sem controle quando o volume de trades subir
db.pragma('wal_autocheckpoint = 400');
db.pragma('journal_size_limit = 8388608');

// ========== TYPES ==========

export interface Signal {
    id: number;
    symbol: string;
    action: 'BUY' | 'SELL';
    entry_price: number;
    stop_loss: number;
    take_profit: number;
    score: number;
    result: 'PENDING' | 'WIN' | 'LOSS';
    created_at: string;
    validated_at?: string;
    exit_price?: number;

    // Normalized features (ML)
    f_smart_money: number;
    f_price_context: number;
    f_imbalance: number;
    f_absorption: number;
    f_trend: number;
    f_momentum: number;
    f_volume: number;

    // Raw data
    volume_ratio: number;
    trend: number;
    momentum: number;
    price_change_24h: number;
}

export interface PriceCheckpoint {
    id: number;
    signal_id: number;
    checkpoint_min: number;  // 5, 10, 15, 30, 45
    price: number;
    profit_percent: number;
    timestamp: string;
}

export interface MLTrainingRecord {
    id: number;
    signal_id: number;
    symbol: string;
    action: string;
    result: string;
    final_profit: number;
    time_to_result_min: number;

    // Time features
    hour_utc: number;      // 0-23
    day_of_week: number;   // 0=Sunday ... 6=Saturday

    // Features
    f_smart_money: number;
    f_price_context: number;
    f_imbalance: number;
    f_absorption: number;
    f_trend: number;
    f_momentum: number;
    f_volume: number;
    score: number;

    // Checkpoints
    profit_5m: number | null;
    profit_10m: number | null;
    profit_15m: number | null;
    profit_30m: number | null;
    profit_45m: number | null;

    // Macro sentiment features
    macro_confidence: number | null;
    macro_sentiment: string | null;
    fear_greed: number | null;
    trade_recommendation: string | null;
    sp500_trend: string | null;
    fed_stance: string | null;
}

export interface EdgeMatrixCell {
    hour_utc: number;
    action: 'BUY' | 'SELL';
    trades: number;
    wins: number;
    losses: number;
    win_rate: number;
    win_rate_ci95_low: number;
    win_rate_ci95_high: number;
    expectancy: number;
    std_dev: number;
    expectancy_ci95_low: number;
    expectancy_ci95_high: number;
    avg_win: number;
    avg_loss: number;
    profit_factor: number;
}

const Z_95 = 1.959963984540054;

function wilson95(wins: number, n: number): { low: number; high: number } {
    if (n <= 0) return { low: 0, high: 0 };
    const p = wins / n;
    const z2 = Z_95 * Z_95;
    const den = 1 + z2 / n;
    const center = (p + z2 / (2 * n)) / den;
    const margin = (Z_95 * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / den;
    return {
        low: Math.max(0, center - margin),
        high: Math.min(1, center + margin)
    };
}

// ========== SCHEMA ==========

function initSchema(): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            action TEXT NOT NULL,
            entry_price REAL NOT NULL,
            stop_loss REAL NOT NULL,
            take_profit REAL NOT NULL,
            score INTEGER NOT NULL,
            result TEXT DEFAULT 'PENDING',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            validated_at DATETIME,
            exit_price REAL,
            
            f_smart_money REAL DEFAULT 0,
            f_price_context REAL DEFAULT 0.5,
            f_imbalance REAL DEFAULT 0,
            f_absorption REAL DEFAULT 0,
            f_trend REAL DEFAULT 0.5,
            f_momentum REAL DEFAULT 0.5,
            f_volume REAL DEFAULT 0.5,
            
            strategy_version TEXT DEFAULT 'v2.0',
            
            volume_ratio REAL,
            trend REAL,
            momentum REAL,
            price_change_24h REAL
        );

        CREATE TABLE IF NOT EXISTS price_checkpoints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            signal_id INTEGER NOT NULL,
            checkpoint_min INTEGER NOT NULL,
            price REAL NOT NULL,
            profit_percent REAL NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (signal_id) REFERENCES signals(id),
            UNIQUE(signal_id, checkpoint_min)
        );

        CREATE TABLE IF NOT EXISTS ml_training (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            signal_id INTEGER UNIQUE NOT NULL,
            symbol TEXT,
            action TEXT,
            result TEXT,
            final_profit REAL,
            time_to_result_min INTEGER,
            
            -- Time features for ML
            hour_utc INTEGER,       -- 0-23 (hora em UTC)
            day_of_week INTEGER,    -- 0=Sunday, 1=Monday, ... 6=Saturday
            
            f_smart_money REAL,
            f_price_context REAL,
            f_imbalance REAL,
            f_absorption REAL,
            f_trend REAL,
            f_momentum REAL,
            f_volume REAL,
            score INTEGER,
            
            profit_5m REAL,
            profit_10m REAL,
            profit_15m REAL,
            profit_30m REAL,
            profit_45m REAL,
            
            -- Macro sentiment features
            macro_confidence REAL,       -- 0.0-1.0 from Perplexity
            macro_sentiment TEXT,        -- BULLISH/NEUTRAL/BEARISH
            fear_greed INTEGER,          -- 0-100
            trade_recommendation TEXT,   -- AGGRESSIVE/NORMAL/CONSERVATIVE/AVOID
            sp500_trend TEXT,            -- BULLISH/NEUTRAL/BEARISH
            fed_stance TEXT,             -- HAWKISH/NEUTRAL/DOVISH
            
            FOREIGN KEY (signal_id) REFERENCES signals(id)
        );

        CREATE INDEX IF NOT EXISTS idx_signals_result ON signals(result);
        CREATE INDEX IF NOT EXISTS idx_checkpoints_signal ON price_checkpoints(signal_id);

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ==========================================
        -- FASE 3: ALTERNATIVE DATA (NEWS)
        -- ==========================================
        CREATE TABLE IF NOT EXISTS news_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guid TEXT UNIQUE,          -- Identificador único do RSS
            content_hash TEXT UNIQUE,  -- Hash do conteúdo para evitar duplicatas
            source TEXT NOT NULL,
            title TEXT NOT NULL,
            link TEXT NOT NULL,
            published_at DATETIME NOT NULL,
            fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- Integrity Check: When bot saw it
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS news_signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            news_item_id INTEGER NOT NULL,
            crypto_relevant BOOLEAN NOT NULL,
            sentiment_score REAL,      -- -1.0 a +1.0
            impact_rating INTEGER,     -- 1 a 5
            reasoning TEXT,
            model_used TEXT,           -- Metadata de reprodutibilidade
            prompt_version TEXT,       -- Metadata de reprodutibilidade
            input_hash TEXT,           -- Metadata de reprodutibilidade
            processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            available_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- Integrity Check: When signal was ready
            FOREIGN KEY (news_item_id) REFERENCES news_items(id),
            UNIQUE(news_item_id, model_used, prompt_version) -- Garante idempotência
        );

        CREATE INDEX IF NOT EXISTS idx_news_signals_available_impact
            ON news_signals(available_at, impact_rating);
    `);

    // ==========================================
    // FASE 3: PAPER TRADING (Separate Statements)
    // ==========================================
    db.prepare(`
        CREATE TABLE IF NOT EXISTS paper_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE,
            username TEXT,
            initial_balance REAL DEFAULT 1000.0,
            balance REAL NOT NULL,
            equity REAL NOT NULL,
            status TEXT DEFAULT 'ACTIVE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS paper_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            entry_price REAL NOT NULL,
            size REAL NOT NULL,
            leverage REAL DEFAULT 1.0,
            stop_loss REAL,
            take_profit REAL,
            status TEXT DEFAULT 'OPEN',
            entry_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES paper_accounts(id)
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS paper_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            position_id INTEGER NOT NULL,
            exit_price REAL NOT NULL,
            pnl REAL NOT NULL,
            pnl_percent REAL NOT NULL,
            closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            close_reason TEXT,
            execution_model TEXT DEFAULT 'baseline',
            FOREIGN KEY (position_id) REFERENCES paper_positions(id)
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS paper_autotrader_settings (
            user_id TEXT PRIMARY KEY,
            username TEXT,
            enabled INTEGER NOT NULL DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS paper_autotrader_executions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            signal_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            reason TEXT,
            executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(signal_id, user_id)
        )
    `).run();

    // ── Exit Decision Engine ──────────────────────────────────────────────────
    // Uma linha por ciclo de monitoramento por sinal.
    // Fase 1: decision_source='HARD_STOP', decision='HOLD' até o fechamento.
    // is_final=1 na linha de fechamento real.
    // Counterfactual preenchido ~15 min após o fechamento.
    db.prepare(`
        CREATE TABLE IF NOT EXISTS exit_decisions_log (
            id                         INTEGER PRIMARY KEY AUTOINCREMENT,
            signal_id                  INTEGER NOT NULL,
            symbol                     TEXT    NOT NULL,
            action                     TEXT    NOT NULL,

            -- Features no momento da captura
            pnl_pct                    REAL,
            time_in_trade_seconds      INTEGER,
            distance_to_stop_pct       REAL,
            distance_to_target_pct     REAL,
            volume_ratio               REAL,
            volatility_5m              REAL,
            volatility_15m             REAL,
            volatility_ratio           REAL,
            rsi_current                REAL,
            rsi_slope                  REAL,
            candles_in_favor           INTEGER,
            candles_against            INTEGER,
            original_signal_score      INTEGER,
            bid_ask_spread_pct         REAL,

            -- Decisão
            decision_source            TEXT    NOT NULL DEFAULT 'HARD_STOP',
            decision                   TEXT    NOT NULL DEFAULT 'HOLD',
            confidence                 REAL             DEFAULT 1.0,
            reasoning                  TEXT,

            -- Outcome (preenchido no fechamento)
            is_final                   INTEGER          DEFAULT 0,
            outcome                    TEXT,
            pnl_final                  REAL,

            -- Counterfactual (preenchido ~15 min após fechamento)
            cf_pnl_5m                  REAL,
            cf_pnl_10m                 REAL,
            cf_pnl_15m                 REAL,
            close_time_ms              INTEGER,
            counterfactual_needed_at   INTEGER,
            counterfactual_filled      INTEGER          DEFAULT 0,

            -- Meta
            captured_at                INTEGER NOT NULL,
            created_at                 DATETIME DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (signal_id) REFERENCES signals(id)
        )
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_exit_log_signal
        ON exit_decisions_log(signal_id)
    `).run();

    db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_exit_log_cf
        ON exit_decisions_log(counterfactual_filled, counterfactual_needed_at)
        WHERE is_final = 1
    `).run();

    console.log('[SQLite] Schema initialized');

    // Backward-compatible schema migrations for legacy paper tables
    const ensureColumn = (table: string, column: string, definition: string) => {
        const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
        if (!cols.some(c => c.name === column)) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
    };

    // paper_positions legacy compatibility
    ensureColumn('paper_positions', 'stop_loss', 'REAL');
    ensureColumn('paper_positions', 'take_profit', 'REAL');
    ensureColumn('paper_positions', 'status', "TEXT DEFAULT 'OPEN'");
    ensureColumn('paper_positions', 'entry_at', "DATETIME DEFAULT CURRENT_TIMESTAMP");

    // paper_trades legacy compatibility
    ensureColumn('paper_trades', 'account_id', 'INTEGER');
    ensureColumn('paper_trades', 'symbol', 'TEXT');
    ensureColumn('paper_trades', 'side', 'TEXT');
    ensureColumn('paper_trades', 'entry_price', 'REAL');
    ensureColumn('paper_trades', 'size', 'REAL');
    ensureColumn('paper_trades', 'pnl_gross', 'REAL');
    ensureColumn('paper_trades', 'slippage_cost', 'REAL');
    ensureColumn('paper_trades', 'pnl_net', 'REAL');
    ensureColumn('paper_trades', 'opened_at', 'DATETIME');
}

// Initialize on import
try {
    initSchema();
} catch (err) {
    console.error("❌ initSchema Failed:", err);
}

// ========== SIGNAL CRUD ==========

export const sqliteDatabase = {
    getStatsPhaseTag(): string {
        const raw = process.env.STATS_PHASE_TAG?.trim();
        if (!raw) return 'fase jim compound v1';
        return raw;
    },

    getStatsBaselineKey(phaseTag?: string): string {
        const tag = (phaseTag ?? this.getStatsPhaseTag()).trim();
        return `stats_baseline_at:${tag}`;
    },

    getActiveStrategyVersion(): string {
        const strategy = process.env.ACTIVE_STRATEGY_VERSION?.trim();
        return strategy && strategy.length > 0 ? strategy : 'v3.0';
    },

    getStatsBaselineAt(phaseTag?: string): string | null {
        const tag = phaseTag ?? this.getStatsPhaseTag();
        const key = this.getStatsBaselineKey(tag);

        const row = db
            .prepare("SELECT value FROM app_settings WHERE key = ? LIMIT 1")
            .get(key) as { value: string } | undefined;

        if (row?.value) {
            return row.value;
        }

        // Backward compatibility: keep reading legacy key only for default phase.
        if (tag === 'default') {
            const legacy = db
                .prepare("SELECT value FROM app_settings WHERE key = 'stats_baseline_at' LIMIT 1")
                .get() as { value: string } | undefined;
            return legacy?.value ?? null;
        }

        // New explicit phase with no baseline yet: initialize from "now"
        // so counters start from this phase inception.
        return this.resetStatsBaselineNow(tag);
    },

    getAppSetting(key: string): string | null {
        const row = db
            .prepare("SELECT value FROM app_settings WHERE key = ? LIMIT 1")
            .get(key) as { value: string } | undefined;

        return row?.value ?? null;
    },

    setAppSetting(key: string, value: string): void {
        db.prepare(`
            INSERT INTO app_settings (key, value, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = datetime('now')
        `).run(key, value);
    },

    deleteAppSetting(key: string): void {
        db.prepare("DELETE FROM app_settings WHERE key = ?").run(key);
    },

    setStatsBaselineAt(isoTimestamp: string, phaseTag?: string): string {
        const parsed = new Date(isoTimestamp);
        if (Number.isNaN(parsed.getTime())) {
            throw new Error('Invalid stats baseline timestamp');
        }

        const key = this.getStatsBaselineKey(phaseTag);
        const normalized = parsed.toISOString();
        db.prepare(`
            INSERT INTO app_settings (key, value, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = datetime('now')
        `).run(key, normalized);

        return normalized;
    },

    resetStatsBaselineNow(phaseTag?: string): string {
        return this.setStatsBaselineAt(new Date().toISOString(), phaseTag);
    },

    clearStatsBaseline(phaseTag?: string): void {
        const key = this.getStatsBaselineKey(phaseTag);
        db.prepare("DELETE FROM app_settings WHERE key = ?").run(key);
    },

    // Insert new signal
    insertSignal(signal: {
        symbol: string;
        action: 'BUY' | 'SELL';
        entry_price: number;
        score: number;
        stop_loss?: number;
        take_profit?: number;
        stop_percent?: number;
        target_percent?: number;
        f_smart_money: number;
        f_price_context: number;
        f_imbalance: number;
        f_absorption: number;
        f_trend: number;
        f_momentum: number;
        f_volume: number;
        volume_ratio: number;
        trend: number;
        momentum: number;
        price_change_24h: number;
    }): number {
        const stopLoss = signal.stop_loss ?? (signal.action === 'BUY'
            ? signal.entry_price * (1 - (signal.stop_percent || 1) / 100)
            : signal.entry_price * (1 + (signal.stop_percent || 1) / 100));

        const takeProfit = signal.take_profit ?? (signal.action === 'BUY'
            ? signal.entry_price * (1 + (signal.target_percent || 2) / 100)
            : signal.entry_price * (1 - (signal.target_percent || 2) / 100));

        const strategyVersion = this.getActiveStrategyVersion();

        const stmt = db.prepare(`
            INSERT INTO signals (
                symbol, action, entry_price, stop_loss, take_profit, score,
                f_smart_money, f_price_context, f_imbalance, f_absorption, 
                f_trend, f_momentum, f_volume,
                volume_ratio, trend, momentum, price_change_24h,
                strategy_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            signal.symbol, signal.action, signal.entry_price, stopLoss, takeProfit, signal.score,
            signal.f_smart_money, signal.f_price_context, signal.f_imbalance, signal.f_absorption,
            signal.f_trend, signal.f_momentum, signal.f_volume,
            signal.volume_ratio, signal.trend, signal.momentum, signal.price_change_24h,
            strategyVersion
        );

        const id = result.lastInsertRowid as number;
        console.log(`[SQLite] Signal #${id} saved: ${signal.symbol} ${signal.action} @ $${signal.entry_price} (${strategyVersion})`);
        return id;
    },

    // Get pending signals older than minAgeMinutes
    getPendingSignals(minAgeMinutes: number = 5): Signal[] {
        const stmt = db.prepare(`
            SELECT * FROM signals 
            WHERE result = 'PENDING' 
            AND datetime(created_at, '+' || ? || ' minutes') <= datetime('now')
        `);
        return stmt.all(minAgeMinutes) as Signal[];
    },

    // Get signal by ID
    getSignal(id: number): Signal | undefined {
        const stmt = db.prepare('SELECT * FROM signals WHERE id = ?');
        return stmt.get(id) as Signal | undefined;
    },

    // Add price checkpoint
    addCheckpoint(signalId: number, checkpointMin: number, price: number, profitPercent: number): void {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO price_checkpoints (signal_id, checkpoint_min, price, profit_percent)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(signalId, checkpointMin, price, profitPercent);
        console.log(`[SQLite] Checkpoint ${checkpointMin}m for #${signalId}: ${profitPercent.toFixed(2)}%`);
    },

    // Get checkpoints for signal
    getCheckpoints(signalId: number): PriceCheckpoint[] {
        const stmt = db.prepare('SELECT * FROM price_checkpoints WHERE signal_id = ? ORDER BY checkpoint_min');
        return stmt.all(signalId) as PriceCheckpoint[];
    },

    // Validate signal (WIN/LOSS based on stop/target)
    validateSignal(
        id: number,
        currentPrice: number,
        macroData?: {
            macro_confidence?: number;
            macro_sentiment?: string;
            fear_greed?: number;
            trade_recommendation?: string;
            sp500_trend?: string;
            fed_stance?: string;
        }
    ): { result: 'WIN' | 'LOSS' | 'PENDING'; profitPercent: number } {
        const signal = this.getSignal(id);
        if (!signal || signal.result !== 'PENDING') {
            return { result: 'PENDING', profitPercent: 0 };
        }

        let result: 'WIN' | 'LOSS' | 'PENDING' = 'PENDING';
        let profitPercent = 0;

        if (signal.action === 'BUY') {
            if (currentPrice >= signal.take_profit) {
                result = 'WIN';
                profitPercent = ((currentPrice - signal.entry_price) / signal.entry_price) * 100;
            } else if (currentPrice <= signal.stop_loss) {
                result = 'LOSS';
                profitPercent = ((currentPrice - signal.entry_price) / signal.entry_price) * 100;
            }
        } else {
            if (currentPrice <= signal.take_profit) {
                result = 'WIN';
                profitPercent = ((signal.entry_price - currentPrice) / signal.entry_price) * 100;
            } else if (currentPrice >= signal.stop_loss) {
                result = 'LOSS';
                profitPercent = ((signal.entry_price - currentPrice) / signal.entry_price) * 100;
            }
        }

        if (result !== 'PENDING') {
            this.closeSignal(id, currentPrice, result, profitPercent, macroData);
        }

        return { result, profitPercent };
    },

    // Close signal and create ML training record
    closeSignal(id: number, exitPrice: number, result: 'WIN' | 'LOSS', profitPercent: number, macroData?: {
        macro_confidence?: number;
        macro_sentiment?: string;
        fear_greed?: number;
        trade_recommendation?: string;
        sp500_trend?: string;
        fed_stance?: string;
    }): void {
        const signal = this.getSignal(id);
        if (!signal) return;

        // Update signal
        const updateStmt = db.prepare(`
            UPDATE signals SET result = ?, exit_price = ?, validated_at = datetime('now')
            WHERE id = ?
        `);
        updateStmt.run(result, exitPrice, id);

        // Get checkpoints
        const checkpoints = this.getCheckpoints(id);
        const getProfit = (min: number) => checkpoints.find(c => c.checkpoint_min === min)?.profit_percent ?? null;

        // Calculate time to result and time features
        const createdDate = new Date(signal.created_at);
        const createdAt = createdDate.getTime();
        const timeToResult = Math.round((Date.now() - createdAt) / (60 * 1000));
        const hourUtc = createdDate.getUTCHours();
        const dayOfWeek = createdDate.getUTCDay();  // 0=Sunday, 6=Saturday

        // Insert ML training record with macro data
        const mlStmt = db.prepare(`
            INSERT OR REPLACE INTO ml_training (
                signal_id, symbol, action, result, final_profit, time_to_result_min,
                hour_utc, day_of_week,
                f_smart_money, f_price_context, f_imbalance, f_absorption,
                f_trend, f_momentum, f_volume, score,
                profit_5m, profit_10m, profit_15m, profit_30m, profit_45m,
                macro_confidence, macro_sentiment, fear_greed, trade_recommendation, sp500_trend, fed_stance
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        mlStmt.run(
            id, signal.symbol, signal.action, result, profitPercent, timeToResult,
            hourUtc, dayOfWeek,
            signal.f_smart_money, signal.f_price_context, signal.f_imbalance, signal.f_absorption,
            signal.f_trend, signal.f_momentum, signal.f_volume, signal.score,
            getProfit(5), getProfit(10), getProfit(15), getProfit(30), getProfit(45),
            macroData?.macro_confidence ?? null,
            macroData?.macro_sentiment ?? null,
            macroData?.fear_greed ?? null,
            macroData?.trade_recommendation ?? null,
            macroData?.sp500_trend ?? null,
            macroData?.fed_stance ?? null
        );

        console.log(`[SQLite] Signal #${id} closed: ${result} (${profitPercent.toFixed(2)}%) in ${timeToResult}min`);
    },

    // Force close signal (timeout)
    forceCloseSignal(id: number, exitPrice: number, result: 'WIN' | 'LOSS', profitPercent: number, macroData?: {
        macro_confidence?: number;
        macro_sentiment?: string;
        fear_greed?: number;
        trade_recommendation?: string;
        sp500_trend?: string;
        fed_stance?: string;
    }): void {
        this.closeSignal(id, exitPrice, result, profitPercent, macroData);
    },

    // Get statistics for active strategy with optional baseline reset window
    // Total de trades fechados (WIN+LOSS) sem filtro de baseline/fase — usado pelo bootstrap
    // mode do filtro hora/direção (ver HOUR_DIRECTION_BOOTSTRAP_TOTAL_TRADES em trendingScanner.ts)
    getTotalClosedTrades(): number {
        const strategyVersion = this.getActiveStrategyVersion();
        const row = db.prepare(
            "SELECT COUNT(*) as count FROM signals WHERE result IN ('WIN','LOSS') AND strategy_version = ?"
        ).get(strategyVersion) as { count: number };
        return row.count;
    },

    getStats(): {
        phase_tag: string;
        strategy_version: string;
        baseline_at: string | null;
        signals: number;
        pending: number;
        wins: number;
        losses: number;
        win_rate: number;
        avg_profit: number;
        all_time_signals: number;
        all_time_wins: number;
        all_time_losses: number;
        all_time_win_rate: number;
    } {
        const strategyVersion = this.getActiveStrategyVersion();
        const phaseTag = this.getStatsPhaseTag();
        const baselineAt = this.getStatsBaselineAt(phaseTag);

        let totalSql = 'SELECT COUNT(*) as count FROM signals WHERE strategy_version = ?';
        const totalParams: string[] = [strategyVersion];
        if (baselineAt) {
            totalSql += " AND datetime(created_at) >= datetime(?)";
            totalParams.push(baselineAt);
        }

        let pendingSql = "SELECT COUNT(*) as count FROM signals WHERE result = 'PENDING' AND strategy_version = ?";
        const pendingParams: string[] = [strategyVersion];
        if (baselineAt) {
            pendingSql += " AND datetime(created_at) >= datetime(?)";
            pendingParams.push(baselineAt);
        }

        let winsSql = "SELECT COUNT(*) as count FROM signals WHERE result = 'WIN' AND strategy_version = ?";
        const winsParams: string[] = [strategyVersion];
        if (baselineAt) {
            winsSql += " AND datetime(COALESCE(validated_at, created_at)) >= datetime(?)";
            winsParams.push(baselineAt);
        }

        let lossesSql = "SELECT COUNT(*) as count FROM signals WHERE result = 'LOSS' AND strategy_version = ?";
        const lossesParams: string[] = [strategyVersion];
        if (baselineAt) {
            lossesSql += " AND datetime(COALESCE(validated_at, created_at)) >= datetime(?)";
            lossesParams.push(baselineAt);
        }

        let avgProfitSql = `
            SELECT AVG(m.final_profit) as avg
            FROM ml_training m
            INNER JOIN signals s ON s.id = m.signal_id
            WHERE s.strategy_version = ?
        `;
        const avgProfitParams: string[] = [strategyVersion];
        if (baselineAt) {
            avgProfitSql += " AND datetime(COALESCE(s.validated_at, s.created_at)) >= datetime(?)";
            avgProfitParams.push(baselineAt);
        }

        const total = db.prepare(totalSql).get(...totalParams) as { count: number };
        const pending = db.prepare(pendingSql).get(...pendingParams) as { count: number };
        const wins = db.prepare(winsSql).get(...winsParams) as { count: number };
        const losses = db.prepare(lossesSql).get(...lossesParams) as { count: number };
        const avgProfit = db.prepare(avgProfitSql).get(...avgProfitParams) as { avg: number | null };

        const totalClosed = wins.count + losses.count;
        const winRate = totalClosed > 0 ? (wins.count / totalClosed) * 100 : 0;

        // All-time (sem filtro de baseline/fase) — transparência: reset de fase nunca esconde o histórico real
        const allTimeSignals = db.prepare('SELECT COUNT(*) as count FROM signals WHERE strategy_version = ?').get(strategyVersion) as { count: number };
        const allTimeWins = db.prepare("SELECT COUNT(*) as count FROM signals WHERE result = 'WIN' AND strategy_version = ?").get(strategyVersion) as { count: number };
        const allTimeLosses = db.prepare("SELECT COUNT(*) as count FROM signals WHERE result = 'LOSS' AND strategy_version = ?").get(strategyVersion) as { count: number };
        const allTimeClosed = allTimeWins.count + allTimeLosses.count;
        const allTimeWinRate = allTimeClosed > 0 ? (allTimeWins.count / allTimeClosed) * 100 : 0;

        return {
            phase_tag: phaseTag,
            strategy_version: strategyVersion,
            baseline_at: baselineAt,
            signals: total.count,
            pending: pending.count,
            wins: wins.count,
            losses: losses.count,
            win_rate: winRate,
            avg_profit: avgProfit.avg ?? 0,
            all_time_signals: allTimeSignals.count,
            all_time_wins: allTimeWins.count,
            all_time_losses: allTimeLosses.count,
            all_time_win_rate: allTimeWinRate
        };
    },

    getEdgeMatrix(minTrades: number = 80): EdgeMatrixCell[] {
        const strategyVersion = this.getActiveStrategyVersion();
        const rows = db.prepare(`
            SELECT
                CAST(strftime('%H', s.created_at) AS INTEGER) AS hour_utc,
                s.action AS action,
                COUNT(*) AS trades,
                SUM(CASE WHEN s.result = 'WIN' THEN 1 ELSE 0 END) AS wins,
                SUM(CASE WHEN s.result = 'LOSS' THEN 1 ELSE 0 END) AS losses,
                AVG(m.final_profit) AS expectancy,
                AVG(CASE WHEN m.final_profit > 0 THEN m.final_profit END) AS avg_win,
                AVG(CASE WHEN m.final_profit < 0 THEN m.final_profit END) AS avg_loss,
                SUM(CASE WHEN m.final_profit > 0 THEN m.final_profit ELSE 0 END) AS gross_win,
                ABS(SUM(CASE WHEN m.final_profit < 0 THEN m.final_profit ELSE 0 END)) AS gross_loss,
                SUM(m.final_profit * m.final_profit) AS sum_sq
            FROM signals s
            INNER JOIN ml_training m ON m.signal_id = s.id
            WHERE s.strategy_version = ?
              AND s.result IN ('WIN', 'LOSS')
              AND m.final_profit IS NOT NULL
            GROUP BY hour_utc, s.action
            HAVING COUNT(*) >= ?
            ORDER BY hour_utc ASC, s.action ASC
        `).all(strategyVersion, minTrades) as Array<{
            hour_utc: number;
            action: 'BUY' | 'SELL';
            trades: number;
            wins: number;
            losses: number;
            expectancy: number;
            avg_win: number | null;
            avg_loss: number | null;
            gross_win: number | null;
            gross_loss: number | null;
            sum_sq: number | null;
        }>;

        return rows.map((row) => {
            const n = row.trades;
            const mean = Number(row.expectancy ?? 0);
            const sumSq = Number(row.sum_sq ?? 0);
            const sampleVar = n > 1 ? Math.max(0, (sumSq - n * mean * mean) / (n - 1)) : 0;
            const stdDev = Math.sqrt(sampleVar);
            const se = n > 0 ? stdDev / Math.sqrt(n) : 0;
            const ciLow = mean - Z_95 * se;
            const ciHigh = mean + Z_95 * se;
            const wr = n > 0 ? (row.wins / n) : 0;
            const wrCi = wilson95(row.wins, n);
            const grossWin = Number(row.gross_win ?? 0);
            const grossLoss = Number(row.gross_loss ?? 0);

            return {
                hour_utc: row.hour_utc,
                action: row.action,
                trades: n,
                wins: row.wins,
                losses: row.losses,
                win_rate: wr * 100,
                win_rate_ci95_low: wrCi.low * 100,
                win_rate_ci95_high: wrCi.high * 100,
                expectancy: mean,
                std_dev: stdDev,
                expectancy_ci95_low: ciLow,
                expectancy_ci95_high: ciHigh,
                avg_win: Number(row.avg_win ?? 0),
                avg_loss: Number(row.avg_loss ?? 0),
                profit_factor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 999 : 0)
            };
        });
    },

    getDirectionalHourStats(minTrades: number = 80): Array<{
        hour_utc: number;
        action: 'BUY' | 'SELL';
        trades: number;
        wins: number;
        losses: number;
        win_rate: number;
    }> {
        return this.getEdgeMatrix(minTrades).map((row) => ({
            hour_utc: row.hour_utc,
            action: row.action,
            trades: row.trades,
            wins: row.wins,
            losses: row.losses,
            win_rate: row.win_rate
        }));
    },

    // Export ML data as CSV
    exportMLData(): string {
        const records = db.prepare('SELECT * FROM ml_training ORDER BY id').all() as MLTrainingRecord[];
        if (records.length === 0) return '';

        const headers = 'id,symbol,action,result,final_profit,time_to_result_min,hour_utc,day_of_week,f_smart_money,f_price_context,f_imbalance,f_absorption,f_trend,f_momentum,f_volume,score,profit_5m,profit_10m,profit_15m,profit_30m,profit_45m';
        const rows = records.map(r =>
            `${r.id},${r.symbol},${r.action},${r.result},${r.final_profit?.toFixed(4) ?? ''},${r.time_to_result_min},${r.hour_utc ?? ''},${r.day_of_week ?? ''},${r.f_smart_money?.toFixed(4) ?? ''},${r.f_price_context?.toFixed(4) ?? ''},${r.f_imbalance?.toFixed(4) ?? ''},${r.f_absorption?.toFixed(4) ?? ''},${r.f_trend?.toFixed(4) ?? ''},${r.f_momentum?.toFixed(4) ?? ''},${r.f_volume?.toFixed(4) ?? ''},${r.score},${r.profit_5m?.toFixed(4) ?? ''},${r.profit_10m?.toFixed(4) ?? ''},${r.profit_15m?.toFixed(4) ?? ''},${r.profit_30m?.toFixed(4) ?? ''},${r.profit_45m?.toFixed(4) ?? ''}`
        );

        return `${headers}\n${rows.join('\n')}`;
    },

    // Get all ML training records
    getMLRecords(): MLTrainingRecord[] {
        return db.prepare('SELECT * FROM ml_training ORDER BY id').all() as MLTrainingRecord[];
    },

    getMLRecordCount(): number {
        const row = db.prepare('SELECT COUNT(*) as count FROM ml_training').get() as { count: number };
        return row?.count ?? 0;
    },

    // ========== ALTERNATIVE DATA (NEWS) ==========

    insertNewsItem(item: {
        guid: string;
        content_hash: string;
        source: string;
        title: string;
        link: string;
        published_at: string;
    }): number | null {
        try {
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO news_items (
                    guid, content_hash, source, title, link, published_at, fetched_at
                ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            `);
            const info = stmt.run(
                item.guid, item.content_hash, item.source, item.title, item.link, item.published_at
            );
            if (info.changes > 0) {
                console.log(`[SQLite] News saved: ${item.source} - ${item.title.substring(0, 30)}...`);
                return info.lastInsertRowid as number;
            }
            return null; // Duplicate
        } catch (err) {
            console.error('[SQLite] Error inserting news item:', err);
            return null;
        }
    },

    getRecentNews(limit: number = 20): any[] {
        return db.prepare('SELECT * FROM news_items ORDER BY published_at DESC LIMIT ?').all(limit);
    },

    getUnprocessedNews(limit: number = 5): any[] {
        // News items that do NOT have a corresponding signal with 'v1.0' (simplified check)
        // Or strictly LEFT JOIN where id is null
        const stmt = db.prepare(`
            SELECT n.* FROM news_items n
            LEFT JOIN news_signals s ON n.id = s.news_item_id
            WHERE s.id IS NULL
            ORDER BY n.published_at DESC
            LIMIT ?
        `);
        return stmt.all(limit);
    },

    insertNewsSignal(signal: {
        news_item_id: number;
        crypto_relevant: boolean;
        sentiment_score: number;
        impact_rating: number;
        reasoning: string;
        model_used: string;
        prompt_version: string;
        input_hash: string;
    }): void {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO news_signals (
                news_item_id, crypto_relevant, sentiment_score, impact_rating, 
                reasoning, model_used, prompt_version, input_hash, available_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        stmt.run(
            signal.news_item_id,
            signal.crypto_relevant ? 1 : 0,
            signal.sentiment_score,
            signal.impact_rating,
            signal.reasoning,
            signal.model_used,
            signal.prompt_version,
            signal.input_hash
        );
        console.log(`[SQLite] Signal save for item #${signal.news_item_id}`);
    },

    getRecentSentimentSignals(windowMinutes: number = 60, minImpact: number = 4): any[] {
        const stmt = db.prepare(`
            SELECT ns.*, ni.title, ni.link 
            FROM news_signals ns
            JOIN news_items ni ON ns.news_item_id = ni.id
            WHERE ns.impact_rating >= ?
            AND ns.available_at <= datetime('now')  -- STRICT Anti-Lookahead
            AND ns.available_at >= datetime('now', '-' || ? || ' minutes') -- Valid Window
            ORDER BY ns.available_at DESC
        `);
        return stmt.all(minImpact, windowMinutes);
    },

    // ========== PAPER TRADING (MULTI-USER) ==========

    getAccount(userId: string): any {
        return db.prepare('SELECT * FROM paper_accounts WHERE user_id = ?').get(userId);
    },

    createAccount(userId: string, username: string, initialBalance: number): void {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO paper_accounts (user_id, username, initial_balance, balance, equity, status)
            VALUES (?, ?, ?, ?, ?, 'ACTIVE')
        `);
        stmt.run(userId, username, initialBalance, initialBalance, initialBalance);
        console.log(`[SQLite] Paper Account created for ${username} (${userId}) with $${initialBalance}`);
    },

    updateAccountBalance(userId: string, balance: number, equity: number): void {
        const stmt = db.prepare("UPDATE paper_accounts SET balance = ?, equity = ?, updated_at = datetime('now') WHERE user_id = ?");
        stmt.run(balance, equity, userId);
    },

    getOpenPositions(accountId: number): any[] {
        return db
            .prepare("SELECT *, entry_at AS opened_at FROM paper_positions WHERE account_id = ? AND COALESCE(status, 'OPEN') = 'OPEN'")
            .all(accountId);
    },

    openPosition(pos: {
        account_id: number;
        symbol: string;
        side: string;
        entry_price: number;
        size: number;
        leverage: number;
        stop_loss?: number;
        take_profit?: number;
    }): number {
        const stmt = db.prepare(`
            INSERT INTO paper_positions (
                account_id, symbol, side, entry_price, size, leverage, stop_loss, take_profit, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')
        `);
        const info = stmt.run(
            pos.account_id, pos.symbol, pos.side, pos.entry_price, pos.size,
            pos.leverage, pos.stop_loss, pos.take_profit
        );
        return info.lastInsertRowid as number;
    },

    closePosition(id: number): void {
        db.prepare("UPDATE paper_positions SET status = 'CLOSED' WHERE id = ?").run(id);
    },

    insertTrade(trade: {
        position_id: number;
        account_id: number;
        symbol: string;
        side: string;
        entry_price: number;
        exit_price: number;
        size: number;
        pnl_gross: number;
        slippage_cost: number;
        pnl_net: number;
        pnl_percent: number;
        close_reason: string;
        execution_model: string;
        opened_at: string; // ISO date passed from position
    }): void {
        const stmt = db.prepare(`
            INSERT INTO paper_trades (
                position_id, account_id, symbol, side, entry_price, exit_price, size,
                pnl, pnl_gross, slippage_cost, pnl_net, pnl_percent, close_reason, execution_model, opened_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            trade.position_id, trade.account_id, trade.symbol, trade.side,
            trade.entry_price, trade.exit_price, trade.size,
            trade.pnl_net, trade.pnl_gross, trade.slippage_cost, trade.pnl_net, trade.pnl_percent,
            trade.close_reason, trade.execution_model, trade.opened_at
        );
        console.log(`[SQLite] Paper Trade saved: ${trade.symbol} PnL: $${trade.pnl_net.toFixed(2)}`);
    },

    getTradeStats(accountId: number): { wins: number; losses: number; total_pnl: number; win_rate: number } {
        const cols = db.prepare('PRAGMA table_info(paper_trades)').all() as Array<{ name: string }>;
        const pnlCol = cols.some(c => c.name === 'pnl_net') ? 'pnl_net' : 'pnl';
        const trades = db
            .prepare(`SELECT ${pnlCol} as pnl_value FROM paper_trades WHERE account_id = ?`)
            .all(accountId) as { pnl_value: number }[];

        let wins = 0;
        let losses = 0;
        let total_pnl = 0;

        for (const t of trades) {
            total_pnl += t.pnl_value;
            if (t.pnl_value > 0) wins++;
            else losses++; // Ties count as loss or ignore? Counting as loss for conservative stats
        }

        const total = wins + losses;
        const win_rate = total > 0 ? (wins / total) * 100 : 0;

        return { wins, losses, total_pnl, win_rate };
    },

    setAutoTraderEnabled(userId: string, username: string, enabled: boolean): void {
        const stmt = db.prepare(`
            INSERT INTO paper_autotrader_settings (user_id, username, enabled, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
                username = excluded.username,
                enabled = excluded.enabled,
                updated_at = datetime('now')
        `);
        stmt.run(userId, username, enabled ? 1 : 0);
    },

    isAutoTraderEnabled(userId: string): boolean {
        const row = db
            .prepare('SELECT enabled FROM paper_autotrader_settings WHERE user_id = ?')
            .get(userId) as { enabled: number } | undefined;
        return row?.enabled === 1;
    },

    getAutoTraderEnabledUsers(): Array<{ user_id: string; username: string; account_id: number }> {
        const stmt = db.prepare(`
            SELECT s.user_id, COALESCE(s.username, a.username, 'Trader') AS username, a.id AS account_id
            FROM paper_autotrader_settings s
            INNER JOIN paper_accounts a ON a.user_id = s.user_id
            WHERE s.enabled = 1 AND a.status = 'ACTIVE'
        `);
        return stmt.all() as Array<{ user_id: string; username: string; account_id: number }>;
    },

    hasAutoTraderExecution(signalId: number, userId: string): boolean {
        const row = db
            .prepare('SELECT 1 as ok FROM paper_autotrader_executions WHERE signal_id = ? AND user_id = ? LIMIT 1')
            .get(signalId, userId) as { ok: number } | undefined;
        return Boolean(row?.ok);
    },

    markAutoTraderExecution(signalId: number, userId: string, symbol: string, reason: string): void {
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO paper_autotrader_executions (signal_id, user_id, symbol, reason)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(signalId, userId, symbol, reason);
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // EXIT DECISION ENGINE — log de features e decisões de saída
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Registra uma observação de features no ciclo de monitoramento.
     * Retorna o id da linha inserida.
     */
    logExitDecision(entry: {
        signal_id:              number;
        symbol:                 string;
        action:                 'BUY' | 'SELL';
        pnl_pct:                number;
        time_in_trade_seconds:  number;
        distance_to_stop_pct:   number;
        distance_to_target_pct: number;
        volume_ratio:           number;
        volatility_5m:          number;
        volatility_15m:         number;
        volatility_ratio:       number;
        rsi_current:            number;
        rsi_slope:              number;
        candles_in_favor:       number;
        candles_against:        number;
        original_signal_score:  number;
        bid_ask_spread_pct:     number;
        decision_source:        'HARD_STOP' | 'ML' | 'LLM' | 'FALLBACK';
        decision:               'HOLD' | 'EXIT' | 'MOVE_STOP';
        confidence:             number;
        reasoning?:             string;
        is_final:               boolean;
        outcome?:               'WIN' | 'LOSS';
        pnl_final?:             number;
        close_time_ms?:         number;
        captured_at:            number;
    }): number {
        const stmt = db.prepare(`
            INSERT INTO exit_decisions_log (
                signal_id, symbol, action,
                pnl_pct, time_in_trade_seconds, distance_to_stop_pct, distance_to_target_pct,
                volume_ratio, volatility_5m, volatility_15m, volatility_ratio,
                rsi_current, rsi_slope, candles_in_favor, candles_against,
                original_signal_score, bid_ask_spread_pct,
                decision_source, decision, confidence, reasoning,
                is_final, outcome, pnl_final,
                close_time_ms, counterfactual_needed_at, counterfactual_filled,
                captured_at
            ) VALUES (
                ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, 0,
                ?
            )
        `);

        // counterfactual_needed_at = closeTimeMs + 16 min (dá margem para o candle fechar)
        const cfNeededAt = entry.is_final && entry.close_time_ms
            ? entry.close_time_ms + 16 * 60 * 1000
            : null;

        const result = stmt.run(
            entry.signal_id, entry.symbol, entry.action,
            entry.pnl_pct, entry.time_in_trade_seconds,
            entry.distance_to_stop_pct, entry.distance_to_target_pct,
            entry.volume_ratio, entry.volatility_5m, entry.volatility_15m, entry.volatility_ratio,
            entry.rsi_current, entry.rsi_slope, entry.candles_in_favor, entry.candles_against,
            entry.original_signal_score, entry.bid_ask_spread_pct,
            entry.decision_source, entry.decision, entry.confidence, entry.reasoning ?? null,
            entry.is_final ? 1 : 0, entry.outcome ?? null, entry.pnl_final ?? null,
            entry.close_time_ms ?? null, cfNeededAt,
            entry.captured_at
        );

        return result.lastInsertRowid as number;
    },

    /**
     * Atualiza o outcome de todas as linhas de um sinal quando ele fecha.
     * Marca a última linha como is_final=1.
     */
    finalizeExitLog(signalId: number, outcome: 'WIN' | 'LOSS', pnlFinal: number, closeTimeMs: number): void {
        // 1. Atualiza o outcome em todas as linhas do sinal
        db.prepare(`
            UPDATE exit_decisions_log
            SET outcome = ?, pnl_final = ?
            WHERE signal_id = ?
        `).run(outcome, pnlFinal, signalId);

        // 2. Marca a última linha como is_final e define quando buscar o contrafactual
        const cfNeededAt = closeTimeMs + 16 * 60 * 1000;
        db.prepare(`
            UPDATE exit_decisions_log
            SET is_final = 1,
                decision = 'EXIT',
                close_time_ms = ?,
                counterfactual_needed_at = ?
            WHERE signal_id = ?
              AND id = (SELECT MAX(id) FROM exit_decisions_log WHERE signal_id = ?)
        `).run(closeTimeMs, cfNeededAt, signalId, signalId);
    },

    /**
     * Retorna linhas finais que ainda precisam do contrafactual preenchido.
     */
    getPendingCounterfactuals(): Array<{
        id: number;
        signal_id: number;
        symbol: string;
        action: string;
        pnl_final: number;
        close_time_ms: number;
        counterfactual_needed_at: number;
    }> {
        return db.prepare(`
            SELECT id, signal_id, symbol, action, pnl_final, close_time_ms, counterfactual_needed_at
            FROM exit_decisions_log
            WHERE is_final = 1
              AND counterfactual_filled = 0
              AND counterfactual_needed_at IS NOT NULL
              AND counterfactual_needed_at <= ?
        `).all(Date.now()) as any[];
    },

    /**
     * Preenche os preços contrafactuais de uma linha final.
     */
    fillCounterfactual(id: number, cf5m: number, cf10m: number, cf15m: number): void {
        db.prepare(`
            UPDATE exit_decisions_log
            SET cf_pnl_5m = ?, cf_pnl_10m = ?, cf_pnl_15m = ?, counterfactual_filled = 1
            WHERE id = ?
        `).run(cf5m, cf10m, cf15m, id);
    },

    /** Conta linhas coletadas na tabela (útil para saber quando há dados suficientes). */
    getExitLogCount(): number {
        const row = db.prepare(
            "SELECT COUNT(*) as n FROM exit_decisions_log WHERE is_final = 1 AND outcome IS NOT NULL"
        ).get() as { n: number };
        return row?.n ?? 0;
    }
};
