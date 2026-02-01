import Database from 'better-sqlite3';
import path from 'path';

// Initialize SQLite database
const DB_PATH = process.env.DATABASE_PATH || './data/eos.db';
console.log(`[DEBUG] Loading sqliteDatabase.ts... DB_PATH=${DB_PATH}`);
const db = new Database(path.resolve(DB_PATH));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

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

    console.log('[SQLite] Schema initialized');
}

// Initialize on import
try {
    initSchema();
} catch (err) {
    console.error("❌ initSchema Failed:", err);
}

// ========== SIGNAL CRUD ==========

export const sqliteDatabase = {
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

        const stmt = db.prepare(`
            INSERT INTO signals (
                symbol, action, entry_price, stop_loss, take_profit, score,
                f_smart_money, f_price_context, f_imbalance, f_absorption, 
                f_trend, f_momentum, f_volume,
                volume_ratio, trend, momentum, price_change_24h,
                strategy_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'v3.0')
        `);

        const result = stmt.run(
            signal.symbol, signal.action, signal.entry_price, stopLoss, takeProfit, signal.score,
            signal.f_smart_money, signal.f_price_context, signal.f_imbalance, signal.f_absorption,
            signal.f_trend, signal.f_momentum, signal.f_volume,
            signal.volume_ratio, signal.trend, signal.momentum, signal.price_change_24h
        );

        const id = result.lastInsertRowid as number;
        console.log(`[SQLite] Signal #${id} saved: ${signal.symbol} ${signal.action} @ $${signal.entry_price} (v3.0)`);
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
    validateSignal(id: number, currentPrice: number): { result: 'WIN' | 'LOSS' | 'PENDING'; profitPercent: number } {
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
            this.closeSignal(id, currentPrice, result, profitPercent);
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

    // Get statistics (v3.0 only - nova estratégia)
    getStats(): { signals: number; pending: number; wins: number; losses: number; win_rate: number; avg_profit: number } {
        // Total e pending de todas as versões
        const total = db.prepare('SELECT COUNT(*) as count FROM signals').get() as { count: number };
        const pending = db.prepare("SELECT COUNT(*) as count FROM signals WHERE result = 'PENDING'").get() as { count: number };

        // Wins e losses apenas da v3.0 (nova estratégia)
        const wins = db.prepare("SELECT COUNT(*) as count FROM signals WHERE result = 'WIN' AND strategy_version = 'v3.0'").get() as { count: number };
        const losses = db.prepare("SELECT COUNT(*) as count FROM signals WHERE result = 'LOSS' AND strategy_version = 'v3.0'").get() as { count: number };

        const avgProfit = db.prepare('SELECT AVG(final_profit) as avg FROM ml_training').get() as { avg: number | null };

        const totalClosed = wins.count + losses.count;
        const winRate = totalClosed > 0 ? (wins.count / totalClosed) * 100 : 0;

        return {
            signals: total.count,
            pending: pending.count,
            wins: wins.count,
            losses: losses.count,
            win_rate: winRate,
            avg_profit: avgProfit.avg ?? 0
        };
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
        const stmt = db.prepare('UPDATE paper_accounts SET balance = ?, equity = ?, updated_at = datetime("now") WHERE user_id = ?');
        stmt.run(balance, equity, userId);
    },

    getOpenPositions(accountId: number): any[] {
        return db.prepare('SELECT * FROM paper_positions WHERE account_id = ?').all(accountId);
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
                account_id, symbol, side, entry_price, size, leverage, stop_loss, take_profit
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(
            pos.account_id, pos.symbol, pos.side, pos.entry_price, pos.size,
            pos.leverage, pos.stop_loss, pos.take_profit
        );
        return info.lastInsertRowid as number;
    },

    closePosition(id: number): void {
        db.prepare('DELETE FROM paper_positions WHERE id = ?').run(id);
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
                pnl_gross, slippage_cost, pnl_net, pnl_percent, close_reason, execution_model, opened_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            trade.position_id, trade.account_id, trade.symbol, trade.side,
            trade.entry_price, trade.exit_price, trade.size,
            trade.pnl_gross, trade.slippage_cost, trade.pnl_net, trade.pnl_percent,
            trade.close_reason, trade.execution_model, trade.opened_at
        );
        console.log(`[SQLite] Paper Trade saved: ${trade.symbol} PnL: $${trade.pnl_net.toFixed(2)}`);
    },

    getTradeStats(accountId: number): { wins: number; losses: number; total_pnl: number; win_rate: number } {
        const trades = db.prepare('SELECT pnl_net FROM paper_trades WHERE account_id = ?').all(accountId) as { pnl_net: number }[];

        let wins = 0;
        let losses = 0;
        let total_pnl = 0;

        for (const t of trades) {
            total_pnl += t.pnl_net;
            if (t.pnl_net > 0) wins++;
            else losses++; // Ties count as loss or ignore? Counting as loss for conservative stats
        }

        const total = wins + losses;
        const win_rate = total > 0 ? (wins / total) * 100 : 0;

        return { wins, losses, total_pnl, win_rate };
    }
};
