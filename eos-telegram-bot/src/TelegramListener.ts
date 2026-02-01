import TelegramBot from 'node-telegram-bot-api';
import { PaperTradingService } from './services/PaperTradingService';
import { AutoTrader } from './services/AutoTrader';
import { sqliteDatabase } from './sqliteDatabase';
import dotenv from 'dotenv';
dotenv.config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const PAPER_TRADING_ENABLED = true;

// Serviço
const paperService = new PaperTradingService();
const autoTrader = new AutoTrader();

export class TelegramListener {
    private bot: TelegramBot | null = null;
    private autoTraderStarted = false;

    constructor() {
        if (!TOKEN) {
            console.error('[TelegramListener] Token não encontrado!');
            return;
        }

        // Polling mode para receber mensagens
        this.bot = new TelegramBot(TOKEN, { polling: true });
        this.registerCommands();
        console.log('[TelegramListener] Bot iniciado em modo Polling. 🚀');
    }

    private registerCommands() {
        if (!this.bot) return;

        // /ajuda
        this.bot.onText(/\/ajuda/, (msg) => {
            const helpText = `
🤖 *Comandos do EOS Trader:*

💰 *Paper Trading:*
\`/iniciar [1000]\` - Criar/Resetar conta
\`/carteira\` - Ver Saldo, Equity e PnL
\`/trade [C/V] [PAR] [PREÇO]\` - Trade Manual (Ex: \`/trade C BTCUSDT 95000\`)
\`/fechar [PAR]\` - Fechar posição (Ex: \`/fechar BTCUSDT\`)

🧠 *Inteligência Artificial:*
\`/autotrader [on/off]\` - Ligar/Desligar Agente Autônomo
\`/status\` - Ver status do AutoTrader
\`/news\` - Ver últimas notícias de alto impacto detectadas
`;
            this.bot?.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
        });

        // /iniciar [valor]
        this.bot.onText(/\/iniciar (.+)/, (msg, match) => {
            const chatId = msg.chat.id;
            const userId = msg.from?.id.toString();
            const username = msg.from?.username || msg.from?.first_name || 'Trader';
            const value = parseFloat(match ? match[1] : '1000');

            if (!userId) return;

            if (isNaN(value)) {
                this.bot?.sendMessage(chatId, '⚠️ Por favor, informe um valor numérico. Ex: `/iniciar 1000`', { parse_mode: 'Markdown' });
                return;
            }

            const response = paperService.startAccount(userId, username, value);
            this.bot?.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        });

        // /iniciar (sem valor)
        this.bot.onText(/\/iniciar$/, (msg) => {
            this.bot?.sendMessage(msg.chat.id, '⚠️ Use `/iniciar [valor]`. Ex: `/iniciar 1000`', { parse_mode: 'Markdown' });
        });

        // /carteira
        this.bot.onText(/\/(carteira|estatisticas)/, (msg) => {
            const userId = msg.from?.id.toString();
            if (!userId) return;

            const response = paperService.getPortfolioStats(userId);
            this.bot?.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
        });

        // /trade [C/V] [SYMBOL] [PRICE] (Manual Test)
        this.bot.onText(/\/trade (C|V|BUY|SELL) (\w+) (.+)/i, (msg, match) => {
            const chatId = msg.chat.id;
            const userId = msg.from?.id.toString();
            if (!userId || !match) return;

            const action = (match[1].toUpperCase().startsWith('C') || match[1].toUpperCase() === 'BUY') ? 'BUY' : 'SELL';
            const symbol = match[2].toUpperCase();
            const price = parseFloat(match[3]);

            if (isNaN(price)) {
                this.bot?.sendMessage(chatId, '⚠️ Preço inválido', { parse_mode: 'Markdown' });
                return;
            }

            // Simular sinal manual
            const mockSignal = {
                symbol: symbol,
                action: action as 'BUY' | 'SELL',
                price: price,
                stopLoss: action === 'BUY' ? price * 0.95 : price * 1.05,
                takeProfit: action === 'BUY' ? price * 1.10 : price * 0.90,
                leverage: 5 // Manual trades = 5x default for fun
            };

            paperService.executeEntry(userId, mockSignal);
            this.bot?.sendMessage(chatId, `🛠 *Trade Manual Executado*\n${action} ${symbol} @ ${price}\n(Stop: ${mockSignal.stopLoss}, TP: ${mockSignal.takeProfit})`, { parse_mode: 'Markdown' });
        });

        // /fechar [SYMBOL]
        this.bot.onText(/\/fechar (\w+)/, (msg, match) => {
            const chatId = msg.chat.id;
            const userId = msg.from?.id.toString();
            if (!userId || !match) return;

            const symbol = match[1].toUpperCase();

            // Need a current price to close... simulates market close using last known or arbitrary for manual test?
            // For manual close via simple command, let's ask user for price or fetch from "market" (not available here easily without price service).
            // Let's assume user provides price: /fechar BTCUSDT 96000
            this.bot?.sendMessage(chatId, "⚠️ Use `/fechar_preco [SYMBOL] [PRICE]` para simular o preço de saída.", { parse_mode: 'Markdown' });
        });

        // /fechar_preco [SYMBOL] [PRICE]
        this.bot.onText(/\/fechar_preco (\w+) (.+)/, (msg, match) => {
            const chatId = msg.chat.id;
            const userId = msg.from?.id.toString();
            if (!userId || !match) return;

            const symbol = match[1].toUpperCase();
            const price = parseFloat(match[2]);

            const result = paperService.executeExit(userId, symbol, price, "MANUAL_CLOSE");

            if (result) {
                this.bot?.sendMessage(chatId, `✅ *Posição Fechada*\n${result.message}`, { parse_mode: 'Markdown' });
            } else {
                this.bot?.sendMessage(chatId, `❌ Nenhuma posição aberta encontrada para ${symbol} ou erro ao fechar.`, { parse_mode: 'Markdown' });
            }
        });

        // /autotrader [on/off]
        this.bot.onText(/\/autotrader (on|off)/i, (msg, match) => {
            if (!match) return;
            const action = match[1].toLowerCase();

            if (action === 'on') {
                if (!this.autoTraderStarted) {
                    autoTrader.start();
                    this.autoTraderStarted = true;
                    this.bot?.sendMessage(msg.chat.id, "🤖 **AutoTrader Iniciado!**\nMonitorando mercado a cada 60s...", { parse_mode: 'Markdown' });
                } else {
                    this.bot?.sendMessage(msg.chat.id, "🤖 AutoTrader já está rodando.", { parse_mode: 'Markdown' });
                }
            } else {
                autoTrader.stop();
                this.autoTraderStarted = false;
                this.bot?.sendMessage(msg.chat.id, "🛑 **AutoTrader Parado.**", { parse_mode: 'Markdown' });
            }
        });

        // /status
        this.bot.onText(/\/status/, (msg) => {
            const status = this.autoTraderStarted ? "🟢 ONLINE" : "🔴 OFFLINE";
            this.bot?.sendMessage(msg.chat.id, `🤖 **Status do AutoTrader:** ${status}`, { parse_mode: 'Markdown' });
        });

        // /news
        this.bot.onText(/\/news/, (msg) => {
            const signals = sqliteDatabase.getRecentSentimentSignals(180, 4); // Últimas 3h, Impacto >= 4

            if (signals.length === 0) {
                this.bot?.sendMessage(msg.chat.id, "📭 Nenhuma notícia de alto impacto recente.", { parse_mode: 'Markdown' });
                return;
            }

            let response = "*📰 Últimas Notícias de Alto Impacto:*\n\n";
            signals.slice(0, 5).forEach((s: any) => {
                const icon = s.sentiment_score > 0 ? "🟢" : "🔴";
                response += `${icon} *Score: ${s.sentiment_score}* (Impact: ${s.impact_rating})\n[${s.title}](${s.link})\nReason: ${s.reasoning}\n\n`;
            });

            this.bot?.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
        });

        // Log erros de polling
        this.bot.on('polling_error', (error) => {
            // Ignora erros comuns de timeout/network para não sujar log
            if (error.message.includes('ETELEGRAM')) return;
            console.error(`[TelegramListener] Polling Error: ${error.message}`);
        });
    }

    // Método público para enviar mensagens proativos (Sinais/Alertas)
    public async sendMessage(chatId: string, text: string): Promise<boolean> {
        if (!this.bot) return false;
        try {
            await this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
            return true;
        } catch (err) {
            console.error('[TelegramListener] Erro ao enviar mensagem:', err);
            return false;
        }
    }

    // Metodos migrados do antigo telegram.ts
    // ----------------------------------------------------------------

    public async sendSignal(signal: any): Promise<boolean> {
        const channelId = process.env.TELEGRAM_CHANNEL_ID;
        if (!channelId) return false;

        const actionText = signal.action === "BUY" ? "COMPRA 🟢" : "VENDA 🔴";
        const emoji = signal.action === "BUY" ? "🚀" : "📉";

        let message = `*Novo Sinal!* ${emoji}

*Par:* ${signal.symbol}
*Direção:* ${actionText}
*Preço:* $${signal.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
`;

        if (signal.stopLoss) {
            message += `*Stop:* $${signal.stopLoss.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
        }

        if (signal.takeProfit) {
            message += `*Alvo:* $${signal.takeProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
        }

        if (signal.timeframe) {
            message += `*Timeframe:* ${signal.timeframe}\n`;
        }

        return this.sendMessage(channelId, message.trim());
    }

    public async sendAlert(alert: { message: string, type?: string }): Promise<boolean> {
        const channelId = process.env.TELEGRAM_CHANNEL_ID;
        if (!channelId) return false;

        const emojiMap: Record<string, string> = {
            info: "ℹ️",
            warning: "⚠️",
            success: "✅",
            error: "❌",
        };

        const emoji = emojiMap[alert.type || "info"] || "ℹ️";

        const message = `${emoji} *ALERTA EOS*\n\n${alert.message}\n\n⚡️ _EOS - Eye of Sauron_`;
        return this.sendMessage(channelId, message);
    }

    public async testConnection(): Promise<{ ok: boolean; botName?: string; error?: string }> {
        if (!this.bot) return { ok: false, error: 'Bot not initialized' };
        try {
            const me = await this.bot.getMe();
            return { ok: true, botName: me.username };
        } catch (err: any) {
            return { ok: false, error: err.message };
        }
    }
}


export const telegramListener = new TelegramListener();
