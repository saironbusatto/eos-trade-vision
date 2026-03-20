import { sqliteDatabase, Signal } from '../sqliteDatabase';
import { PaperTradingService } from './PaperTradingService';

// Regex para identificar ativos no título da notícia
const TOKEN_MAP: { [key: string]: RegExp } = {
    'BTC': /\b(bitcoin|btc)\b/i,
    'ETH': /\b(ethereum|eth)\b/i,
    'SOL': /\b(solana|sol)\b/i,
    'BNB': /\b(binance coin|bnb)\b/i,
    'XRP': /\b(ripple|xrp)\b/i
};

export class AutoTrader {
    private isRunning: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;
    private paperTrading: PaperTradingService;

    constructor() {
        this.paperTrading = new PaperTradingService();
    }

    public enableForUser(userId: string, username: string): void {
        sqliteDatabase.setAutoTraderEnabled(userId, username, true);
    }

    public disableForUser(userId: string, username: string): void {
        sqliteDatabase.setAutoTraderEnabled(userId, username, false);
    }

    public isEnabledForUser(userId: string): boolean {
        return sqliteDatabase.isAutoTraderEnabled(userId);
    }

    public getEnabledUsersCount(): number {
        return sqliteDatabase.getAutoTraderEnabledUsers().length;
    }

    public start(intervalMs: number = 60000) {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log(`[AutoTrader] Started. Watching for confluence every ${intervalMs / 1000}s...`);

        this.runCycle();
        this.intervalId = setInterval(() => this.runCycle(), intervalMs);
    }

    public stop() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.isRunning = false;
        console.log('[AutoTrader] Stopped.');
    }

    private async runCycle() {
        try {
            const enabledUsers = sqliteDatabase.getAutoTraderEnabledUsers();
            if (enabledUsers.length === 0) return;

            // 0. Manage open positions first (auto TP/SL)
            for (const user of enabledUsers) {
                const closedTrades = await this.paperTrading.monitorAndClosePositions(user.user_id);
                for (const closed of closedTrades) {
                    console.log(
                        `[AutoTrader] ✅ Closed ${closed.tradeDetails.symbol} for ${user.username} | PnL ${closed.tradeDetails.pnlNet.toFixed(2)}`
                    );
                }
            }

            const sentimentEnabled =
                process.env.ENABLE_SENTIMENT_ANALYSIS === 'true' &&
                Boolean(process.env.OPENAI_API_KEY);

            // 1. Buscar Notícias de Alta Convicção Recentes (últimos 60 min, Impacto >= 4)
            const sentimentSignals = sentimentEnabled
                ? sqliteDatabase.getRecentSentimentSignals(60, 4)
                : [];

            // 2. Buscar Sinais Técnicos Recentes (últimos 15 min, ainda PENDING)
            const minSignalAgeMin = Number(process.env.AUTO_TRADER_MIN_SIGNAL_AGE_MIN ?? 0);
            const technicalSignals = sqliteDatabase.getPendingSignals(
                Number.isFinite(minSignalAgeMin) ? Math.max(0, minSignalAgeMin) : 0
            );

            if (technicalSignals.length === 0) return;

            // console.log(`[AutoTrader] Scanning... Found ${sentimentSignals.length} high-impact news & ${technicalSignals.length} technical signals.`);

            // 3. Confluência
            for (const techSignal of technicalSignals) {
                // Filtra apenas sinais técnicos fortes
                if (Math.abs(techSignal.score) < 70) continue;

                // Tenta achar notícia corroborando
                const matchingNews = this.findMatchingNews(techSignal, sentimentSignals);

                await this.executeStrategyForUsers(techSignal, matchingNews, enabledUsers);
            }

        } catch (err: any) {
            console.error('[AutoTrader] Cycle error:', err.message);
        }
    }

    private findMatchingNews(signal: Signal, newsSignals: any[]): any | null {
        // Direção do sinal técnico
        const techDirection = signal.action; // 'BUY' or 'SELL'

        for (const news of newsSignals) {
            // 1. Validação de Sentimento vs Direção
            const sentimentDir = news.sentiment_score > 0 ? 'BUY' : 'SELL';

            // Se discordarem, ignora (Conflito de dados = No Trade)
            if (techDirection !== sentimentDir) continue;

            // 2. Validação de Ativo (Entity Matching)
            // Se a notícia fala explicitamente de OUTRO ativo, ignora.
            // Se fala do MESMO ativo ou é Genérica (Macro), aceita.

            const title = news.title.toLowerCase();
            const signalSymbol = signal.symbol.replace('USDT', '').toUpperCase(); // BTCUSDT -> BTC

            let mentionsOtherToken = false;
            let mentionsTargetToken = false;

            // Check regex map
            for (const [token, regex] of Object.entries(TOKEN_MAP)) {
                if (regex.test(title)) {
                    if (token === signalSymbol) {
                        mentionsTargetToken = true;
                    } else {
                        mentionsOtherToken = true;
                    }
                }
            }

            // Regra:
            // - Se menciona o Token Alvo: MATCH PERFEITO.
            // - Se menciona Outro Token e NÃO o Alvo (ex: Notícia de SOL para sinal de BTC): REJECT.
            // - Se não menciona nenhum token (Notícia Macro/SEC/Regulation): ACCEPT (Systemic Risk).

            if (mentionsOtherToken && !mentionsTargetToken) {
                continue; // Notícia irrelevante para este par
            }

            // Se chegou aqui, temos Direção Alinhada + (Token Match ou Macro).
            return news;
        }

        return null;
    }

    private async executeStrategyForUsers(
        techSignal: Signal,
        news: any | null,
        enabledUsers: Array<{ user_id: string; username: string; account_id: number }>
    ) {
        const leverage = this.calculateLeverage(news);

        for (const user of enabledUsers) {
            if (sqliteDatabase.hasAutoTraderExecution(techSignal.id, user.user_id)) {
                continue;
            }

            const existingPos = sqliteDatabase.getOpenPositions(user.account_id);
            if (existingPos.find((p: any) => p.symbol === techSignal.symbol)) {
                continue;
            }

            const executed = this.paperTrading.executeEntry(user.user_id, {
                symbol: techSignal.symbol,
                action: techSignal.action,
                price: techSignal.entry_price,
                stopLoss: techSignal.stop_loss,
                takeProfit: techSignal.take_profit,
                leverage
            });

            if (!executed) continue;

            const reason = news
                ? `confluence: tech=${techSignal.score}, sentiment=${news.sentiment_score}`
                : `technical-only: score=${techSignal.score}`;

            sqliteDatabase.markAutoTraderExecution(techSignal.id, user.user_id, techSignal.symbol, reason);
            console.log(
                `[AutoTrader] 🚀 ${user.username} (${user.user_id}) -> ${techSignal.action} ${techSignal.symbol} | ${reason} | ${leverage}x`
            );
        }
    }

    private calculateLeverage(news: any | null): number {
        if (!news) return 2; // modo técnico sem notícia: conservador

        let leverage = 3;
        const absScore = Math.abs(news.sentiment_score);
        if (absScore >= 0.9) return 10;
        if (absScore >= 0.75) return 5;
        return leverage;
    }
}
