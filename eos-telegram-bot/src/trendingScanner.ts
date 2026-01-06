import { telegram } from "./telegram";
import { sqliteDatabase } from "./sqliteDatabase";
import { getRandomQuote } from "./quotes";
import { calculatePosition, getFundingRate } from "./leverageCalculator";
import { getMacroAnalysis, getMacroForDB } from "./macroAnalyzer";
import { mlFilter } from "./mlFilter";

// Default bankroll for calculations (user can override)
const DEFAULT_BANKROLL = 1000; // $1000
const RISK_PERCENT = 2; // Arriscar 2% por trade

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

export class TrendingScanner {
    private isRunning = false;
    private trendingCoins: TrendingCoin[] = [];

    async start(): Promise<void> {
        console.log("[TrendingScanner] Iniciando scanner de trending coins...");
        this.isRunning = true;

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
                !isStablecoin(t.symbol)
            )
            .map((t: any) => ({
                symbol: t.symbol,
                priceChangePercent: parseFloat(t.priceChangePercent),
                volume: parseFloat(t.quoteVolume),
                lastPrice: parseFloat(t.lastPrice),
            }))
            .sort((a, b) => b.volume - a.volume)
            .slice(0, 10);

        console.log(`[TrendingScanner] Top 10: ${this.trendingCoins.map(c => c.symbol).join(", ")}`);
    }

    private async analyzeAll(): Promise<OFASignal[]> {
        const validSignals: OFASignal[] = [];

        for (const coin of this.trendingCoins) {
            const signal = await this.analyzeOFA(coin);

            if (signal && signal.score >= MIN_SCORE) {
                // ML Filter: Check if signal should be executed
                const mlResult = await mlFilter.shouldExecute({
                    f_volume: signal.f_volume,
                    f_momentum: signal.f_momentum,
                    f_trend: signal.f_trend,
                    f_price_context: signal.f_price_context,
                    f_smart_money: signal.f_smart_money,
                    f_imbalance: signal.f_imbalance,
                    f_absorption: signal.f_absorption,
                    score: signal.score,
                });

                // Log ML decision
                console.log(`[ML] ${signal.symbol}: ${mlResult.reason}`);

                // Skip if ML rejects (only in production mode)
                if (!DATA_COLLECTION_MODE && !mlResult.should_execute) {
                    console.log(`[ML] ${signal.symbol} rejeitado pelo filtro ML`);
                    continue;
                }

                // Save to database with stop/target and get ID
                const signalId = sqliteDatabase.insertSignal({
                    symbol: signal.symbol,
                    action: signal.direction === "LONG" ? "BUY" : "SELL",
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
                    stop_percent: 1,    // 1% stop loss
                    target_percent: 2,  // 2% take profit (2:1 RR)
                });

                // Attach ID to signal for display
                signal.signalId = signalId;
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

    // VALIDATION: Check pending signals and send WIN/LOSS with 45min timeout
    private async validatePendingSignals(): Promise<void> {
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

                // 1. Verificar se bateu stop ou target
                const validation = sqliteDatabase.validateSignal(signal.id, currentPrice);

                if (validation && validation.result !== 'PENDING') {
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

            message += `${emoji} *#${signal.id} ${symbol}* - ${ageMinutes}min\n`;
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

        const message = `${emoji} *#${signal.id} ${symbol}* - *${result}* (TIMEOUT)

Entry: ${formatPrice(signal.entry_price)} → Exit: ${formatPrice(exitPrice)}
Resultado: ${profitStr} em ${ageMinutes}min

━━━━━ Estatísticas ━━━━━
🏆 Wins: ${stats.wins} | ❌ Losses: ${stats.losses}
📊 Win Rate: ${winRate}%
🔄 Pendentes: ${stats.pending}
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

        const message = `${emoji} *#${signal.id} ${symbol}* - *${result}*

Entry: ${formatPrice(signal.entry_price)} → Exit: ${formatPrice(exitPrice)}
Resultado: ${profitStr}

━━━━━ Estatísticas ━━━━━
🏆 Wins: ${stats.wins} | ❌ Losses: ${stats.losses}
📊 Win Rate: ${winRate}%
💰 Média: ${avgProfitStr}
🔄 Pendentes: ${stats.pending}
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
            const stopPercent = 1;
            const targetPercent = 2;
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
            message += `*${idStr}${s.symbol.replace("USDT", "")}* ${dir}\n`;
            message += `Entry: ${formatPrice(s.price)}\n`;
            message += `Stop: ${formatPrice(calc.stopPrice)} | Alvo: ${formatPrice(calc.targetPrice)}\n`;
            message += `Prob: ${s.score}% | 24h: ${change}\n`;
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
