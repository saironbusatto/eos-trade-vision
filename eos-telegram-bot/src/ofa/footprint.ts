/**
 * Footprint Analyzer
 * 
 * Analisa agressao de compra vs venda por candle,
 * base para deteccao de Imbalances.
 * 
 * Baseado em: Footprint Charts (Trader Dale / Michael Valtos)
 * 
 * REFATORADO: Agora usa DataService (buffer 60min) em vez de REST direto.
 */

import { getDataService, TradeData } from '../engine/DataService';

export interface FootprintCandle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    bidVolume: number;      // Volume vendido (vendedor agrediu)
    askVolume: number;      // Volume comprado (comprador agrediu)
    delta: number;          // Ask - Bid
    totalVolume: number;
    percentBuy: number;     // % do volume que foi compra agressiva
    isBullishCandle: boolean;
    priceLevels: PriceLevel[];  // Para imbalance detection
}

export interface PriceLevel {
    price: number;
    bidVolume: number;
    askVolume: number;
    delta: number;
    imbalanceRatio?: number;  // Ask/Bid ratio
}

/**
 * Agrupa trades em candles de footprint
 */
function groupIntoCandles(trades: TradeData[], candleMinutes: number = 15): FootprintCandle[] {
    if (trades.length === 0) return [];

    const candleMs = candleMinutes * 60 * 1000;
    const candles: Map<number, FootprintCandle> = new Map();

    for (const trade of trades) {
        // Arredondar para o inicio do candle
        const candleStart = Math.floor(trade.timestamp / candleMs) * candleMs;

        let candle = candles.get(candleStart);
        if (!candle) {
            candle = {
                timestamp: candleStart,
                open: trade.price,
                high: trade.price,
                low: trade.price,
                close: trade.price,
                bidVolume: 0,
                askVolume: 0,
                delta: 0,
                totalVolume: 0,
                percentBuy: 0,
                isBullishCandle: true,
                priceLevels: [],
            };
            candles.set(candleStart, candle);
        }

        // Atualizar OHLC
        if (trade.price > candle.high) candle.high = trade.price;
        if (trade.price < candle.low) candle.low = trade.price;
        candle.close = trade.price;

        // Acumular volume
        const usdVolume = trade.price * trade.quantity;

        // isBuyerMaker = false significa que comprador agrediu (Ask hit)
        if (!trade.isBuyerMaker) {
            candle.askVolume += usdVolume;
        } else {
            candle.bidVolume += usdVolume;
        }

        // Encontrar ou criar price level
        const priceRounded = Math.round(trade.price * 100) / 100;
        let level = candle.priceLevels.find(l => Math.abs(l.price - priceRounded) < 0.01);
        if (!level) {
            level = { price: priceRounded, bidVolume: 0, askVolume: 0, delta: 0 };
            candle.priceLevels.push(level);
        }

        if (!trade.isBuyerMaker) {
            level.askVolume += usdVolume;
        } else {
            level.bidVolume += usdVolume;
        }
    }

    // Calcular totais e ordenar
    const result: FootprintCandle[] = [];

    for (const candle of candles.values()) {
        candle.totalVolume = candle.bidVolume + candle.askVolume;
        candle.delta = candle.askVolume - candle.bidVolume;
        candle.percentBuy = candle.totalVolume > 0
            ? (candle.askVolume / candle.totalVolume) * 100
            : 50;
        candle.isBullishCandle = candle.close > candle.open;

        // Calcular delta por level
        for (const level of candle.priceLevels) {
            level.delta = level.askVolume - level.bidVolume;
        }

        // Ordenar levels por preco
        candle.priceLevels.sort((a, b) => b.price - a.price);

        result.push(candle);
    }

    // Ordenar candles por timestamp
    result.sort((a, b) => a.timestamp - b.timestamp);

    return result;
}

/**
 * Gera footprint para um simbolo usando DataService
 * REFATORADO: Nao faz mais REST direto
 */
export async function generateFootprint(symbol: string, minutes: number = 60): Promise<FootprintCandle[]> {
    const dataService = getDataService();

    if (!dataService.isReady(symbol)) {
        console.warn(`[Footprint] Symbol ${symbol} not ready`);
        return [];
    }

    const trades = dataService.getTrades(symbol, minutes);

    if (trades.length === 0) {
        console.warn(`[Footprint] No trades for ${symbol}`);
        return [];
    }

    console.log(`[Footprint] Generating from ${trades.length} trades for ${symbol}`);

    return groupIntoCandles(trades);
}

/**
 * Calcula delta cumulativo
 */
export function calculateCumulativeDelta(candles: FootprintCandle[]): number[] {
    const cumulative: number[] = [];
    let total = 0;

    for (const candle of candles) {
        total += candle.delta;
        cumulative.push(total);
    }

    return cumulative;
}

/**
 * Detecta divergência entre preco e delta
 */
export function detectDeltaDivergence(candles: FootprintCandle[]): {
    hasDivergence: boolean;
    type: 'BULLISH_DIV' | 'BEARISH_DIV' | 'NONE';
    description: string;
} {
    if (candles.length < 4) {
        return { hasDivergence: false, type: 'NONE', description: '' };
    }

    const recent = candles.slice(-4);
    const cumDelta = calculateCumulativeDelta(recent);

    // Preco subindo mas delta caindo = bearish divergence
    const priceUp = recent[recent.length - 1].close > recent[0].close;
    const deltaDown = cumDelta[cumDelta.length - 1] < cumDelta[0];

    // Preco descendo mas delta subindo = bullish divergence
    const priceDown = recent[recent.length - 1].close < recent[0].close;
    const deltaUp = cumDelta[cumDelta.length - 1] > cumDelta[0];

    if (priceUp && deltaDown) {
        return {
            hasDivergence: true,
            type: 'BEARISH_DIV',
            description: 'Preco subindo mas compradores perdendo forca',
        };
    }

    if (priceDown && deltaUp) {
        return {
            hasDivergence: true,
            type: 'BULLISH_DIV',
            description: 'Preco caindo mas compradores acumulando',
        };
    }

    return { hasDivergence: false, type: 'NONE', description: '' };
}

/**
 * Formata footprint summary
 */
export function formatFootprintSummary(candles: FootprintCandle[]): string {
    if (candles.length === 0) return 'No data';

    const lastCandle = candles[candles.length - 1];
    const totalDelta = candles.reduce((sum, c) => sum + c.delta, 0);
    const avgBuyPercent = candles.reduce((sum, c) => sum + c.percentBuy, 0) / candles.length;

    const deltaStr = totalDelta >= 0
        ? `+$${(totalDelta / 1000).toFixed(0)}k`
        : `-$${(Math.abs(totalDelta) / 1000).toFixed(0)}k`;

    return `Delta: ${deltaStr} | Compra: ${avgBuyPercent.toFixed(0)}%`;
}

export default {
    generateFootprint,
    calculateCumulativeDelta,
    detectDeltaDivergence,
    formatFootprintSummary,
};
