import * as fs from 'fs';
import * as path from 'path';
import { config } from './config';

// Ensure data directory exists
const dataDir = path.dirname(config.databasePath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Signal interface
export interface Signal {
    id: number;
    created_at: string;
    pair: string;
    direction: 'CALL' | 'PUT';
    entry_time: string;
    entry_price: number;
    exit_price?: number;
    result: 'PENDING' | 'WIN' | 'LOSS';
    validated_at?: string;

    // OFA Indicators
    delta_1m?: number;
    delta_5m?: number;
    volume_1m?: number;
    absorption_detected?: boolean;
    divergence_detected?: boolean;
    trend_direction?: string;
}

interface Database {
    signals: Signal[];
    lastId: number;
}

// Load or create database
function loadDatabase(): Database {
    const dbPath = config.databasePath.replace('.db', '.json');

    if (fs.existsSync(dbPath)) {
        const data = fs.readFileSync(dbPath, 'utf8');
        return JSON.parse(data);
    }

    return { signals: [], lastId: 0 };
}

function saveDatabase(db: Database): void {
    const dbPath = config.databasePath.replace('.db', '.json');
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

let db = loadDatabase();
console.log(`[Database] Loaded ${db.signals.length} signals`);

// Database functions
export const database = {
    // Insert new signal
    insertSignal(signal: Omit<Signal, 'id' | 'created_at' | 'result'>): number {
        db.lastId++;

        const newSignal: Signal = {
            id: db.lastId,
            created_at: new Date().toISOString(),
            result: 'PENDING',
            ...signal,
        };

        db.signals.push(newSignal);
        saveDatabase(db);

        console.log(`[Database] Signal inserted: #${newSignal.id}`);
        return newSignal.id;
    },

    // Get pending signals
    getPendingSignals(): Signal[] {
        const now = Date.now();

        return db.signals.filter(s => {
            if (s.result !== 'PENDING') return false;

            const entryTime = new Date(s.entry_time).getTime();
            const expirationMs = 5 * 60 * 1000; // 5 minutes

            return now >= entryTime + expirationMs;
        });
    },

    // Update signal result
    updateResult(id: number, exitPrice: number, result: 'WIN' | 'LOSS'): void {
        const signal = db.signals.find(s => s.id === id);
        if (signal) {
            signal.exit_price = exitPrice;
            signal.result = result;
            signal.validated_at = new Date().toISOString();
            saveDatabase(db);
            console.log(`[Database] Signal #${id} updated: ${result}`);
        }
    },

    // Get daily stats
    getDailyStats(date?: string): { total: number; wins: number; losses: number; pending: number } {
        const targetDate = date || new Date().toISOString().split('T')[0];

        const todaySignals = db.signals.filter(s =>
            s.created_at.startsWith(targetDate)
        );

        return {
            total: todaySignals.length,
            wins: todaySignals.filter(s => s.result === 'WIN').length,
            losses: todaySignals.filter(s => s.result === 'LOSS').length,
            pending: todaySignals.filter(s => s.result === 'PENDING').length,
        };
    },

    // Get stats by pair
    getStatsByPair(): { pair: string; total: number; wins: number; win_rate: number }[] {
        const pairs = [...new Set(db.signals.map(s => s.pair))];

        return pairs.map(pair => {
            const pairSignals = db.signals.filter(s => s.pair === pair);
            const completed = pairSignals.filter(s => s.result !== 'PENDING');
            const wins = completed.filter(s => s.result === 'WIN').length;

            return {
                pair,
                total: pairSignals.length,
                wins,
                win_rate: completed.length > 0 ? (wins / completed.length) * 100 : 0,
            };
        });
    },

    // Export for ML (CSV format)
    exportForML(): string {
        const completed = db.signals.filter(s => s.result !== 'PENDING');

        if (completed.length === 0) return '';

        const headers = 'pair,direction,delta_1m,delta_5m,volume_1m,absorption_detected,divergence_detected,trend_direction,result';

        const rows = completed.map(s =>
            `${s.pair},${s.direction},${s.delta_1m || 0},${s.delta_5m || 0},${s.volume_1m || 0},${s.absorption_detected ? 1 : 0},${s.divergence_detected ? 1 : 0},${s.trend_direction || 'UNKNOWN'},${s.result}`
        );

        return `${headers}\n${rows.join('\n')}`;
    },
};

export default database;
