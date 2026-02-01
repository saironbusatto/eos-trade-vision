
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH || './data/eos.db';
console.log(`[MIGRATE] Opening database at ${DB_PATH}`);
const db = new Database(path.resolve(DB_PATH));

const schema = `
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
        FOREIGN KEY (news_item_id) REFERENCES news_items(id),
        UNIQUE(news_item_id, model_used, prompt_version) -- Garante idempotência
    );

    -- ==========================================
    -- FASE 3: PAPER TRADING
    -- ==========================================
    CREATE TABLE IF NOT EXISTS paper_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,     -- Expansível para multi-user
        balance REAL NOT NULL,
        equity REAL NOT NULL,
        status TEXT DEFAULT 'ACTIVE', -- ACTIVE, PAUSED, CLOSED
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS paper_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,        -- LONG / SHORT
        entry_price REAL NOT NULL,
        size REAL NOT NULL,        -- Quantidade
        leverage INTEGER NOT NULL,
        stop_loss REAL,
        take_profit REAL,
        entry_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES paper_accounts(id)
    );

    CREATE TABLE IF NOT EXISTS paper_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        position_id INTEGER NOT NULL,
        exit_price REAL NOT NULL,
        pnl REAL NOT NULL,
        pnl_percent REAL NOT NULL,
        closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        close_reason TEXT,         -- TP, SL, MANUAL, LIQUIDATION
        execution_model TEXT DEFAULT 'baseline', -- baseline / realistic
        FOREIGN KEY (position_id) REFERENCES paper_positions(id)
    );
`;

try {
    console.log('[MIGRATE] Executing schema updates...');
    db.exec(schema);
    console.log('[MIGRATE] Success! Tables created/verified.');
} catch (err) {
    console.error('[MIGRATE] Failed:', err);
    process.exit(1);
}
