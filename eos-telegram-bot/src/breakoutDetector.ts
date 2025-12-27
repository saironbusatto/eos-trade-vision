import WebSocket from "ws";
import { DeltaCalculator } from "./deltaCalculator";
import { telegram } from "./telegram";
import tolkienQuotes from "./tolkienQuotes.json";

interface Kline {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    closeTime: number;
    isClosed: boolean;
}

interface BreakoutConfig {
    symbol: string;
    timeframe: string;
    lookback: number;
    volumeMultiplier: number;
    deltaThreshold: number;
}

const DEFAULT_CONFIG: BreakoutConfig = {
    symbol: "btcusdt",
    timeframe: "15m",
    lookback: 20,
    volumeMultiplier: 1.5,
    deltaThreshold: 50000 // USD value
};

export class BreakoutDetector {
    private config: BreakoutConfig;
    private klines: Kline[] = [];
    private ws: WebSocket | null = null;
    private deltaCalculator: DeltaCalculator;
    private lastSignalTime: number = 0;
    private signalCooldown: number = 15 * 60 * 1000; // 15 min cooldown

    constructor(config: Partial<BreakoutConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.deltaCalculator = new DeltaCalculator(this.config.symbol);
    }

    async start(): Promise<void> {
        console.log(`[BreakoutDetector] Starting for ${this.config.symbol} ${this.config.timeframe}`);

        // Load historical klines first
        await this.loadHistoricalKlines();

        // Start delta calculator
        this.deltaCalculator.start();

        // Connect to kline WebSocket
        this.connectKlineStream();
    }

    stop(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.deltaCalculator.stop();
    }

    private async loadHistoricalKlines(): Promise<void> {
        const url = `https://api.binance.com/api/v3/klines?symbol=${this.config.symbol.toUpperCase()}&interval=${this.config.timeframe}&limit=${this.config.lookback + 1}`;

        try {
            const response = await fetch(url);
            const data = await response.json() as any[];

            this.klines = data.map((k: any[]) => ({
                openTime: k[0],
                open: parseFloat(k[1]),
                high: parseFloat(k[2]),
                low: parseFloat(k[3]),
                close: parseFloat(k[4]),
                volume: parseFloat(k[5]),
                closeTime: k[6],
                isClosed: true
            }));

            console.log(`[BreakoutDetector] Loaded ${this.klines.length} historical klines`);
        } catch (error) {
            console.error("[BreakoutDetector] Failed to load historical klines:", error);
        }
    }

    private connectKlineStream(): void {
        const url = `wss://stream.binance.com:9443/ws/${this.config.symbol}@kline_${this.config.timeframe}`;

        console.log(`[BreakoutDetector] Connecting to kline stream...`);

        this.ws = new WebSocket(url);

        this.ws.on("open", () => {
            console.log(`[BreakoutDetector] Connected to kline stream`);
        });

        this.ws.on("message", (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());
                this.processKline(msg.k);
            } catch (error) {
                console.error("[BreakoutDetector] Error parsing kline:", error);
            }
        });

        this.ws.on("close", () => {
            console.log("[BreakoutDetector] Kline WebSocket closed, reconnecting in 5s...");
            setTimeout(() => this.connectKlineStream(), 5000);
        });

        this.ws.on("error", (error) => {
            console.error("[BreakoutDetector] WebSocket error:", error);
        });
    }

    private processKline(k: any): void {
        const kline: Kline = {
            openTime: k.t,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            closeTime: k.T,
            isClosed: k.x
        };

        // Only check breakout when candle closes
        if (kline.isClosed) {
            this.klines.push(kline);

            // Keep only lookback + 1 candles
            if (this.klines.length > this.config.lookback + 1) {
                this.klines.shift();
            }

            this.checkBreakout(kline);

            // Reset delta for new candle
            this.deltaCalculator.resetDelta();
        }
    }

    private checkBreakout(currentKline: Kline): void {
        if (this.klines.length < this.config.lookback) {
            console.log("[BreakoutDetector] Not enough data yet");
            return;
        }

        // Cooldown check
        if (Date.now() - this.lastSignalTime < this.signalCooldown) {
            return;
        }

        // Get previous candles (excluding current)
        const previousKlines = this.klines.slice(0, -1);

        // Calculate levels
        const highestHigh = Math.max(...previousKlines.map(k => k.high));
        const lowestLow = Math.min(...previousKlines.map(k => k.low));

        // Calculate average volume
        const avgVolume = previousKlines.reduce((sum, k) => sum + k.volume, 0) / previousKlines.length;
        const volumeRatio = currentKline.volume / avgVolume;

        // Get delta
        const deltaState = this.deltaCalculator.getDelta();

        // Check conditions
        const hasVolumeConfirmation = volumeRatio >= this.config.volumeMultiplier;
        const hasDeltaConfirmation = Math.abs(deltaState.delta) >= this.config.deltaThreshold;

        // LONG breakout
        if (currentKline.close > highestHigh && hasVolumeConfirmation && deltaState.delta > 0 && hasDeltaConfirmation) {
            this.sendBreakoutSignal("LONG", currentKline, highestHigh, volumeRatio, deltaState.delta);
        }

        // SHORT breakout
        if (currentKline.close < lowestLow && hasVolumeConfirmation && deltaState.delta < 0 && hasDeltaConfirmation) {
            this.sendBreakoutSignal("SHORT", currentKline, lowestLow, volumeRatio, deltaState.delta);
        }
    }

    private async sendBreakoutSignal(
        direction: "LONG" | "SHORT",
        kline: Kline,
        level: number,
        volumeRatio: number,
        delta: number
    ): Promise<void> {
        this.lastSignalTime = Date.now();

        // Determine intensity
        const intensity = this.getIntensity(volumeRatio, delta);

        // Get random quote
        const quote = this.getRandomQuote(intensity, direction);

        // Calculate suggested levels
        const stopPercent = 0.45;
        const tpPercent = 0.9;
        const stopLoss = direction === "LONG"
            ? kline.close * (1 - stopPercent / 100)
            : kline.close * (1 + stopPercent / 100);
        const takeProfit = direction === "LONG"
            ? kline.close * (1 + tpPercent / 100)
            : kline.close * (1 - tpPercent / 100);

        const message = this.formatMessage(direction, kline, level, volumeRatio, delta, stopLoss, takeProfit, quote);

        console.log(`[BreakoutDetector] ${direction} breakout detected!`);
        await telegram.sendBreakoutAlert(message);
    }

    private getIntensity(volumeRatio: number, delta: number): "low" | "medium" | "high" | "extreme" {
        const thresholds = tolkienQuotes.thresholds;
        const absDelta = Math.abs(delta);
        const deltaRatio = absDelta / (absDelta + 100000); // Normalize

        if (volumeRatio >= thresholds.extreme.volumeMultiplier) return "extreme";
        if (volumeRatio >= thresholds.high.volumeMultiplier) return "high";
        if (volumeRatio >= thresholds.medium.volumeMultiplier) return "medium";
        return "low";
    }

    private getRandomQuote(intensity: "low" | "medium" | "high" | "extreme", direction: "LONG" | "SHORT"): string {
        const quotes = tolkienQuotes.intensity[intensity].quotes;
        const prefixes = tolkienQuotes.actions[direction.toLowerCase() as "long" | "short"].prefix;

        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];

        return `${randomPrefix} ${randomQuote}`;
    }

    private formatMessage(
        direction: "LONG" | "SHORT",
        kline: Kline,
        level: number,
        volumeRatio: number,
        delta: number,
        stopLoss: number,
        takeProfit: number,
        quote: string
    ): string {
        const now = new Date();
        const timestamp = now.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });

        const levelLabel = direction === "LONG" ? "Rompeu Maxima" : "Rompeu Minima";
        const deltaLabel = delta > 0 ? "compras agressivas" : "vendas agressivas";
        const stopPercent = direction === "LONG"
            ? ((stopLoss - kline.close) / kline.close * 100).toFixed(2)
            : ((stopLoss - kline.close) / kline.close * 100).toFixed(2);
        const tpPercent = direction === "LONG"
            ? ((takeProfit - kline.close) / kline.close * 100).toFixed(2)
            : ((takeProfit - kline.close) / kline.close * 100).toFixed(2);

        return `BREAKOUT OFA - ${direction}

Par: ${this.config.symbol.toUpperCase()}
Preco Atual: $${kline.close.toLocaleString("en-US", { minimumFractionDigits: 2 })}
${levelLabel}: $${level.toLocaleString("en-US", { minimumFractionDigits: 2 })} (${this.config.lookback} candles)

CONFIRMACAO OFA:
  Volume: ${volumeRatio.toFixed(1)}x media
  Delta: ${delta > 0 ? "+" : ""}${Math.round(delta).toLocaleString("en-US")} (${deltaLabel})

Sugestao:
  Entry: $${kline.close.toLocaleString("en-US", { minimumFractionDigits: 2 })}
  Stop Loss: $${stopLoss.toLocaleString("en-US", { minimumFractionDigits: 2 })} (${stopPercent}%)
  Take Profit: $${takeProfit.toLocaleString("en-US", { minimumFractionDigits: 2 })} (+${tpPercent}%)

Timeframe: ${this.config.timeframe}
${timestamp}

${quote}

-- EOS - Eye of Sauron`;
    }
}
