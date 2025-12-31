/**
 * EoS ML Filter - Cliente TypeScript
 * Integra com a API ML Python para filtrar sinais.
 */

const ML_API_URL = process.env.ML_API_URL || 'http://localhost:5000';

interface SignalFeatures {
    f_volume: number;
    f_momentum: number;
    f_trend: number;
    f_price_context: number;
    f_smart_money: number;
    f_imbalance: number;
    f_absorption: number;
    score: number;
    hour_utc?: number;
}

interface MLPrediction {
    should_execute: boolean;
    probability: number;
    regime_ok: boolean;
    cluster: number;
    reason: string;
}

class MLFilter {
    private enabled: boolean = true;
    private lastCheck: number = 0;
    private apiHealthy: boolean = false;

    constructor() {
        this.checkHealth();
    }

    /**
     * Verifica se a API está disponível
     */
    async checkHealth(): Promise<boolean> {
        try {
            const response = await fetch(`${ML_API_URL}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000),
            });

            if (response.ok) {
                this.apiHealthy = true;
                console.log('[ML] API conectada ✅');
                return true;
            }
        } catch (error) {
            this.apiHealthy = false;
            console.log('[ML] API não disponível - filtro desabilitado');
        }
        return false;
    }

    /**
     * Filtra sinal usando modelo ML
     * Retorna true se o sinal deve ser executado
     */
    async shouldExecute(features: SignalFeatures): Promise<MLPrediction> {
        // Default: aprovar se API não disponível
        const defaultResult: MLPrediction = {
            should_execute: true,
            probability: 0.5,
            regime_ok: true,
            cluster: -1,
            reason: 'ML não disponível - aprovado por default'
        };

        if (!this.enabled || !this.apiHealthy) {
            return defaultResult;
        }

        try {
            // Adicionar hora UTC
            const hourUtc = new Date().getUTCHours();

            const response = await fetch(`${ML_API_URL}/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...features,
                    hour_utc: hourUtc,
                }),
                signal: AbortSignal.timeout(5000),
            });

            if (!response.ok) {
                console.error('[ML] Erro na API:', response.status);
                return defaultResult;
            }

            const prediction = await response.json() as MLPrediction;

            console.log(`[ML] Predição: prob=${(prediction.probability * 100).toFixed(1)}% | ` +
                `regime=${prediction.regime_ok ? '✅' : '❌'} | ` +
                `${prediction.should_execute ? 'APROVAR' : 'REJEITAR'}`);

            return prediction;

        } catch (error) {
            console.error('[ML] Erro:', error);
            return defaultResult;
        }
    }

    /**
     * Habilita/desabilita o filtro ML
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        console.log(`[ML] Filtro ${enabled ? 'habilitado' : 'desabilitado'}`);
    }

    isEnabled(): boolean {
        return this.enabled && this.apiHealthy;
    }
}

// Singleton
export const mlFilter = new MLFilter();
