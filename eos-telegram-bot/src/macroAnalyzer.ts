/**
 * Macro Sentiment Analyzer (heuristic, no paid external provider)
 * Uses public market data + deterministic rules to produce stable macro context.
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

// Default neutral analysis when external data is unavailable
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
    warnings: ['Using default values - market snapshot unavailable'],
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

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

async function fetch24hChange(symbol: string): Promise<number | null> {
    try {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
        if (!res.ok) return null;
        const data = await res.json() as { priceChangePercent?: string };
        const change = Number(data.priceChangePercent);
        return Number.isFinite(change) ? change : null;
    } catch {
        return null;
    }
}

function getSentimentFromChange(changePct: number): 'BULLISH' | 'NEUTRAL' | 'BEARISH' {
    if (changePct >= 1.25) return 'BULLISH';
    if (changePct <= -1.25) return 'BEARISH';
    return 'NEUTRAL';
}

function getRecommendation(
    sentiment: 'BULLISH' | 'NEUTRAL' | 'BEARISH',
    confidence: number,
    riskSentiment: 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF'
): 'AGGRESSIVE' | 'NORMAL' | 'CONSERVATIVE' | 'AVOID' {
    if (sentiment === 'BEARISH' && confidence >= 0.62) return 'AVOID';
    if (sentiment === 'BULLISH' && confidence >= 0.72 && riskSentiment === 'RISK_ON') return 'AGGRESSIVE';
    if (sentiment === 'BULLISH' && confidence >= 0.58) return 'NORMAL';
    return 'CONSERVATIVE';
}

async function buildHeuristicAnalysis(): Promise<MacroAnalysis> {
    const [btcChange, ethChange] = await Promise.all([
        fetch24hChange('BTCUSDT'),
        fetch24hChange('ETHUSDT')
    ]);

    if (btcChange == null || ethChange == null) {
        return { ...DEFAULT_ANALYSIS, timestamp: new Date().toISOString() };
    }

    const avgChange = (btcChange + ethChange) / 2;
    const btcSentiment = getSentimentFromChange(btcChange);
    const altcoinSentiment = getSentimentFromChange(ethChange);
    const overallSentiment = getSentimentFromChange(avgChange);

    const riskSentiment: 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' =
        avgChange >= 1 ? 'RISK_ON' : avgChange <= -1 ? 'RISK_OFF' : 'NEUTRAL';

    const confidence = clamp(0.45 + Math.abs(avgChange) / 8, 0.45, 0.82);
    const fearGreed = Math.round(clamp(50 + avgChange * 7, 5, 95));

    const analysis: MacroAnalysis = {
        macro: {
            sp500_trend: overallSentiment,
            fed_stance: overallSentiment === 'BEARISH' ? 'HAWKISH' : overallSentiment === 'BULLISH' ? 'DOVISH' : 'NEUTRAL',
            dxy_trend: overallSentiment === 'BEARISH' ? 'UP' : overallSentiment === 'BULLISH' ? 'DOWN' : 'STABLE',
            risk_sentiment: riskSentiment
        },
        crypto: {
            btc_sentiment: btcSentiment,
            altcoin_sentiment: altcoinSentiment,
            fear_greed: fearGreed
        },
        overall: {
            sentiment: overallSentiment,
            confidence,
            trade_recommendation: getRecommendation(overallSentiment, confidence, riskSentiment)
        },
        key_events: [],
        warnings: ['Heuristic macro mode active (Perplexity disabled)'],
        timestamp: new Date().toISOString()
    };

    return analysis;
}

export async function getMacroAnalysis(forceRefresh: boolean = false): Promise<MacroAnalysis> {
    // Check if we should refresh based on S&P 500 schedule
    if (!forceRefresh && !shouldRefreshMacro()) {
        if (cachedAnalysis) {
            console.log('[MacroAnalyzer] Using cached analysis');
            return cachedAnalysis;
        }
    }

    try {
        console.log('[MacroAnalyzer] Fetching fresh heuristic macro snapshot...');
        const analysis = await buildHeuristicAnalysis();

        cachedAnalysis = analysis;
        lastFetchHour = new Date().getUTCHours();

        console.log('[MacroAnalyzer] Analysis updated:', {
            sentiment: analysis.overall.sentiment,
            confidence: analysis.overall.confidence,
            recommendation: analysis.overall.trade_recommendation
        });

        return analysis;

    } catch (error) {
        console.error('[MacroAnalyzer] Error generating macro analysis:', error);
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
