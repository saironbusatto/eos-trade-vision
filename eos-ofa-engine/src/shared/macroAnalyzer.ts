/**
 * Macro Sentiment Analyzer using Perplexity API
 * Shared between crypto and forex bots
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
        fear_greed: number;
    };
    overall: {
        sentiment: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
        confidence: number;
        trade_recommendation: 'AGGRESSIVE' | 'NORMAL' | 'CONSERVATIVE' | 'AVOID';
    };
    key_events: string[];
    warnings: string[];
    timestamp: string;
}

export interface MacroForDB {
    macro_confidence: number;
    macro_sentiment: string;
    fear_greed: number;
    trade_recommendation: string;
    sp500_trend: string;
    fed_stance: string;
}

const DEFAULT_ANALYSIS: MacroAnalysis = {
    macro: { sp500_trend: 'NEUTRAL', fed_stance: 'NEUTRAL', dxy_trend: 'STABLE', risk_sentiment: 'NEUTRAL' },
    crypto: { btc_sentiment: 'NEUTRAL', altcoin_sentiment: 'NEUTRAL', fear_greed: 50 },
    overall: { sentiment: 'NEUTRAL', confidence: 0.5, trade_recommendation: 'NORMAL' },
    key_events: [],
    warnings: ['Using default values'],
    timestamp: new Date().toISOString()
};

let cachedAnalysis: MacroAnalysis | null = null;
let lastFetchHour: number = -1;
const SP500_FETCH_HOURS = [13, 16, 18, 20];

function shouldRefreshMacro(): boolean {
    const currentHour = new Date().getUTCHours();
    if (SP500_FETCH_HOURS.includes(currentHour) && currentHour !== lastFetchHour) return true;
    if (!cachedAnalysis) return true;
    return false;
}

const PROMPT = `You are a financial analyst AI. Analyze the current macro and crypto market conditions and respond ONLY with valid JSON:
{"macro":{"sp500_trend":"BULLISH|NEUTRAL|BEARISH","fed_stance":"HAWKISH|NEUTRAL|DOVISH","dxy_trend":"UP|STABLE|DOWN","risk_sentiment":"RISK_ON|NEUTRAL|RISK_OFF"},"crypto":{"btc_sentiment":"BULLISH|NEUTRAL|BEARISH","altcoin_sentiment":"BULLISH|NEUTRAL|BEARISH","fear_greed":0-100},"overall":{"sentiment":"BULLISH|NEUTRAL|BEARISH","confidence":0.0-1.0,"trade_recommendation":"AGGRESSIVE|NORMAL|CONSERVATIVE|AVOID"},"key_events":["event"],"warnings":["warning"]}
Respond with ONLY the JSON.`;

export async function getMacroAnalysis(apiKey?: string, forceRefresh: boolean = false): Promise<MacroAnalysis> {
    if (!forceRefresh && !shouldRefreshMacro() && cachedAnalysis) {
        console.log('[MacroAnalyzer] Using cached');
        return cachedAnalysis;
    }

    const key = apiKey || process.env.PERPLEXITY_API_KEY;
    if (!key) {
        console.log('[MacroAnalyzer] No API key');
        return { ...DEFAULT_ANALYSIS, timestamp: new Date().toISOString() };
    }

    try {
        console.log('[MacroAnalyzer] Fetching...');
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.1-sonar-small-128k-online',
                messages: [{ role: 'user', content: PROMPT }],
                max_tokens: 1000, temperature: 0.1
            })
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON');

        const parsed = JSON.parse(jsonMatch[0]) as Omit<MacroAnalysis, 'timestamp'>;
        const analysis: MacroAnalysis = { ...parsed, timestamp: new Date().toISOString() };
        cachedAnalysis = analysis;
        lastFetchHour = new Date().getUTCHours();
        console.log('[MacroAnalyzer] Updated:', analysis.overall.sentiment);
        return analysis;
    } catch (error) {
        console.error('[MacroAnalyzer] Error:', error);
        return { ...DEFAULT_ANALYSIS, timestamp: new Date().toISOString() };
    }
}

export function getMacroForDB(analysis: MacroAnalysis): MacroForDB {
    return {
        macro_confidence: analysis.overall.confidence,
        macro_sentiment: analysis.overall.sentiment,
        fear_greed: analysis.crypto.fear_greed,
        trade_recommendation: analysis.overall.trade_recommendation,
        sp500_trend: analysis.macro.sp500_trend,
        fed_stance: analysis.macro.fed_stance
    };
}
