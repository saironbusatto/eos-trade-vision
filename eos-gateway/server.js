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
const Database = require('better-sqlite3');

const FOREX_DB = path.resolve(__dirname, 'data', 'eos-iq.db');
const CRYPTO_DB = path.resolve(__dirname, 'data-crypto', 'eos.db');

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

// GET /api/stats/analytics - Endpoint Unificado
app.get('/api/gateway/analytics', (req, res) => {
    try {
        // Query Params
        const { bot, strategy, startDate, endDate } = req.query;
        // bot: 'forex', 'crypto', 'all' (default)
        // strategy: 'v2.0', 'v3.0', 'all'
        // timeframe filtering logic implementation needed

        const forexSignals = [];
        const cryptoSignals = [];

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
            const rawCrypto = queryDB(CRYPTO_DB, "SELECT * FROM signals WHERE result IN ('WIN', 'LOSS')");
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

        res.json({
            summary: calculateStats(allSignals),
            forex: calculateStats(allSignals.filter(s => s.type === 'forex')),
            crypto: calculateStats(allSignals.filter(s => s.type === 'crypto')),
            signals: allSignals,
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
