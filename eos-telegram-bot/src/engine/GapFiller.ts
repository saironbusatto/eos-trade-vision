import { BinanceAggTrade } from './types';
import { ENGINE_CONFIG } from './config';

interface TokenBucket {
    tokens: number;
    lastRefill: number;
}

export class GapFiller {
    private bucket: TokenBucket;
    private readonly TOKENS_PER_MIN = ENGINE_CONFIG.MAX_GAP_FILL_REQUESTS_PER_MIN;
    private readonly BASE_URL = 'https://api.binance.com/api/v3/aggTrades';

    constructor() {
        this.bucket = {
            tokens: this.TOKENS_PER_MIN,
            lastRefill: Date.now()
        };
    }

    /**
     * Preenche gap por range de IDs
     * Retorna trades ordenados por ID
     */
    public async fillByIdRange(symbol: string, fromId: number, toId: number): Promise<BinanceAggTrade[]> {
        const gapSize = toId - fromId + 1;
        console.log(`[GapFiller] Filling gap by ID: ${symbol} [${fromId} -> ${toId}] (${gapSize} trades)`);

        if (gapSize > ENGINE_CONFIG.SMALL_GAP_MAX_TRADES) {
            throw new Error(`GAP_TOO_LARGE: ${gapSize} > ${ENGINE_CONFIG.SMALL_GAP_MAX_TRADES}`);
        }

        const allTrades: BinanceAggTrade[] = [];
        let currentFromId = fromId;

        while (currentFromId <= toId) {
            await this.consumeToken();

            const batch = await this.fetchBatch(symbol, { fromId: currentFromId });
            if (batch.length === 0) break;

            // Filtrar apenas trades dentro do range
            const validTrades = batch.filter(t => t.a >= fromId && t.a <= toId);
            allTrades.push(...validTrades);

            // Proximo batch comeca apos o ultimo ID recebido
            const lastId = batch[batch.length - 1].a;
            if (lastId >= toId) break;
            currentFromId = lastId + 1;
        }

        console.log(`[GapFiller] Fetched ${allTrades.length} trades for gap`);
        return allTrades;
    }

    /**
     * Preenche gap por range de tempo
     * Usado principalmente para WarmUp
     */
    public async fillByTimeRange(symbol: string, startTime: number, endTime: number): Promise<BinanceAggTrade[]> {
        console.log(`[GapFiller] Filling by time: ${symbol} [${new Date(startTime).toISOString()} -> ${new Date(endTime).toISOString()}]`);

        const allTrades: BinanceAggTrade[] = [];
        let currentStart = startTime;

        while (currentStart < endTime) {
            await this.consumeToken();

            const batch = await this.fetchBatch(symbol, {
                startTime: currentStart,
                endTime: endTime
            });

            if (batch.length === 0) break;

            allTrades.push(...batch);

            // Proximo batch comeca 1ms apos o ultimo trade
            const lastTime = batch[batch.length - 1].T;
            if (lastTime >= endTime) break;
            currentStart = lastTime + 1;
        }

        console.log(`[GapFiller] Fetched ${allTrades.length} trades for time range`);
        return allTrades;
    }

    private async fetchBatch(
        symbol: string,
        params: { fromId?: number; startTime?: number; endTime?: number }
    ): Promise<BinanceAggTrade[]> {
        const url = new URL(this.BASE_URL);
        url.searchParams.set('symbol', symbol.toUpperCase());
        url.searchParams.set('limit', '1000');

        if (params.fromId !== undefined) {
            url.searchParams.set('fromId', params.fromId.toString());
        }
        if (params.startTime !== undefined) {
            url.searchParams.set('startTime', params.startTime.toString());
        }
        if (params.endTime !== undefined) {
            url.searchParams.set('endTime', params.endTime.toString());
        }

        try {
            const response = await fetch(url.toString());

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Binance API error: ${response.status} - ${text}`);
            }

            const data = await response.json() as any[];

            // Mapear para formato BinanceAggTrade (REST retorna formato diferente do WS)
            return data.map((t: any) => ({
                e: 'aggTrade',
                E: t.T, // Event time = Trade time
                s: symbol.toUpperCase(),
                a: t.a,
                p: t.p,
                q: t.q,
                f: t.f,
                l: t.l,
                T: t.T,
                m: t.m
            }));
        } catch (err) {
            console.error('[GapFiller] Fetch error:', err);
            throw err;
        }
    }

    /**
     * Token bucket rate limiting
     * Bloqueia se nao houver tokens disponiveis
     */
    private async consumeToken(): Promise<void> {
        const now = Date.now();
        const elapsed = now - this.bucket.lastRefill;

        // Refill tokens baseado no tempo passado
        if (elapsed >= 60000) {
            this.bucket.tokens = this.TOKENS_PER_MIN;
            this.bucket.lastRefill = now;
        } else {
            // Refill proporcional
            const refillAmount = Math.floor((elapsed / 60000) * this.TOKENS_PER_MIN);
            this.bucket.tokens = Math.min(this.TOKENS_PER_MIN, this.bucket.tokens + refillAmount);
            if (refillAmount > 0) {
                this.bucket.lastRefill = now;
            }
        }

        if (this.bucket.tokens <= 0) {
            // Esperar ate proximo refill
            const waitTime = 60000 - elapsed + 100; // +100ms margem
            console.warn(`[GapFiller] Rate limited, waiting ${waitTime}ms`);
            await this.sleep(waitTime);
            this.bucket.tokens = this.TOKENS_PER_MIN;
            this.bucket.lastRefill = Date.now();
        }

        this.bucket.tokens--;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
