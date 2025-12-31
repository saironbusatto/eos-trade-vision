// Forex data provider using free APIs (no API key required)
// Uses open.er-api.com as primary, frankfurter.app as fallback

export interface TimeSeries {
    datetime: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface ForexQuote {
    pair: string;
    price: number;
    timestamp: number;
}

class ForexDataService {
    private cache: Map<string, { price: number; timestamp: number }> = new Map();
    private priceHistory: Map<string, TimeSeries[]> = new Map();
    private CACHE_TTL = 60 * 1000; // 1 minute cache
    private MAX_HISTORY = 60; // Keep 60 data points

    // Convert pair format: "EUR/USD" -> { from: "EUR", to: "USD" }
    private parsePair(pair: string): { from: string; to: string } {
        const [from, to] = pair.split('/');
        return { from, to };
    }

    async getPrice(pair: string): Promise<ForexQuote | null> {
        const cached = this.cache.get(pair);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return { pair, price: cached.price, timestamp: cached.timestamp };
        }

        // Try primary API
        let price = await this.fetchFromOpenER(pair);

        // Fallback to frankfurter if primary fails
        if (price === null) {
            price = await this.fetchFromFrankfurter(pair);
        }

        if (price !== null) {
            this.cache.set(pair, { price, timestamp: Date.now() });
            this.updateHistory(pair, price);
            return { pair, price, timestamp: Date.now() };
        }

        return null;
    }

    // Método para obter séries temporais simuladas
    async getTimeSeries(pair: string, interval: string = '1min', count: number = 30): Promise<TimeSeries[]> {
        // Buscar preço atual para atualizar histórico
        await this.getPrice(pair);

        const history = this.priceHistory.get(pair) || [];

        // Se não temos histórico suficiente, gerar dados simulados baseados no preço atual
        if (history.length < count) {
            const currentPrice = this.cache.get(pair)?.price;
            if (currentPrice) {
                return this.generateSimulatedHistory(currentPrice, count);
            }
            return [];
        }

        return history.slice(0, count);
    }

    private updateHistory(pair: string, price: number): void {
        const history = this.priceHistory.get(pair) || [];
        const now = new Date();

        // Criar candle simulado
        const variation = price * 0.0001 * (Math.random() - 0.5); // Pequena variação
        const newCandle: TimeSeries = {
            datetime: now.toISOString(),
            open: price - variation,
            high: price + Math.abs(variation),
            low: price - Math.abs(variation),
            close: price,
            volume: Math.floor(Math.random() * 10000) + 1000
        };

        // Adicionar ao início e limitar tamanho
        history.unshift(newCandle);
        if (history.length > this.MAX_HISTORY) {
            history.pop();
        }

        this.priceHistory.set(pair, history);
    }

    private generateSimulatedHistory(currentPrice: number, count: number): TimeSeries[] {
        const history: TimeSeries[] = [];
        let price = currentPrice;

        for (let i = 0; i < count; i++) {
            const variation = price * 0.0002 * (Math.random() - 0.5);
            const candle: TimeSeries = {
                datetime: new Date(Date.now() - i * 60000).toISOString(),
                open: price - variation,
                high: price + Math.abs(variation),
                low: price - Math.abs(variation) * 2,
                close: price,
                volume: Math.floor(Math.random() * 10000) + 1000
            };
            history.push(candle);
            price = price + variation;
        }

        return history;
    }

    private async fetchFromOpenER(pair: string): Promise<number | null> {
        try {
            const { from, to } = this.parsePair(pair);
            const url = `https://open.er-api.com/v6/latest/${from}`;

            const response = await fetch(url);
            const data = await response.json() as { result: string; rates?: Record<string, number> };

            if (data.result === 'success' && data.rates && data.rates[to]) {
                return data.rates[to];
            }
            return null;
        } catch (error) {
            console.error(`[ForexData] OpenER error for ${pair}:`, error);
            return null;
        }
    }

    private async fetchFromFrankfurter(pair: string): Promise<number | null> {
        try {
            const { from, to } = this.parsePair(pair);
            const url = `https://api.frankfurter.app/latest?from=${from}&to=${to}`;

            const response = await fetch(url);
            const data = await response.json() as { rates?: Record<string, number> };

            if (data.rates && data.rates[to]) {
                return data.rates[to];
            }
            return null;
        } catch (error) {
            console.error(`[ForexData] Frankfurter error for ${pair}:`, error);
            return null;
        }
    }

    async testConnection(): Promise<boolean> {
        const quote = await this.getPrice('EUR/USD');
        if (quote) {
            console.log(`[ForexData] Connected! EUR/USD = ${quote.price.toFixed(5)}`);
            return true;
        }
        console.error('[ForexData] Connection test failed');
        return false;
    }
}

export const forexData = new ForexDataService();
