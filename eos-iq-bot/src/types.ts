export interface TradingSignal {
    symbol: string;
    action: 'BUY' | 'SELL';
    price: number;
    stopLoss?: number;
    takeProfit?: number;
    timeframe?: string;
}

export interface AlertMessage {
    message: string;
    type?: 'info' | 'warning' | 'success' | 'error';
}
