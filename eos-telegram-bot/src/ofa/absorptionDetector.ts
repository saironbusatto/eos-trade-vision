/**
 * Absorption Detector
 * 
 * Detecta absorção institucional: grande volume sem movimento de preço.
 * 
 * Absorção = Instituição comprando/vendendo sem mover o preço
 * = Acumulação (antes de alta) ou Distribuição (antes de queda)
 */

import { FootprintCandle, generateFootprint } from './footprint';

// Thresholds
const VOLUME_MULTIPLIER = 2.0;      // Volume 2x acima da média
const MAX_PRICE_MOVE = 0.002;       // Movimento máximo: 0.2%

export interface Absorption {
    detected: boolean;
    timestamp: number;
    volume: number;
    avgVolume: number;
    volumeRatio: number;
    priceMove: number;              // Movimento em %
    interpretation: 'ACCUMULATION' | 'DISTRIBUTION' | 'NONE';
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    delta: number;                  // Delta do período
}

export interface AbsorptionAnalysis {
    absorptions: Absorption[];
    totalAbsorptions: number;
    dominantType: 'ACCUMULATION' | 'DISTRIBUTION' | 'MIXED';
    score: number;                  // 0-100
    summary: string;
}

/**
 * Detecta absorção em um candle
 */
function detectAbsorption(
    candle: FootprintCandle,
    avgVolume: number,
    prevCandle?: FootprintCandle
): Absorption | null {
    // Volume deve ser acima da média
    const volumeRatio = candle.totalVolume / avgVolume;
    if (volumeRatio < VOLUME_MULTIPLIER) return null;

    // Movimento de preço deve ser pequeno
    const priceMove = Math.abs(candle.close - candle.open) / candle.open;
    if (priceMove > MAX_PRICE_MOVE) return null;

    // Absorção detectada!
    // Determinar se é acumulação ou distribuição baseado no delta
    let interpretation: 'ACCUMULATION' | 'DISTRIBUTION' | 'NONE' = 'NONE';

    if (candle.delta > 0) {
        // Delta positivo + preço não subiu = absorção de venda (acumulação)
        interpretation = 'ACCUMULATION';
    } else if (candle.delta < 0) {
        // Delta negativo + preço não caiu = absorção de compra (distribuição)
        interpretation = 'DISTRIBUTION';
    }

    // Calcular confiança
    let confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    if (volumeRatio >= 3 && priceMove < 0.001) {
        confidence = 'HIGH';
    } else if (volumeRatio >= 2.5) {
        confidence = 'MEDIUM';
    } else {
        confidence = 'LOW';
    }

    return {
        detected: true,
        timestamp: candle.timestamp,
        volume: candle.totalVolume,
        avgVolume,
        volumeRatio,
        priceMove: priceMove * 100, // Em %
        interpretation,
        confidence,
        delta: candle.delta,
    };
}

/**
 * Análise completa de absorção para um símbolo
 */
export async function analyzeAbsorption(symbol: string): Promise<AbsorptionAnalysis> {
    try {
        const footprint = await generateFootprint(symbol, 120); // 2 horas

        if (footprint.length < 5) {
            return getEmptyAnalysis();
        }

        // Calcular volume médio
        const avgVolume = footprint.reduce((sum, c) => sum + c.totalVolume, 0) / footprint.length;

        // Detectar absorções
        const absorptions: Absorption[] = [];

        for (let i = 1; i < footprint.length; i++) {
            const absorption = detectAbsorption(footprint[i], avgVolume, footprint[i - 1]);
            if (absorption) {
                absorptions.push(absorption);
            }
        }

        // Determinar tipo dominante
        const accumulations = absorptions.filter(a => a.interpretation === 'ACCUMULATION').length;
        const distributions = absorptions.filter(a => a.interpretation === 'DISTRIBUTION').length;

        let dominantType: 'ACCUMULATION' | 'DISTRIBUTION' | 'MIXED';
        if (accumulations > distributions * 1.5) {
            dominantType = 'ACCUMULATION';
        } else if (distributions > accumulations * 1.5) {
            dominantType = 'DISTRIBUTION';
        } else {
            dominantType = 'MIXED';
        }

        // Calcular score (0-100)
        let score = 0;

        // Quantidade de absorções (max 40 pontos)
        score += Math.min(absorptions.length * 10, 40);

        // Confiança das absorções (max 40 pontos)
        for (const absorption of absorptions) {
            if (absorption.confidence === 'HIGH') score += 15;
            else if (absorption.confidence === 'MEDIUM') score += 10;
            else score += 5;
        }
        score = Math.min(score, 80);

        // Tipo dominante claro (max 20 pontos)
        if (dominantType !== 'MIXED') score += 20;

        // Summary
        const summary = absorptions.length > 0
            ? `${absorptions.length} absorção(ões), ${dominantType}`
            : 'Nenhuma absorção detectada';

        return {
            absorptions,
            totalAbsorptions: absorptions.length,
            dominantType,
            score: Math.min(score, 100),
            summary,
        };

    } catch (error) {
        console.error(`[AbsorptionDetector] Error analyzing ${symbol}:`, error);
        return getEmptyAnalysis();
    }
}

function getEmptyAnalysis(): AbsorptionAnalysis {
    return {
        absorptions: [],
        totalAbsorptions: 0,
        dominantType: 'MIXED',
        score: 0,
        summary: 'No data',
    };
}

/**
 * Detecta absorção recente (última hora)
 */
export async function hasRecentAbsorption(symbol: string): Promise<{
    hasAbsorption: boolean;
    type: 'ACCUMULATION' | 'DISTRIBUTION' | 'NONE';
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}> {
    const analysis = await analyzeAbsorption(symbol);

    if (analysis.absorptions.length === 0) {
        return { hasAbsorption: false, type: 'NONE', confidence: 'LOW' };
    }

    // Pegar última absorção
    const recent = analysis.absorptions[analysis.absorptions.length - 1];
    const ageMinutes = (Date.now() - recent.timestamp) / (60 * 1000);

    // Só considerar se for dos últimos 30 minutos
    if (ageMinutes > 30) {
        return { hasAbsorption: false, type: 'NONE', confidence: 'LOW' };
    }

    return {
        hasAbsorption: true,
        type: recent.interpretation,
        confidence: recent.confidence,
    };
}

/**
 * Formata absorção para exibição
 */
export function formatAbsorption(analysis: AbsorptionAnalysis): string {
    if (analysis.totalAbsorptions === 0) return 'Abs: -';

    const emoji = analysis.dominantType === 'ACCUMULATION' ? '📥' :
        analysis.dominantType === 'DISTRIBUTION' ? '📤' : '🔄';

    return `Abs: ${analysis.totalAbsorptions} ${emoji} ${analysis.dominantType}`;
}

export default {
    analyzeAbsorption,
    hasRecentAbsorption,
    formatAbsorption,
};
