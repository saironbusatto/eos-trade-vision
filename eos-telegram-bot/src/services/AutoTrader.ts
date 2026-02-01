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
        if (!process.env.OPENAI_API_KEY) return; // Só roda se tiver IA ativada para validar news

        try {
            // 1. Buscar Notícias de Alta Convicção Recentes (últimos 60 min, Impacto >= 4)
            const sentimentSignals = sqliteDatabase.getRecentSentimentSignals(60, 4);

            // 2. Buscar Sinais Técnicos Recentes (últimos 15 min, ainda PENDING)
            const technicalSignals = sqliteDatabase.getPendingSignals(15);

            if (sentimentSignals.length === 0 && technicalSignals.length === 0) return;

            // console.log(`[AutoTrader] Scanning... Found ${sentimentSignals.length} high-impact news & ${technicalSignals.length} technical signals.`);

            // 3. Confluência
            for (const techSignal of technicalSignals) {
                // Filtra apenas sinais técnicos fortes
                if (Math.abs(techSignal.score) < 70) continue;

                // Tenta achar notícia corroborando
                const matchingNews = this.findMatchingNews(techSignal, sentimentSignals);

                if (matchingNews) {
                    await this.executeStrategy(techSignal, matchingNews);
                }
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

    private async executeStrategy(techSignal: Signal, news: any) {
        // Verificar se usuário tem conta principal (ou rodar para todos)
        // MVP: Assume 'admin_user' ou pega todos accounts
        // Vamos usar um user ID 'autotrader_bot' para testes ou iterar todos
        // O PaperTradingService atual suporta multi-user. Vamos operar na conta de teste padrão se houver.

        // Simulação: Vamos criar uma conta 'AutoTrader' se não existir e operar nela
        const botUserId = 'autotrader_host';
        const account = sqliteDatabase.getAccount(botUserId);

        if (!account) {
            sqliteDatabase.createAccount(botUserId, 'AutoTrader AI', 1000); // Start with $1k
        }

        // Check deduplication (Já operamos esse sinal específico?)
        // Simples verificação: Se já tem posição aberta nesse symbol, não aumenta (Pyramiding OFF for MVP)
        const existingPos = sqliteDatabase.getOpenPositions(sqliteDatabase.getAccount(botUserId).id);
        if (existingPos.find(p => p.symbol === techSignal.symbol)) return;

        // --- CÁLCULO DE ALAVANCAGEM ---
        let leverage = 3; // Base
        const absScore = Math.abs(news.sentiment_score);

        // Escalada de Convicção
        if (absScore >= 0.9) {
            leverage = 10; // "Double or Nothing" Max Conviction
        } else if (absScore >= 0.75) {
            leverage = 5;  // Strong Conviction
        }

        console.log(`[AutoTrader] 🚀 EXECUTING TRADE: ${techSignal.action} ${techSignal.symbol} | Leverage: ${leverage}x`);
        console.log(`[AutoTrader] Confluece: Tech Score ${techSignal.score} + News Score ${news.sentiment_score} ("${news.title}")`);

        // Executar
        this.paperTrading.executeEntry(botUserId, {
            symbol: techSignal.symbol,
            action: techSignal.action,
            price: techSignal.entry_price,
            stopLoss: techSignal.stop_loss,
            takeProfit: techSignal.take_profit,
            leverage: leverage
        });

        // (Opcional) Notificar Telegram aqui se tivesse acesso ao bot instance
        // Como o TelegramListener é quem escuta, podemos ter um EventBus ou o AutoTrader retornar algo.
        // Por enquanto, log no console basta. 
    }
}
