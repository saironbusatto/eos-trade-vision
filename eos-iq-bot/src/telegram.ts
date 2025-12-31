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

    async sendMessage(text: string, parseMode: "HTML" | "Markdown" = "Markdown"): Promise<boolean> {
        if (!this.checkCredentials()) return false;

        // Adicionar prefixo EoS IQ
        const prefixedText = `🎯 *EoS IQ*\n\n${text}`;

        try {
            const url = `${TELEGRAM_API_BASE}${this.botToken}/sendMessage`;

            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: this.channelId,
                    text: prefixedText,
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
}

export const telegram = new TelegramService();
