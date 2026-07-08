import type { TradingSignal, AlertMessage } from "./types";
import { getRandomQuote } from "./quotes";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED === "true";
const SCRIPTS_DIR = path.join(__dirname, "..", "scripts");

class TelegramService {
    private get botToken(): string {
        return process.env.TELEGRAM_BOT_TOKEN || "";
    }

    private get channelId(): string {
        return process.env.TELEGRAM_CHANNEL_ID || "";
    }

    private checkCredentials(): boolean {
        if (!this.botToken || !this.channelId) {
            console.warn("Telegram credentials not configured");
            return false;
        }
        return true;
    }

    private async sendMessage(text: string, parseMode: "HTML" | "Markdown" = "Markdown"): Promise<boolean> {
        if (!TELEGRAM_ENABLED) {
            console.log("[Telegram] DISABLED - Message not sent");
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

            console.log("[Telegram] Message sent");
            return true;
        } catch (error) {
            console.error("Error sending message:", error);
            return false;
        }
    }

    private async sendPhotoWithCaption(photoPath: string, caption: string, parseMode: "HTML" | "Markdown" = "Markdown"): Promise<boolean> {
        if (!TELEGRAM_ENABLED) {
            console.log("[Telegram] DISABLED - Photo not sent");
            return true;
        }

        if (!fs.existsSync(photoPath)) {
            console.warn(`[Telegram] Photo not found: ${photoPath}, falling back to text`);
            return this.sendMessage(caption, parseMode);
        }

        try {
            const url = `${TELEGRAM_API_BASE}${this.botToken}/sendPhoto`;
            
            const formData = new FormData();
            formData.append("chat_id", this.channelId);
            formData.append("caption", caption);
            formData.append("parse_mode", parseMode);
            
            const fileBuffer = fs.readFileSync(photoPath);
            const blob = new Blob([fileBuffer], { type: "image/jpeg" });
            formData.append("photo", blob, "sauron.jpg");

            const response = await fetch(url, {
                method: "POST",
                body: formData,
            });

            const result = await response.json() as { ok: boolean; description?: string };

            if (!result.ok) {
                console.error("[Telegram] Photo API error:", result);
                return this.sendMessage(caption, parseMode);
            }

            console.log("[Telegram] Photo sent with caption");
            
            // Limpar arquivo temporário
            try {
                fs.unlinkSync(photoPath);
            } catch {}
            
            return true;
        } catch (error) {
            console.error("[Telegram] Error sending photo:", error);
            return this.sendMessage(caption, parseMode);
        }
    }

    generateSauronImage(symbol: string, direction: string, score: number, quote: string = "O Olho ve tudo."): string | null {
        try {
            const scriptPath = path.join(SCRIPTS_DIR, "generate-sauron.py");
            if (!fs.existsSync(scriptPath)) {
                console.warn("[Sauron] Script not found:", scriptPath);
                return null;
            }

            const cacheDir = "/tmp/eos-sauron";
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }

            const ts = Date.now();
            const outputPath = path.join(cacheDir, `sauron-${symbol}-${ts}.jpg`);

            console.log(`[Sauron] Generating image for ${symbol} ${direction}...`);
            
            execSync(
                `python3 "${scriptPath}" "${symbol}" "${direction}" "${score}" "${quote}" "${outputPath}"`,
                { timeout: 90000, stdio: "pipe" }
            );

            if (fs.existsSync(outputPath)) {
                const size = fs.statSync(outputPath).size;
                console.log(`[Sauron] Image generated: ${outputPath} (${(size / 1024).toFixed(1)} KB)`);
                return outputPath;
            }

            return null;
        } catch (error) {
            console.error("[Sauron] Generation failed:", error);
            return null;
        }
    }

    async sendSignal(signal: TradingSignal): Promise<boolean> {
        const actionText = signal.action === "BUY" ? "COMPRA" : "VENDA";

        let message = `*Novo Sinal!*\n\n`;
        message += `Par: ${signal.symbol}\n`;
        message += `Direcao: ${actionText}\n`;
        message += `Preco: $${signal.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;

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

        // Gerar imagem do Sauron
        const score = (signal as any).score || 75;
        const imagePath = this.generateSauronImage(signal.symbol, signal.action, score);
        
        if (imagePath) {
            return this.sendPhotoWithCaption(imagePath, message.trim());
        }
        
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

    async sendBreakoutAlert(message: string, symbol?: string, direction?: string, score?: number, quote?: string): Promise<boolean> {
        const prefixedMessage = `🔮 *EoS CRYPTO*\n\n${message}`;
        
        // Se temos dados do sinal, gerar imagem
        if (symbol && direction && score) {
            const imagePath = this.generateSauronImage(symbol, direction, score, quote);
            
            if (imagePath) {
                return this.sendPhotoWithCaption(imagePath, prefixedMessage);
            }
        }
        
        return this.sendMessage(prefixedMessage);
    }
}

export const telegram = new TelegramService();
