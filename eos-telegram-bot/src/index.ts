// Load environment variables FIRST before anything else
import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { telegramListener as telegram } from "./TelegramListener";
import { trendingScanner } from "./trendingScanner";
import { getDataService } from "./engine";
import { NewsCollector } from "./services/NewsCollector";
import { SentimentAnalyzer } from "./services/SentimentAnalyzer";
import { mlRecalibrationService } from "./services/MLRecalibrationService";
import { exitModelRecalibrationService } from "./services/ExitModelRecalibrationService";
import { sqliteDatabase } from "./sqliteDatabase";
import type { TradingSignal, AlertMessage } from "./types";

const app = express();
const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET || "";

// Middleware
app.use(cors());
app.use(express.json());

// Auth middleware
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!API_SECRET) {
        console.warn("⚠️ API_SECRET not set - endpoints are unprotected!");
        return next();
    }

    if (!authHeader || authHeader !== `Bearer ${API_SECRET}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    next();
};

// Health check
app.get("/health", async (_req: Request, res: Response) => {
    const telegramStatus = await telegram.testConnection();

    // Get DataEngine status
    const dataService = getDataService();
    const engineStatus: Record<string, any> = {};

    const defaultSymbols = [
        'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT',
        'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT'
    ];

    for (const symbol of defaultSymbols) {
        const status = dataService.getStatus(symbol);
        if (status) {
            engineStatus[symbol] = {
                state: status.state,
                coverage: Math.round(status.coverage),
                trades: status.count
            };
        }
    }

    const liveCount = Object.values(engineStatus).filter((s: any) => s.state === 'LIVE_OK').length;

    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        telegram: telegramStatus,
        engine: {
            liveSymbols: liveCount,
            totalSymbols: Object.keys(engineStatus).length,
            symbols: engineStatus
        }
    });
});

// Public stats snapshot for dashboard integrations
app.get("/api/stats", (req: Request, res: Response) => {
    const stats = sqliteDatabase.getStats();
    const minTradesRaw = Number(req.query.minTrades);
    const minTrades = Number.isFinite(minTradesRaw) && minTradesRaw > 0 ? Math.floor(minTradesRaw) : 80;
    const edgeMatrix = sqliteDatabase.getEdgeMatrix(minTrades);
    res.json({
        success: true,
        ...stats,
        edge: {
            min_trades: minTrades,
            cells: edgeMatrix
        }
    });
});

// Reset stats window (logical reset; does not delete historical data)
app.post("/api/stats/reset", authMiddleware, (req: Request, res: Response) => {
    try {
        const body = req.body as { baselineAt?: string; phaseTag?: string };
        const phaseTag = body?.phaseTag?.trim() || undefined;
        const baselineAt = body?.baselineAt
            ? sqliteDatabase.setStatsBaselineAt(body.baselineAt, phaseTag)
            : sqliteDatabase.resetStatsBaselineNow(phaseTag);

        const stats = sqliteDatabase.getStats();
        res.json({
            success: true,
            message: "Stats baseline updated",
            baselineAt,
            stats
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to reset stats baseline";
        res.status(400).json({ success: false, error: message });
    }
});

// Send trading signal
app.post("/api/signal", authMiddleware, async (req: Request, res: Response) => {
    try {
        const signal: TradingSignal = req.body;

        // Validate required fields
        if (!signal.symbol || !signal.action || !signal.price) {
            return res.status(400).json({ error: "Missing required fields: symbol, action, price" });
        }

        if (!["BUY", "SELL"].includes(signal.action)) {
            return res.status(400).json({ error: "action must be BUY or SELL" });
        }

        const success = await telegram.sendSignal(signal);

        if (success) {
            res.json({ success: true, message: "Signal sent to Telegram" });
        } else {
            res.status(500).json({ success: false, error: "Failed to send signal" });
        }
    } catch (error) {
        console.error("Error sending signal:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Send alert message
app.post("/api/alert", authMiddleware, async (req: Request, res: Response) => {
    try {
        const alert: AlertMessage = req.body;

        if (!alert.message) {
            return res.status(400).json({ error: "Missing required field: message" });
        }

        const success = await telegram.sendAlert(alert);

        if (success) {
            res.json({ success: true, message: "Alert sent to Telegram" });
        } else {
            res.status(500).json({ success: false, error: "Failed to send alert" });
        }
    } catch (error) {
        console.error("Error sending alert:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`
🚀 EOS Telegram Bot Backend
📡 Server running on port ${PORT}
🔗 Health check: http://localhost:${PORT}/health
  `);

    // Start trending scanner (top 10 coins, every 10 min)
    trendingScanner.start();
    console.log("TrendingScanner started - analyzing top 10 coins every 10 min");

    // Start News Collector (RSS)
    const newsCollector = new NewsCollector();
    newsCollector.start();
    console.log("📰 NewsCollector started - Fetching RSS feeds...");

    // Start Sentiment Analyzer (OpenAI)
    const sentimentAnalyzer = new SentimentAnalyzer();
    sentimentAnalyzer.start(); // Uses default 60s polling
    console.log("🧠 SentimentAnalyzer started - Analyzing market sentiment...");

    // Start weekly ML recalibration workflow (walk-forward guarded)
    mlRecalibrationService.start();
    console.log("🤖 MLRecalibrationService started - Weekly auto retraining enabled");

    // Start exit model auto-retraining (Fase 4)
    exitModelRecalibrationService.start();
    console.log("🎯 ExitModelRecalibrationService started - Auto retraining on new exit data");
});
