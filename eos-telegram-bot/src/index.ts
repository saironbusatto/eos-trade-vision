// Load environment variables FIRST before anything else
import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { telegram } from "./telegram";
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

    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        telegram: telegramStatus,
    });
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
});
