import fetch from 'node-fetch';
import { config } from './config';

const BASE_URL = 'https://api.twelvedata.com';

export interface Quote {
    symbol: string;
    price: number;
    timestamp: number;
}

export interface TimeSeries {
    datetime: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

export class TwelveDataClient {
    private apiKey: string;

    constructor() {
        this.apiKey = config.twelveDataApiKey;
    }

    // Get real-time price
    async getPrice(symbol: string): Promise<Quote | null> {
        try {
            const url = `${BASE_URL}/price?symbol=${symbol}&apikey=${this.apiKey}`;
            const response = await fetch(url);
            const data = await response.json() as any;

            if (data.code) {
                console.error(`[TwelveData] Error: ${data.message}`);
                return null;
            }

            return {
                symbol,
                price: parseFloat(data.price),
                timestamp: Date.now(),
            };
        } catch (error) {
            console.error('[TwelveData] Price error:', error);
            return null;
        }
    }

    // Get time series data
    async getTimeSeries(symbol: string, interval: string = '1min', outputSize: number = 30): Promise<TimeSeries[]> {
        try {
            const url = `${BASE_URL}/time_series?symbol=${symbol}&interval=${interval}&outputsize=${outputSize}&apikey=${this.apiKey}`;
            const response = await fetch(url);
            const data = await response.json() as any;

            if (data.code) {
                console.error(`[TwelveData] Error: ${data.message}`);
                return [];
            }

            return (data.values || []).map((v: any) => ({
                datetime: v.datetime,
                open: parseFloat(v.open),
                high: parseFloat(v.high),
                low: parseFloat(v.low),
                close: parseFloat(v.close),
                volume: v.volume ? parseFloat(v.volume) : undefined,
            }));
        } catch (error) {
            console.error('[TwelveData] Time series error:', error);
            return [];
        }
    }

    // Get multiple prices at once (more efficient)
    async getPrices(symbols: string[]): Promise<Map<string, number>> {
        const prices = new Map<string, number>();

        try {
            const symbolList = symbols.join(',');
            const url = `${BASE_URL}/price?symbol=${symbolList}&apikey=${this.apiKey}`;
            const response = await fetch(url);
            const data = await response.json() as any;

            if (data.code) {
                console.error(`[TwelveData] Error: ${data.message}`);
                return prices;
            }

            // Single symbol returns {price: "..."}, multiple returns {SYMBOL: {price: "..."}}
            if (symbols.length === 1) {
                prices.set(symbols[0], parseFloat(data.price));
            } else {
                for (const symbol of symbols) {
                    if (data[symbol] && data[symbol].price) {
                        prices.set(symbol, parseFloat(data[symbol].price));
                    }
                }
            }
        } catch (error) {
            console.error('[TwelveData] Prices error:', error);
        }

        return prices;
    }

    // Test connection
    async testConnection(): Promise<boolean> {
        const quote = await this.getPrice('EUR/USD');
        if (quote) {
            console.log(`[TwelveData] Connected! EUR/USD = ${quote.price}`);
            return true;
        }
        return false;
    }
}

export const twelveData = new TwelveDataClient();
