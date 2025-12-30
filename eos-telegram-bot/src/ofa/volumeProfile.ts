/**
 * Volume Profile Calculator
 * 
 * Calcula VPOC (Volume Point of Control), Value Area, HVN e LVN
 * para contexto de preço no mercado.
 * 
 * Baseado em: Market Profile / Volume Profile (Trader Dale)
 */

export interface VolumeProfile {
    vpoc: number;               // Preço com maior volume (Point of Control)
    valueAreaHigh: number;      // Limite superior da Value Area (68.2%)
    valueAreaLow: number;       // Limite inferior da Value Area (68.2%)
    hvNodes: number[];          // High Volume Nodes (resistência/suporte forte)
    lvNodes: number[];          // Low Volume Nodes (áreas de rápido movimento)
    totalVolume: number;        // Volume total analisado
    priceContext: 'ABOVE_VA' | 'INSIDE_VA' | 'BELOW_VA';
    bins: VolumeBin[];          // Distribuição de volume por preço
}

export interface VolumeBin {
    priceLevel: number;         // Preço central do bin
    volume: number;             // Volume neste nível
    buyVolume: number;          // Volume de compra
    sellVolume: number;         // Volume de venda
    percentOfTotal: number;     // % do volume total
}

interface KlineData {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quoteVolume: number;
}

// Número de bins (faixas de preço) para o profile
const NUM_BINS = 50;
// Value Area = 68.2% do volume (1 desvio padrão)
const VALUE_AREA_PERCENT = 0.682;

/**
 * Busca klines da Binance
 */
async function fetchKlines(symbol: string, interval: string, limit: number): Promise<KlineData[]> {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

    const response = await fetch(url);
    const data = await response.json() as any[];

    return data.map(k => ({
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        quoteVolume: parseFloat(k[7]),
    }));
}

/**
 * Cria bins (faixas de preço) para o Volume Profile
 */
function createBins(klines: KlineData[]): VolumeBin[] {
    // Encontrar range de preço
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    for (const k of klines) {
        if (k.low < minPrice) minPrice = k.low;
        if (k.high > maxPrice) maxPrice = k.high;
    }

    const priceRange = maxPrice - minPrice;
    const binSize = priceRange / NUM_BINS;

    // Criar bins vazios
    const bins: VolumeBin[] = [];
    for (let i = 0; i < NUM_BINS; i++) {
        bins.push({
            priceLevel: minPrice + (i + 0.5) * binSize,
            volume: 0,
            buyVolume: 0,
            sellVolume: 0,
            percentOfTotal: 0,
        });
    }

    // Distribuir volume nos bins
    // Simplificação: distribuir volume da kline uniformemente entre high e low
    for (const k of klines) {
        const isBullish = k.close > k.open;
        const volumePerBin = k.quoteVolume;

        // Encontrar bins que cobrem o range da vela
        for (const bin of bins) {
            if (bin.priceLevel >= k.low && bin.priceLevel <= k.high) {
                // Distribuir proporcionalmente
                const binsInRange = bins.filter(b => b.priceLevel >= k.low && b.priceLevel <= k.high).length;
                const volumeForThisBin = volumePerBin / Math.max(binsInRange, 1);

                bin.volume += volumeForThisBin;

                if (isBullish) {
                    bin.buyVolume += volumeForThisBin * 0.6;
                    bin.sellVolume += volumeForThisBin * 0.4;
                } else {
                    bin.buyVolume += volumeForThisBin * 0.4;
                    bin.sellVolume += volumeForThisBin * 0.6;
                }
            }
        }
    }

    // Calcular % do total
    const totalVolume = bins.reduce((sum, b) => sum + b.volume, 0);
    for (const bin of bins) {
        bin.percentOfTotal = totalVolume > 0 ? bin.volume / totalVolume : 0;
    }

    return bins;
}

/**
 * Encontra o VPOC (Volume Point of Control)
 */
function findVPOC(bins: VolumeBin[]): number {
    let maxVolume = 0;
    let vpoc = 0;

    for (const bin of bins) {
        if (bin.volume > maxVolume) {
            maxVolume = bin.volume;
            vpoc = bin.priceLevel;
        }
    }

    return vpoc;
}

/**
 * Calcula a Value Area (68.2% do volume centralizado no VPOC)
 */
function calculateValueArea(bins: VolumeBin[], vpoc: number): { high: number; low: number } {
    const totalVolume = bins.reduce((sum, b) => sum + b.volume, 0);
    const targetVolume = totalVolume * VALUE_AREA_PERCENT;

    // Ordenar bins por distância do VPOC
    const sortedBins = [...bins].sort((a, b) =>
        Math.abs(a.priceLevel - vpoc) - Math.abs(b.priceLevel - vpoc)
    );

    // Adicionar bins até atingir 68.2%
    let accumulatedVolume = 0;
    const includedBins: VolumeBin[] = [];

    for (const bin of sortedBins) {
        includedBins.push(bin);
        accumulatedVolume += bin.volume;

        if (accumulatedVolume >= targetVolume) break;
    }

    // Encontrar high e low da Value Area
    const prices = includedBins.map(b => b.priceLevel);

    return {
        high: Math.max(...prices),
        low: Math.min(...prices),
    };
}

/**
 * Encontra HVN (High Volume Nodes) e LVN (Low Volume Nodes)
 */
function findNodes(bins: VolumeBin[]): { hvNodes: number[]; lvNodes: number[] } {
    const avgVolume = bins.reduce((sum, b) => sum + b.volume, 0) / bins.length;

    const hvNodes: number[] = [];
    const lvNodes: number[] = [];

    for (let i = 1; i < bins.length - 1; i++) {
        const prev = bins[i - 1].volume;
        const curr = bins[i].volume;
        const next = bins[i + 1].volume;

        // HVN: pico local com volume acima da média
        if (curr > prev && curr > next && curr > avgVolume * 1.5) {
            hvNodes.push(bins[i].priceLevel);
        }

        // LVN: vale local com volume abaixo da média
        if (curr < prev && curr < next && curr < avgVolume * 0.5) {
            lvNodes.push(bins[i].priceLevel);
        }
    }

    return { hvNodes, lvNodes };
}

/**
 * Determina o contexto do preço atual em relação à Value Area
 */
function getPriceContext(currentPrice: number, vaHigh: number, vaLow: number): 'ABOVE_VA' | 'INSIDE_VA' | 'BELOW_VA' {
    if (currentPrice > vaHigh) return 'ABOVE_VA';
    if (currentPrice < vaLow) return 'BELOW_VA';
    return 'INSIDE_VA';
}

/**
 * Calcula o Volume Profile completo para um símbolo
 */
export async function calculateVolumeProfile(symbol: string, currentPrice: number): Promise<VolumeProfile> {
    try {
        // Buscar 100 klines de 15m = 25 horas de dados
        const klines = await fetchKlines(symbol, '15m', 100);

        if (klines.length < 20) {
            throw new Error('Insufficient kline data');
        }

        // Criar bins
        const bins = createBins(klines);

        // Encontrar VPOC
        const vpoc = findVPOC(bins);

        // Calcular Value Area
        const { high: valueAreaHigh, low: valueAreaLow } = calculateValueArea(bins, vpoc);

        // Encontrar nodes
        const { hvNodes, lvNodes } = findNodes(bins);

        // Contexto do preço atual
        const priceContext = getPriceContext(currentPrice, valueAreaHigh, valueAreaLow);

        // Volume total
        const totalVolume = bins.reduce((sum, b) => sum + b.volume, 0);

        return {
            vpoc,
            valueAreaHigh,
            valueAreaLow,
            hvNodes: hvNodes.slice(0, 3), // Top 3 HVN
            lvNodes: lvNodes.slice(0, 3), // Top 3 LVN
            totalVolume,
            priceContext,
            bins,
        };

    } catch (error) {
        console.error(`[VolumeProfile] Error calculating for ${symbol}:`, error);

        // Return empty profile
        return {
            vpoc: currentPrice,
            valueAreaHigh: currentPrice * 1.01,
            valueAreaLow: currentPrice * 0.99,
            hvNodes: [],
            lvNodes: [],
            totalVolume: 0,
            priceContext: 'INSIDE_VA',
            bins: [],
        };
    }
}

/**
 * Formata Volume Profile para exibição
 */
export function formatVolumeProfile(profile: VolumeProfile, currentPrice: number): string {
    const contextEmoji = {
        'ABOVE_VA': '📈',
        'INSIDE_VA': '🔄',
        'BELOW_VA': '📉',
    };

    const distanceToVPOC = ((currentPrice - profile.vpoc) / profile.vpoc * 100).toFixed(2);
    const vpocDir = parseFloat(distanceToVPOC) >= 0 ? '+' : '';

    return `VPOC: $${profile.vpoc.toFixed(2)} (${vpocDir}${distanceToVPOC}%)
VA: $${profile.valueAreaLow.toFixed(2)} - $${profile.valueAreaHigh.toFixed(2)}
Contexto: ${profile.priceContext} ${contextEmoji[profile.priceContext]}`;
}

/**
 * Calcula score baseado no Volume Profile
 * 
 * - Preço acima da VA + tendência de alta = bullish (score alto)
 * - Preço dentro da VA = consolidação (score neutro)
 * - Preço abaixo da VA + tendência de baixa = bearish (score alto para short)
 */
export function getVolumeProfileScore(profile: VolumeProfile, direction: 'LONG' | 'SHORT'): number {
    let score = 0;

    // Contexto do preço (0-40 pontos)
    if (direction === 'LONG') {
        if (profile.priceContext === 'ABOVE_VA') score += 40;
        else if (profile.priceContext === 'INSIDE_VA') score += 20;
        else score += 5;
    } else {
        if (profile.priceContext === 'BELOW_VA') score += 40;
        else if (profile.priceContext === 'INSIDE_VA') score += 20;
        else score += 5;
    }

    return score;
}

export default {
    calculateVolumeProfile,
    formatVolumeProfile,
    getVolumeProfileScore,
};
