// Forex data provider using IBKR as primary, free APIs as fallback
// Primary: @stoqey/ib (IBKR Gateway)
// Fallback: open.er-api.com, frankfurter.app

import { ibkrData } from './ibkrData';

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
    source?: 'ibkr' | 'openER' | 'frankfurter';
}

class ForexDataService {
    private cache: Map<string, { price: number; timestamp: number }> = new Map();
    private priceHistory: Map<string, TimeSeries[]> = new Map();
    private CACHE_TTL = 60 * 1000; // 1 minute cache
    private MAX_HISTORY = 60; // Keep 60 data points
    private ibkrEnabled = true; // Flag para habilitar/desabilitar IBKR
    private ibkrInitialized = false;

    // Convert pair format: "EUR/USD" -> { from: "EUR", to: "USD" }
    private parsePair(pair: string): { from: string; to: string } {
        const [from, to] = pair.split('/');
        return { from, to };
    }

    /**
     * Inicializa conexão com IBKR (chamado uma vez no startup)
     */
    async initIBKR(): Promise<boolean> {
        if (this.ibkrInitialized) return ibkrData.isConnected();

        console.log('[ForexData] Tentando conectar ao IBKR Gateway...');
        const connected = await ibkrData.connect();
        this.ibkrInitialized = true;

        if (connected) {
            console.log('[ForexData] IBKR conectado! Subscrevendo pares principais...');
            // Subscreve pares mais usados
            const mainPairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD'];
            mainPairs.forEach(pair => ibkrData.subscribePair(pair));
            return true;
        } else {
            console.log('[ForexData] IBKR não disponível. Usando APIs gratuitas.');
            this.ibkrEnabled = false;
            return false;
        }
    }

    async getPrice(pair: string): Promise<ForexQuote | null> {
        // Tenta IBKR primeiro se habilitado
        if (this.ibkrEnabled && ibkrData.isConnected()) {
            const ibkrPrice = ibkrData.getPrice(pair);
            if (ibkrPrice !== null && ibkrData.hasValidData(pair, 120)) {
                const quote = this.quotes.get(pair);
                this.updateHistory(pair, ibkrPrice);
                return {
                    pair,
                    price: ibkrPrice,
                    timestamp: quote?.timestamp || Date.now(),
                    source: 'ibkr'
                };
            }
            // Se não tem dados ainda, subscreve o par
            if (!ibkrData.getQuote(pair)) {
                ibkrData.subscribePair(pair);
            }
        }

        // Fallback: APIs gratuitas
        const cached = this.cache.get(pair);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return { pair, price: cached.price, timestamp: cached.timestamp, source: 'openER' };
        }

        // Try primary API
        let price = await this.fetchFromOpenER(pair);
        let source: 'openER' | 'frankfurter' = 'openER';

        // Fallback to frankfurter if primary fails
        if (price === null) {
            price = await this.fetchFromFrankfurter(pair);
            source = 'frankfurter';
        }

        if (price !== null) {
            this.cache.set(pair, { price, timestamp: Date.now() });
            this.updateHistory(pair, price);
            return { pair, price, timestamp: Date.now(), source };
        }

        return null;
    }

    // Getter para quotes do IBKR
    private get quotes() {
        return new Map<string, { timestamp: number }>();
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
