import type { TradingSignal, AlertMessage } from "./types";
import { getRandomQuote } from "./quotes";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

// Flag para desabilitar envio de sinais ao Telegram
// Definir TELEGRAM_ENABLED=true para habilitar
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED === 'true';

class TelegramService {
    private get botToken(): string {
        return process.env.TELEGRAM_BOT_TOKEN || "";
    }

    private get channelId(): string {
        return process.env.TELEGRAM_CHANNEL_ID || "";
    }

    private checkCredentials(): boolean {
        if (!this.botToken || !this.channelId) {
            console.warn("⚠️ Telegram credentials not configured");
            return false;
        }
        return true;
    }

    private async sendMessage(text: string, parseMode: "HTML" | "Markdown" = "Markdown"): Promise<boolean> {
        // Se Telegram desabilitado, apenas log e retorna true
        if (!TELEGRAM_ENABLED) {
            console.log("[Telegram] DISABLED - Mensagem não enviada (TELEGRAM_ENABLED=false)");
            return true;
        }

        try {
            const url = `${TELEGRAM_API_BASE}${this.botToken}/sendMessage`;

            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: this.channelId,
                    text,
                    parse_mode: parseMode,
                    disable_web_page_preview: true,
                }),
            });

            const result = await response.json() as { ok: boolean; description?: string };

            if (!result.ok) {
                console.error("Telegram API error:", result);
                return false;
            }

            console.log("✅ Message sent to Telegram");
            return true;
        } catch (error) {
            console.error("Error sending message:", error);
            return false;
        }
    }

    async sendSignal(signal: TradingSignal): Promise<boolean> {
        const actionText = signal.action === "BUY" ? "COMPRA" : "VENDA";

        let message = `*Novo Sinal!*

Par: ${signal.symbol}
Direção: ${actionText}
Preço: $${signal.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
`;

        if (signal.stopLoss) {
            message += `Stop: $${signal.stopLoss.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
        }

        if (signal.takeProfit) {
            message += `Alvo: $${signal.takeProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
        }

        if (signal.timeframe) {
            message += `Timeframe: ${signal.timeframe}\n`;
        }

        message += `\n_${getRandomQuote()}_`;

        return this.sendMessage(message.trim());
    }

    async sendAlert(alert: AlertMessage): Promise<boolean> {
        const emojiMap = {
            info: "ℹ️",
            warning: "⚠️",
            success: "✅",
            error: "❌",
        };

        const emoji = emojiMap[alert.type || "info"];
        const message = `${emoji} <b>ALERTA EOS</b>\n\n${alert.message}\n\n⚡️ <i>EOS - Eye of Sauron</i>`;

        return this.sendMessage(message);
    }

    async testConnection(): Promise<{ ok: boolean; botName?: string; error?: string }> {
        try {
            const url = `${TELEGRAM_API_BASE}${this.botToken}/getMe`;
            const response = await fetch(url);
            const result = await response.json() as { ok: boolean; result?: { username: string }; description?: string };

            if (result.ok) {
                return { ok: true, botName: result.result?.username };
            }

            return { ok: false, error: result.description };
        } catch (error) {
            return { ok: false, error: String(error) };
        }
    }

    async sendBreakoutAlert(message: string): Promise<boolean> {
        const prefixedMessage = `🔮 *EoS CRYPTO*\n\n${message}`;
        return this.sendMessage(prefixedMessage);
    }
}

export const telegram = new TelegramService();
