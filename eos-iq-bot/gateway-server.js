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
            'sudo docker ps --filter "name=ibgateway" --format "{{.ID}}|{{.Status}}|{{.Ports}}"'
        );

        if (!stdout.trim()) {
            return res.json({ running: false });
        }

        const [containerId, status, ports] = stdout.trim().split('|');

        // Get last log lines
        let lastLog = '';
        try {
            const { stdout: logOutput } = await execAsync(
                'sudo docker logs --tail 10 ibgateway 2>&1 | grep -E "IBC:|Login|Challenge|connect|error" | tail -3'
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
            `sudo docker logs --tail ${lines} ibgateway 2>&1`
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
        await execAsync('sudo docker restart ibgateway');
        res.json({ success: true, message: 'Container reiniciando...' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/gateway/stop
app.post('/api/gateway/stop', async (req, res) => {
    try {
        await execAsync('sudo docker stop ibgateway');
        res.json({ success: true, message: 'Container parado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/gateway/start
app.post('/api/gateway/start', async (req, res) => {
    try {
        await execAsync('sudo docker start ibgateway');
        res.json({ success: true, message: 'Container iniciado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Database Connection for Stats
const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve(__dirname, 'data', 'eos-iq.db');

// GET /api/gateway/stats - Retorna estatísticas reais do DB
app.get('/api/gateway/stats', (req, res) => {
    try {
        const db = new Database(dbPath, { readonly: true });

        // Stats Gerais (v3.0)
        const total = db.prepare('SELECT COUNT(*) as c FROM signals').get();
        const wins = db.prepare("SELECT COUNT(*) as c FROM signals WHERE result = 'WIN' AND strategy_version = 'v3.0'").get();
        const losses = db.prepare("SELECT COUNT(*) as c FROM signals WHERE result = 'LOSS' AND strategy_version = 'v3.0'").get();
        const pending = db.prepare("SELECT COUNT(*) as c FROM signals WHERE result = 'PENDING'").get();

        // Stats Golden
        const goldenWins = db.prepare("SELECT COUNT(*) as c FROM signals WHERE result = 'WIN' AND is_golden = 1").get();
        const goldenLosses = db.prepare("SELECT COUNT(*) as c FROM signals WHERE result = 'LOSS' AND is_golden = 1").get();
        const goldenTotal = goldenWins.c + goldenLosses.c;

        // Horário de melhor performance (UTC)
        const bestHour = db.prepare(`
            SELECT hour_utc, COUNT(*) as wins FROM signals 
            WHERE result = 'WIN' 
            GROUP BY hour_utc 
            ORDER BY wins DESC 
            LIMIT 1
        `).get();

        // Melhor par
        const bestPair = db.prepare(`
            SELECT pair, COUNT(*) as wins FROM signals 
            WHERE result = 'WIN' 
            GROUP BY pair 
            ORDER BY wins DESC 
            LIMIT 1
        `).get();

        db.close();

        const closed = wins.c + losses.c;
        const winRate = closed > 0 ? ((wins.c / closed) * 100).toFixed(1) : 0;

        const goldenWinRate = goldenTotal > 0 ? ((goldenWins.c / goldenTotal) * 100).toFixed(1) : 0;

        res.json({
            all: {
                total: total.c,
                wins: wins.c,
                losses: losses.c,
                winRate: Number(winRate)
            },
            golden: {
                total: goldenTotal,
                wins: goldenWins.c,
                losses: goldenLosses.c,
                winRate: Number(goldenWinRate)
            },
            pendentes: pending.c,
            melhorPar: bestPair ? bestPair.pair : 'N/A',
            melhorHorario: bestHour ? `${bestHour.hour_utc}:00 UTC` : 'N/A'
        });

    } catch (error) {
        console.error('Database stats error:', error);
        res.status(500).json({ error: error.message, details: 'Falha ao ler banco de dados' });
    }
});

// GET /api/gateway/system - Retorna status dos serviços
app.get('/api/gateway/system', async (req, res) => {
    try {
        const { stdout } = await execAsync('pm2 jlist');
        const processes = JSON.parse(stdout);

        const getStatus = (name) => {
            const proc = processes.find(p => p.name === name);
            return proc ? proc.pm2_env.status : 'stopped';
        };

        res.json({
            forex: getStatus('eos-iq-bot'),
            crypto: getStatus('eos-telegram-bot'),
            gateway: getStatus('gateway-api') || getStatus('gateway-server'),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 IB Gateway Control API running on port ${PORT}`);
});
