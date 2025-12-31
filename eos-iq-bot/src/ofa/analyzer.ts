import { TimeSeries, forexData } from '../forexData';
import { config } from '../config';

/**
 * OFA Analyzer - Implementa os 10 indicadores do documento estrategiasbysairon.md
 */

export interface OFAIndicators {
    // Indicadores básicos
    delta: number;                    // Delta atual
    deltaCumulative: number;          // Delta acumulado
    volume: number;                   // Volume total

    // 10 Indicadores avançados
    unfinishedBusiness: boolean;      // 1. Negócios inacabados
    absorptionDetected: boolean;      // 2. Absorção passiva
    stackedImbalances: number;        // 3. Imbalances empilhados
    deltaDivergence: boolean;         // 4. Divergência de delta
    largeLotActivity: boolean;        // 5. Atividade de grandes lotes
    profileShape: 'P' | 'b' | 'D';    // 6. Forma do perfil (P, b, D normal)
    orderBlockNearby: boolean;        // 7. Order block próximo
    vpocMigration: 'UP' | 'DOWN' | 'FLAT'; // 8. Migração do VPOC
    lvnNearby: boolean;               // 9. LVN próximo
    reversalSequence: number;         // 10. Sequência de reversão (0-3)

    // Score final
    score: number;                    // 0-100
    direction: 'CALL' | 'PUT' | 'NEUTRAL';
    confidence: number;               // 0-100
}

export class OFAAnalyzer {
    private priceHistory: Map<string, number[]> = new Map();
    private deltaHistory: Map<string, number[]> = new Map();

    /**
     * Analisa um par e retorna todos os indicadores OFA
     */
    async analyze(pair: string): Promise<OFAIndicators> {
        // Buscar dados históricos
        const timeSeries = await forexData.getTimeSeries(pair, '1min', 30);

        if (timeSeries.length < 5) {
            return this.getEmptyIndicators();
        }

        // Calcular indicadores
        const delta = this.calculateDelta(timeSeries);
        const deltaCumulative = this.calculateCumulativeDelta(timeSeries);
        const volume = this.calculateVolume(timeSeries);

        // 1. Negócios inacabados
        const unfinishedBusiness = this.detectUnfinishedBusiness(timeSeries);

        // 2. Absorção passiva
        const absorptionDetected = this.detectAbsorption(timeSeries, delta);

        // 3. Imbalances empilhados
        const stackedImbalances = this.countStackedImbalances(timeSeries);

        // 4. Divergência de delta
        const deltaDivergence = this.detectDeltaDivergence(timeSeries, deltaCumulative);

        // 5. Grandes lotes
        const largeLotActivity = this.detectLargeLots(volume);

        // 6. Forma do perfil
        const profileShape = this.detectProfileShape(timeSeries);

        // 7. Order block
        const orderBlockNearby = this.detectOrderBlock(timeSeries);

        // 8. Migração VPOC
        const vpocMigration = this.detectVPOCMigration(timeSeries);

        // 9. LVN
        const lvnNearby = this.detectLVN(timeSeries);

        // 10. Sequência de reversão
        const reversalSequence = this.detectReversalSequence(timeSeries, absorptionDetected);

        // Calcular score e direção
        const { score, direction, confidence } = this.calculateScore({
            delta, deltaCumulative, absorptionDetected, deltaDivergence,
            stackedImbalances, vpocMigration, reversalSequence
        });

        return {
            delta,
            deltaCumulative,
            volume,
            unfinishedBusiness,
            absorptionDetected,
            stackedImbalances,
            deltaDivergence,
            largeLotActivity,
            profileShape,
            orderBlockNearby,
            vpocMigration,
            lvnNearby,
            reversalSequence,
            score,
            direction,
            confidence,
        };
    }

    /**
     * 1. Detecta "Negócios Inacabados" - falhas de leilão nos extremos
     */
    private detectUnfinishedBusiness(series: TimeSeries[]): boolean {
        if (series.length < 3) return false;

        const recent = series.slice(0, 3);
        const highestHigh = Math.max(...recent.map(s => s.high));
        const lowestLow = Math.min(...recent.map(s => s.low));

        // Verifica se houve reversão sem completar o leilão
        const lastCandle = recent[0];
        const prevCandle = recent[1];

        // Topo não completado
        if (prevCandle.high === highestHigh && lastCandle.close < prevCandle.high * 0.998) {
            return true;
        }

        // Fundo não completado
        if (prevCandle.low === lowestLow && lastCandle.close > prevCandle.low * 1.002) {
            return true;
        }

        return false;
    }

    /**
     * 2. Detecta Absorção Passiva - alto volume sem movimento de preço
     */
    private detectAbsorption(series: TimeSeries[], delta: number): boolean {
        if (series.length < 2) return false;

        const last = series[0];
        const range = last.high - last.low;
        const body = Math.abs(last.close - last.open);

        // Absorção: delta forte mas preço não move (doji ou corpo pequeno)
        const isSmallBody = body < range * 0.3;
        const isStrongDelta = Math.abs(delta) > config.ofa.deltaThreshold;

        return isSmallBody && isStrongDelta;
    }

    /**
     * 3. Conta Imbalances Empilhados
     */
    private countStackedImbalances(series: TimeSeries[]): number {
        let stacked = 0;

        for (let i = 0; i < Math.min(5, series.length); i++) {
            const candle = series[i];
            const range = candle.high - candle.low;
            const body = Math.abs(candle.close - candle.open);

            // Imbalance: corpo grande (>70% do range)
            if (body > range * 0.7) {
                stacked++;
            } else {
                break; // Parar na primeira vela sem imbalance
            }
        }

        return stacked;
    }

    /**
     * 4. Detecta Divergência de Delta
     */
    private detectDeltaDivergence(series: TimeSeries[], deltaCumulative: number): boolean {
        if (series.length < 5) return false;

        const prices = series.map(s => s.close);
        const priceDirection = prices[0] > prices[4] ? 'UP' : 'DOWN';

        // Divergência: preço sobe mas delta acumulado cai (ou vice-versa)
        if (priceDirection === 'UP' && deltaCumulative < 0) {
            return true; // Bearish divergence
        }
        if (priceDirection === 'DOWN' && deltaCumulative > 0) {
            return true; // Bullish divergence
        }

        return false;
    }

    /**
     * 5. Detecta atividade de Grandes Lotes
     */
    private detectLargeLots(volume: number): boolean {
        return volume > config.ofa.absorptionVolumeMin;
    }

    /**
     * 6. Detecta forma do Perfil de Volume (P, b, D)
     */
    private detectProfileShape(series: TimeSeries[]): 'P' | 'b' | 'D' {
        if (series.length < 10) return 'D';

        const prices = series.map(s => s.close);
        const firstHalf = prices.slice(5);
        const secondHalf = prices.slice(0, 5);

        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        // P = alta seguida de consolidação no topo
        if (secondAvg > firstAvg * 1.002) return 'P';

        // b = baixa seguida de consolidação no fundo
        if (secondAvg < firstAvg * 0.998) return 'b';

        return 'D'; // Normal distribution
    }

    /**
     * 7. Detecta Order Block próximo
     */
    private detectOrderBlock(series: TimeSeries[]): boolean {
        if (series.length < 5) return false;

        // Procura por vela de reversão seguida de movimento forte
        for (let i = 1; i < Math.min(5, series.length - 1); i++) {
            const candle = series[i];
            const nextCandle = series[i - 1];

            const candleDirection = candle.close > candle.open ? 'UP' : 'DOWN';
            const nextDirection = nextCandle.close > nextCandle.open ? 'UP' : 'DOWN';

            // Order block: última vela contrária antes de movimento forte
            if (candleDirection !== nextDirection) {
                const nextBody = Math.abs(nextCandle.close - nextCandle.open);
                const candleBody = Math.abs(candle.close - candle.open);

                if (nextBody > candleBody * 2) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * 8. Detecta Migração do VPOC
     */
    private detectVPOCMigration(series: TimeSeries[]): 'UP' | 'DOWN' | 'FLAT' {
        if (series.length < 10) return 'FLAT';

        // VPOC simplificado: preço médio ponderado
        const recentVPOC = series.slice(0, 5).reduce((a, c) => a + c.close, 0) / 5;
        const oldVPOC = series.slice(5, 10).reduce((a, c) => a + c.close, 0) / 5;

        const diff = (recentVPOC - oldVPOC) / oldVPOC;

        if (diff > 0.001) return 'UP';
        if (diff < -0.001) return 'DOWN';
        return 'FLAT';
    }

    /**
     * 9. Detecta LVN (Low Volume Node) próximo
     */
    private detectLVN(series: TimeSeries[]): boolean {
        if (series.length < 5) return false;

        // Procura por gaps ou movimentos rápidos sem consolidação
        for (let i = 0; i < Math.min(3, series.length - 1); i++) {
            const candle = series[i];
            const range = candle.high - candle.low;
            const body = Math.abs(candle.close - candle.open);

            // LVN: candle com corpo grande e pouca consolidação
            if (body > range * 0.8) {
                return true;
            }
        }

        return false;
    }

    /**
     * 10. Detecta Sequência de Reversão (0-3: Exaustão → Absorção → Iniciativa)
     */
    private detectReversalSequence(series: TimeSeries[], absorptionDetected: boolean): number {
        if (series.length < 3) return 0;

        let sequence = 0;

        // 1. Exaustão: vela com corpo pequeno ou doji
        const last = series[0];
        const prevRange = series[1].high - series[1].low;
        const lastRange = last.high - last.low;

        if (lastRange < prevRange * 0.5) {
            sequence++; // Exaustão detectada
        }

        // 2. Absorção
        if (absorptionDetected) {
            sequence++;
        }

        // 3. Iniciativa: próxima vela com corpo forte na direção oposta
        if (series.length >= 2) {
            const prev = series[1];
            const prevDirection = prev.close > prev.open ? 'UP' : 'DOWN';
            const lastDirection = last.close > last.open ? 'UP' : 'DOWN';

            if (prevDirection !== lastDirection) {
                const lastBody = Math.abs(last.close - last.open);
                if (lastBody > lastRange * 0.6) {
                    sequence++; // Iniciativa detectada
                }
            }
        }

        return sequence;
    }

    /**
     * Calcula Delta (usando variação de preço como proxy)
     */
    private calculateDelta(series: TimeSeries[]): number {
        if (series.length < 2) return 0;

        const last = series[0];
        const direction = last.close > last.open ? 1 : -1;
        const body = Math.abs(last.close - last.open);

        return direction * body * 10000; // Normalizado
    }

    /**
     * Calcula Delta Cumulativo
     */
    private calculateCumulativeDelta(series: TimeSeries[]): number {
        let cumulative = 0;

        for (const candle of series.slice(0, 10)) {
            const direction = candle.close > candle.open ? 1 : -1;
            const body = Math.abs(candle.close - candle.open);
            cumulative += direction * body * 10000;
        }

        return cumulative;
    }

    /**
     * Calcula Volume total (usando range como proxy se não disponível)
     */
    private calculateVolume(series: TimeSeries[]): number {
        return series.slice(0, 5).reduce((sum, c) => {
            return sum + (c.volume || (c.high - c.low) * 100000);
        }, 0);
    }

    /**
     * Calcula Score final e direção
     */
    private calculateScore(indicators: any): { score: number; direction: 'CALL' | 'PUT' | 'NEUTRAL'; confidence: number } {
        let score = 50; // Base
        let direction: 'CALL' | 'PUT' | 'NEUTRAL' = 'NEUTRAL';

        // Ajustar score baseado nos indicadores
        if (indicators.absorptionDetected) score += 10;
        if (indicators.deltaDivergence) score += 15;
        if (indicators.stackedImbalances >= 3) score += 10;
        if (indicators.reversalSequence >= 2) score += 15;

        // Determinar direção baseado no delta (principal) e VPOC (confirmação)
        if (indicators.deltaCumulative > 0) {
            direction = 'CALL';
            if (indicators.vpocMigration === 'UP') score += 10; // Confirmação
        } else if (indicators.deltaCumulative < 0) {
            direction = 'PUT';
            if (indicators.vpocMigration === 'DOWN') score += 10; // Confirmação
        }

        // Confiança baseada na quantidade de confirmações
        let confirmations = 0;
        if (indicators.absorptionDetected) confirmations++;
        if (indicators.deltaDivergence) confirmations++;
        if (indicators.stackedImbalances >= 2) confirmations++;
        if (indicators.reversalSequence >= 1) confirmations++;

        const confidence = Math.min(100, 40 + confirmations * 15);

        return { score: Math.min(100, score), direction, confidence };
    }

    /**
     * Retorna indicadores vazios/default
     */
    private getEmptyIndicators(): OFAIndicators {
        return {
            delta: 0,
            deltaCumulative: 0,
            volume: 0,
            unfinishedBusiness: false,
            absorptionDetected: false,
            stackedImbalances: 0,
            deltaDivergence: false,
            largeLotActivity: false,
            profileShape: 'D',
            orderBlockNearby: false,
            vpocMigration: 'FLAT',
            lvnNearby: false,
            reversalSequence: 0,
            score: 0,
            direction: 'NEUTRAL',
            confidence: 0,
        };
    }

    /**
     * Formata análise para exibição
     */
    formatAnalysis(pair: string, indicators: OFAIndicators): string {
        const emoji = indicators.direction === 'CALL' ? '🟢' : indicators.direction === 'PUT' ? '🔴' : '⚪';

        return `${emoji} *${pair}*
📊 Score: ${indicators.score}/100 (${indicators.confidence}% confiança)
📈 Direção: ${indicators.direction}

*Indicadores:*
• Delta: ${indicators.delta > 0 ? '+' : ''}${indicators.delta.toFixed(0)}
• Absorção: ${indicators.absorptionDetected ? '✅' : '❌'}
• Divergência: ${indicators.deltaDivergence ? '✅' : '❌'}
• Imbalances: ${indicators.stackedImbalances}
• VPOC: ${indicators.vpocMigration}
• Reversão: ${indicators.reversalSequence}/3`;
    }
}

export const ofaAnalyzer = new OFAAnalyzer();
