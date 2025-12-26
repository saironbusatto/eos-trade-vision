// Binance Public API Service
// Docs: https://binance-docs.github.io/apidocs/spot/en/

const BINANCE_API_BASE = "https://api.binance.com/api/v3";

export interface SymbolPrice {
    symbol: string;
    price: string;
}

export interface Ticker24h {
    symbol: string;
    priceChange: string;
    priceChangePercent: string;
    weightedAvgPrice: string;
    prevClosePrice: string;
    lastPrice: string;
    lastQty: string;
    bidPrice: string;
    bidQty: string;
    askPrice: string;
    askQty: string;
    openPrice: string;
    highPrice: string;
    lowPrice: string;
    volume: string;
    quoteVolume: string;
    openTime: number;
    closeTime: number;
    firstId: number;
    lastId: number;
    count: number;
}

export interface Kline {
    openTime: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    closeTime: number;
    quoteAssetVolume: string;
    numberOfTrades: number;
    takerBuyBaseAssetVolume: string;
    takerBuyQuoteAssetVolume: string;
}

export interface ExchangeInfo {
    symbols: Array<{
        symbol: string;
        baseAsset: string;
        quoteAsset: string;
        status: string;
    }>;
}

// Get current price for a symbol
export async function getSymbolPrice(symbol: string): Promise<SymbolPrice | null> {
    try {
        const response = await fetch(`${BINANCE_API_BASE}/ticker/price?symbol=${symbol.toUpperCase()}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error("Error fetching symbol price:", error);
        return null;
    }
}

// Get 24h ticker data for a symbol
export async function get24hTicker(symbol: string): Promise<Ticker24h | null> {
    try {
        const response = await fetch(`${BINANCE_API_BASE}/ticker/24hr?symbol=${symbol.toUpperCase()}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error("Error fetching 24h ticker:", error);
        return null;
    }
}

// Get kline/candlestick data
export async function getKlines(
    symbol: string,
    interval: string = "1h",
    limit: number = 24
): Promise<Kline[]> {
    try {
        const response = await fetch(
            `${BINANCE_API_BASE}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`
        );
        if (!response.ok) return [];
        const data = await response.json();
        return data.map((k: unknown[]) => ({
            openTime: k[0] as number,
            open: k[1] as string,
            high: k[2] as string,
            low: k[3] as string,
            close: k[4] as string,
            volume: k[5] as string,
            closeTime: k[6] as number,
            quoteAssetVolume: k[7] as string,
            numberOfTrades: k[8] as number,
            takerBuyBaseAssetVolume: k[9] as string,
            takerBuyQuoteAssetVolume: k[10] as string,
        }));
    } catch (error) {
        console.error("Error fetching klines:", error);
        return [];
    }
}

// Get all available trading pairs
let cachedSymbols: ExchangeInfo["symbols"] | null = null;

export async function getExchangeInfo(): Promise<ExchangeInfo["symbols"]> {
    if (cachedSymbols) return cachedSymbols;

    try {
        const response = await fetch(`${BINANCE_API_BASE}/exchangeInfo`);
        if (!response.ok) return [];
        const data: ExchangeInfo = await response.json();
        cachedSymbols = data.symbols.filter(s => s.status === "TRADING");
        return cachedSymbols;
    } catch (error) {
        console.error("Error fetching exchange info:", error);
        return [];
    }
}

// Find symbol from user query (e.g., "bitcoin" -> "BTCUSDT")
const COMMON_NAMES: Record<string, string> = {
    bitcoin: "BTC",
    btc: "BTC",
    ethereum: "ETH",
    eth: "ETH",
    ether: "ETH",
    binance: "BNB",
    bnb: "BNB",
    solana: "SOL",
    sol: "SOL",
    cardano: "ADA",
    ada: "ADA",
    ripple: "XRP",
    xrp: "XRP",
    dogecoin: "DOGE",
    doge: "DOGE",
    polkadot: "DOT",
    dot: "DOT",
    avalanche: "AVAX",
    avax: "AVAX",
    polygon: "MATIC",
    matic: "MATIC",
    chainlink: "LINK",
    link: "LINK",
    litecoin: "LTC",
    ltc: "LTC",
    uniswap: "UNI",
    uni: "UNI",
    shiba: "SHIB",
    shib: "SHIB",
    tron: "TRX",
    trx: "TRX",
    stellar: "XLM",
    xlm: "XLM",
    cosmos: "ATOM",
    atom: "ATOM",
    near: "NEAR",
    aptos: "APT",
    apt: "APT",
    arbitrum: "ARB",
    arb: "ARB",
    optimism: "OP",
    op: "OP",
    sui: "SUI",
    pepe: "PEPE",
};

export function resolveSymbol(query: string): string {
    const lower = query.toLowerCase().trim();

    // Check common names first
    if (COMMON_NAMES[lower]) {
        return COMMON_NAMES[lower] + "USDT";
    }

    // If already looks like a symbol (e.g., "BTCUSDT" or "BTC")
    const upper = query.toUpperCase().trim();
    if (upper.endsWith("USDT") || upper.endsWith("BUSD") || upper.endsWith("BTC")) {
        return upper;
    }

    // Assume it's a base asset and pair with USDT
    return upper + "USDT";
}

// Get comprehensive market data for a symbol
export async function getMarketData(symbol: string): Promise<{
    price: SymbolPrice | null;
    ticker: Ticker24h | null;
    klines: Kline[];
}> {
    const resolvedSymbol = resolveSymbol(symbol);

    const [price, ticker, klines] = await Promise.all([
        getSymbolPrice(resolvedSymbol),
        get24hTicker(resolvedSymbol),
        getKlines(resolvedSymbol, "1h", 24),
    ]);

    return { price, ticker, klines };
}

// Format price for display
export function formatPrice(price: string | number): string {
    const num = typeof price === "string" ? parseFloat(price) : price;
    if (num >= 1000) return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (num >= 1) return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    if (num >= 0.0001) return num.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    return num.toLocaleString("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 8 });
}

// Format percentage for display
export function formatPercent(percent: string | number): string {
    const num = typeof percent === "string" ? parseFloat(percent) : percent;
    const sign = num >= 0 ? "+" : "";
    return `${sign}${num.toFixed(2)}%`;
}

// Format volume for display
export function formatVolume(volume: string | number): string {
    const num = typeof volume === "string" ? parseFloat(volume) : volume;
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toFixed(2);
}
