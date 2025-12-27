import WebSocket from "ws";

interface DeltaState {
    delta: number;
    buyVolume: number;
    sellVolume: number;
    lastUpdate: number;
}

type DeltaCallback = (delta: DeltaState) => void;

export class DeltaCalculator {
    private ws: WebSocket | null = null;
    private symbol: string;
    private delta: number = 0;
    private buyVolume: number = 0;
    private sellVolume: number = 0;
    private callbacks: DeltaCallback[] = [];
    private reconnectTimer: NodeJS.Timeout | null = null;

    constructor(symbol: string = "btcusdt") {
        this.symbol = symbol.toLowerCase();
    }

    start(): void {
        this.connect();
    }

    stop(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    onDelta(callback: DeltaCallback): void {
        this.callbacks.push(callback);
    }

    getDelta(): DeltaState {
        return {
            delta: this.delta,
            buyVolume: this.buyVolume,
            sellVolume: this.sellVolume,
            lastUpdate: Date.now()
        };
    }

    resetDelta(): void {
        this.delta = 0;
        this.buyVolume = 0;
        this.sellVolume = 0;
    }

    private connect(): void {
        const url = `wss://stream.binance.com:9443/ws/${this.symbol}@aggTrade`;

        console.log(`[DeltaCalculator] Connecting to ${this.symbol} aggTrade stream...`);

        this.ws = new WebSocket(url);

        this.ws.on("open", () => {
            console.log(`[DeltaCalculator] Connected to ${this.symbol} aggTrade`);
        });

        this.ws.on("message", (data: WebSocket.Data) => {
            try {
                const trade = JSON.parse(data.toString());
                this.processTrade(trade);
            } catch (error) {
                console.error("[DeltaCalculator] Error parsing trade:", error);
            }
        });

        this.ws.on("close", () => {
            console.log("[DeltaCalculator] WebSocket closed, reconnecting in 5s...");
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        });

        this.ws.on("error", (error) => {
            console.error("[DeltaCalculator] WebSocket error:", error);
        });
    }

    private processTrade(trade: {
        p: string; // price
        q: string; // quantity
        m: boolean; // is buyer maker (true = sell aggression, false = buy aggression)
        T: number; // trade time
    }): void {
        const quantity = parseFloat(trade.q);
        const price = parseFloat(trade.p);
        const volume = quantity * price;

        // m = true means buyer is maker, so trade was SELL aggression (hit bid)
        // m = false means seller is maker, so trade was BUY aggression (lift ask)
        if (trade.m) {
            // Sell aggression
            this.sellVolume += volume;
            this.delta -= volume;
        } else {
            // Buy aggression
            this.buyVolume += volume;
            this.delta += volume;
        }

        const state = this.getDelta();
        this.callbacks.forEach(cb => cb(state));
    }
}
