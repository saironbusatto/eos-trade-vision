import type { TradingSignal, AlertMessage } from "./types";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

// MODO GOLDEN ONLY - bloqueia TODAS as mensagens normais
// Apenas sendGoldenMessage consegue enviar
const GOLDEN_ONLY_MODE = true;

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

    // Método interno que realmente envia
    private async _sendToTelegram(text: string, parseMode: "HTML" | "Markdown" = "Markdown"): Promise<boolean> {
        if (!this.checkCredentials()) return false;

        const MAX_RETRIES = 3;
        let attempt = 0;

        while (attempt < MAX_RETRIES) {
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
                    attempt++;
                    if (attempt < MAX_RETRIES) {
                        await new Promise(r => setTimeout(r, 2000));
                        continue;
                    }
                    return false;
                }

                console.log("✅ Message sent to Telegram");
                return true;
            } catch (error: unknown) {
                console.error("Error sending message:", error);
                attempt++;
                if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                return false;
            }
        }

        console.error(`[Telegram] Falha após ${MAX_RETRIES} tentativas`);
        return false;
    }

    // Método público normal - BLOQUEADO em modo golden only
    async sendMessage(text: string, parseMode: "HTML" | "Markdown" = "Markdown"): Promise<boolean> {
        if (GOLDEN_ONLY_MODE) {
            console.log("[Telegram] BLOQUEADO - Modo golden only ativo (sendMessage)");
            return true;
        }

        const prefixedText = `🎯 *EoS IQ*\n\n${text}`;
        return this._sendToTelegram(prefixedText, parseMode);
    }

    // Método para sinais GOLDEN - SEMPRE envia (bypassa GOLDEN_ONLY_MODE)
    async sendGoldenMessage(text: string): Promise<boolean> {
        console.log("[Telegram] Enviando mensagem GOLDEN...");
        return this._sendToTelegram(text, "Markdown");
    }

    // Testar conexão
    async testConnection(): Promise<{ ok: boolean; botName?: string; error?: string }> {
        try {
            const url = `${TELEGRAM_API_BASE}${this.botToken}/getMe`;
            const response = await fetch(url);
            const result = await response.json() as { ok: boolean; result?: { username: string }; description?: string };

            if (result.ok && result.result) {
                return { ok: true, botName: result.result.username };
            }
            return { ok: false, error: result.description };
        } catch (error: unknown) {
            const err = error as Error;
            return { ok: false, error: err.message };
        }
    }
}

export const telegram = new TelegramService();
