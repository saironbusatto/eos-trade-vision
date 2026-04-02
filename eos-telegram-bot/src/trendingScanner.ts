import { telegram } from "./telegram";
import { sqliteDatabase } from "./sqliteDatabase";
import { getRandomQuote } from "./quotes";
import { calculatePosition, getFundingRate } from "./leverageCalculator";
import { getMacroAnalysis, getMacroForDB } from "./macroAnalyzer";
import { getDataService } from "./engine";
import { mlService } from "./mlService";
import { collectExitFeatures, fetchCounterfactualPrices, makeExitDecision, USE_ML_EXIT } from "./exitDecisionEngine";

// Default bankroll for calculations (user can override)
const DEFAULT_BANKROLL = 1000; // $1000
const RISK_PERCENT = 2; // Arriscar 2% por trade

function envNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
    const raw = process.env[name];
    if (raw == null) return fallback;
    return raw.toLowerCase() === 'true';
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

const RISK_STOP_MIN_PERCENT = envNumber('RISK_STOP_MIN_PERCENT', 0.45);
const RISK_STOP_MAX_PERCENT = envNumber('RISK_STOP_MAX_PERCENT', 0.95);
const RISK_TARGET_MIN_PERCENT = envNumber('RISK_TARGET_MIN_PERCENT', 0.35);
const RISK_TARGET_MAX_PERCENT = envNumber('RISK_TARGET_MAX_PERCENT', 0.90);
const RISK_TARGET_STOP_RATIO = envNumber('RISK_TARGET_STOP_RATIO', 0.80);
const RISK_VOL_TO_STOP_MULTIPLIER = envNumber('RISK_VOL_TO_STOP_MULTIPLIER', 0.70);
const ENABLE_HOUR_DIRECTION_FILTER = envBool('ENABLE_HOUR_DIRECTION_FILTER', true);
const HOUR_DIRECTION_MIN_TRADES = envNumber('HOUR_DIRECTION_MIN_TRADES', 80);
const HOUR_DIRECTION_MIN_WINRATE = envNumber('HOUR_DIRECTION_MIN_WINRATE', 52);
const HOUR_DIRECTION_MIN_WINRATE_CI95_LOW = envNumber('HOUR_DIRECTION_MIN_WINRATE_CI95_LOW', 45);
const ENABLE_EXPECTANCY_GATE = envBool('ENABLE_EXPECTANCY_GATE', true);
const HOUR_DIRECTION_MIN_EXPECTANCY_CI95_LOW = envNumber('HOUR_DIRECTION_MIN_EXPECTANCY_CI95_LOW', 0);
const ENGINE_TARGET_COVERAGE_SEC = envNumber('ENGINE_TARGET_COVERAGE_SEC', 3300);
const ENABLE_UNIFIED_DECISION_SCORE = envBool('ENABLE_UNIFIED_DECISION_SCORE', true);
const UNIFIED_DECISION_MIN_SCORE = envNumber('UNIFIED_DECISION_MIN_SCORE', 0.62);
const UNIFIED_SCORE_WEIGHT_OFA = envNumber('UNIFIED_SCORE_WEIGHT_OFA', 0.30);
const UNIFIED_SCORE_WEIGHT_ML = envNumber('UNIFIED_SCORE_WEIGHT_ML', 0.30);
const UNIFIED_SCORE_WEIGHT_EDGE = envNumber('UNIFIED_SCORE_WEIGHT_EDGE', 0.20);
const UNIFIED_SCORE_WEIGHT_REGIME = envNumber('UNIFIED_SCORE_WEIGHT_REGIME', 0.10);
const UNIFIED_SCORE_WEIGHT_SENTIMENT = envNumber('UNIFIED_SCORE_WEIGHT_SENTIMENT', 0.10);
const UNIFIED_SCORE_SENTIMENT_WINDOW_MIN = Math.max(30, envNumber('UNIFIED_SCORE_SENTIMENT_WINDOW_MIN', 180));
const UNIFIED_SCORE_SENTIMENT_MIN_IMPACT = Math.max(1, envNumber('UNIFIED_SCORE_SENTIMENT_MIN_IMPACT', 4));
const UNIFIED_SCORE_REQUIRE_ML_APPROVAL = envBool('UNIFIED_SCORE_REQUIRE_ML_APPROVAL', true);

// ContextFilter — SM alignment + volume gate
const ENABLE_CONTEXT_FILTER = envBool('ENABLE_CONTEXT_FILTER', true);
const CONTEXT_FILTER_REQUIRE_SM_ALIGNED = envBool('CONTEXT_FILTER_REQUIRE_SM_ALIGNED', true);
const CONTEXT_FILTER_MAX_SELL_VOLUME_RATIO = envNumber('CONTEXT_FILTER_MAX_SELL_VOLUME_RATIO', 1.5);
const CONTEXT_FILTER_CONTEXT_SCORE_BONUS = envNumber('CONTEXT_FILTER_CONTEXT_SCORE_BONUS', 0.05);

// Format price with dynamic decimals based on value
function formatPrice(price: number): string {
    if (price >= 100) return `$${price.toFixed(2)}`;
    if (price >= 1) return `$${price.toFixed(4)}`;
    if (price >= 0.01) return `$${price.toFixed(6)}`;
    return `$${price.toFixed(8)}`;
}

interface TrendingCoin {
    symbol: string;
    priceChangePercent: number;
    volume: number;
    lastPrice: number;
}

interface OFASignal {
    symbol: string;
    direction: "LONG" | "SHORT";
    price: number;
    score: number;
    signalId?: number;  // ID from database for tracking
    // Raw metrics
    volumeRatio: number;
    trend: number;
    momentum: number;
    priceChange24h: number;
    // Normalized features for ML (0-1 or -1 to 1)
    f_smart_money: number;
    f_price_context: number;
    f_imbalance: number;
    f_absorption: number;
    f_trend: number;
    f_momentum: number;
    f_volume: number;
    volatility15m: number;
    stopPercent?: number;
    targetPercent?: number;
    decisionScore?: number;
    decisionBreakdown?: {
        ofa: number;
        ml: number;
        edge: number;
        regime: number;
        sentiment: number;
    };
}

interface HourDirectionEdgeStats {
    trades: number;
    win_rate: number;
    win_rate_ci95_low: number;
    expectancy: number;
    expectancy_ci95_low: number;
}

interface DecisionComponents {
    ofa: number;
    ml: number;
    edge: number;
    regime: number;
    sentiment: number;
}

// ============================================
// EoS CRYPTO v3.0 - Ensemble + Cross-Validation
// Nova estratégia com 4 modelos votando (XGBoost, LightGBM, RF, GB)
// Threshold 70% para maior precisão
// ============================================
const STRATEGY_VERSION = 'v3.0';
const DATA_COLLECTION_MODE = false; // false = produção com threshold 70%
const MIN_SCORE = DATA_COLLECTION_MODE ? 40 : 70; // 40% coleta, 70% produção
const SCAN_INTERVAL = 10 * 60 * 1000; // 10 minutos
const VALIDATION_INTERVAL = 5 * 60 * 1000; // Valida a cada 5 min

// Stablecoins a serem excluídas (não faz sentido tradear stablecoins)
const EXCLUDED_STABLECOINS = [
    'USDT', 'USDC', 'USDS', 'USDE', 'DAI', 'TUSD',
    'FDUSD', 'EURC', 'USDP', 'PYUSD', 'BUSD', 'GUSD'
];

const DEFAULT_MONITORED_SYMBOLS = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT',
    'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT'
];

export class TrendingScanner {
    private isRunning = false;
    private trendingCoins: TrendingCoin[] = [];
    private monitoredSymbols = new Set<string>(DEFAULT_MONITORED_SYMBOLS);

    private calculateRiskPercents(signal: OFASignal): { stopPercent: number; targetPercent: number } {
        const volatilityPercent = signal.volatility15m * 100;
        const baseStop = clamp(
            volatilityPercent * RISK_VOL_TO_STOP_MULTIPLIER,
            RISK_STOP_MIN_PERCENT,
            RISK_STOP_MAX_PERCENT
        );

        let targetRatio = RISK_TARGET_STOP_RATIO;

        if (signal.score >= 85 && Math.abs(signal.momentum) >= 0.003) {
            targetRatio = Math.min(1.0, targetRatio + 0.1);
        }
        if (Math.abs(signal.momentum) <= 0.0015) {
            targetRatio = Math.max(0.65, targetRatio - 0.1);
        }

        const targetPercent = clamp(
            baseStop * targetRatio,
            RISK_TARGET_MIN_PERCENT,
            RISK_TARGET_MAX_PERCENT
        );

        return {
            stopPercent: Number(baseStop.toFixed(3)),
            targetPercent: Number(targetPercent.toFixed(3))
        };
    }

    private normalizeDecisionWeights(): DecisionComponents {
        const raw = {
            ofa: Math.max(0, UNIFIED_SCORE_WEIGHT_OFA),
            ml: Math.max(0, UNIFIED_SCORE_WEIGHT_ML),
            edge: Math.max(0, UNIFIED_SCORE_WEIGHT_EDGE),
            regime: Math.max(0, UNIFIED_SCORE_WEIGHT_REGIME),
            sentiment: Math.max(0, UNIFIED_SCORE_WEIGHT_SENTIMENT),
        };
        const sum = raw.ofa + raw.ml + raw.edge + raw.regime + raw.sentiment;
        if (sum <= 0) {
            return { ofa: 0.30, ml: 0.30, edge: 0.20, regime: 0.10, sentiment: 0.10 };
        }

        return {
            ofa: raw.ofa / sum,
            ml: raw.ml / sum,
            edge: raw.edge / sum,
            regime: raw.regime / sum,
            sentiment: raw.sentiment / sum,
        };
    }

    private getInfraRegimeScore(symbol: string): number {
        const status = getDataService().getStatus(symbol);
        if (!status) return 0.5;

        const stateScore = status.state === 'LIVE_OK'
            ? 1
            : status.state === 'DEGRADED'
                ? 0.6
                : status.state === 'WARMING'
                    ? 0.35
                    : status.state === 'OFFLINE'
                        ? 0.15
                        : 0.25;
        const coverageScore = clamp(status.coverage / ENGINE_TARGET_COVERAGE_SEC, 0, 1);

        return clamp(0.7 * stateScore + 0.3 * coverageScore, 0, 1);
    }

    private getMarketRegimeScore(signal: OFASignal, action: 'BUY' | 'SELL'): number {
        const directionalTrend = action === 'BUY' ? signal.trend : -signal.trend;
        const directionalMomentum = action === 'BUY' ? signal.momentum : -signal.momentum;

        const trendScore = clamp(0.5 + directionalTrend * 45, 0, 1);
        const momentumScore = clamp(0.5 + directionalMomentum * 60, 0, 1);
        const volatilityScore = clamp(1 - ((signal.volatility15m - 0.004) / 0.02), 0, 1);

        return clamp(0.45 * trendScore + 0.35 * momentumScore + 0.20 * volatilityScore, 0, 1);
    }

    private getRegimeScore(signal: OFASignal, action: 'BUY' | 'SELL'): number {
        const market = this.getMarketRegimeScore(signal, action);
        const infra = this.getInfraRegimeScore(signal.symbol);
        return clamp(0.7 * market + 0.3 * infra, 0, 1);
    }

    private getEdgeScore(edge: HourDirectionEdgeStats | undefined): number {
        if (!edge) return 0.5;

        const ciWinrateScore = clamp((edge.win_rate_ci95_low - 35) / 25, 0, 1);
        const winrateScore = clamp((edge.win_rate - 45) / 20, 0, 1);
        const expectancyScore = clamp((edge.expectancy_ci95_low + 0.2) / 0.4, 0, 1);
        const sampleSizeScore = clamp(
            (edge.trades - HOUR_DIRECTION_MIN_TRADES) / (HOUR_DIRECTION_MIN_TRADES * 2),
            0,
            1
        );

        return clamp(
            0.35 * ciWinrateScore +
            0.25 * winrateScore +
            0.25 * expectancyScore +
            0.15 * sampleSizeScore,
            0,
            1
        );
    }

    private titleMentionsSymbol(title: string, symbol: string): boolean {
        const normalizedTitle = title.toUpperCase();
        if (normalizedTitle.includes(symbol)) return true;

        const aliases: Record<string, string[]> = {
            BTC: ['BITCOIN'],
            ETH: ['ETHEREUM'],
            SOL: ['SOLANA'],
            XRP: ['RIPPLE'],
            BNB: ['BINANCE COIN', 'BINANCE'],
        };
        const candidates = aliases[symbol] ?? [];
        return candidates.some((alias) => normalizedTitle.includes(alias));
    }

    private getSentimentScore(action: 'BUY' | 'SELL', symbol: string, sentimentSignals: any[]): number {
        if (!sentimentSignals || sentimentSignals.length === 0) return 0.5;

        const baseSymbol = symbol.replace('USDT', '').toUpperCase();
        let weightedSum = 0;
        let totalWeight = 0;

        for (const item of sentimentSignals) {
            const sentiment = Number(item?.sentiment_score);
            const impact = Number(item?.impact_rating ?? 1);
            if (!Number.isFinite(sentiment) || !Number.isFinite(impact)) continue;

            const title = String(item?.title ?? '');
            const targeted = this.titleMentionsSymbol(title, baseSymbol);
            const weight = Math.max(1, impact) * (targeted ? 1.5 : 0.8);

            weightedSum += sentiment * weight;
            totalWeight += weight;
        }

        if (totalWeight <= 0) return 0.5;

        const avgSentiment = weightedSum / totalWeight; // -1..1
        const directionalSentiment = action === 'BUY' ? avgSentiment : -avgSentiment;

        return clamp((directionalSentiment + 1) / 2, 0, 1);
    }

    private getMlScore(
        signal: OFASignal,
        action: 'BUY' | 'SELL',
        mlResult: Awaited<ReturnType<typeof mlService.predict>>
    ): number {
        if (mlResult.error) return 0.5;

        const gateProbability = clamp(
            Number(mlResult.gate_probability ?? (mlResult.gate_check ? 1 : 0.5)),
            0,
            1
        );
        const directionProbability = action === 'BUY'
            ? Number(mlResult.direction_probabilities?.LONG ?? mlResult.confidence)
            : Number(mlResult.direction_probabilities?.SHORT ?? mlResult.confidence);
        const normalizedDirectionProbability = clamp(
            Number.isFinite(directionProbability) ? directionProbability : 0.5,
            0,
            1
        );
        const agreementScore = mlResult.direction === signal.direction
            ? 1
            : mlResult.direction === 'NO-TRADE'
                ? 0.30
                : 0;

        return clamp(
            0.45 * gateProbability +
            0.40 * normalizedDirectionProbability +
            0.15 * agreementScore,
            0,
            1
        );
    }

    private getUnifiedDecisionScore(
        signal: OFASignal,
        action: 'BUY' | 'SELL',
        mlResult: Awaited<ReturnType<typeof mlService.predict>>,
        edge: HourDirectionEdgeStats | undefined,
        sentimentSignals: any[]
    ): { score: number; components: DecisionComponents } {
        const components: DecisionComponents = {
            ofa: clamp(signal.score / 100, 0, 1),
            ml: this.getMlScore(signal, action, mlResult),
            edge: this.getEdgeScore(edge),
            regime: this.getRegimeScore(signal, action),
            sentiment: this.getSentimentScore(action, signal.symbol, sentimentSignals),
        };

        const weights = this.normalizeDecisionWeights();
        const score =
            components.ofa * weights.ofa +
            components.ml * weights.ml +
            components.edge * weights.edge +
            components.regime * weights.regime +
            components.sentiment * weights.sentiment;

        return {
            score: clamp(score, 0, 1),
            components,
        };
    }

    async start(): Promise<void> {
        console.log("[TrendingScanner] Iniciando scanner de trending coins...");
        this.isRunning = true;

        // Initialize DataService with default popular coins
        const dataService = getDataService();
        const defaultSymbols = [...this.monitoredSymbols];

        console.log("[TrendingScanner] Initializing DataService...");
        await dataService.initialize(defaultSymbols);

        // Wait for at least one symbol to be ready (max 60s)
        console.log("[TrendingScanner] Waiting for DataService warmup...");
        const warmupStart = Date.now();
        let readyCount = 0;

        while (readyCount < 3 && Date.now() - warmupStart < 60000) {
            await new Promise(r => setTimeout(r, 2000));
            readyCount = defaultSymbols.filter(s => dataService.isReady(s)).length;
            console.log(`[TrendingScanner] ${readyCount}/${defaultSymbols.length} symbols ready`);
        }

        console.log(`[TrendingScanner] DataService warmup complete: ${readyCount} symbols LIVE_OK`);

        // First scan immediately
        await this.scan();

        // Schedule regular scans
        setInterval(() => {
            if (this.isRunning) this.scan();
        }, SCAN_INTERVAL);

        // Schedule validation loop
        setInterval(() => {
            if (this.isRunning) this.validatePendingSignals();
        }, VALIDATION_INTERVAL);

        console.log("[TrendingScanner] Validation loop started (every 5 min)");
    }

    stop(): void {
        this.isRunning = false;
        console.log("[TrendingScanner] Scanner parado");
    }

    private async scan(): Promise<void> {
        console.log("[TrendingScanner] Buscando top 10 trending...");

        try {
            // 1. Get top 10 trending by volume
            await this.fetchTrendingCoins();

            // 2. Analyze each coin with OFA
            const validSignals = await this.analyzeAll();

            // 3. Send consolidated message if any valid signals
            if (validSignals.length > 0) {
                await this.sendConsolidatedSignal(validSignals);
            } else {
                console.log("[TrendingScanner] Nenhum sinal >= 75% encontrado");
            }

        } catch (error) {
            console.error("[TrendingScanner] Erro no scan:", error);
        }
    }

    private async fetchTrendingCoins(): Promise<void> {
        const url = "https://api.binance.com/api/v3/ticker/24hr";

        const response = await fetch(url);
        const data = await response.json() as any[];

        // Helper para verificar se é uma stablecoin
        const isStablecoin = (symbol: string) => {
            const base = symbol.replace('USDT', '');
            return EXCLUDED_STABLECOINS.includes(base.toUpperCase());
        };

        // Filter USDT pairs, exclude stablecoins, leveraged tokens, and sort by volume
        this.trendingCoins = data
            .filter((t: any) =>
                t.symbol.endsWith("USDT") &&
                !t.symbol.includes("UP") &&
                !t.symbol.includes("DOWN") &&
                !isStablecoin(t.symbol) &&
                this.monitoredSymbols.has(t.symbol)
            )
            .map((t: any) => ({
                symbol: t.symbol,
                priceChangePercent: parseFloat(t.priceChangePercent),
                volume: parseFloat(t.quoteVolume),
                lastPrice: parseFloat(t.lastPrice),
            }))
            .sort((a, b) => b.volume - a.volume)
            .slice(0, 10);

        console.log(`[TrendingScanner] Top monitored: ${this.trendingCoins.map(c => c.symbol).join(", ")}`);
    }

    private async analyzeAll(): Promise<OFASignal[]> {
        const validSignals: OFASignal[] = [];
        const hourUtc = new Date().getUTCHours();
        const directionalStats = ENABLE_HOUR_DIRECTION_FILTER
            ? sqliteDatabase.getEdgeMatrix(HOUR_DIRECTION_MIN_TRADES)
            : [];
        const edgeMap = new Map<string, HourDirectionEdgeStats>();
        const sentimentSignals = sqliteDatabase.getRecentSentimentSignals(
            UNIFIED_SCORE_SENTIMENT_WINDOW_MIN,
            UNIFIED_SCORE_SENTIMENT_MIN_IMPACT
        );

        for (const row of directionalStats) {
            edgeMap.set(`${row.hour_utc}:${row.action}`, {
                trades: row.trades,
                win_rate: row.win_rate,
                win_rate_ci95_low: row.win_rate_ci95_low,
                expectancy: row.expectancy,
                expectancy_ci95_low: row.expectancy_ci95_low
            });
        }

        for (const coin of this.trendingCoins) {
            const signal = await this.analyzeOFA(coin);

            if (signal && signal.score >= MIN_SCORE) {
                const action = signal.direction === "LONG" ? "BUY" : "SELL";
                if (ENABLE_HOUR_DIRECTION_FILTER) {
                    const edge = edgeMap.get(`${hourUtc}:${action}`);
                    if (!edge) {
                        console.log(`[TimingFilter] ${signal.symbol} ${action} REJEITADO - sem histórico suficiente para hora ${hourUtc} UTC`);
                        continue;
                    }
                    if (edge.win_rate < HOUR_DIRECTION_MIN_WINRATE) {
                        console.log(`[TimingFilter] ${signal.symbol} ${action} REJEITADO - WR ${edge.win_rate.toFixed(1)}% < ${HOUR_DIRECTION_MIN_WINRATE}% (hora ${hourUtc} UTC, n=${edge.trades})`);
                        continue;
                    }
                    if (edge.win_rate_ci95_low < HOUR_DIRECTION_MIN_WINRATE_CI95_LOW) {
                        console.log(`[TimingFilter] ${signal.symbol} ${action} REJEITADO - IC95 low WR ${edge.win_rate_ci95_low.toFixed(1)}% < ${HOUR_DIRECTION_MIN_WINRATE_CI95_LOW}% (hora ${hourUtc} UTC, n=${edge.trades})`);
                        continue;
                    }
                    if (ENABLE_EXPECTANCY_GATE && edge.expectancy_ci95_low <= HOUR_DIRECTION_MIN_EXPECTANCY_CI95_LOW) {
                        console.log(`[TimingFilter] ${signal.symbol} ${action} REJEITADO - IC95 low expectancy ${edge.expectancy_ci95_low.toFixed(3)}% <= ${HOUR_DIRECTION_MIN_EXPECTANCY_CI95_LOW.toFixed(3)}% (mean=${edge.expectancy.toFixed(3)}%, hora ${hourUtc} UTC, n=${edge.trades})`);
                        continue;
                    }
                }

                // [ContextFilter] SM Alignment + Volume Gate
                if (ENABLE_CONTEXT_FILTER) {
                    // Gate 1: Smart Money deve estar alinhado com a direção
                    if (CONTEXT_FILTER_REQUIRE_SM_ALIGNED) {
                        const smRequired = action === 'BUY' ? 1 : -1;
                        if (signal.f_smart_money !== smRequired) {
                            const smLabel = signal.f_smart_money === 0 ? 'NEUTRAL' : 'OPOSTO';
                            console.log(`[ContextFilter] ${signal.symbol} ${action} REJEITADO - SM ${smLabel} (f_sm=${signal.f_smart_money}, requer ${action === 'BUY' ? 'BULLISH(1)' : 'BEARISH(-1)'})`);
                            continue;
                        }
                    }

                    // Gate 2: SELL com volume anormal é armadilha (WR histórico 42-44%)
                    if (action === 'SELL' && signal.volumeRatio >= CONTEXT_FILTER_MAX_SELL_VOLUME_RATIO) {
                        console.log(`[ContextFilter] ${signal.symbol} SELL REJEITADO - vol ${signal.volumeRatio.toFixed(2)}x >= ${CONTEXT_FILTER_MAX_SELL_VOLUME_RATIO}x (WR histórico 42-44%)`);
                        continue;
                    }

                    console.log(`[ContextFilter] ${signal.symbol} ${action} APROVADO - SM:${signal.f_smart_money} VP:${signal.f_price_context} Vol:${signal.volumeRatio.toFixed(2)}x`);
                }

                // [NEW] ML Service V2: Python Inference
                const now = new Date();

                // Prepare features payload
                const mlResult = await mlService.predict(signal.symbol, {
                    f_smart_money: signal.f_smart_money,
                    f_price_context: signal.f_price_context,
                    f_imbalance: signal.f_imbalance,
                    f_absorption: signal.f_absorption,
                    f_trend: signal.f_trend,
                    f_momentum: signal.f_momentum,
                    f_volume: signal.f_volume,
                    score: signal.score,
                    // Temporal features
                    hour_utc: now.getUTCHours(),
                    day_of_week: now.getUTCDay(),
                    // Raw metrics for extra context
                    volume_ratio: signal.volumeRatio,
                    trend: signal.trend,
                    momentum: signal.momentum,
                    price_change_24h: signal.priceChange24h,
                    min_score: MIN_SCORE
                });

                // Log ML decision
                const reasons = mlResult.reasons ? mlResult.reasons.join(' | ') : 'No reason provided';
                console.log(`[ML V2] ${signal.symbol}: ${mlResult.direction} (Conf: ${(mlResult.confidence * 100).toFixed(1)}%) - ${reasons}`);

                // Skip if ML rejects (only in production mode)
                if (!DATA_COLLECTION_MODE) {
                    if (UNIFIED_SCORE_REQUIRE_ML_APPROVAL && !mlResult.should_trade) {
                        console.log(`[ML V2] ${signal.symbol} REJEITADO pelo modelo de IA`);
                        continue;
                    }

                    // Se o modelo sugerir direção diferente, podemos respeitar ou ignorar
                    // Como nosso sistema OFA já definiu a direção (signal.direction), 
                    // o modelo ML atua mais como validador. 
                    // Mas se o modelo Direction der "NO-TRADE", já foi filtrado acima.
                    // Se der direção oposta, é um sinal de alerta, mas por enquanto vamos confiar no Gating Model.
                }

                const edge = edgeMap.get(`${hourUtc}:${action}`);
                const unified = this.getUnifiedDecisionScore(signal, action, mlResult, edge, sentimentSignals);

                // Context bonus: SM alinhado + hora com CI95_low >= 50% ("golden hour")
                let contextBonus = 0;
                if (ENABLE_CONTEXT_FILTER && CONTEXT_FILTER_CONTEXT_SCORE_BONUS > 0) {
                    const smAligned = (action === 'BUY' && signal.f_smart_money === 1) ||
                                      (action === 'SELL' && signal.f_smart_money === -1);
                    const goldenHour = edge !== undefined && edge.win_rate_ci95_low >= 50;
                    if (smAligned && goldenHour) {
                        contextBonus = CONTEXT_FILTER_CONTEXT_SCORE_BONUS;
                        console.log(`[ContextFilter] ${signal.symbol} +${(contextBonus * 100).toFixed(0)}% bonus (SM alinhado + golden hour CI95=${edge!.win_rate_ci95_low.toFixed(1)}%)`);
                    }
                }
                signal.decisionScore = clamp(unified.score + contextBonus, 0, 1);
                signal.decisionBreakdown = unified.components;

                console.log(
                    `[Decision] ${signal.symbol} score=${(unified.score * 100).toFixed(1)}% ` +
                    `(ofa=${(unified.components.ofa * 100).toFixed(1)} ` +
                    `ml=${(unified.components.ml * 100).toFixed(1)} ` +
                    `edge=${(unified.components.edge * 100).toFixed(1)} ` +
                    `regime=${(unified.components.regime * 100).toFixed(1)} ` +
                    `sent=${(unified.components.sentiment * 100).toFixed(1)})`
                );

                if (ENABLE_UNIFIED_DECISION_SCORE && unified.score < UNIFIED_DECISION_MIN_SCORE) {
                    console.log(
                        `[Decision] ${signal.symbol} REJEITADO - unified ${(unified.score * 100).toFixed(1)}% < ${(UNIFIED_DECISION_MIN_SCORE * 100).toFixed(1)}%`
                    );
                    continue;
                }

                // Save to database with stop/target and get ID
                const risk = this.calculateRiskPercents(signal);
                const signalId = sqliteDatabase.insertSignal({
                    symbol: signal.symbol,
                    action,
                    entry_price: signal.price,
                    score: signal.score,
                    // Normalized features for ML
                    f_smart_money: signal.f_smart_money,
                    f_price_context: signal.f_price_context,
                    f_imbalance: signal.f_imbalance,
                    f_absorption: signal.f_absorption,
                    f_trend: signal.f_trend,
                    f_momentum: signal.f_momentum,
                    f_volume: signal.f_volume,
                    // Raw data
                    volume_ratio: signal.volumeRatio,
                    trend: signal.trend,
                    momentum: signal.momentum,
                    price_change_24h: signal.priceChange24h,
                    stop_percent: risk.stopPercent,
                    target_percent: risk.targetPercent,
                });

                // Attach ID to signal for display
                signal.signalId = signalId;
                signal.stopPercent = risk.stopPercent;
                signal.targetPercent = risk.targetPercent;
                validSignals.push(signal);
            }
        }

        return validSignals;
    }

    private async analyzeOFA(coin: TrendingCoin): Promise<OFASignal | null> {
        try {
            // Import OFA modules
            const { getSmartMoneyDelta } = await import('./ofa/smartMoneyFilter');
            const { calculateVolumeProfile, getVolumeProfileScore } = await import('./ofa/volumeProfile');
            const { analyzeImbalances } = await import('./ofa/imbalanceDetector');
            const { analyzeAbsorption } = await import('./ofa/absorptionDetector');

            // Run all analyses in parallel
            const [smartMoney, volumeProfile, imbalances, absorption] = await Promise.all([
                getSmartMoneyDelta(coin.symbol),
                calculateVolumeProfile(coin.symbol, coin.lastPrice),
                analyzeImbalances(coin.symbol),
                analyzeAbsorption(coin.symbol),
            ]);

            // Also get basic kline data for trend/momentum
            const klines = await this.getKlines(coin.symbol, "15m", 20);
            if (klines.length < 20) return null;

            const volumeRatio = this.calculateVolumeRatio(klines);
            const trend = this.calculateTrend(klines);
            const momentum = this.calculateMomentum(klines);
            const volatility15m = this.calculateVolatility(klines);

            // Determine direction based on multiple factors
            let longPoints = 0;
            let shortPoints = 0;

            // Smart Money bias (weight: 25)
            if (smartMoney.smartMoneyBias === 'BULLISH') longPoints += 25;
            else if (smartMoney.smartMoneyBias === 'BEARISH') shortPoints += 25;

            // Volume Profile context (weight: 20)
            if (volumeProfile.priceContext === 'ABOVE_VA') longPoints += 20;
            else if (volumeProfile.priceContext === 'BELOW_VA') shortPoints += 20;

            // Imbalance dominance (weight: 30)
            if (imbalances.dominantSide === 'BUY') longPoints += 30;
            else if (imbalances.dominantSide === 'SELL') shortPoints += 30;

            // Stacked imbalance bonus (weight: 15)
            if (imbalances.hasSignificantStack) {
                if (imbalances.dominantSide === 'BUY') longPoints += 15;
                else if (imbalances.dominantSide === 'SELL') shortPoints += 15;
            }

            // Absorption (weight: 10)
            if (absorption.dominantType === 'ACCUMULATION') longPoints += 10;
            else if (absorption.dominantType === 'DISTRIBUTION') shortPoints += 10;

            // Trend + Momentum backup (weight: 10 each)
            if (trend > 0) longPoints += 10;
            else if (trend < 0) shortPoints += 10;

            if (momentum > 0) longPoints += 5;
            else if (momentum < 0) shortPoints += 5;

            // Determine final direction
            let direction: "LONG" | "SHORT" | null = null;
            let score = 0;

            if (longPoints > shortPoints && longPoints >= 40) {
                direction = "LONG";
                score = Math.min(longPoints, 100);
            } else if (shortPoints > longPoints && shortPoints >= 40) {
                direction = "SHORT";
                score = Math.min(shortPoints, 100);
            } else {
                return null; // No clear direction
            }

            // Calculate normalized features for ML (0-1 or -1 to 1)
            const f_smart_money = smartMoney.smartMoneyBias === 'BULLISH' ? 1 :
                smartMoney.smartMoneyBias === 'BEARISH' ? -1 : 0;
            const f_price_context = volumeProfile.priceContext === 'ABOVE_VA' ? 1 :
                volumeProfile.priceContext === 'BELOW_VA' ? 0 : 0.5;
            const f_imbalance = Math.min(imbalances.score / 100, 1);
            const f_absorption = Math.min(absorption.score / 100, 1);
            const f_trend = Math.min(Math.max((trend + 1) / 2, 0), 1); // -1..1 -> 0..1
            const f_momentum = Math.min(Math.max((momentum + 1) / 2, 0), 1);
            const f_volume = Math.min(volumeRatio / 5, 1); // cap at 5x

            console.log(`[OFA] ${coin.symbol}: L${longPoints}/S${shortPoints} = ${direction} (${score}%) | SM:${smartMoney.smartMoneyBias} VP:${volumeProfile.priceContext} Imb:${imbalances.dominantSide}`);

            return {
                symbol: coin.symbol,
                direction,
                price: coin.lastPrice,
                score,
                volumeRatio,
                trend,
                momentum,
                priceChange24h: coin.priceChangePercent,
                // Normalized features for ML
                f_smart_money,
                f_price_context,
                f_imbalance,
                f_absorption,
                f_trend,
                f_momentum,
                f_volume,
                volatility15m,
            };

        } catch (error) {
            console.error(`[TrendingScanner] Erro analisando ${coin.symbol}:`, error);
            return null;
        }
    }

    private async getKlines(symbol: string, interval: string, limit: number): Promise<any[]> {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const response = await fetch(url);
        return await response.json() as any[];
    }

    private calculateVolumeRatio(klines: any[]): number {
        const volumes = klines.map((k: any) => parseFloat(k[5]));
        const avgVolume = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
        const lastVolume = volumes[volumes.length - 1];
        return lastVolume / avgVolume;
    }

    private calculateTrend(klines: any[]): number {
        const closes = klines.map((k: any) => parseFloat(k[4]));
        const first = closes[0];
        const last = closes[closes.length - 1];
        return (last - first) / first;
    }

    private calculateMomentum(klines: any[]): number {
        const closes = klines.map((k: any) => parseFloat(k[4]));
        const recent = closes.slice(-5);
        const older = closes.slice(-10, -5);
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        return (recentAvg - olderAvg) / olderAvg;
    }

    private calculateVolatility(klines: any[]): number {
        const closes = klines.map((k: any) => parseFloat(k[4]));
        if (closes.length < 2) return 0.005;

        const returns: number[] = [];
        for (let i = 1; i < closes.length; i++) {
            const prev = closes[i - 1];
            const cur = closes[i];
            if (prev > 0) returns.push(Math.abs((cur - prev) / prev));
        }

        if (returns.length === 0) return 0.005;
        const avgAbsReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        return clamp(avgAbsReturn, 0.0025, 0.02);
    }

    // VALIDATION: Check pending signals and send WIN/LOSS with 45min timeout
    private async validatePendingSignals(): Promise<void> {
        // ── 0. Preencher contrafactuais pendentes ─────────────────────────────
        // (não-blocking: roda em background, erros são silenciosos)
        this.fillPendingCounterfactuals().catch(() => undefined);

        const pending = sqliteDatabase.getPendingSignals();
        if (pending.length === 0) return;

        console.log(`[TrendingScanner] Validating ${pending.length} pending signals...`);

        const MAX_AGE_MS = 45 * 60 * 1000;  // 45 minutos máximo

        // Coletar status updates para enviar consolidado
        const statusUpdates: Array<{
            signal: any;
            currentPrice: number;
            profitPercent: number;
            ageMinutes: number;
        }> = [];

        for (const signal of pending) {
            try {
                // Get current price
                const currentPrice = await this.getCurrentPrice(signal.symbol);
                if (!currentPrice) continue;

                const age = Date.now() - new Date(signal.created_at).getTime();
                const ageMinutes = Math.floor(age / (60 * 1000));

                // ── Exit Decision Engine ──────────────────────────────────────
                if (USE_ML_EXIT) {
                    // Fase 2: ML ativo — coleta features e consulta modelo
                    const features = await collectExitFeatures(signal, currentPrice).catch(() => null);
                    if (features) {
                        const decision = await makeExitDecision(signal, features);
                        sqliteDatabase.logExitDecision({
                            ...features,
                            decision_source: decision.source,
                            decision:        decision.decision,
                            confidence:      decision.confidence,
                            is_final:        false,
                            captured_at:     features.captured_at
                        });

                        if (decision.decision === 'EXIT') {
                            // ML quer sair — fecha como se fosse timeout mas com preço atual
                            const profit_percent = signal.action === 'BUY'
                                ? ((currentPrice - signal.entry_price) / signal.entry_price) * 100
                                : ((signal.entry_price - currentPrice) / signal.entry_price) * 100;
                            const result = profit_percent >= 0 ? 'WIN' : 'LOSS';

                            const closeTimeMs = Date.now();
                            sqliteDatabase.finalizeExitLog(signal.id, result as 'WIN' | 'LOSS', profit_percent, closeTimeMs);

                            const macroAnalysis = await getMacroAnalysis();
                            const macroData = getMacroForDB(macroAnalysis);
                            sqliteDatabase.forceCloseSignal(signal.id, currentPrice, result as 'WIN' | 'LOSS', profit_percent, macroData);

                            console.log(`[ExitDecision] ML EXIT signal ${signal.id} ${signal.symbol} @ ${currentPrice} (${result} ${profit_percent.toFixed(2)}%)`);
                            await this.sendTimeoutResult(signal, result, currentPrice, profit_percent, ageMinutes);
                            continue;
                        }

                        if (decision.decision === 'MOVE_STOP') {
                            // Mover stop para breakeven — apenas loga por agora
                            console.log(`[ExitDecision] MOVE_STOP signal ${signal.id} ${signal.symbol} — breakeven não implementado ainda, aguarda hard stop`);
                        }
                    }
                } else {
                    // Fase 1: só coleta, não interfere
                    collectExitFeatures(signal, currentPrice).then(features => {
                        if (!features) return;
                        sqliteDatabase.logExitDecision({
                            ...features,
                            decision_source: 'HARD_STOP',
                            decision:        'HOLD',
                            confidence:      1.0,
                            is_final:        false,
                            captured_at:     features.captured_at
                        });
                    }).catch(() => undefined);
                }

                // 1. Verificar se bateu stop ou target
                const validation = sqliteDatabase.validateSignal(signal.id, currentPrice);

                if (validation && validation.result !== 'PENDING') {
                    // ── Exit log: marca fechamento real ────────────────────────
                    const closeTimeMs = Date.now();
                    sqliteDatabase.finalizeExitLog(signal.id, validation.result, validation.profitPercent, closeTimeMs);

                    // Bateu stop ou target - envia WIN/LOSS
                    await this.sendValidationResult(signal, validation.result, currentPrice, validation.profitPercent);
                    continue;
                }

                // 2. Se passou 45 min, força fechamento no preço atual
                if (age >= MAX_AGE_MS) {
                    const profit_percent = signal.action === 'BUY'
                        ? ((currentPrice - signal.entry_price) / signal.entry_price) * 100
                        : ((signal.entry_price - currentPrice) / signal.entry_price) * 100;

                    const result = profit_percent >= 0 ? 'WIN' : 'LOSS';

                    // Fetch macro data for ML training
                    const macroAnalysis = await getMacroAnalysis();
                    const macroData = getMacroForDB(macroAnalysis);

                    // ── Exit log: marca fechamento por timeout ─────────────────
                    const closeTimeMs = Date.now();
                    sqliteDatabase.finalizeExitLog(signal.id, result as 'WIN' | 'LOSS', profit_percent, closeTimeMs);

                    // Force close - atualiza no banco com macro data
                    sqliteDatabase.forceCloseSignal(signal.id, currentPrice, result as 'WIN' | 'LOSS', profit_percent, macroData);

                    await this.sendTimeoutResult(signal, result, currentPrice, profit_percent, ageMinutes);
                    continue;
                }

                // 3. Record checkpoints at 5m, 10m, 15m, 30m intervals
                const checkpointMinutes = [5, 10, 15, 30];
                for (const checkpointMin of checkpointMinutes) {
                    // Record checkpoint if we're within the window (e.g., 5-9min for 5m checkpoint)
                    if (ageMinutes >= checkpointMin && ageMinutes < checkpointMin + 5) {
                        const profit_percent = signal.action === 'BUY'
                            ? ((currentPrice - signal.entry_price) / signal.entry_price) * 100
                            : ((signal.entry_price - currentPrice) / signal.entry_price) * 100;

                        sqliteDatabase.addCheckpoint(signal.id, checkpointMin, currentPrice, profit_percent);
                    }
                }

                // 4. Coletar para status update consolidado (a cada 15 min)
                if (ageMinutes >= 15 && ageMinutes % 15 < 5) {
                    const profit_percent = signal.action === 'BUY'
                        ? ((currentPrice - signal.entry_price) / signal.entry_price) * 100
                        : ((signal.entry_price - currentPrice) / signal.entry_price) * 100;

                    statusUpdates.push({ signal, currentPrice, profitPercent: profit_percent, ageMinutes });
                }

            } catch (error) {
                console.error(`[TrendingScanner] Error validating #${signal.id}:`, error);
            }
        }

        // Enviar status updates consolidados (uma única mensagem)
        if (statusUpdates.length > 0) {
            await this.sendConsolidatedStatusUpdate(statusUpdates);
        }
    }

    /** Preenche contrafactuais de saídas antigas que já têm 16+ min. */
    private async fillPendingCounterfactuals(): Promise<void> {
        const pending = sqliteDatabase.getPendingCounterfactuals();
        for (const row of pending) {
            try {
                const signal = sqliteDatabase.getSignal(row.signal_id);
                if (!signal) continue;

                const cf = await fetchCounterfactualPrices(
                    row.symbol,
                    signal.action,
                    signal.entry_price,
                    row.close_time_ms
                );
                if (!cf) continue;

                sqliteDatabase.fillCounterfactual(row.id, cf.cf_pnl_5m, cf.cf_pnl_10m, cf.cf_pnl_15m);
                console.log(`[ExitDecisionEngine] Counterfactual filled for log#${row.id} (signal#${row.signal_id}): 5m=${cf.cf_pnl_5m.toFixed(2)}% 10m=${cf.cf_pnl_10m.toFixed(2)}% 15m=${cf.cf_pnl_15m.toFixed(2)}%`);
            } catch {
                /* silencioso — será tentado novamente no próximo ciclo */
            }
        }
    }

    // Enviar status updates consolidados em uma única mensagem
    private async sendConsolidatedStatusUpdate(updates: Array<{
        signal: any;
        currentPrice: number;
        profitPercent: number;
        ageMinutes: number;
    }>): Promise<void> {
        if (updates.length === 0) return;

        let message = `⏱️ *Status das Operações* (${updates.length} ativas)\n\n`;

        for (const { signal, currentPrice, profitPercent, ageMinutes } of updates) {
            const symbol = signal.symbol.replace("USDT", "");
            const profitStr = profitPercent >= 0 ? `+${profitPercent.toFixed(2)}%` : `${profitPercent.toFixed(2)}%`;
            const emoji = profitPercent >= 0 ? '🟢' : '🔴';
            const distanceToStop = signal.action === 'BUY'
                ? ((currentPrice - signal.stop_loss) / signal.entry_price * 100).toFixed(2)
                : ((signal.stop_loss - currentPrice) / signal.entry_price * 100).toFixed(2);
            const distanceToTarget = signal.action === 'BUY'
                ? ((signal.take_profit - currentPrice) / signal.entry_price * 100).toFixed(2)
                : ((currentPrice - signal.take_profit) / signal.entry_price * 100).toFixed(2);

            const direction = signal.action === 'BUY' ? '🟩 LONG' : '🟥 SHORT';
            message += `${emoji} *#${signal.id} ${symbol}* ${direction} - ${ageMinutes}min\n`;
            message += `Atual: ${formatPrice(currentPrice)} (${profitStr})\n`;
            message += `Stop: ${distanceToStop}% | Alvo: ${distanceToTarget}% | Fecha: ${45 - ageMinutes}min\n\n`;
        }

        message += `━━━━━━━━━━━━━━━━━━━`;

        await telegram.sendBreakoutAlert(message);
        console.log(`[TrendingScanner] Consolidated status update: ${updates.length} signals`);
    }


    private async sendTimeoutResult(
        signal: any,
        result: string,
        exitPrice: number,
        profitPercent: number,
        ageMinutes: number
    ): Promise<void> {
        const symbol = signal.symbol.replace("USDT", "");
        const profitStr = profitPercent >= 0 ? `+${profitPercent.toFixed(2)}%` : `${profitPercent.toFixed(2)}%`;
        const emoji = result === 'WIN' ? '✅' : '❌';

        const stats = sqliteDatabase.getStats();
        const winRate = stats.win_rate.toFixed(1);
        const baselineInfo = stats.baseline_at
            ? `\n🗓️ Desde: ${new Date(stats.baseline_at).toLocaleString('pt-BR')} (${stats.strategy_version})`
            : `\n🏷️ Estratégia: ${stats.strategy_version}`;

        const message = `${emoji} *#${signal.id} ${symbol}* - *${result}* (TIMEOUT)

Entry: ${formatPrice(signal.entry_price)} → Exit: ${formatPrice(exitPrice)}
Resultado: ${profitStr} em ${ageMinutes}min

━━━━━ Estatísticas ━━━━━
🏆 Wins: ${stats.wins} | ❌ Losses: ${stats.losses}
📊 Win Rate: ${winRate}%
🔄 Pendentes: ${stats.pending}
${baselineInfo}
━━━━━━━━━━━━━━━━━━━`;

        await telegram.sendBreakoutAlert(message);
        console.log(`[TrendingScanner] Timeout ${result} for #${signal.id} after ${ageMinutes}min`);
    }

    private async getCurrentPrice(symbol: string): Promise<number | null> {
        try {
            const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
            const response = await fetch(url);
            const data = await response.json() as { price: string };
            return parseFloat(data.price);
        } catch {
            return null;
        }
    }

    private async sendValidationResult(
        signal: any,
        result: 'WIN' | 'LOSS',
        exitPrice: number,
        profitPercent: number
    ): Promise<void> {
        const symbol = signal.symbol.replace("USDT", "");
        const profitStr = profitPercent >= 0 ? `+${profitPercent.toFixed(2)}%` : `${profitPercent.toFixed(2)}%`;
        const emoji = result === 'WIN' ? '✅' : '❌';

        // Get overall stats
        const stats = sqliteDatabase.getStats();
        const winRate = stats.win_rate.toFixed(1);
        const avgProfit = stats.avg_profit.toFixed(2);
        const avgProfitStr = stats.avg_profit >= 0 ? `+${avgProfit}%` : `${avgProfit}%`;
        const baselineInfo = stats.baseline_at
            ? `\n🗓️ Desde: ${new Date(stats.baseline_at).toLocaleString('pt-BR')} (${stats.strategy_version})`
            : `\n🏷️ Estratégia: ${stats.strategy_version}`;

        const message = `${emoji} *#${signal.id} ${symbol}* - *${result}*

Entry: ${formatPrice(signal.entry_price)} → Exit: ${formatPrice(exitPrice)}
Resultado: ${profitStr}

━━━━━ Estatísticas ━━━━━
🏆 Wins: ${stats.wins} | ❌ Losses: ${stats.losses}
📊 Win Rate: ${winRate}%
💰 Média: ${avgProfitStr}
🔄 Pendentes: ${stats.pending}
${baselineInfo}
━━━━━━━━━━━━━━━━━━━`;

        await telegram.sendBreakoutAlert(message);
        console.log(`[TrendingScanner] Sent ${result} for #${signal.id} | WinRate: ${winRate}%`);
    }

    private async sendConsolidatedSignal(signals: OFASignal[]): Promise<void> {
        const quote = getRandomQuote();

        let message = `*Novo Sinal!*\n\n`;
        message += `${signals.length} oportunidade(s) detectada(s):\n\n`;

        for (const s of signals) {
            const dir = s.direction === "LONG" ? "COMPRA" : "VENDA";
            const change = s.priceChange24h >= 0 ? `+${s.priceChange24h.toFixed(2)}%` : `${s.priceChange24h.toFixed(2)}%`;

            // Get funding rate from Binance
            const fundingRate = await getFundingRate(s.symbol);
            const fundingStr = (fundingRate * 100).toFixed(4);
            const fundingWarning = Math.abs(fundingRate) > 0.0003 ? " ⚠️" : "";

            // Calculate position
            const stopPercent = s.stopPercent ?? 0.8;
            const targetPercent = s.targetPercent ?? 0.6;
            const calc = calculatePosition(
                DEFAULT_BANKROLL,
                RISK_PERCENT,
                s.price,
                stopPercent,
                targetPercent,
                s.direction,
                'TAKER',
                fundingRate
            );

            // SINAL (universal) - com ID para tracking
            const idStr = s.signalId ? `#${s.signalId} ` : "";
            const decisionStr = s.decisionScore != null ? `${(s.decisionScore * 100).toFixed(1)}%` : "n/a";
            message += `*${idStr}${s.symbol.replace("USDT", "")}* ${dir}\n`;
            message += `Entry: ${formatPrice(s.price)}\n`;
            message += `Stop: ${formatPrice(calc.stopPrice)} | Alvo: ${formatPrice(calc.targetPrice)}\n`;
            message += `Prob: ${s.score}% | Q-Score: ${decisionStr} | 24h: ${change}\n`;
            message += `R:R = ${calc.riskReward.toFixed(1)}:1\n\n`;

            // BLOCO BINANCE FUTURES
            message += `━━━━━ Binance Futures ━━━━━\n`;
            message += `Banca: $${DEFAULT_BANKROLL} | Risco: ${RISK_PERCENT}%\n`;
            message += `Alavancagem: ${calc.leverage}x\n`;
            message += `Limite: ${formatPrice(calc.limitPrice)} _(50% menos taxa)_\n`;
            message += `WIN: +$${calc.netProfit.toFixed(2)} | LOSS: -$${(calc.potentialLoss + calc.totalFees).toFixed(2)}\n`;
            message += `Taxa: $${calc.totalFees.toFixed(2)} | Fund: ${fundingStr}%${fundingWarning}\n`;
            message += `_Pague com BNB = -10% extra_\n`;
            message += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        }

        message += `_${quote}_`;

        await telegram.sendBreakoutAlert(message);
        console.log(`[TrendingScanner] Enviados ${signals.length} sinais consolidados`);
    }
}

export const trendingScanner = new TrendingScanner();
