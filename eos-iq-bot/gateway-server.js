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
