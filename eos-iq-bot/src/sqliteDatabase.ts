import Database from 'better-sqlite3';
import path from 'path';
import { config } from './config';

// Initialize SQLite database
const DB_PATH = config.databasePath.replace('.json', '.db');
const db = new Database(path.resolve(DB_PATH));
db.pragma('journal_mode = WAL');

// ========== TYPES ==========

export interface Signal {
    id: number;
    pair: string;
    direction: 'CALL' | 'PUT';
    entry_price: number;
    exit_price?: number;
    score: number;
    result: 'PENDING' | 'WIN' | 'LOSS';
    expiration_min: number;
    created_at: string;
    validated_at?: string;

    // OFA Indicators
    delta: number;
    delta_cumulative: number;
    absorption_detected: boolean;
    divergence_detected: boolean;
    stacked_imbalances: number;
    vpoc_migration: string;
    reversal_sequence: number;

    // Time features
    hour_utc: number;
    day_of_week: number;

    // Golden flag
    is_golden: boolean;
}

export interface MLTrainingRecord {
    id: number;
    signal_id: number;
    pair: string;
    direction: string;
    result: string;
    expiration_min: number;

    // OFA features
    delta: number;
    delta_cumulative: number;
    absorption_detected: number;
    divergence_detected: number;
    stacked_imbalances: number;
    reversal_sequence: number;
    score: number;

    // Time features
    hour_utc: number;
    day_of_week: number;

    // Macro features
    macro_confidence: number | null;
    macro_sentiment: string | null;
    fear_greed: number | null;
    sp500_trend: string | null;
    fed_stance: string | null;
}

// ========== SCHEMA ==========

function initSchema(): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pair TEXT NOT NULL,
            direction TEXT NOT NULL,
            entry_price REAL NOT NULL,
            exit_price REAL,
            score INTEGER NOT NULL,
            result TEXT DEFAULT 'PENDING',
            expiration_min INTEGER DEFAULT 5,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            validated_at DATETIME,
            
            delta REAL,
            delta_cumulative REAL,
            absorption_detected INTEGER,
            divergence_detected INTEGER,
            stacked_imbalances INTEGER,
            vpoc_migration TEXT,
            reversal_sequence INTEGER,
            
            strategy_version TEXT DEFAULT 'v2.0',
            is_golden INTEGER DEFAULT 0,
            
            hour_utc INTEGER,
            day_of_week INTEGER
        );

        CREATE TABLE IF NOT EXISTS ml_training (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            signal_id INTEGER UNIQUE NOT NULL,
            pair TEXT,
            direction TEXT,
            result TEXT,
            expiration_min INTEGER,
            
            delta REAL,
            delta_cumulative REAL,
            absorption_detected INTEGER,
            divergence_detected INTEGER,
            stacked_imbalances INTEGER,
            reversal_sequence INTEGER,
            score INTEGER,
            
            hour_utc INTEGER,
            day_of_week INTEGER,
            
            macro_confidence REAL,
            macro_sentiment TEXT,
            fear_greed INTEGER,
            sp500_trend TEXT,
            fed_stance TEXT,
            
            FOREIGN KEY (signal_id) REFERENCES signals(id)
        );

        CREATE INDEX IF NOT EXISTS idx_signals_result ON signals(result);
    `);
    console.log('[SQLite] IQ Bot schema initialized');
}

initSchema();

// ========== DATABASE OPERATIONS ==========

export const sqliteDatabase = {
    insertSignal(signal: {
        pair: string;
        direction: 'CALL' | 'PUT';
        entry_price: number;
        score: number;
        expiration_min?: number;
        delta?: number;
        delta_cumulative?: number;
        absorption_detected?: boolean;
        divergence_detected?: boolean;
        stacked_imbalances?: number;
        vpoc_migration?: string;
        reversal_sequence?: number;
        is_golden?: boolean;
    }): number {
        const now = new Date();
        const stmt = db.prepare(`
            INSERT INTO signals (
                pair, direction, entry_price, score, expiration_min,
                delta, delta_cumulative, absorption_detected, divergence_detected,
                stacked_imbalances, vpoc_migration, reversal_sequence,
                hour_utc, day_of_week, strategy_version, is_golden
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'v3.0', ?)
        `);

        const result = stmt.run(
            signal.pair, signal.direction, signal.entry_price, signal.score,
            signal.expiration_min ?? 5,
            signal.delta ?? 0, signal.delta_cumulative ?? 0,
            signal.absorption_detected ? 1 : 0, signal.divergence_detected ? 1 : 0,
            signal.stacked_imbalances ?? 0, signal.vpoc_migration ?? 'FLAT',
            signal.reversal_sequence ?? 0,
            now.getUTCHours(), now.getUTCDay(),
            signal.is_golden ? 1 : 0
        );

        const id = result.lastInsertRowid as number;
        const goldenLabel = signal.is_golden ? ' [GOLDEN]' : '';
        console.log(`[SQLite] Signal #${id} saved: ${signal.pair} ${signal.direction} @ ${signal.entry_price} (v3.0)${goldenLabel}`);
        return id;
    },

    getPendingSignals(minAgeMinutes: number = 5): Signal[] {
        const stmt = db.prepare(`
            SELECT * FROM signals 
            WHERE result = 'PENDING' 
            AND datetime(created_at, '+' || ? || ' minutes') <= datetime('now')
        `);
        return stmt.all(minAgeMinutes) as Signal[];
    },

    getSignal(id: number): Signal | undefined {
        return db.prepare('SELECT * FROM signals WHERE id = ?').get(id) as Signal | undefined;
    },

    closeSignal(id: number, exitPrice: number, result: 'WIN' | 'LOSS', macroData?: {
        macro_confidence?: number;
        macro_sentiment?: string;
        fear_greed?: number;
        sp500_trend?: string;
        fed_stance?: string;
    }): void {
        const signal = this.getSignal(id);
        if (!signal) return;

        db.prepare(`
            UPDATE signals SET result = ?, exit_price = ?, validated_at = datetime('now')
            WHERE id = ?
        `).run(result, exitPrice, id);

        // Insert ML training record
        db.prepare(`
            INSERT OR REPLACE INTO ml_training (
                signal_id, pair, direction, result, expiration_min,
                delta, delta_cumulative, absorption_detected, divergence_detected,
                stacked_imbalances, reversal_sequence, score,
                hour_utc, day_of_week,
                macro_confidence, macro_sentiment, fear_greed, sp500_trend, fed_stance
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id, signal.pair, signal.direction, result, signal.expiration_min,
            signal.delta, signal.delta_cumulative,
            signal.absorption_detected ? 1 : 0, signal.divergence_detected ? 1 : 0,
            signal.stacked_imbalances, signal.reversal_sequence, signal.score,
            signal.hour_utc, signal.day_of_week,
            macroData?.macro_confidence ?? null, macroData?.macro_sentiment ?? null,
            macroData?.fear_greed ?? null, macroData?.sp500_trend ?? null,
            macroData?.fed_stance ?? null
        );

        console.log(`[SQLite] Signal #${id} closed: ${result}`);
    },

    // Get statistics (v3.0 only - nova estratégia)
    getStats(): { total: number; wins: number; losses: number; pending: number; win_rate: number } {
        const total = db.prepare('SELECT COUNT(*) as c FROM signals').get() as { c: number };
        // Wins e losses apenas da v3.0 (nova estratégia)
        const wins = db.prepare("SELECT COUNT(*) as c FROM signals WHERE result = 'WIN' AND strategy_version = 'v3.0'").get() as { c: number };
        const losses = db.prepare("SELECT COUNT(*) as c FROM signals WHERE result = 'LOSS' AND strategy_version = 'v3.0'").get() as { c: number };
        const pending = db.prepare("SELECT COUNT(*) as c FROM signals WHERE result = 'PENDING'").get() as { c: number };

        const closed = wins.c + losses.c;
        return {
            total: total.c,
            wins: wins.c,
            losses: losses.c,
            pending: pending.c,
            win_rate: closed > 0 ? (wins.c / closed) * 100 : 0
        };
    },

    // Get GOLDEN stats (sinais de alta confluência)
    getGoldenStats(): { total: number; wins: number; losses: number; pending: number; win_rate: number } {
        const total = db.prepare('SELECT COUNT(*) as c FROM signals WHERE is_golden = 1').get() as { c: number };
        const wins = db.prepare("SELECT COUNT(*) as c FROM signals WHERE result = 'WIN' AND is_golden = 1").get() as { c: number };
        const losses = db.prepare("SELECT COUNT(*) as c FROM signals WHERE result = 'LOSS' AND is_golden = 1").get() as { c: number };
        const pending = db.prepare("SELECT COUNT(*) as c FROM signals WHERE result = 'PENDING' AND is_golden = 1").get() as { c: number };

        const closed = wins.c + losses.c;
        return {
            total: total.c,
            wins: wins.c,
            losses: losses.c,
            pending: pending.c,
            win_rate: closed > 0 ? (wins.c / closed) * 100 : 0
        };
    },

    // Retorna o próximo ID de sinal golden (contador separado)
    getNextGoldenId(): number {
        const result = db.prepare('SELECT COUNT(*) as c FROM signals WHERE is_golden = 1').get() as { c: number };
        return result.c + 1;
    },

    exportMLData(): string {
        const records = db.prepare('SELECT * FROM ml_training ORDER BY id').all() as MLTrainingRecord[];
        if (records.length === 0) return '';

        const headers = 'id,pair,direction,result,score,delta,delta_cumulative,absorption,divergence,imbalances,reversal,hour_utc,day_of_week,macro_confidence,macro_sentiment,fear_greed';
        const rows = records.map(r =>
            `${r.id},${r.pair},${r.direction},${r.result},${r.score},${r.delta},${r.delta_cumulative},${r.absorption_detected},${r.divergence_detected},${r.stacked_imbalances},${r.reversal_sequence},${r.hour_utc},${r.day_of_week},${r.macro_confidence ?? ''},${r.macro_sentiment ?? ''},${r.fear_greed ?? ''}`
        );
        return `${headers}\n${rows.join('\n')}`;
    }
};

export default sqliteDatabase;
