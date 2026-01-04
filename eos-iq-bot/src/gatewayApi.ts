// IB Gateway Control API
// Endpoints para gerenciar o container Docker do IB Gateway

import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = express.Router();

interface GatewayStatus {
    running: boolean;
    containerId?: string;
    uptime?: string;
    ports?: string[];
    lastLog?: string;
}

// GET /api/gateway/status - Retorna status do container
router.get('/status', async (req, res) => {
    try {
        const { stdout } = await execAsync(
            'docker ps --filter "name=ibgateway" --format "{{.ID}}|{{.Status}}|{{.Ports}}"'
        );

        if (!stdout.trim()) {
            return res.json({ running: false } as GatewayStatus);
        }

        const [containerId, status, ports] = stdout.trim().split('|');

        // Get last log line
        const { stdout: logOutput } = await execAsync(
            'docker logs --tail 5 ibgateway 2>&1 | tail -1'
        );

        res.json({
            running: true,
            containerId,
            uptime: status,
            ports: ports ? ports.split(',') : [],
            lastLog: logOutput.trim()
        } as GatewayStatus);
    } catch (error) {
        res.json({ running: false, error: String(error) });
    }
});

// GET /api/gateway/logs - Retorna últimos logs
router.get('/logs', async (req, res) => {
    try {
        const lines = Number(req.query.lines) || 50;
        const { stdout } = await execAsync(
            `docker logs --tail ${lines} ibgateway 2>&1`
        );

        // Filter for important log lines
        const importantLines = stdout.split('\n').filter(line =>
            line.includes('IBC:') ||
            line.includes('Login') ||
            line.includes('error') ||
            line.includes('connect') ||
            line.includes('Challenge')
        );

        res.json({
            logs: importantLines.slice(-20),
            fullLogs: stdout.split('\n').slice(-lines)
        });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// POST /api/gateway/restart - Reinicia o container
router.post('/restart', async (req, res) => {
    try {
        await execAsync('docker restart ibgateway');
        res.json({ success: true, message: 'Container restarting...' });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// POST /api/gateway/stop - Para o container
router.post('/stop', async (req, res) => {
    try {
        await execAsync('docker stop ibgateway');
        res.json({ success: true, message: 'Container stopped' });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// POST /api/gateway/start - Inicia o container
router.post('/start', async (req, res) => {
    try {
        await execAsync('docker start ibgateway');
        res.json({ success: true, message: 'Container started' });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

export default router;
