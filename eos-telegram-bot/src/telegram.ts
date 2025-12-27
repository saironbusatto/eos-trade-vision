import type { TradingSignal, AlertMessage } from "./types";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

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

    private async sendMessage(text: string, parseMode: "HTML" | "Markdown" = "HTML"): Promise<boolean> {
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
        const emoji = signal.action === "BUY" ? "🟢" : "🔴";
        const actionText = signal.action === "BUY" ? "COMPRA" : "VENDA";

        let message = `
${emoji} <b>SINAL DE ${actionText}</b> ${emoji}

📊 <b>Par:</b> ${signal.symbol}
💰 <b>Preço:</b> $${signal.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
`;

        if (signal.stopLoss) {
            message += `🛑 <b>Stop Loss:</b> $${signal.stopLoss.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
        }

        if (signal.takeProfit) {
            message += `🎯 <b>Take Profit:</b> $${signal.takeProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
        }

        if (signal.timeframe) {
            message += `⏰ <b>Timeframe:</b> ${signal.timeframe}\n`;
        }

        if (signal.notes) {
            message += `\n📝 <i>${signal.notes}</i>\n`;
        }

        message += `\n⚡️ <i>EOS - Eye of Sauron</i>`;

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
        return this.sendMessage(message);
    }
}

export const telegram = new TelegramService();
