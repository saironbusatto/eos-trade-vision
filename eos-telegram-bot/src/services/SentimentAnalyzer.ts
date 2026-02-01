
import OpenAI from 'openai';
import crypto from 'crypto';
import { sqliteDatabase } from '../sqliteDatabase';

const MODEL = 'gpt-4o-mini';
const PROMPT_VERSION = 'v2.0_scoring_filter';

// === FILTER CONFIGURATION (Phase 4) ===

// 1. Blacklist (Hard Reject: -999)
// "opinion", "tutorial", "top 10", "press release"
const BLACKLIST_REGEX = /sponsored|press release|advertorial|partner|paid|giveaway|airdrop|whitelist|mint|pre-sale|claim now|referral|sign up|price prediction|price analysis|technical analysis|opinion|rumor|speculation|top 10|best coins|what is|tutorial|guide|explained|meme|shiba|doge/i;

// 2. Critical Events (+3)
// "lawsuit", "hack", "insolvency", "ETF filing"
const CRITICAL_EVENTS_REGEX = /lawsuit|settlement|charges|subpoena|investigation|enforcement|court|judge|cease and desist|injunction|approve|approval|deny|denial|spot etf|etf filing|s-1|19b-4|hack|exploit|drained|breach|private key|hot wallet|suspends withdrawals|halts trading|insolvent|bankruptcy|restructuring|proof of reserves|depeg/i;

// 3. Regulatory/Market Structure (+2)
// "SEC", "Fed", "Liquidations" (checked with numbers later)
const REGULATORY_REGEX = /sec|cftc|doj|fed|fomc|treasury|irs|eu|esma|uk fca|hong kong sfc/i;

// 4. Entities (+1)
// Major Players & Assets
const PLAYERS_REGEX = /binance|coinbase|kraken|okx|bybit|blackrock|fidelity|grayscale|tether|circle/i;
const ASSETS_REGEX = /\b(bitcoin|btc|ethereum|eth|solana|sol|bnb|xrp|usdt|usdc)\b/i;

// 5. Numeric Data Context (Required for "Liquidations" to count)
// $50m, 1h, 24h, 100 million
const NUMERIC_CONTEXT_REGEX = /\b(\$?\d+(\.\d+)?\s?(m|bn|b|million|billion|k))\b|\b(5m|15m|30m|1h|4h|24h)\b/i;
const MARKET_TERMS_REGEX = /liquidation|funding rate|open interest|margin requirements|circuit breaker|market outage/i;

export class SentimentAnalyzer {
    private openai: OpenAI | null = null;
    private isRunning: boolean = false;
    private intervalId: NodeJS.Timeout | null = null;

    constructor() {
        if (process.env.OPENAI_API_KEY) {
            this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        } else {
            console.warn('[SentimentAnalyzer] OPENAI_API_KEY not found. Service disabled.');
        }
    }

    public start(intervalMs: number = 60000) { // Check every 1 min
        if (this.isRunning) return;

        const enabled = process.env.ENABLE_SENTIMENT_ANALYSIS === 'true';
        this.isRunning = true;
        console.log(`[SentimentAnalyzer] Started. Polling every ${intervalMs / 1000}s. Enabled: ${enabled}`);

        this.analyzeJob();
        this.intervalId = setInterval(() => this.analyzeJob(), intervalMs);
    }

    public stop() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.isRunning = false;
        console.log('[SentimentAnalyzer] Stopped');
    }

    private async analyzeJob() {
        const enabled = process.env.ENABLE_SENTIMENT_ANALYSIS === 'true';
        if (!enabled || !this.openai) return;

        try {
            const items = sqliteDatabase.getUnprocessedNews(5); // Process batch of 5
            if (items.length === 0) return;

            console.log(`[SentimentAnalyzer] Processing ${items.length} new items...`);

            for (const item of items) {
                await this.processItem(item);
            }
        } catch (err: any) {
            console.error('[SentimentAnalyzer] Job error:', err.message);
        }
    }

    private async processItem(item: any) {
        // Stage 1: Regex Filter
        if (!CRYPTO_KEYWORDS.test(item.title) && !CRYPTO_KEYWORDS.test(item.link)) {
            // Irrelevant
            this.saveResult(item.id, false, 0, 0, "Keywords not found (Stage 1)", "");
            return;
        }

        // Stage 2: LLM Analysis
        try {
            const prompt = `
Analyze this crypto news item for market sentiment impact.
Title: "${item.title}"
Link: "${item.link}"

Determine:
1. Is it strictly relevant to crypto market prices? (bool)
2. Sentiment Score (-1.0 to +1.0)
3. Impact Rating (1-5), where 5 is massive market mover.
4. Short reasoning (max 15 words).

Return strictly valid JSON:
{
  "crypto_relevant": boolean,
  "sentiment_score": number, 
  "impact_rating": number,
  "reasoning": string
}`;

            const inputHash = crypto.createHash('md5').update(prompt).digest('hex');

            const completion = await this.openai!.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: MODEL,
                response_format: { type: "json_object" },
                temperature: 0.0
            });

            const content = completion.choices[0].message.content;
            if (!content) throw new Error("Empty response from OpenAI");

            const result = JSON.parse(content);

            this.saveResult(
                item.id,
                result.crypto_relevant,
                result.sentiment_score,
                result.impact_rating,
                result.reasoning,
                inputHash
            );

        } catch (err: any) {
            console.error(`[SentimentAnalyzer] Error processing item ${item.id}:`, err.message);
        }
    }

    private saveResult(
        newsId: number,
        relevant: boolean,
        score: number,
        impact: number,
        reasoning: string,
        inputHash: string
    ) {
        sqliteDatabase.insertNewsSignal({
            news_item_id: newsId,
            crypto_relevant: relevant,
            sentiment_score: score,
            impact_rating: impact,
            reasoning: reasoning,
            model_used: MODEL,
            prompt_version: PROMPT_VERSION,
            input_hash: inputHash
        });
    }
}
