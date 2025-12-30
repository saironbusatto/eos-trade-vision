/**
 * OFA (Order Flow Analysis) Module Index
 * 
 * Exporta todos os módulos OFA para uso no analyzer principal.
 */

// Smart Money Filter - Filtra trades por tamanho
export {
    getSmartMoneyDelta,
    formatSmartMoney,
    classifyTrade,
    type SmartMoneyDelta,
    type TradeClassification,
} from './smartMoneyFilter';

// Volume Profile - VPOC, Value Area, HVN/LVN
export {
    calculateVolumeProfile,
    formatVolumeProfile,
    getVolumeProfileScore,
    type VolumeProfile,
} from './volumeProfile';

// Footprint - Bid/Ask por candle, Delta cumulativo
export {
    generateFootprint,
    calculateCumulativeDelta,
    detectDeltaDivergence,
    formatFootprintSummary,
    type FootprintCandle,
} from './footprint';

// Imbalance Detector - Stacked Imbalances
export {
    analyzeImbalances,
    formatImbalanceAnalysis,
    type ImbalanceAnalysis,
    type StackedImbalance,
} from './imbalanceDetector';

// Absorption Detector - Acumulação/Distribuição
export {
    analyzeAbsorption,
    hasRecentAbsorption,
    formatAbsorption,
    type AbsorptionAnalysis,
} from './absorptionDetector';

/**
 * Análise OFA completa para um símbolo
 */
export interface CompleteOFAAnalysis {
    symbol: string;
    timestamp: number;

    // Scores individuais (0-100)
    smartMoneyScore: number;
    volumeProfileScore: number;
    imbalanceScore: number;
    absorptionScore: number;

    // Score final ponderado
    totalScore: number;

    // Direção sugerida
    suggestedDirection: 'LONG' | 'SHORT' | 'NEUTRAL';

    // Confiança
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';

    // Dados detalhados
    smartMoney: import('./smartMoneyFilter').SmartMoneyDelta;
    volumeProfile: import('./volumeProfile').VolumeProfile;
    imbalances: import('./imbalanceDetector').ImbalanceAnalysis;
    absorption: import('./absorptionDetector').AbsorptionAnalysis;

    // Summary para exibição
    summary: string;
}

/**
 * Executa análise OFA completa
 */
export async function runCompleteOFAAnalysis(
    symbol: string,
    currentPrice: number
): Promise<CompleteOFAAnalysis> {
    const timestamp = Date.now();

    // Executar todas as análises em paralelo
    const [smartMoney, volumeProfile, imbalances, absorption] = await Promise.all([
        import('./smartMoneyFilter').then(m => m.getSmartMoneyDelta(symbol)),
        import('./volumeProfile').then(m => m.calculateVolumeProfile(symbol, currentPrice)),
        import('./imbalanceDetector').then(m => m.analyzeImbalances(symbol)),
        import('./absorptionDetector').then(m => m.analyzeAbsorption(symbol)),
    ]);

    // Calcular scores (exceto volumeProfile que precisa da direção)
    const smartMoneyScore = calculateSmartMoneyScore(smartMoney);
    const imbalanceScore = imbalances.score;
    const absorptionScore = absorption.score;

    // Determinar direção sugerida primeiro
    let suggestedDirection: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';

    // Smart Money bias
    if (smartMoney.smartMoneyBias === 'BULLISH') {
        suggestedDirection = 'LONG';
    } else if (smartMoney.smartMoneyBias === 'BEARISH') {
        suggestedDirection = 'SHORT';
    }

    // Volume Profile contexto
    if (volumeProfile.priceContext === 'ABOVE_VA' && suggestedDirection !== 'SHORT') {
        suggestedDirection = 'LONG';
    } else if (volumeProfile.priceContext === 'BELOW_VA' && suggestedDirection !== 'LONG') {
        suggestedDirection = 'SHORT';
    }

    // Imbalances override (sinal muito forte)
    if (imbalances.hasSignificantStack) {
        if (imbalances.dominantSide === 'BUY') suggestedDirection = 'LONG';
        else if (imbalances.dominantSide === 'SELL') suggestedDirection = 'SHORT';
    }

    // Agora calcular volumeProfileScore com a direção definida
    const { getVolumeProfileScore } = await import('./volumeProfile');
    const volumeProfileScore = getVolumeProfileScore(volumeProfile, suggestedDirection !== 'SHORT' ? 'LONG' : 'SHORT');

    // Score total ponderado
    const weights = {
        smartMoney: 25,
        volumeProfile: 20,
        imbalance: 35,      // Peso maior para imbalances
        absorption: 20,
    };

    const totalScore = Math.round(
        (smartMoneyScore * weights.smartMoney +
            volumeProfileScore * weights.volumeProfile +
            imbalanceScore * weights.imbalance +
            absorptionScore * weights.absorption) / 100
    );

    // Confiança baseada no score e concordância dos indicadores
    let confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    if (totalScore >= 75 && imbalances.hasSignificantStack) {
        confidence = 'HIGH';
    } else if (totalScore >= 60) {
        confidence = 'MEDIUM';
    } else {
        confidence = 'LOW';
    }

    // Summary
    const summary = `OFA: ${totalScore}% | SM: ${smartMoney.smartMoneyBias} | VP: ${volumeProfile.priceContext} | Imb: ${imbalances.score}%`;

    return {
        symbol,
        timestamp,
        smartMoneyScore,
        volumeProfileScore,
        imbalanceScore,
        absorptionScore,
        totalScore,
        suggestedDirection,
        confidence,
        smartMoney,
        volumeProfile,
        imbalances,
        absorption,
        summary,
    };
}

/**
 * Calcula score do Smart Money (0-100)
 */
function calculateSmartMoneyScore(sm: import('./smartMoneyFilter').SmartMoneyDelta): number {
    let score = 50; // Base

    // Bias claro (+-20)
    if (sm.smartMoneyBias === 'BULLISH' || sm.smartMoneyBias === 'BEARISH') {
        score += 20;
    }

    // Whale trades (+-20)
    if (sm.whaleTrades > 0) {
        score += Math.min(sm.whaleTrades * 10, 20);
    }

    // Divergência varejo vs smart (+-10)
    if (sm.divergence) {
        score += 10; // Divergência pode indicar reversão
    }

    return Math.min(Math.max(score, 0), 100);
}
