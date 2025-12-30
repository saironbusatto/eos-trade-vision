import * as fs from 'fs';
import * as path from 'path';

// Database paths
const SIGNALS_PATH = process.env.DATABASE_PATH || './data/crypto_signals.json';
const ML_DATA_PATH = './data/ml_training.json'; // Separado para Deep Learning

// Ensure data directory exists
const dataDir = path.dirname(SIGNALS_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Signal interface with stop/target
export interface CryptoSignal {
    id: number;
    created_at: string;
    symbol: string;
    action: 'BUY' | 'SELL';
    entry_price: number;
    stop_loss: number;
    take_profit: number;
    exit_price?: number;
    result: 'PENDING' | 'WIN' | 'LOSS';
    validated_at?: string;

    // Score final
    score: number;

    // Features normalizadas (0-1) para ML
    f_smart_money: number;      // -1 a 1
    f_price_context: number;    // 0-1
    f_imbalance: number;        // 0-1
    f_absorption: number;       // 0-1
    f_trend: number;            // 0-1
    f_momentum: number;         // 0-1
    f_volume: number;           // 0-1

    // Raw data
    volume_ratio: number;
    trend: number;
    momentum: number;
    price_change_24h: number;
    notes?: string;
}

// ML Training data (resultados com features normalizadas)
export interface MLTrainingData {
    id: number;
    timestamp: string;
    symbol: string;
    action: 'BUY' | 'SELL';
    entry_price: number;
    exit_price: number;
    result: 'WIN' | 'LOSS';
    profit_percent: number;
    time_to_result_min: number;  // Tempo até WIN/LOSS

    // ===== FEATURES NORMALIZADAS (0-1) PARA ML =====
    // Cada feature representa uma dimensão independente do mercado

    f_smart_money: number;      // -1 a 1: -1=BEARISH, 0=NEUTRAL, 1=BULLISH
    f_price_context: number;    // 0-1: 0=BELOW_VA, 0.5=INSIDE_VA, 1=ABOVE_VA
    f_imbalance: number;        // 0-1: força das imbalances (baseado em stacked count)
    f_absorption: number;       // 0-1: força da absorção
    f_trend: number;            // 0-1: direção do trend normalizada
    f_momentum: number;         // 0-1: momentum normalizado
    f_volume: number;           // 0-1: volume ratio normalizado

    // Score final (combinação ponderada)
    score: number;

    // Features brutas para análise
    raw_volume_ratio: number;
    raw_trend: number;
    raw_momentum: number;
    raw_price_change_24h: number;
}

interface SignalDatabase {
    signals: CryptoSignal[];
    lastId: number;
}

interface MLDatabase {
    training_data: MLTrainingData[];
    stats: {
        total_trades: number;
        wins: number;
        losses: number;
        win_rate: number;
        avg_profit: number;
    };
}

// Load databases
function loadSignals(): SignalDatabase {
    if (fs.existsSync(SIGNALS_PATH)) {
        return JSON.parse(fs.readFileSync(SIGNALS_PATH, 'utf8'));
    }
    return { signals: [], lastId: 0 };
}

function loadMLData(): MLDatabase {
    if (fs.existsSync(ML_DATA_PATH)) {
        return JSON.parse(fs.readFileSync(ML_DATA_PATH, 'utf8'));
    }
    return {
        training_data: [],
        stats: { total_trades: 0, wins: 0, losses: 0, win_rate: 0, avg_profit: 0 }
    };
}

function saveSignals(db: SignalDatabase): void {
    fs.writeFileSync(SIGNALS_PATH, JSON.stringify(db, null, 2));
}

function saveMLData(db: MLDatabase): void {
    fs.writeFileSync(ML_DATA_PATH, JSON.stringify(db, null, 2));
}

let signalsDb = loadSignals();
let mlDb = loadMLData();
console.log(`[Database] Loaded ${signalsDb.signals.length} signals, ${mlDb.training_data.length} ML records`);

// Database functions
export const cryptoDatabase = {
    // Insert new signal with stop/target
    insertSignal(signal: Omit<CryptoSignal, 'id' | 'created_at' | 'result' | 'stop_loss' | 'take_profit'> & {
        stop_percent?: number;
        target_percent?: number;
    }): number {
        signalsDb.lastId++;

        // Default stop: -1%, target: +2% (2:1 risk/reward)
        const stopPercent = signal.stop_percent || 1;
        const targetPercent = signal.target_percent || 2;

        const stopLoss = signal.action === 'BUY'
            ? signal.entry_price * (1 - stopPercent / 100)
            : signal.entry_price * (1 + stopPercent / 100);

        const takeProfit = signal.action === 'BUY'
            ? signal.entry_price * (1 + targetPercent / 100)
            : signal.entry_price * (1 - targetPercent / 100);

        const newSignal: CryptoSignal = {
            id: signalsDb.lastId,
            created_at: new Date().toISOString(),
            result: 'PENDING',
            stop_loss: stopLoss,
            take_profit: takeProfit,
            symbol: signal.symbol,
            action: signal.action,
            entry_price: signal.entry_price,
            score: signal.score,
            // Normalized features (default 0.5 if not provided)
            f_smart_money: signal.f_smart_money ?? 0,
            f_price_context: signal.f_price_context ?? 0.5,
            f_imbalance: signal.f_imbalance ?? 0,
            f_absorption: signal.f_absorption ?? 0,
            f_trend: signal.f_trend ?? 0.5,
            f_momentum: signal.f_momentum ?? 0.5,
            f_volume: signal.f_volume ?? 0.5,
            // Raw data
            volume_ratio: signal.volume_ratio,
            trend: signal.trend,
            momentum: signal.momentum,
            price_change_24h: signal.price_change_24h,
            notes: signal.notes,
        };

        signalsDb.signals.push(newSignal);
        saveSignals(signalsDb);

        console.log(`[Database] Signal #${newSignal.id} saved: ${signal.symbol} ${signal.action} @ $${signal.entry_price.toFixed(2)}`);
        return newSignal.id;
    },

    // Get pending signals for validation
    getPendingSignals(): CryptoSignal[] {
        // Retorna sinais pendentes com mais de 15 min (deu tempo de mover)
        const minAge = 15 * 60 * 1000;
        const now = Date.now();

        return signalsDb.signals.filter(s => {
            if (s.result !== 'PENDING') return false;
            const age = now - new Date(s.created_at).getTime();
            return age >= minAge;
        });
    },

    // Validate and update result
    validateSignal(id: number, currentPrice: number): { result: 'WIN' | 'LOSS' | 'PENDING'; profit_percent: number } | null {
        const signal = signalsDb.signals.find(s => s.id === id);
        if (!signal || signal.result !== 'PENDING') return null;

        let result: 'WIN' | 'LOSS' | 'PENDING' = 'PENDING';
        let profit_percent = 0;

        if (signal.action === 'BUY') {
            // LONG: WIN se preço >= target, LOSS se preço <= stop
            if (currentPrice >= signal.take_profit) {
                result = 'WIN';
                profit_percent = ((currentPrice - signal.entry_price) / signal.entry_price) * 100;
            } else if (currentPrice <= signal.stop_loss) {
                result = 'LOSS';
                profit_percent = ((currentPrice - signal.entry_price) / signal.entry_price) * 100;
            }
        } else {
            // SHORT: WIN se preço <= target, LOSS se preço >= stop
            if (currentPrice <= signal.take_profit) {
                result = 'WIN';
                profit_percent = ((signal.entry_price - currentPrice) / signal.entry_price) * 100;
            } else if (currentPrice >= signal.stop_loss) {
                result = 'LOSS';
                profit_percent = ((signal.entry_price - currentPrice) / signal.entry_price) * 100;
            }
        }

        if (result !== 'PENDING') {
            // Update signal
            signal.result = result;
            signal.exit_price = currentPrice;
            signal.validated_at = new Date().toISOString();
            saveSignals(signalsDb);

            // Add to ML training data
            this.addMLRecord(signal, currentPrice, profit_percent);

            console.log(`[Database] Signal #${id} validated: ${result} (${profit_percent.toFixed(2)}%)`);
        }

        return { result, profit_percent };
    },

    // Force close signal after timeout (45min)
    forceCloseSignal(id: number, exitPrice: number, result: 'WIN' | 'LOSS', profitPercent: number): void {
        const signal = signalsDb.signals.find(s => s.id === id);
        if (!signal || signal.result !== 'PENDING') return;

        signal.result = result;
        signal.exit_price = exitPrice;
        signal.validated_at = new Date().toISOString();
        saveSignals(signalsDb);

        // Add to ML training data
        this.addMLRecord(signal, exitPrice, profitPercent);

        console.log(`[Database] Signal #${id} force-closed: ${result} (${profitPercent.toFixed(2)}%) after timeout`);
    },

    // Add record to ML training database
    addMLRecord(signal: CryptoSignal, exitPrice: number, profitPercent: number): void {
        // Calculate time to result in minutes
        const createdAt = new Date(signal.created_at).getTime();
        const validatedAt = signal.validated_at ? new Date(signal.validated_at).getTime() : Date.now();
        const timeToResultMin = Math.round((validatedAt - createdAt) / (60 * 1000));

        const mlRecord: MLTrainingData = {
            id: mlDb.training_data.length + 1,
            timestamp: new Date().toISOString(),
            symbol: signal.symbol,
            action: signal.action,
            entry_price: signal.entry_price,
            exit_price: exitPrice,
            result: signal.result as 'WIN' | 'LOSS',
            profit_percent: profitPercent,
            time_to_result_min: timeToResultMin,

            // Normalized features
            f_smart_money: signal.f_smart_money,
            f_price_context: signal.f_price_context,
            f_imbalance: signal.f_imbalance,
            f_absorption: signal.f_absorption,
            f_trend: signal.f_trend,
            f_momentum: signal.f_momentum,
            f_volume: signal.f_volume,

            // Score
            score: signal.score,

            // Raw data
            raw_volume_ratio: signal.volume_ratio,
            raw_trend: signal.trend,
            raw_momentum: signal.momentum,
            raw_price_change_24h: signal.price_change_24h,
        };

        mlDb.training_data.push(mlRecord);

        // Update stats
        mlDb.stats.total_trades++;
        if (signal.result === 'WIN') mlDb.stats.wins++;
        else mlDb.stats.losses++;
        mlDb.stats.win_rate = (mlDb.stats.wins / mlDb.stats.total_trades) * 100;

        const profits = mlDb.training_data.map(r => r.profit_percent);
        mlDb.stats.avg_profit = profits.reduce((a, b) => a + b, 0) / profits.length;

        saveMLData(mlDb);
        console.log(`[ML] Record #${mlRecord.id} saved for training`);
    },

    // Get stats
    getStats(): { signals: number; pending: number; wins: number; losses: number; win_rate: number; avg_profit: number } {
        const pending = signalsDb.signals.filter(s => s.result === 'PENDING').length;
        return {
            signals: signalsDb.signals.length,
            pending,
            wins: mlDb.stats.wins,
            losses: mlDb.stats.losses,
            win_rate: mlDb.stats.win_rate,
            avg_profit: mlDb.stats.avg_profit,
        };
    },

    // Export for ML training (CSV)
    exportForML(): string {
        if (mlDb.training_data.length === 0) return '';

        const headers = 'timestamp,symbol,action,result,profit_percent,time_to_result_min,score,f_smart_money,f_price_context,f_imbalance,f_absorption,f_trend,f_momentum,f_volume,raw_volume_ratio,raw_trend,raw_momentum,raw_price_change_24h';
        const rows = mlDb.training_data.map(r =>
            `${r.timestamp},${r.symbol},${r.action},${r.result},${r.profit_percent.toFixed(4)},${r.time_to_result_min},${r.score},${r.f_smart_money.toFixed(4)},${r.f_price_context.toFixed(4)},${r.f_imbalance.toFixed(4)},${r.f_absorption.toFixed(4)},${r.f_trend.toFixed(4)},${r.f_momentum.toFixed(4)},${r.f_volume.toFixed(4)},${r.raw_volume_ratio.toFixed(4)},${r.raw_trend.toFixed(4)},${r.raw_momentum.toFixed(4)},${r.raw_price_change_24h.toFixed(4)}`
        );

        return `${headers}\n${rows.join('\n')}`;
    },
};

export default cryptoDatabase;
