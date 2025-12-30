/**
 * Smart Money Filter
 * 
 * Filtra trades por tamanho para focar em ordens institucionais
 * e reduzir ruído de varejo.
 * 
 * Baseado em: Trade Filter (Trader Dale / Michael Valtos)
 */

// Thresholds em USD
const THRESHOLDS = {
    IGNORE: 500,        // < $500 = ignorar (ruído)
    RETAIL: 5000,       // $500-$5k = varejo normal
    SMART: 25000,       // $5k-$25k = smart money
    WHALE: 100000,      // > $100k = whale
};

// Pesos para diferentes tamanhos de trade
const WEIGHTS = {
    IGNORE: 0,
    RETAIL: 1,
    SMART: 3,
    WHALE: 10,
};

export interface TradeData {
    price: number;
    quantity: number;
    isBuyerMaker: boolean;  // false = buyer aggressor (compra agressiva)
    timestamp: number;
}

export interface SmartMoneyDelta {
    totalDelta: number;         // Delta normal (todos os trades)
    smartDelta: number;         // Delta ponderado por tamanho
    buyVolume: number;          // Volume de compra
    sellVolume: number;         // Volume de venda
    smartBuyVolume: number;     // Volume compra smart money
    smartSellVolume: number;    // Volume venda smart money
    whaleTrades: number;        // Quantidade de trades whale
    smartMoneyBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    divergence: boolean;        // Delta normal vs smart divergem?
}

export interface TradeClassification {
    category: 'IGNORE' | 'RETAIL' | 'SMART' | 'WHALE';
    weight: number;
    usdValue: number;
}

/**
 * Classifica um trade pelo tamanho em USD
 */
export function classifyTrade(trade: TradeData): TradeClassification {
    const usdValue = trade.price * trade.quantity;

    if (usdValue < THRESHOLDS.IGNORE) {
        return { category: 'IGNORE', weight: WEIGHTS.IGNORE, usdValue };
    }
    if (usdValue < THRESHOLDS.RETAIL) {
        return { category: 'RETAIL', weight: WEIGHTS.RETAIL, usdValue };
    }
    if (usdValue < THRESHOLDS.SMART) {
        return { category: 'SMART', weight: WEIGHTS.SMART, usdValue };
    }
    return { category: 'WHALE', weight: WEIGHTS.WHALE, usdValue };
}

/**
 * Calcula o delta filtrado por Smart Money
 */
export function calculateSmartMoneyDelta(trades: TradeData[]): SmartMoneyDelta {
    let totalDelta = 0;
    let smartDelta = 0;
    let buyVolume = 0;
    let sellVolume = 0;
    let smartBuyVolume = 0;
    let smartSellVolume = 0;
    let whaleTrades = 0;

    for (const trade of trades) {
        const classification = classifyTrade(trade);

        // Pular trades muito pequenos
        if (classification.category === 'IGNORE') continue;

        // Determinar direção (isBuyerMaker = false significa comprador agrediu)
        const isBuy = !trade.isBuyerMaker;
        const volume = classification.usdValue;
        const weightedVolume = volume * classification.weight;

        // Acumular volumes
        if (isBuy) {
            buyVolume += volume;
            totalDelta += volume;
            smartDelta += weightedVolume;

            if (classification.category === 'SMART' || classification.category === 'WHALE') {
                smartBuyVolume += volume;
            }
        } else {
            sellVolume += volume;
            totalDelta -= volume;
            smartDelta -= weightedVolume;

            if (classification.category === 'SMART' || classification.category === 'WHALE') {
                smartSellVolume += volume;
            }
        }

        if (classification.category === 'WHALE') {
            whaleTrades++;
        }
    }

    // Determinar bias do Smart Money
    const smartNetFlow = smartBuyVolume - smartSellVolume;
    const smartMoneyBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
        smartNetFlow > smartBuyVolume * 0.1 ? 'BULLISH' :
            smartNetFlow < -smartSellVolume * 0.1 ? 'BEARISH' : 'NEUTRAL';

    // Detectar divergência (varejo vs smart money)
    const retailBias = totalDelta > 0;
    const smartBias = smartDelta > 0;
    const divergence = retailBias !== smartBias;

    return {
        totalDelta,
        smartDelta,
        buyVolume,
        sellVolume,
        smartBuyVolume,
        smartSellVolume,
        whaleTrades,
        smartMoneyBias,
        divergence,
    };
}

/**
 * Busca trades recentes da Binance e calcula Smart Money Delta
 */
export async function getSmartMoneyDelta(symbol: string, minutes: number = 15): Promise<SmartMoneyDelta> {
    const endTime = Date.now();
    const startTime = endTime - (minutes * 60 * 1000);

    const url = `https://api.binance.com/api/v3/aggTrades?symbol=${symbol}&startTime=${startTime}&endTime=${endTime}&limit=1000`;

    try {
        const response = await fetch(url);
        const data = await response.json() as any[];

        const trades: TradeData[] = data.map(t => ({
            price: parseFloat(t.p),
            quantity: parseFloat(t.q),
            isBuyerMaker: t.m,
            timestamp: t.T,
        }));

        return calculateSmartMoneyDelta(trades);
    } catch (error) {
        console.error(`[SmartMoneyFilter] Error fetching trades for ${symbol}:`, error);
        return {
            totalDelta: 0,
            smartDelta: 0,
            buyVolume: 0,
            sellVolume: 0,
            smartBuyVolume: 0,
            smartSellVolume: 0,
            whaleTrades: 0,
            smartMoneyBias: 'NEUTRAL',
            divergence: false,
        };
    }
}

/**
 * Formata Smart Money para exibição
 */
export function formatSmartMoney(delta: SmartMoneyDelta): string {
    const smartFlowStr = delta.smartDelta >= 0
        ? `+$${(delta.smartDelta / 1000).toFixed(0)}k`
        : `-$${(Math.abs(delta.smartDelta) / 1000).toFixed(0)}k`;

    const divergenceStr = delta.divergence ? ' ⚠️ DIV' : '';
    const whaleStr = delta.whaleTrades > 0 ? ` 🐋${delta.whaleTrades}` : '';

    return `Smart: ${delta.smartMoneyBias} ${smartFlowStr}${whaleStr}${divergenceStr}`;
}

export default {
    classifyTrade,
    calculateSmartMoneyDelta,
    getSmartMoneyDelta,
    formatSmartMoney,
};
