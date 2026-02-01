export type HealthState = 'COLD' | 'WARMING' | 'LIVE_OK' | 'DEGRADED' | 'OFFLINE';

export interface MarketTrade {
    id: number;     // AggTrade ID (a)
    time: number;   // Timestamp (T)
    price: number;  // Price (p)
    qty: number;    // Quantity (q)
    isBuyer: boolean; // Computed from !m (isBuyerMaker)
    symbol: string;
}

export interface BufferStats {
    symbol: string;
    count: number;
    coverageSec: number;
    gapsDetected: number;
    outOfOrderCount: number;
    firstId: number;
    lastId: number;
    oldestTime: number;
    newestTime: number;
    lagMs: number;
}

export interface StreamEvents {
    'connected': () => void;
    'disconnected': () => void;
    'message': (data: any) => void;
    'error': (err: Error) => void;
}

export interface EngineEvents {
    'signal_ready': (symbol: string) => void;
    'state_change': (symbol: string, oldState: HealthState, newState: HealthState) => void;
    'gap_detected': (symbol: string, gap: { from: number, to: number, type: 'HARD' | 'SILENCE' }) => void;
}

// Binance Raw Types (for ingestion)
export interface BinanceAggTrade {
    e: string; // "aggTrade"
    E: number; // Event Time
    s: string; // Symbol
    a: number; // AggTradeId
    p: string; // Price
    q: string; // Qty
    f: number; // FirstId
    l: number; // LastId
    T: number; // TradeTime
    m: boolean;// IsBuyerMaker
}
