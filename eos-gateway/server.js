// IB Gateway Control Server
// Servidor standalone para gerenciar o IB Gateway via API REST

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// GET /api/gateway/status
app.get('/api/gateway/status', async (req, res) => {
    try {
        const { stdout } = await execAsync(
            'docker ps --filter "name=eos-ibgateway" --format "{{.ID}}|{{.Status}}|{{.Ports}}"'
        );

        if (!stdout.trim()) {
            return res.json({ running: false });
        }

        const [containerId, status, ports] = stdout.trim().split('|');

        // Get last log lines
        let lastLog = '';
        try {
            const { stdout: logOutput } = await execAsync(
                'docker logs --tail 10 eos-ibgateway 2>&1 | grep -E "IBC:|Login|Challenge|connect|error" | tail -3'
            );
            lastLog = logOutput.trim();
        } catch (e) { }

        res.json({
            running: true,
            containerId: containerId.substring(0, 12),
            uptime: status,
            ports: ports || '',
            lastLog
        });
    } catch (error) {
        res.json({ running: false, error: error.message });
    }
});

// GET /api/gateway/logs
app.get('/api/gateway/logs', async (req, res) => {
    try {
        const lines = Number(req.query.lines) || 30;
        const { stdout } = await execAsync(
            `docker logs --tail ${lines} eos-ibgateway 2>&1`
        );

        const allLines = stdout.split('\n');
        const importantLines = allLines.filter(line =>
            line.includes('IBC:') ||
            line.includes('Login') ||
            line.includes('error') ||
            line.includes('connect') ||
            line.includes('Challenge') ||
            line.includes('LOGGED')
        );

        res.json({
            logs: importantLines.slice(-15),
            total: allLines.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/gateway/restart
app.post('/api/gateway/restart', async (req, res) => {
    try {
        await execAsync('docker restart eos-ibgateway');
        res.json({ success: true, message: 'Container reiniciando...' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/gateway/stop
app.post('/api/gateway/stop', async (req, res) => {
    try {
        await execAsync('docker stop eos-ibgateway');
        res.json({ success: true, message: 'Container parado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/gateway/start
app.post('/api/gateway/start', async (req, res) => {
    try {
        await execAsync('docker start eos-ibgateway');
        res.json({ success: true, message: 'Container iniciado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Database Connections
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const FOREX_DB = path.resolve(__dirname, 'data', 'eos-iq.db');
const CRYPTO_DB_CANDIDATES = [
    path.resolve(__dirname, 'data-crypto', 'eos.db'),
    path.resolve(__dirname, '..', 'data', 'eos.db'),
    path.resolve(__dirname, '..', 'eos-telegram-bot', 'data', 'eos.db')
];
const CRYPTO_DB = CRYPTO_DB_CANDIDATES.find((dbPath) => fs.existsSync(dbPath)) || CRYPTO_DB_CANDIDATES[0];
console.log(`[Gateway] Using crypto DB: ${CRYPTO_DB}`);

// Helper para conectar e executar query segura
function queryDB(dbPath, sql, params = []) {
    let db;
    try {
        // Tenta abrir sem readonly primeiro para evitar problemas com WAL/SHM em sistemas de arquivos montados
        // Se falhar, o catch captura.
        db = new Database(dbPath, { timeout: 5000 });
        return db.prepare(sql).all(params);
    } catch (error) {
        console.warn(`[DB Warning] Failed to query ${path.basename(dbPath)}: ${error.message}`);
        // Tentar fallback readonly se o erro for de permissão
        try {
            const retryDb = new Database(dbPath, { readonly: true, timeout: 5000 });
            const results = retryDb.prepare(sql).all(params);
            retryDb.close();
            return results;
        } catch (retryError) {
            console.error(`[DB Error] Retry failed for ${path.basename(dbPath)}: ${retryError.message}`);
            return [];
        }
    } finally {
        if (db && db.open) db.close();
    }
}

const Z95 = 1.959963984540054;

function wilson95(wins, n) {
    if (!n || n <= 0) return { low: 0, high: 0 };
    const p = wins / n;
    const z2 = Z95 * Z95;
    const den = 1 + z2 / n;
    const center = (p + z2 / (2 * n)) / den;
    const margin = (Z95 * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / den;
    return {
        low: Math.max(0, center - margin),
        high: Math.min(1, center + margin)
    };
}

function computeCryptoEdgeStats(minTrades = 80) {
    const rows = queryDB(
        CRYPTO_DB,
        `
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
        WHERE s.result IN ('WIN', 'LOSS')
          AND s.strategy_version = 'v3.0'
          AND m.final_profit IS NOT NULL
        GROUP BY hour_utc, s.action
        HAVING COUNT(*) >= ?
        ORDER BY hour_utc ASC, s.action ASC
        `,
        [minTrades]
    );

    const cells = rows.map((row) => {
        const n = Number(row.trades || 0);
        const mean = Number(row.expectancy || 0);
        const sumSq = Number(row.sum_sq || 0);
        const sampleVar = n > 1 ? Math.max(0, (sumSq - n * mean * mean) / (n - 1)) : 0;
        const stdDev = Math.sqrt(sampleVar);
        const se = n > 0 ? stdDev / Math.sqrt(n) : 0;
        const expectancyCi95Low = mean - Z95 * se;
        const expectancyCi95High = mean + Z95 * se;
        const wr = n > 0 ? Number(row.wins || 0) / n : 0;
        const wrCi = wilson95(Number(row.wins || 0), n);
        const grossWin = Number(row.gross_win || 0);
        const grossLoss = Number(row.gross_loss || 0);

        return {
            hour_utc: Number(row.hour_utc),
            action: row.action,
            trades: n,
            wins: Number(row.wins || 0),
            losses: Number(row.losses || 0),
            win_rate: wr * 100,
            win_rate_ci95_low: wrCi.low * 100,
            win_rate_ci95_high: wrCi.high * 100,
            expectancy: mean,
            std_dev: stdDev,
            expectancy_ci95_low: expectancyCi95Low,
            expectancy_ci95_high: expectancyCi95High,
            avg_win: Number(row.avg_win || 0),
            avg_loss: Number(row.avg_loss || 0),
            profit_factor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 999 : 0)
        };
    });

    return {
        min_trades: minTrades,
        cells,
        generated_at: new Date().toISOString()
    };
}

// GET /api/stats/analytics - Endpoint Unificado
app.get('/api/gateway/analytics', (req, res) => {
    try {
        // Query Params
        const { bot, strategy, startDate, endDate } = req.query;
        const edgeMinTradesRaw = Number(req.query.edgeMinTrades);
        const edgeMinTrades = Number.isFinite(edgeMinTradesRaw) && edgeMinTradesRaw > 0
            ? Math.floor(edgeMinTradesRaw)
            : 80;
        // bot: 'forex', 'crypto', 'all' (default)
        // strategy: 'v2.0', 'v3.0', 'all'
        // timeframe filtering logic implementation needed

        const forexSignals = [];
        const cryptoSignals = [];
        let cryptoBaselineAt = process.env.CRYPTO_STATS_BASELINE_AT || null;

        try {
            const baselineRows = queryDB(
                CRYPTO_DB,
                "SELECT value FROM app_settings WHERE key = 'stats_baseline_at' LIMIT 1"
            );
            if (baselineRows.length > 0 && baselineRows[0].value) {
                cryptoBaselineAt = baselineRows[0].value;
            }
        } catch (error) {
            console.warn('[Analytics] Failed to load crypto baseline from app_settings:', error.message);
        }

        // 1. Fetch Forex Data
        if (bot !== 'crypto') {
            const rawForex = queryDB(FOREX_DB, "SELECT * FROM signals WHERE result IN ('WIN', 'LOSS')");
            rawForex.forEach(s => {
                forexSignals.push({
                    type: 'forex',
                    id: s.id,
                    asset: s.pair,
                    action: s.direction, // CALL/PUT
                    result: s.result,
                    strategy: s.strategy_version || 'v2.0',
                    timeframe: s.expiration_min || 5,
                    timestamp: s.created_at,
                    score: s.score,
                    isGolden: s.is_golden || false
                });
            });
        }

        // 2. Fetch Crypto Data
        if (bot !== 'forex') {
            // Nota: Schema do crypto é diferente (symbol, action, etc)
            let cryptoSql = "SELECT * FROM signals WHERE result IN ('WIN', 'LOSS')";
            const cryptoParams = [];

            if (cryptoBaselineAt) {
                cryptoSql += " AND datetime(COALESCE(validated_at, created_at)) >= datetime(?)";
                cryptoParams.push(cryptoBaselineAt);
            }

            const rawCrypto = queryDB(CRYPTO_DB, cryptoSql, cryptoParams);
            rawCrypto.forEach(s => {
                cryptoSignals.push({
                    type: 'crypto',
                    id: s.id,
                    asset: s.symbol,
                    action: s.action, // BUY/SELL
                    result: s.result,
                    strategy: s.strategy_version || 'v3.0',
                    timeframe: 15, // Crypto usa timeframe fixo de 15min para validação
                    timestamp: s.created_at,
                    score: s.score
                });
            });
        }

        // 3. Merge and Filter
        let allSignals = [...forexSignals, ...cryptoSignals];

        // Filter by Date
        if (startDate) {
            allSignals = allSignals.filter(s => new Date(s.timestamp) >= new Date(startDate));
        }
        if (endDate) {
            allSignals = allSignals.filter(s => new Date(s.timestamp) <= new Date(endDate));
        }

        // Filter by Strategy
        if (strategy && strategy !== 'all') {
            allSignals = allSignals.filter(s => s.strategy === strategy);
        }

        // Filter by Timeframe
        const { timeframe } = req.query;
        if (timeframe && timeframe !== 'all') {
            allSignals = allSignals.filter(s => s.timeframe === parseInt(timeframe));
        }

        // Extract unique strategies and timeframes for filter options
        const strategies = [...new Set(allSignals.map(s => s.strategy))].filter(Boolean).sort();
        const timeframes = [...new Set(allSignals.map(s => s.timeframe))].filter(Boolean).sort((a, b) => a - b);

        // 4. Calculate Stats
        const calculateStats = (signals) => {
            const total = signals.length;
            const wins = signals.filter(s => s.result === 'WIN').length;
            return {
                total,
                wins,
                losses: total - wins,
                winRate: total > 0 ? (wins / total) * 100 : 0
            };
        };

        // Calculate stats per strategy
        const strategyStats = {};
        strategies.forEach(strat => {
            const stratSignals = allSignals.filter(s => s.strategy === strat);
            strategyStats[strat] = calculateStats(stratSignals);
        });

        const edgeStats = bot === 'forex' ? { min_trades: edgeMinTrades, cells: [], generated_at: new Date().toISOString() } : computeCryptoEdgeStats(edgeMinTrades);

        res.json({
            summary: calculateStats(allSignals),
            forex: calculateStats(allSignals.filter(s => s.type === 'forex')),
            crypto: calculateStats(allSignals.filter(s => s.type === 'crypto')),
            signals: allSignals,
            edgeStats,
            meta: {
                cryptoBaselineAt
            },
            filters: {
                strategies,
                timeframes
            },
            strategyStats
        });

    } catch (error) {
        console.error('Analytics Error:', error);
        res.status(500).json({ error: error.message });
    }
});



// GET /api/gateway/system - Status dos sistemas via Docker
app.get('/api/gateway/system', async (req, res) => {
    try {
        const { stdout } = await execAsync('docker ps --format "{{.Names}},{{.Status}}"');
        const lines = stdout.split('\n');

        const getStatus = (containerName) => {
            const line = lines.find(l => l.startsWith(containerName));
            if (!line) return 'stopped';
            // Se existir e não for exited, assume running. O status do docker é complexo (Ex: Up 3 hours)
            return line.includes('Exited') ? 'stopped' : 'online';
        };

        res.json({
            forex: getStatus('eos-forex-bot'),
            crypto: getStatus('eos-crypto-bot'),
            gateway: getStatus('eos-gateway'),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('System status error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 IB Gateway Control API running on port ${PORT}`);
});
