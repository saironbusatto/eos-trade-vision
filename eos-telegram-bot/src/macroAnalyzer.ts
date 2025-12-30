/**
 * Macro Sentiment Analyzer using Perplexity API
 * Fetches macro + crypto sentiment and returns structured JSON
 */

export interface MacroAnalysis {
    macro: {
        sp500_trend: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
        fed_stance: 'HAWKISH' | 'NEUTRAL' | 'DOVISH';
        dxy_trend: 'UP' | 'STABLE' | 'DOWN';
        risk_sentiment: 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF';
    };
    crypto: {
        btc_sentiment: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
        altcoin_sentiment: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
        fear_greed: number;  // 0-100
    };
    overall: {
        sentiment: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
        confidence: number;  // 0.0-1.0
        trade_recommendation: 'AGGRESSIVE' | 'NORMAL' | 'CONSERVATIVE' | 'AVOID';
    };
    key_events: string[];
    warnings: string[];
    timestamp: string;
}

// Default neutral analysis when API fails
const DEFAULT_ANALYSIS: MacroAnalysis = {
    macro: {
        sp500_trend: 'NEUTRAL',
        fed_stance: 'NEUTRAL',
        dxy_trend: 'STABLE',
        risk_sentiment: 'NEUTRAL'
    },
    crypto: {
        btc_sentiment: 'NEUTRAL',
        altcoin_sentiment: 'NEUTRAL',
        fear_greed: 50
    },
    overall: {
        sentiment: 'NEUTRAL',
        confidence: 0.5,
        trade_recommendation: 'NORMAL'
    },
    key_events: [],
    warnings: ['Using default values - API unavailable'],
    timestamp: new Date().toISOString()
};

// Cache to avoid calling API too frequently
let cachedAnalysis: MacroAnalysis | null = null;
let lastFetchHour: number = -1;

// S&P 500 trading schedule (UTC):
// Before open: 13:00 UTC (9:00 AM ET)
// 2h after open: 16:00 UTC (12:00 PM ET)  
// Mid-session: 18:00 UTC (2:00 PM ET)
// Near close: 20:00 UTC (4:00 PM ET)
const SP500_FETCH_HOURS = [13, 16, 18, 20];

function shouldRefreshMacro(): boolean {
    const now = new Date();
    const currentHour = now.getUTCHours();

    // Check if we're in a S&P 500 fetch window (within the hour)
    const isInFetchWindow = SP500_FETCH_HOURS.includes(currentHour);

    // Only fetch if we're in a fetch window AND haven't fetched this hour
    if (isInFetchWindow && currentHour !== lastFetchHour) {
        return true;
    }

    // Also fetch if we've never fetched
    if (!cachedAnalysis) {
        return true;
    }

    return false;
}

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

const PROMPT = `You are a financial analyst AI. Analyze the current macro and crypto market conditions and respond ONLY with valid JSON in this exact format:

{
  "macro": {
    "sp500_trend": "BULLISH" | "NEUTRAL" | "BEARISH",
    "fed_stance": "HAWKISH" | "NEUTRAL" | "DOVISH",
    "dxy_trend": "UP" | "STABLE" | "DOWN",
    "risk_sentiment": "RISK_ON" | "NEUTRAL" | "RISK_OFF"
  },
  "crypto": {
    "btc_sentiment": "BULLISH" | "NEUTRAL" | "BEARISH",
    "altcoin_sentiment": "BULLISH" | "NEUTRAL" | "BEARISH",
    "fear_greed": 0-100
  },
  "overall": {
    "sentiment": "BULLISH" | "NEUTRAL" | "BEARISH",
    "confidence": 0.0-1.0,
    "trade_recommendation": "AGGRESSIVE" | "NORMAL" | "CONSERVATIVE" | "AVOID"
  },
  "key_events": ["event1", "event2"],
  "warnings": ["warning1"]
}

Respond with ONLY the JSON, no explanation or markdown.`;

export async function getMacroAnalysis(forceRefresh: boolean = false): Promise<MacroAnalysis> {
    // Check if we should refresh based on S&P 500 schedule
    if (!forceRefresh && !shouldRefreshMacro()) {
        if (cachedAnalysis) {
            console.log('[MacroAnalyzer] Using cached analysis');
            return cachedAnalysis;
        }
    }

    if (!PERPLEXITY_API_KEY) {
        console.log('[MacroAnalyzer] No API key, using defaults');
        return { ...DEFAULT_ANALYSIS, timestamp: new Date().toISOString() };
    }

    try {
        console.log('[MacroAnalyzer] Fetching fresh analysis from Perplexity...');

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.1-sonar-small-128k-online',
                messages: [
                    { role: 'user', content: PROMPT }
                ],
                max_tokens: 1000,
                temperature: 0.1
            })
        });

        if (!response.ok) {
            throw new Error(`Perplexity API error: ${response.status}`);
        }

        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content || '';

        // Extract JSON from response (may have extra text)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }

        const parsed = JSON.parse(jsonMatch[0]) as Omit<MacroAnalysis, 'timestamp'>;

        // Add timestamp and cache
        const analysis: MacroAnalysis = {
            ...parsed,
            timestamp: new Date().toISOString()
        };

        cachedAnalysis = analysis;
        lastFetchHour = new Date().getUTCHours();

        console.log('[MacroAnalyzer] Analysis updated:', {
            sentiment: analysis.overall.sentiment,
            confidence: analysis.overall.confidence,
            recommendation: analysis.overall.trade_recommendation
        });

        return analysis;

    } catch (error) {
        console.error('[MacroAnalyzer] Error fetching analysis:', error);
        return { ...DEFAULT_ANALYSIS, timestamp: new Date().toISOString() };
    }
}

// Get simplified data for SQLite storage
export function getMacroForDB(analysis: MacroAnalysis) {
    return {
        macro_confidence: analysis.overall.confidence,
        macro_sentiment: analysis.overall.sentiment,
        fear_greed: analysis.crypto.fear_greed,
        trade_recommendation: analysis.overall.trade_recommendation,
        sp500_trend: analysis.macro.sp500_trend,
        fed_stance: analysis.macro.fed_stance
    };
}
