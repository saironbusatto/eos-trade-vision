/**
 * Imbalance Detector
 * 
 * Detecta Imbalances e Stacked Imbalances conforme metodologia Trader Dale.
 * 
 * Imbalance = Volume de um lado 300%+ maior que o outro
 * Stacked Imbalance = 3+ imbalances consecutivos = sinal forte
 */

import { FootprintCandle, PriceLevel, generateFootprint } from './footprint';

// Ratio mínimo para considerar um imbalance (300% = 3x)
const IMBALANCE_RATIO = 3.0;
// Mínimo de imbalances consecutivos para "stacked"
const MIN_STACKED = 3;

export interface Imbalance {
    price: number;
    ratio: number;          // Ex: 4.5 = Ask foi 450% do Bid
    direction: 'BUY' | 'SELL';
    volumeDiff: number;     // Diferença em USD
}

export interface StackedImbalance {
    count: number;                  // Quantidade de imbalances empilhados
    direction: 'BUY' | 'SELL';
    startPrice: number;
    endPrice: number;
    avgRatio: number;
    strength: 'MODERATE' | 'STRONG' | 'EXTREME';
    priceRange: number;
}

export interface ImbalanceAnalysis {
    imbalances: Imbalance[];
    stackedImbalances: StackedImbalance[];
    buyImbalances: number;
    sellImbalances: number;
    dominantSide: 'BUY' | 'SELL' | 'NEUTRAL';
    hasSignificantStack: boolean;
    score: number;                  // 0-100
}

/**
 * Detecta imbalances em um candle
 * 
 * Usa comparação diagonal: Ask[i] vs Bid[i-1]
 */
export function detectImbalances(priceLevels: PriceLevel[]): Imbalance[] {
    const imbalances: Imbalance[] = [];

    if (priceLevels.length < 2) return imbalances;

    for (let i = 1; i < priceLevels.length; i++) {
        const current = priceLevels[i];
        const previous = priceLevels[i - 1];

        // Comparação diagonal para BUY imbalance:
        // Ask no nível atual vs Bid no nível anterior (acima)
        if (previous.bidVolume > 0 && current.askVolume > 0) {
            const ratio = current.askVolume / previous.bidVolume;

            if (ratio >= IMBALANCE_RATIO) {
                imbalances.push({
                    price: current.price,
                    ratio,
                    direction: 'BUY',
                    volumeDiff: current.askVolume - previous.bidVolume,
                });
            }
        }

        // Comparação diagonal para SELL imbalance:
        // Bid no nível atual vs Ask no nível anterior (abaixo)
        if (previous.askVolume > 0 && current.bidVolume > 0) {
            const ratio = current.bidVolume / previous.askVolume;

            if (ratio >= IMBALANCE_RATIO) {
                imbalances.push({
                    price: current.price,
                    ratio,
                    direction: 'SELL',
                    volumeDiff: current.bidVolume - previous.askVolume,
                });
            }
        }
    }

    return imbalances;
}

/**
 * Detecta Stacked Imbalances (3+ consecutivos)
 */
export function detectStackedImbalances(imbalances: Imbalance[]): StackedImbalance[] {
    const stacks: StackedImbalance[] = [];

    if (imbalances.length < MIN_STACKED) return stacks;

    // Ordenar por preço
    const sorted = [...imbalances].sort((a, b) => b.price - a.price);

    let currentStack: Imbalance[] = [];
    let currentDirection: 'BUY' | 'SELL' | null = null;

    for (const imb of sorted) {
        if (currentStack.length === 0) {
            currentStack.push(imb);
            currentDirection = imb.direction;
        } else if (imb.direction === currentDirection) {
            // Verificar se é consecutivo (preços próximos)
            const lastPrice = currentStack[currentStack.length - 1].price;
            const priceDiff = Math.abs(imb.price - lastPrice);
            const avgPrice = (imb.price + lastPrice) / 2;

            // Considerar consecutivo se diferença < 0.5%
            if (priceDiff / avgPrice < 0.005) {
                currentStack.push(imb);
            } else {
                // Não consecutivo, verificar se stack atual é válida
                if (currentStack.length >= MIN_STACKED) {
                    stacks.push(createStackedImbalance(currentStack));
                }
                currentStack = [imb];
                currentDirection = imb.direction;
            }
        } else {
            // Direção mudou
            if (currentStack.length >= MIN_STACKED) {
                stacks.push(createStackedImbalance(currentStack));
            }
            currentStack = [imb];
            currentDirection = imb.direction;
        }
    }

    // Verificar última stack
    if (currentStack.length >= MIN_STACKED) {
        stacks.push(createStackedImbalance(currentStack));
    }

    return stacks;
}

/**
 * Cria objeto StackedImbalance a partir de lista de imbalances
 */
function createStackedImbalance(imbalances: Imbalance[]): StackedImbalance {
    const prices = imbalances.map(i => i.price);
    const avgRatio = imbalances.reduce((sum, i) => sum + i.ratio, 0) / imbalances.length;

    let strength: 'MODERATE' | 'STRONG' | 'EXTREME';
    if (imbalances.length >= 5 && avgRatio >= 5) {
        strength = 'EXTREME';
    } else if (imbalances.length >= 4 || avgRatio >= 4) {
        strength = 'STRONG';
    } else {
        strength = 'MODERATE';
    }

    return {
        count: imbalances.length,
        direction: imbalances[0].direction,
        startPrice: Math.max(...prices),
        endPrice: Math.min(...prices),
        avgRatio,
        strength,
        priceRange: Math.max(...prices) - Math.min(...prices),
    };
}

/**
 * Análise completa de imbalances para um símbolo
 */
export async function analyzeImbalances(symbol: string): Promise<ImbalanceAnalysis> {
    try {
        const footprint = await generateFootprint(symbol, 60); // 1 hora

        if (footprint.length === 0) {
            return getEmptyAnalysis();
        }

        // Coletar todos os imbalances de todos os candles
        const allImbalances: Imbalance[] = [];

        for (const candle of footprint) {
            const candleImbalances = detectImbalances(candle.priceLevels);
            allImbalances.push(...candleImbalances);
        }

        // Detectar stacked imbalances
        const stackedImbalances = detectStackedImbalances(allImbalances);

        // Contagem por lado
        const buyImbalances = allImbalances.filter(i => i.direction === 'BUY').length;
        const sellImbalances = allImbalances.filter(i => i.direction === 'SELL').length;

        // Determinar lado dominante
        let dominantSide: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
        if (buyImbalances > sellImbalances * 1.5) dominantSide = 'BUY';
        else if (sellImbalances > buyImbalances * 1.5) dominantSide = 'SELL';

        // Verificar se há stacked significativo
        const hasSignificantStack = stackedImbalances.some(s =>
            s.count >= 4 || s.strength === 'STRONG' || s.strength === 'EXTREME'
        );

        // Calcular score (0-100)
        let score = 0;

        // Imbalances totais (max 30 pontos)
        score += Math.min(allImbalances.length * 3, 30);

        // Stacked imbalances (max 50 pontos)
        for (const stack of stackedImbalances) {
            if (stack.strength === 'EXTREME') score += 20;
            else if (stack.strength === 'STRONG') score += 15;
            else score += 10;
        }
        score = Math.min(score, 80);

        // Dominância clara (max 20 pontos)
        if (dominantSide !== 'NEUTRAL') score += 20;

        return {
            imbalances: allImbalances,
            stackedImbalances,
            buyImbalances,
            sellImbalances,
            dominantSide,
            hasSignificantStack,
            score: Math.min(score, 100),
        };

    } catch (error) {
        console.error(`[ImbalanceDetector] Error analyzing ${symbol}:`, error);
        return getEmptyAnalysis();
    }
}

function getEmptyAnalysis(): ImbalanceAnalysis {
    return {
        imbalances: [],
        stackedImbalances: [],
        buyImbalances: 0,
        sellImbalances: 0,
        dominantSide: 'NEUTRAL',
        hasSignificantStack: false,
        score: 0,
    };
}

/**
 * Formata análise para exibição
 */
export function formatImbalanceAnalysis(analysis: ImbalanceAnalysis): string {
    const stackStr = analysis.stackedImbalances.length > 0
        ? ` | Stack: ${analysis.stackedImbalances.length}`
        : '';

    const strengthStr = analysis.hasSignificantStack ? ' 🔥' : '';

    return `Imb: ${analysis.buyImbalances}B/${analysis.sellImbalances}S${stackStr}${strengthStr}`;
}

export default {
    detectImbalances,
    detectStackedImbalances,
    analyzeImbalances,
    formatImbalanceAnalysis,
};
