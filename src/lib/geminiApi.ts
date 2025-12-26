// Gemini AI Service for Chat
// Uses environment variable VITE_GEMINI_API_KEY

import { getMarketData, formatPrice, formatPercent, formatVolume, type Ticker24h, type Kline } from "./binanceApi";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

interface GeminiContent {
    role: string;
    parts: Array<{ text: string }>;
}

interface GeminiResponse {
    candidates?: Array<{
        content: {
            parts: Array<{ text: string }>;
        };
    }>;
    error?: {
        message: string;
    };
}

const SYSTEM_PROMPT = `Você é um assistente especialista em criptomoedas e trading. Seu nome é EOS Assistant.

Você tem acesso a dados em tempo real da Binance e deve usá-los para responder perguntas sobre criptomoedas.

Regras:
1. Seja conciso e direto nas respostas
2. Quando dados de mercado forem fornecidos, use-os na sua resposta
3. Formate números de forma legível (use K, M, B para grandes números)
4. Indique se o preço está subindo (🟢) ou caindo (🔴) nas últimas 24h
5. Nunca invente dados - use apenas os dados fornecidos
6. Responda sempre em português do Brasil
7. Para análises, seja cauteloso e mencione que trading envolve riscos
8. Se não tiver dados para responder, diga que não conseguiu buscar as informações

Formato sugerido para respostas sobre preços:
- Preço atual
- Variação 24h
- Volume 24h (se relevante)
- Breve análise ou observação`;

// Extract potential crypto symbols from user message
function extractSymbols(message: string): string[] {
    const symbols: string[] = [];
    const words = message.toLowerCase().split(/\s+/);

    const cryptoKeywords = [
        "bitcoin", "btc", "ethereum", "eth", "ether", "bnb", "binance",
        "solana", "sol", "cardano", "ada", "ripple", "xrp", "dogecoin", "doge",
        "polkadot", "dot", "avalanche", "avax", "polygon", "matic", "chainlink", "link",
        "litecoin", "ltc", "uniswap", "uni", "shiba", "shib", "tron", "trx",
        "stellar", "xlm", "cosmos", "atom", "near", "aptos", "apt",
        "arbitrum", "arb", "optimism", "op", "sui", "pepe"
    ];

    for (const word of words) {
        const cleanWord = word.replace(/[^a-z]/g, "");
        if (cryptoKeywords.includes(cleanWord)) {
            symbols.push(cleanWord);
        }
    }

    // Also check for uppercase symbols like BTC, ETH
    const upperMatches = message.match(/\b[A-Z]{2,5}\b/g);
    if (upperMatches) {
        symbols.push(...upperMatches.map(s => s.toLowerCase()));
    }

    return [...new Set(symbols)];
}

// Build market context from Binance data
async function buildMarketContext(symbols: string[]): Promise<string> {
    if (symbols.length === 0) return "";

    const contexts: string[] = [];

    for (const symbol of symbols.slice(0, 3)) { // Limit to 3 symbols
        const data = await getMarketData(symbol);

        if (data.ticker) {
            const ticker = data.ticker;
            const priceChange = parseFloat(ticker.priceChangePercent);
            const trend = priceChange >= 0 ? "🟢 alta" : "🔴 queda";

            contexts.push(`
📊 ${ticker.symbol}:
- Preço atual: $${formatPrice(ticker.lastPrice)}
- Variação 24h: ${formatPercent(ticker.priceChangePercent)} (${trend})
- Máxima 24h: $${formatPrice(ticker.highPrice)}
- Mínima 24h: $${formatPrice(ticker.lowPrice)}
- Volume 24h: $${formatVolume(ticker.quoteVolume)} USDT
- Preço de abertura: $${formatPrice(ticker.openPrice)}`);
        }
    }

    if (contexts.length === 0) return "";

    return `\n\n[DADOS DE MERCADO EM TEMPO REAL - Use estas informações na sua resposta]\n${contexts.join("\n")}`;
}

// Convert chat history to Gemini format
function toGeminiFormat(messages: ChatMessage[]): GeminiContent[] {
    return messages.map(msg => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }]
    }));
}

// Send message to Gemini API
export async function sendMessage(
    messages: ChatMessage[],
    userMessage: string
): Promise<string> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
        return "❌ API Key do Gemini não configurada. Configure a variável VITE_GEMINI_API_KEY.";
    }

    try {
        // Extract symbols and get market data
        const symbols = extractSymbols(userMessage);
        const marketContext = await buildMarketContext(symbols);

        // Build conversation with market context
        const augmentedMessage = userMessage + marketContext;

        const conversationHistory = toGeminiFormat(messages);
        conversationHistory.push({
            role: "user",
            parts: [{ text: augmentedMessage }]
        });

        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                contents: conversationHistory,
                systemInstruction: {
                    parts: [{ text: SYSTEM_PROMPT }]
                },
                generationConfig: {
                    temperature: 0.7,
                    topP: 0.95,
                    topK: 40,
                    maxOutputTokens: 1024,
                }
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Gemini API error:", errorData);
            return `❌ Erro na API: ${errorData.error?.message || "Erro desconhecido"}`;
        }

        const data: GeminiResponse = await response.json();

        if (data.error) {
            return `❌ Erro: ${data.error.message}`;
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            return "❌ Não consegui gerar uma resposta. Tente novamente.";
        }

        return text;
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return "❌ Erro ao conectar com a IA. Verifique sua conexão.";
    }
}

// Quick price check without AI
export async function getQuickPrice(symbol: string): Promise<string> {
    const data = await getMarketData(symbol);

    if (!data.ticker) {
        return `❌ Não encontrei o símbolo "${symbol}". Tente usar o nome completo (ex: Bitcoin, Ethereum).`;
    }

    const ticker = data.ticker;
    const priceChange = parseFloat(ticker.priceChangePercent);
    const trend = priceChange >= 0 ? "🟢" : "🔴";

    return `${trend} **${ticker.symbol}**
💰 Preço: $${formatPrice(ticker.lastPrice)}
📈 24h: ${formatPercent(ticker.priceChangePercent)}
📊 Volume: $${formatVolume(ticker.quoteVolume)}`;
}
