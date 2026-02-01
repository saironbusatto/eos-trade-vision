// offline_backtest_mvp.ts
// Skeleton for offline backtest using buffer dump
// ASCII ONLY

import * as fs from 'fs';

interface Trade {
    p: number;
    q: number;
    T: number;
    m: boolean;
}

interface Candle {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    time: number;
}

function aggregateToCandles(trades: Trade[], intervalMs = 60000): Candle[] {
    if (trades.length === 0) return [];

    const candles: Candle[] = [];
    let currentCandle: Candle | null = null;
    let currentBucket = 0;

    for (const trade of trades) {
        const bucket = Math.floor(trade.T / intervalMs) * intervalMs;

        if (currentCandle === null || bucket !== currentBucket) {
            if (currentCandle) candles.push(currentCandle);
            currentBucket = bucket;
            currentCandle = {
                open: trade.p,
                high: trade.p,
                low: trade.p,
                close: trade.p,
                volume: trade.q,
                time: bucket
            };
        } else {
            currentCandle.high = Math.max(currentCandle.high, trade.p);
            currentCandle.low = Math.min(currentCandle.low, trade.p);
            currentCandle.close = trade.p;
            currentCandle.volume += trade.q;
        }
    }

    if (currentCandle) candles.push(currentCandle);
    return candles;
}

function calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateRSI(prices: number[], period = 14): number {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = prices.length - period; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
    }

    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
}

export function runBacktest(bufferFile: string) {
    console.log(`Loading ${bufferFile}...`);
    const raw = fs.readFileSync(bufferFile, 'utf-8');
    const trades: Trade[] = JSON.parse(raw);

    console.log(`Loaded ${trades.length} trades`);

    // Aggregate to 1m candles
    const candles = aggregateToCandles(trades, 60000);
    console.log(`Aggregated to ${candles.length} candles`);

    let balance = 1000;
    let position = 0; // 0 flat, 1 long
    let entryPrice = 0;
    let totalTrades = 0;
    let wins = 0;

    const lookback = 50;

    // Backtest loop (shift 1 for no look-ahead)
    for (let i = lookback; i < candles.length; i++) {
        // Use data up to i-1 for signal, execute at i open
        const pastCandles = candles.slice(0, i);
        const closes = pastCandles.map(c => c.close);

        const smaSlow = calculateSMA(closes, 30);
        const smaFast = calculateSMA(closes, 10);
        const rsi = calculateRSI(closes);

        const currentPrice = candles[i].open; // Execute at open to avoid look-ahead

        // Simple strategy: Fast SMA crosses above Slow + RSI not overbought
        const bullishCross = smaFast > smaSlow && rsi < 70;
        const bearishCross = smaFast < smaSlow || rsi > 80;

        if (position === 0 && bullishCross) {
            position = 1;
            entryPrice = currentPrice;
        } else if (position === 1 && bearishCross) {
            position = 0;
            const pnl = (currentPrice - entryPrice) / entryPrice;
            balance *= (1 + pnl - 0.001); // 0.1% fee
            totalTrades++;
            if (pnl > 0) wins++;
        }
    }

    console.log('=== BACKTEST RESULTS ===');
    console.log(`Final Balance: $${balance.toFixed(2)}`);
    console.log(`Total Trades: ${totalTrades}`);
    console.log(`Win Rate: ${((wins / totalTrades) * 100 || 0).toFixed(1)}%`);
    console.log(`Return: ${((balance / 1000 - 1) * 100).toFixed(2)}%`);
}

// CLI entry point
if (require.main === module) {
    const file = process.argv[2];
    if (!file) {
        console.log('Usage: npx ts-node backtest_mvp.ts <buffer_dump.json>');
        process.exit(1);
    }
    runBacktest(file);
}
