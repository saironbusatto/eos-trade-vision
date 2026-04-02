/**
 * ExitDecisionEngine — Fase 1: Instrumentação (coleta de dados)
 *
 * Fase 1: USE_ML_EXIT=false → só coleta features e loga, não interfere na decisão atual.
 * Fase 2: Treinar modelo XGBoost/LightGBM com os dados coletados (meta: 300+ operações).
 * Fase 3: Integrar LLM como camada de incerteza quando ML confidence < EXIT_ML_MIN_CONFIDENCE.
 *
 * Nota sobre LightGBM JS: não há bindings TS oficiais estáveis.
 * O modelo permanece em Python (ml/exitDecisionModel.py), chamado via child_process
 * exatamente como ml/infer.py, para consistência com o pipeline existente.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import OpenAI from 'openai';
import { Signal } from './sqliteDatabase';

// ─── Feature flags (controlados pelo .env) ────────────────────────────────────
export const USE_ML_EXIT = process.env.USE_ML_EXIT === 'true';
const EXIT_ML_MIN_CONFIDENCE = Number(process.env.EXIT_ML_MIN_CONFIDENCE ?? 0.75);
const EXIT_LLM_MIN_CONFIDENCE = Number(process.env.EXIT_LLM_MIN_CONFIDENCE ?? 0.70);
const EXIT_LLM_TIMEOUT_MS = Number(process.env.EXIT_LLM_TIMEOUT_MS ?? 8000);
const EXIT_LLM_MIN_TRADE_AGE_MIN = Number(process.env.EXIT_LLM_MIN_TRADE_AGE_MIN ?? 10);

// ─── Types ────────────────────────────────────────────────────────────────────

export type DecisionSource = 'HARD_STOP' | 'ML' | 'LLM' | 'FALLBACK';
export type ExitDecision   = 'EXIT' | 'HOLD' | 'MOVE_STOP';

export interface ExitFeatures {
    signal_id: number;
    symbol: string;
    action: 'BUY' | 'SELL';

    // Position state
    pnl_pct: number;
    time_in_trade_seconds: number;
    distance_to_stop_pct: number;
    distance_to_target_pct: number;

    // Volume & volatility
    volume_ratio: number;       // último candle / média dos últimos 15 candles
    volatility_5m: number;      // desvio padrão dos retornos dos últimos 5 candles
    volatility_15m: number;     // desvio padrão dos retornos dos últimos 15 candles
    volatility_ratio: number;   // 5m / 15m

    // Momentum
    rsi_current: number;
    rsi_slope: number;          // RSI[0] - RSI[-3]

    // Candle bias desde entrada
    candles_in_favor: number;
    candles_against: number;

    // Contexto do sinal original
    original_signal_score: number;

    // Order flow
    bid_ask_spread_pct: number;

    // Meta
    captured_at: number; // unix ms
}

export interface ExitDecisionResult {
    decision: ExitDecision;
    source: DecisionSource;
    confidence: number;
    reasoning?: string;
    probabilities?: Record<string, number>;
}

interface BinanceKline {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

// ─── Binance REST helpers ─────────────────────────────────────────────────────

async function fetchKlines(
    symbol: string,
    interval: '1m' | '5m',
    limit: number = 20,
    startTime?: number
): Promise<BinanceKline[]> {
    try {
        let url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        if (startTime !== undefined) url += `&startTime=${startTime}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) return [];
        const raw = await resp.json() as any[][];
        return raw.map(k => ({
            openTime: Number(k[0]),
            open:     parseFloat(k[1]),
            high:     parseFloat(k[2]),
            low:      parseFloat(k[3]),
            close:    parseFloat(k[4]),
            volume:   parseFloat(k[5])
        }));
    } catch {
        return [];
    }
}

async function fetchBidAskSpread(symbol: string): Promise<number> {
    try {
        const url = `https://api.binance.com/api/v3/ticker/bookTicker?symbol=${symbol}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (!resp.ok) return 0;
        const data = await resp.json() as { bidPrice: string; askPrice: string };
        const bid = parseFloat(data.bidPrice);
        const ask = parseFloat(data.askPrice);
        if (!bid || !ask || bid <= 0) return 0;
        const mid = (bid + ask) / 2;
        return ((ask - bid) / mid) * 100;
    } catch {
        return 0;
    }
}

// ─── Indicadores ─────────────────────────────────────────────────────────────

/**
 * Wilder RSI com warm-up sobre o array de closes.
 * Retorna array com mesmo tamanho (valores iniciais = 50 como neutro).
 */
function calculateRSI(closes: number[], period: number = 14): number[] {
    if (closes.length < period + 1) return closes.map(() => 50);

    const out: number[] = new Array(period).fill(50);

    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 1; i <= period; i++) {
        const d = closes[i] - closes[i - 1];
        if (d >= 0) avgGain += d; else avgLoss += Math.abs(d);
    }
    avgGain /= period;
    avgLoss /= period;
    out.push(100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss)));

    for (let i = period + 1; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        avgGain = (avgGain * (period - 1) + (d >= 0 ? d : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (d <  0 ? Math.abs(d) : 0)) / period;
        out.push(100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss)));
    }

    return out;
}

/** Desvio padrão dos retornos percentuais de um array de preços. */
function stdDevReturns(prices: number[]): number {
    if (prices.length < 2) return 0;
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
        if (prices[i - 1] > 0) returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    if (returns.length === 0) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance);
}

// ─── Core: collectExitFeatures ────────────────────────────────────────────────

/**
 * Coleta todas as features de saída para um sinal em tempo real.
 * Usa 20 candles de 1m da Binance REST.
 * Retorna null se não houver dados suficientes ou em caso de erro.
 */
export async function collectExitFeatures(
    signal: Signal,
    currentPrice: number
): Promise<ExitFeatures | null> {
    try {
        // 20 candles de 1m cobrem 20 minutos: suficiente para RSI-14, vol-15m e candle counting
        const [klines, spread] = await Promise.all([
            fetchKlines(signal.symbol, '1m', 20),
            fetchBidAskSpread(signal.symbol)
        ]);

        if (klines.length < 5) return null;

        const closes  = klines.map(k => k.close);
        const volumes = klines.map(k => k.volume);

        // ── PnL corrente ───────────────────────────────────────────────────────
        const pnl_pct = signal.action === 'BUY'
            ? ((currentPrice - signal.entry_price) / signal.entry_price) * 100
            : ((signal.entry_price - currentPrice) / signal.entry_price) * 100;

        // ── Tempo na operação ──────────────────────────────────────────────────
        const entryMs = new Date(signal.created_at).getTime();
        const time_in_trade_seconds = Math.max(0, (Date.now() - entryMs) / 1000);

        // ── Distâncias ao stop e ao alvo (como % do entry) ────────────────────
        const distance_to_stop_pct = signal.action === 'BUY'
            ? ((currentPrice - signal.stop_loss) / signal.entry_price) * 100
            : ((signal.stop_loss - currentPrice) / signal.entry_price) * 100;

        const distance_to_target_pct = signal.action === 'BUY'
            ? ((signal.take_profit - currentPrice) / signal.entry_price) * 100
            : ((currentPrice - signal.take_profit) / signal.entry_price) * 100;

        // ── Volume ratio ───────────────────────────────────────────────────────
        const lastVol = volumes[volumes.length - 1];
        const prevVols = volumes.slice(0, -1);
        const avgVol = prevVols.length > 0
            ? prevVols.reduce((a, b) => a + b, 0) / prevVols.length
            : lastVol;
        const volume_ratio = avgVol > 0 ? lastVol / avgVol : 1;

        // ── Volatilidade ───────────────────────────────────────────────────────
        const volatility_5m  = stdDevReturns(closes.slice(-6));   // últimos 5 retornos
        const volatility_15m = stdDevReturns(closes.slice(-16));   // últimos 15 retornos
        const volatility_ratio = volatility_15m > 0 ? volatility_5m / volatility_15m : 1;

        // ── RSI ────────────────────────────────────────────────────────────────
        const rsiValues   = calculateRSI(closes, 14);
        const rsi_current = rsiValues[rsiValues.length - 1] ?? 50;
        const rsi_3ago    = rsiValues[Math.max(0, rsiValues.length - 4)] ?? rsi_current;
        const rsi_slope   = rsi_current - rsi_3ago;

        // ── Candles a favor / contra desde a entrada ───────────────────────────
        const relevantKlines = klines.filter(k => k.openTime >= entryMs);
        let candles_in_favor = 0;
        let candles_against  = 0;
        for (const k of relevantKlines) {
            const bullish = k.close > k.open;
            if (signal.action === 'BUY') {
                bullish ? candles_in_favor++ : candles_against++;
            } else {
                !bullish ? candles_in_favor++ : candles_against++;
            }
        }

        return {
            signal_id: signal.id,
            symbol:    signal.symbol,
            action:    signal.action,
            pnl_pct,
            time_in_trade_seconds,
            distance_to_stop_pct,
            distance_to_target_pct,
            volume_ratio,
            volatility_5m,
            volatility_15m,
            volatility_ratio,
            rsi_current,
            rsi_slope,
            candles_in_favor,
            candles_against,
            original_signal_score: signal.score,
            bid_ask_spread_pct:    spread,
            captured_at: Date.now()
        };
    } catch (err) {
        console.error(`[ExitDecisionEngine] collectExitFeatures #${signal.id}:`, err);
        return null;
    }
}

// ─── Counterfactual ───────────────────────────────────────────────────────────

/**
 * Busca os preços hipotéticos em +5m, +10m, +15m a partir do fechamento.
 * Chamado depois que o tempo mínimo passou (closeTimeMs + 15 min).
 * Retorna null se os candles não estiverem disponíveis ainda.
 */
export async function fetchCounterfactualPrices(
    symbol: string,
    action: 'BUY' | 'SELL',
    entryPrice: number,
    closeTimeMs: number
): Promise<{ cf_pnl_5m: number; cf_pnl_10m: number; cf_pnl_15m: number } | null> {
    try {
        // Busca 3 candles de 5m a partir do momento de fechamento
        const klines = await fetchKlines(symbol, '5m', 3, closeTimeMs);
        if (klines.length < 3) return null;

        const pnl = (exitPrice: number) => action === 'BUY'
            ? ((exitPrice - entryPrice) / entryPrice) * 100
            : ((entryPrice - exitPrice) / entryPrice) * 100;

        return {
            cf_pnl_5m:  pnl(klines[0].close),
            cf_pnl_10m: pnl(klines[1].close),
            cf_pnl_15m: pnl(klines[2].close)
        };
    } catch {
        return null;
    }
}

// ─── ML inference via Python subprocess ──────────────────────────────────────

const PYTHON_BIN      = process.env.PYTHON_BIN ?? 'python3';
const EXIT_MODEL_SCRIPT = path.resolve(
    __dirname, '..', 'ml', 'exitDecisionModel.py'
);

interface MLExitRaw {
    decision:      string;
    confidence:    number;
    probabilities?: Record<string, number>;
    source?:       string;
    error?:        string;
    reason?:       string;
}

function runExitModelInference(features: ExitFeatures): Promise<MLExitRaw> {
    return new Promise((resolve) => {
        const payload = JSON.stringify({
            pnl_pct:                features.pnl_pct,
            time_in_trade_seconds:  features.time_in_trade_seconds,
            distance_to_stop_pct:   features.distance_to_stop_pct,
            distance_to_target_pct: features.distance_to_target_pct,
            volume_ratio:           features.volume_ratio,
            volatility_5m:          features.volatility_5m,
            volatility_15m:         features.volatility_15m,
            volatility_ratio:       features.volatility_ratio,
            rsi_current:            features.rsi_current,
            rsi_slope:              features.rsi_slope,
            candles_in_favor:       features.candles_in_favor,
            candles_against:        features.candles_against,
            original_signal_score:  features.original_signal_score,
            bid_ask_spread_pct:     features.bid_ask_spread_pct,
        });

        const childEnv = {
            ...process.env,
            ML_MODEL_DIR: process.env.ML_MODEL_DIR
                ?? path.resolve(__dirname, '..', 'data', 'ml', 'models'),
        };

        const proc = spawn(PYTHON_BIN, [EXIT_MODEL_SCRIPT, '--action', 'predict', '--input', payload], { env: childEnv });

        let stdout = '';
        let resolved = false;

        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                proc.kill();
                resolve({ decision: 'HOLD', confidence: 0, source: 'FALLBACK', reason: 'timeout' });
            }
        }, 5000);

        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.on('close', () => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timer);
            try {
                resolve(JSON.parse(stdout.trim()) as MLExitRaw);
            } catch {
                resolve({ decision: 'HOLD', confidence: 0, source: 'FALLBACK', reason: 'parse error' });
            }
        });
        proc.on('error', () => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                resolve({ decision: 'HOLD', confidence: 0, source: 'FALLBACK', reason: 'spawn error' });
            }
        });
    });
}

// ─── LLM exit decision (Fase 3) ───────────────────────────────────────────────

const EXIT_LLM_MODEL_NAME = process.env.EXIT_LLM_MODEL ?? 'gpt-4o-mini';
let _openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
    if (!process.env.OPENAI_API_KEY) return null;
    if (!_openaiClient) _openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return _openaiClient;
}

function buildLLMPrompt(signal: Signal, features: ExitFeatures, mlConf: number): string {
    const side      = signal.action === 'BUY' ? 'LONG' : 'SHORT';
    const pnlSign   = features.pnl_pct >= 0 ? '+' : '';
    const ageMin    = Math.round(features.time_in_trade_seconds / 60);
    const rsiDir    = features.rsi_slope > 0.5 ? 'subindo' : features.rsi_slope < -0.5 ? 'caindo' : 'lateral';
    const volCtx    = features.volatility_ratio > 1.3 ? 'volatilidade AUMENTANDO (5m > 15m)'
                    : features.volatility_ratio < 0.7 ? 'volatilidade CAINDO (5m < 15m)'
                    : 'volatilidade estável';

    return `Você é um trader quantitativo experiente. Analise esta operação aberta e decida: EXIT (fechar agora) ou HOLD (aguardar stop/target).

OPERAÇÃO:
- Símbolo: ${signal.symbol} | Direção: ${side}
- Entrada: ${signal.entry_price.toFixed(4)} | Stop: ${signal.stop_loss.toFixed(4)} | Target: ${signal.take_profit.toFixed(4)}
- PnL atual: ${pnlSign}${features.pnl_pct.toFixed(3)}%
- Tempo na operação: ${ageMin} min
- Score original do sinal: ${features.original_signal_score.toFixed(1)}%

MERCADO ATUAL:
- Distância ao stop: ${features.distance_to_stop_pct.toFixed(3)}%
- Distância ao target: ${features.distance_to_target_pct.toFixed(3)}%
- RSI: ${features.rsi_current.toFixed(1)} (${rsiDir}, slope ${features.rsi_slope.toFixed(2)})
- Volume ratio: ${features.volume_ratio.toFixed(2)}x (acima de 1 = volume acima da média)
- ${volCtx}
- Bid-ask spread: ${features.bid_ask_spread_pct.toFixed(4)}%
- Candles a favor: ${features.candles_in_favor} | Contra: ${features.candles_against}

CONTEXTO DO MODELO ML:
- O modelo ML estava INSEGURO nesta decisão (confiança: ${(mlConf * 100).toFixed(1)}% < 75%)
- Isso significa que o padrão desta operação é ambíguo para o modelo estatístico

Responda SOMENTE com JSON válido, sem markdown:
{"decision": "EXIT" ou "HOLD", "confidence": 0.0 a 1.0, "reasoning": "1-2 frases objetivas"}

Critérios: prefira EXIT se RSI divergindo contra a posição + spread alto + candles contra maioria. Prefira HOLD se ainda longe do stop e momentum a favor.`;
}

async function runLLMExitDecision(
    signal: Signal,
    features: ExitFeatures,
    mlConf: number
): Promise<ExitDecisionResult> {
    const client = getOpenAI();
    if (!client) {
        return { decision: 'HOLD', source: 'FALLBACK', confidence: 0, reasoning: 'OPENAI_API_KEY não configurada' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EXIT_LLM_TIMEOUT_MS);

    try {
        const response = await client.chat.completions.create({
            model:       EXIT_LLM_MODEL_NAME,
            messages:    [{ role: 'user', content: buildLLMPrompt(signal, features, mlConf) }],
            temperature: 0.1,
            max_tokens:  200,
        }, { signal: controller.signal });

        clearTimeout(timer);

        const content = response.choices[0]?.message?.content?.trim() ?? '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('JSON não encontrado na resposta LLM');

        const parsed = JSON.parse(jsonMatch[0]) as {
            decision: string;
            confidence: number;
            reasoning?: string;
        };

        const decision  = (['EXIT', 'HOLD', 'MOVE_STOP'].includes(parsed.decision) ? parsed.decision : 'HOLD') as ExitDecision;
        const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));

        return { decision, source: 'LLM', confidence, reasoning: parsed.reasoning };

    } catch (err: unknown) {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[ExitDecision] LLM error for signal ${signal.id}: ${msg}`);
        return { decision: 'HOLD', source: 'FALLBACK', confidence: 0, reasoning: msg };
    }
}

// ─── Decisão de saída (Fase 2 — ML ativo) ────────────────────────────────────

/**
 * Árbitro de saída (Fases 2 + 3).
 *
 * Fluxo:
 *   1. ML predict → confiança >= EXIT_ML_MIN_CONFIDENCE (75%)? age imediatamente
 *   2. ML inseguro + trade >= EXIT_LLM_MIN_TRADE_AGE_MIN (10 min)?
 *      → LLM analisa contexto → confiança >= EXIT_LLM_MIN_CONFIDENCE (70%)? age
 *   3. Qualquer incerteza restante → HOLD (hard stop decide)
 */
export async function makeExitDecision(
    signal: Signal,
    features: ExitFeatures
): Promise<ExitDecisionResult> {
    if (!USE_ML_EXIT) {
        return { decision: 'HOLD', source: 'HARD_STOP', confidence: 1.0 };
    }

    // ── Fase 2: ML ────────────────────────────────────────────────────────────
    let mlConf = 0;
    try {
        const raw = await runExitModelInference(features);

        if (!raw.error && raw.source !== 'FALLBACK') {
            const decision = (raw.decision ?? 'HOLD') as ExitDecision;
            mlConf = raw.confidence ?? 0;

            if (mlConf >= EXIT_ML_MIN_CONFIDENCE) {
                console.log(`[ExitDecision] ${signal.symbol}#${signal.id} → ${decision} (ML ${(mlConf * 100).toFixed(1)}%)`);
                return { decision, source: 'ML', confidence: mlConf, probabilities: raw.probabilities };
            }

            console.log(`[ExitDecision] ${signal.symbol}#${signal.id} ML inseguro (${(mlConf * 100).toFixed(1)}%) — escalando para LLM`);
        }
    } catch (err) {
        console.error(`[ExitDecision] ML error signal ${signal.id}:`, err);
    }

    // ── Fase 3: LLM (só se operação tem maturidade mínima) ───────────────────
    const ageMin = features.time_in_trade_seconds / 60;
    if (ageMin < EXIT_LLM_MIN_TRADE_AGE_MIN) {
        console.log(`[ExitDecision] ${signal.symbol}#${signal.id} operação muito nova (${ageMin.toFixed(1)}min < ${EXIT_LLM_MIN_TRADE_AGE_MIN}min) — HOLD`);
        return { decision: 'HOLD', source: 'ML', confidence: mlConf };
    }

    const llmResult = await runLLMExitDecision(signal, features, mlConf);

    if (llmResult.source !== 'FALLBACK' && llmResult.confidence >= EXIT_LLM_MIN_CONFIDENCE) {
        console.log(`[ExitDecision] ${signal.symbol}#${signal.id} → ${llmResult.decision} (LLM ${(llmResult.confidence * 100).toFixed(1)}%) — ${llmResult.reasoning}`);
        return llmResult;
    }

    console.log(`[ExitDecision] ${signal.symbol}#${signal.id} LLM também inseguro (${(llmResult.confidence * 100).toFixed(1)}%) — HOLD`);
    return { decision: 'HOLD', source: 'LLM', confidence: llmResult.confidence, reasoning: llmResult.reasoning };
}

// ─── Sanity test ──────────────────────────────────────────────────────────────

/**
 * Testa a coleta de features com um sinal mockado apontando para BTCUSDT real.
 *
 * Como chamar (no servidor, após build):
 *   node -e "require('./dist/exitDecisionEngine').runSanityTest()"
 */
export async function runSanityTest(): Promise<void> {
    const mockSignal: Signal = {
        id: 9999,
        symbol: 'BTCUSDT',
        action: 'BUY',
        entry_price: 85000,
        stop_loss:   84500,
        take_profit: 85500,
        score: 80,
        result: 'PENDING',
        created_at: new Date(Date.now() - 10 * 60 * 1000)
            .toISOString().replace('T', ' ').slice(0, 19),
        f_smart_money:   1,
        f_price_context: 0.6,
        f_imbalance:     0.5,
        f_absorption:    0.3,
        f_trend:         0.7,
        f_momentum:      0.6,
        f_volume:        0.5,
        volume_ratio:    1.2,
        trend:           0.7,
        momentum:        0.003,
        price_change_24h: 1.5
    };

    // Use live BTC price to make the test realistic
    let currentPrice = 85100;
    try {
        const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        const d = await r.json() as { price: string };
        currentPrice = parseFloat(d.price) || currentPrice;
    } catch { /* use fallback */ }

    mockSignal.entry_price = currentPrice * 0.999;
    mockSignal.stop_loss   = currentPrice * 0.995;
    mockSignal.take_profit = currentPrice * 1.005;

    console.log('[ExitDecisionEngine] Running sanity test…');
    console.log(`[ExitDecisionEngine] Mock signal: BUY BTCUSDT @ ${mockSignal.entry_price.toFixed(2)}`);
    console.log(`[ExitDecisionEngine] Current price: ${currentPrice.toFixed(2)}`);

    const features = await collectExitFeatures(mockSignal, currentPrice);
    if (features) {
        console.log('[ExitDecisionEngine] ✅ Sanity test PASSED');
        console.log(JSON.stringify(features, null, 2));
    } else {
        console.log('[ExitDecisionEngine] ❌ Sanity test FAILED — features returned null');
    }
}

// Export flag values for use in other modules
export { EXIT_ML_MIN_CONFIDENCE, EXIT_LLM_MIN_CONFIDENCE, EXIT_LLM_TIMEOUT_MS, EXIT_LLM_MIN_TRADE_AGE_MIN };
