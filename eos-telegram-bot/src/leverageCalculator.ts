/**
 * Calculador de Alavancagem e Posição para Futures
 * 
 * Features:
 * - Cálculo de posição baseado em risco
 * - Taxas Maker vs Taker
 * - Funding rate atual da Binance
 * - Sugestão de preço limite (Maker)
 */

// Binance Futures fees (Regular tier)
const MAKER_FEE = 0.0002; // 0.02%
const TAKER_FEE = 0.0004; // 0.04%

export type OrderType = 'MAKER' | 'TAKER';

export interface PositionResult {
    // Posição
    positionSize: number;
    leverage: number;
    riskAmount: number;
    orderType: OrderType;

    // Preços
    entryPrice: number;
    limitPrice: number;      // Preço sugerido para ordem limite
    stopPrice: number;
    targetPrice: number;

    // Lucro/Prejuízo
    potentialProfit: number;
    potentialLoss: number;
    profitPercent: number;
    lossPercent: number;

    // Taxas
    entryFee: number;
    exitFee: number;
    totalFees: number;
    netProfit: number;

    // Funding
    fundingRate: number;     // Taxa atual (ex: 0.0001 = 0.01%)
    fundingCost8h: number;   // Custo por 8h
    fundingCostDay: number;  // Custo por dia

    // Risk/Reward
    riskReward: number;
}

/**
 * Busca funding rate atual da Binance
 */
export async function getFundingRate(symbol: string): Promise<number> {
    try {
        const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`;
        const response = await fetch(url);
        const data = await response.json() as { fundingRate: string }[];

        if (data && data.length > 0) {
            return parseFloat(data[0].fundingRate);
        }
        return 0.0001; // Default 0.01%
    } catch {
        return 0.0001;
    }
}

/**
 * Calcula preço limite sugerido (para ordem Maker)
 * Sugere um preço 0.05% melhor que o mercado
 */
export function suggestLimitPrice(
    marketPrice: number,
    direction: 'LONG' | 'SHORT',
    spreadPercent: number = 0.05
): number {
    if (direction === 'LONG') {
        // Compra: sugere preço um pouco abaixo do mercado
        return marketPrice * (1 - spreadPercent / 100);
    } else {
        // Venda: sugere preço um pouco acima do mercado
        return marketPrice * (1 + spreadPercent / 100);
    }
}

/**
 * Calcula posição completa
 */
export function calculatePosition(
    bankroll: number,
    riskPercent: number,
    entryPrice: number,
    stopPercent: number,
    targetPercent: number,
    direction: 'LONG' | 'SHORT',
    orderType: OrderType = 'TAKER',
    fundingRate: number = 0.0001
): PositionResult {
    // Taxa baseada no tipo de ordem
    const fee = orderType === 'MAKER' ? MAKER_FEE : TAKER_FEE;

    // Risco em USD
    const riskAmount = bankroll * (riskPercent / 100);

    // Preços
    const stopPrice = direction === 'LONG'
        ? entryPrice * (1 - stopPercent / 100)
        : entryPrice * (1 + stopPercent / 100);

    const targetPrice = direction === 'LONG'
        ? entryPrice * (1 + targetPercent / 100)
        : entryPrice * (1 - targetPercent / 100);

    // Preço limite sugerido
    const limitPrice = suggestLimitPrice(entryPrice, direction);

    // Tamanho da posição
    const positionSize = riskAmount / (stopPercent / 100);

    // Alavancagem
    let leverage = positionSize / bankroll;
    leverage = Math.min(Math.max(Math.ceil(leverage), 1), 20);

    const actualPositionSize = bankroll * leverage;

    // Lucro/prejuízo
    const potentialProfit = actualPositionSize * (targetPercent / 100);
    const potentialLoss = actualPositionSize * (stopPercent / 100);

    // Taxas de trading
    const entryFee = actualPositionSize * fee;
    const exitFee = actualPositionSize * fee;
    const totalFees = entryFee + exitFee;

    // Funding costs
    const fundingCost8h = actualPositionSize * Math.abs(fundingRate);
    const fundingCostDay = fundingCost8h * 3;

    // Lucro líquido (sem funding, que depende do tempo)
    const netProfit = potentialProfit - totalFees;

    // % da banca
    const profitPercent = (netProfit / bankroll) * 100;
    const lossPercent = ((potentialLoss + totalFees) / bankroll) * 100;

    // Risk/Reward
    const riskReward = targetPercent / stopPercent;

    return {
        positionSize: actualPositionSize,
        leverage,
        riskAmount,
        orderType,
        entryPrice,
        limitPrice,
        stopPrice,
        targetPrice,
        potentialProfit,
        potentialLoss,
        profitPercent,
        lossPercent,
        entryFee,
        exitFee,
        totalFees,
        netProfit,
        fundingRate,
        fundingCost8h,
        fundingCostDay,
        riskReward,
    };
}

/**
 * Formata para mensagem Telegram
 */
export function formatPositionForTelegram(
    calc: PositionResult,
    symbol: string,
    direction: 'LONG' | 'SHORT'
): string {
    const dir = direction === 'LONG' ? 'COMPRA' : 'VENDA';
    const fundingStr = (calc.fundingRate * 100).toFixed(4);
    const feeType = calc.orderType === 'MAKER' ? 'Limite' : 'Mercado';

    return `
*Futures ${calc.leverage}x* (${feeType})

Entry: $${calc.entryPrice.toFixed(2)}
Limite: $${calc.limitPrice.toFixed(2)} (economia ~50% taxa)
Stop: $${calc.stopPrice.toFixed(2)}
Alvo: $${calc.targetPrice.toFixed(2)}

WIN: +$${calc.netProfit.toFixed(2)} (+${calc.profitPercent.toFixed(1)}%)
LOSS: -$${(calc.potentialLoss + calc.totalFees).toFixed(2)} (-${calc.lossPercent.toFixed(1)}%)

Taxas: $${calc.totalFees.toFixed(2)}
Funding: ${fundingStr}% (8h) = $${calc.fundingCost8h.toFixed(2)}
R:R = ${calc.riskReward.toFixed(1)}:1
`.trim();
}

export default { calculatePosition, getFundingRate, suggestLimitPrice, formatPositionForTelegram };
