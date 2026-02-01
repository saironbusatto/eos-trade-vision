import { MarketTrade, BinanceAggTrade, BufferStats } from './types';
import { ENGINE_CONFIG } from './config';

export class MarketDataBuffer {
    private trades: MarketTrade[] = [];
    private outOfOrderCount = 0;
    private gapsDetected = 0;

    constructor(private symbol: string) { }

    /**
     * Insert a single realtime trade with Strict Gap Check
     * Returns TRUE if accepted smoothly, FALSE if GAP detected (Caller handles fill)
     */
    public insertRealtime(raw: BinanceAggTrade): boolean {
        const trade = this.mapTrade(raw);

        if (this.trades.length > 0) {
            const last = this.trades[this.trades.length - 1];

            // 1. Strict ID Check
            if (trade.id > last.id + 1) {
                // HARD GAP DETECTED
                // console.warn(`[Buffer] Gap detected: Last=${last.id}, Current=${trade.id}`);
                return false;
            }

            // 2. Out of order / Dup check
            if (trade.id <= last.id) {
                this.handleOutOfOrder(trade);
                return true;
            }
        }

        this.trades.push(trade);
        this.trim();
        return true;
    }

    /**
     * Batch insert (e.g. from REST or GapFill)
     * Handles sorting and dedup
     */
    public insertMany(rawTrades: BinanceAggTrade[]): void {
        const mapped = rawTrades.map(this.mapTrade);
        this.trades.push(...mapped);
        this.resortAndDedup();
        this.trim();
    }

    public getStats(): BufferStats {
        const now = Date.now();
        const count = this.trades.length;
        const first = this.trades[0];
        const last = this.trades[count - 1];

        return {
            symbol: this.symbol,
            count,
            coverageSec: count > 0 ? (last.time - first.time) / 1000 : 0,
            gapsDetected: this.gapsDetected,
            outOfOrderCount: this.outOfOrderCount,
            firstId: first?.id || 0,
            lastId: last?.id || 0,
            oldestTime: first?.time || 0,
            newestTime: last?.time || 0,
            lagMs: last ? now - last.time : 0
        };
    }

    public getLastId(): number {
        return this.trades.length > 0 ? this.trades[this.trades.length - 1].id : -1;
    }

    /**
     * Retorna copia dos trades (para consumo externo)
     */
    public getAllTrades(): MarketTrade[] {
        return [...this.trades];
    }

    /**
     * Retorna trades dentro de uma janela de tempo
     */
    public getTradesInWindow(minutes: number): MarketTrade[] {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        return this.trades.filter(t => t.time >= cutoff);
    }

    private mapTrade(raw: BinanceAggTrade): MarketTrade {
        return {
            id: raw.a,
            time: raw.T,
            price: parseFloat(raw.p),
            qty: parseFloat(raw.q),
            isBuyer: !raw.m,
            symbol: raw.s
        };
    }

    private handleOutOfOrder(trade: MarketTrade) {
        // Linear scan from end (usually it's just a few ms off)
        // Optimization: if much older, binary search.
        const existingIdx = this.trades.findIndex(t => t.id === trade.id);
        if (existingIdx !== -1) {
            return; // Duplicate, ignore.
        }

        // Insert and sort
        this.trades.push(trade);
        this.outOfOrderCount++;
        this.resortAndDedup();
    }

    private resortAndDedup() {
        // Sort by Time, then ID
        this.trades.sort((a, b) => {
            if (a.time !== b.time) return a.time - b.time;
            return a.id - b.id;
        });

        // Dedup
        let writeIdx = 0;
        for (let i = 1; i < this.trades.length; i++) {
            if (this.trades[i].id !== this.trades[writeIdx].id) {
                writeIdx++;
                this.trades[writeIdx] = this.trades[i];
            }
        }
        this.trades.length = writeIdx + 1;
    }

    private trim() {
        const cutoff = Date.now() - ENGINE_CONFIG.WINDOW_SIZE_MS;
        // Fast trim from head
        if (this.trades.length > 0 && this.trades[0].time < cutoff) {
            const idx = this.trades.findIndex(t => t.time >= cutoff);
            if (idx > 0) {
                this.trades = this.trades.slice(idx);
            }
        }
    }
}
