/**
 * Smart Money Filter
 * 
 * Filtra trades por tamanho para focar em ordens institucionais
 * e reduzir ruido de varejo.
 * 
 * Baseado em: Trade Filter (Trader Dale / Michael Valtos)
 * 
 * REFATORADO: Agora usa DataService (buffer 60min) em vez de REST direto.
 */

import { getDataService, TradeData } from '../engine/DataService';

// Thresholds em USD
const THRESHOLDS = {
    IGNORE: 500,        // < $500 = ignorar (ruido)
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
    dataSource: 'BUFFER' | 'REST'; // Indica de onde vieram os dados
    tradeCount: number;         // Quantidade de trades analisados
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

        // Determinar direcao (isBuyerMaker = false significa comprador agrediu)
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

    // Detectar divergencia (varejo vs smart money)
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
        dataSource: 'BUFFER',
        tradeCount: trades.length
    };
}

/**
 * Busca trades do DataService (buffer 60min) e calcula Smart Money Delta
 * REFATORADO: Nao faz mais REST direto, usa o buffer em memoria
 */
export async function getSmartMoneyDelta(symbol: string, minutes: number = 15): Promise<SmartMoneyDelta> {
    const dataService = getDataService();

    // Verificar se simbolo esta pronto
    if (!dataService.isReady(symbol)) {
        console.warn(`[SmartMoneyFilter] Symbol ${symbol} not ready, returning neutral`);
        return createNeutralDelta('BUFFER');
    }

    // Obter trades do buffer
    const trades = dataService.getTrades(symbol, minutes);

    if (trades.length === 0) {
        console.warn(`[SmartMoneyFilter] No trades for ${symbol}`);
        return createNeutralDelta('BUFFER');
    }

    console.log(`[SmartMoneyFilter] Analyzing ${trades.length} trades for ${symbol} (${minutes}min window)`);

    return calculateSmartMoneyDelta(trades);
}

/**
 * Fallback REST para quando DataService nao esta disponivel
 * Mantido para compatibilidade mas MARCADO como deprecated
 * @deprecated Use getSmartMoneyDelta que usa o buffer
 */
export async function getSmartMoneyDeltaLegacy(symbol: string, minutes: number = 15): Promise<SmartMoneyDelta> {
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

        const result = calculateSmartMoneyDelta(trades);
        result.dataSource = 'REST';
        return result;
    } catch (error) {
        console.error(`[SmartMoneyFilter] Error fetching trades for ${symbol}:`, error);
        return createNeutralDelta('REST');
    }
}

function createNeutralDelta(source: 'BUFFER' | 'REST'): SmartMoneyDelta {
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
        dataSource: source,
        tradeCount: 0
    };
}

/**
 * Formata Smart Money para exibicao
 */
export function formatSmartMoney(delta: SmartMoneyDelta): string {
    const smartFlowStr = delta.smartDelta >= 0
        ? `+$${(delta.smartDelta / 1000).toFixed(0)}k`
        : `-$${(Math.abs(delta.smartDelta) / 1000).toFixed(0)}k`;

    const divergenceStr = delta.divergence ? ' DIV' : '';
    const whaleStr = delta.whaleTrades > 0 ? ` W${delta.whaleTrades}` : '';
    const sourceStr = delta.dataSource === 'BUFFER' ? '' : ' [REST]';

    return `Smart: ${delta.smartMoneyBias} ${smartFlowStr}${whaleStr}${divergenceStr}${sourceStr}`;
}

export default {
    classifyTrade,
    calculateSmartMoneyDelta,
    getSmartMoneyDelta,
    getSmartMoneyDeltaLegacy,
    formatSmartMoney,
};
