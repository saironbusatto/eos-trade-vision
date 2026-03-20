import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

function getEnvNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function getEnvBoolean(name: string, fallback: boolean): boolean {
    const raw = process.env[name];
    if (!raw) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export interface MLSignalFeatures {
    f_smart_money: number;
    f_price_context: number;
    f_imbalance: number;
    f_absorption: number;
    f_trend: number;
    f_momentum: number;
    f_volume: number;
    score: number;
    hour_utc?: number;
    day_of_week?: number;
    volume_ratio?: number;
    trend?: number;
    momentum?: number;
    price_change_24h?: number;
    min_score?: number;
}

export interface MLInferenceResult {
    should_trade: boolean;
    direction: 'LONG' | 'SHORT' | 'NO-TRADE';
    confidence: number;
    gate_probability?: number;
    direction_probabilities?: {
        LONG: number;
        SHORT: number;
        NO_TRADE: number;
    };
    score_check?: boolean;
    gate_check?: boolean;
    reasons: string[];
    error?: string;
}

interface CacheEntry {
    result: MLInferenceResult;
    timestamp: number;
}

export class MLService {
    private static instance: MLService;
    private cache: Map<string, CacheEntry> = new Map();
    private readonly CACHE_TTL_MS = 60 * 1000; // 1 min cache (candles updates every 5/10 min)
    private readonly TIMEOUT_MS = getEnvNumber('ML_INFERENCE_TIMEOUT_MS', 2500);
    private readonly SLOW_LOG_MS = getEnvNumber('ML_SLOW_LOG_MS', 1200);
    private readonly FAIL_OPEN_ON_ERROR = getEnvBoolean('ML_FAIL_OPEN_ON_ERROR', false);
    private readonly PYTHON_BIN = process.env.PYTHON_BIN || 'python3';

    private constructor() { }

    public static getInstance(): MLService {
        if (!MLService.instance) {
            MLService.instance = new MLService();
        }
        return MLService.instance;
    }

    /**
     * Gera chave de cache baseada no símbolo e hora (aproximada para minuto)
     * Como o scan roda a cada 10 min, podemos cachear por alguns minutos
     */
    private getCacheKey(symbol: string): string {
        const timeBucket = Math.floor(Date.now() / (1000 * 60)); // Minuto atual
        return `${symbol}_${timeBucket}`;
    }

    public async predict(symbol: string, features: MLSignalFeatures): Promise<MLInferenceResult> {
        // 1. Check Cache
        const cacheKey = this.getCacheKey(symbol);
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL_MS)) {
            // console.log(`[ML] Cache hit for ${symbol}`);
            return cached.result;
        }

        // 2. Prepare payload
        const payload = JSON.stringify(features);
        const startedAt = Date.now();

        // 3. Spawn Python process with timeout
        try {
            const result = await this.runPythonInference(payload);
            const elapsedMs = Date.now() - startedAt;
            if (elapsedMs >= this.SLOW_LOG_MS) {
                console.warn(`[ML] Slow inference for ${symbol}: ${elapsedMs}ms`);
            }

            // 4. Save to Cache
            this.cache.set(cacheKey, {
                result,
                timestamp: Date.now()
            });

            // Limpeza básica do cache se ficar muito grande
            if (this.cache.size > 1000) {
                this.cache.clear();
            }

            return result;
        } catch (error) {
            const elapsedMs = Date.now() - startedAt;
            console.error(`[ML] Error inference for ${symbol}:`, error);
            const failMode = this.FAIL_OPEN_ON_ERROR ? 'FAIL_OPEN' : 'FAIL_CLOSED';
            const message = error instanceof Error ? error.message : String(error);

            return {
                should_trade: this.FAIL_OPEN_ON_ERROR,
                direction: 'NO-TRADE',
                confidence: 0,
                reasons: [
                    `Inference Error (${failMode}) after ${elapsedMs}ms: ${message}`
                ],
                error: message
            };
        }
    }

    private runPythonInference(payload: string): Promise<MLInferenceResult> {
        return new Promise((resolve, reject) => {
            const scriptPath = this.resolveScriptPath();
            const inferredModelDir = path.resolve(path.dirname(scriptPath), '..', 'data', 'ml', 'models');
            const childEnv = {
                ...process.env,
                ML_MODEL_DIR: process.env.ML_MODEL_DIR || inferredModelDir,
            };
            const pythonProcess = spawn(this.PYTHON_BIN, [scriptPath], { env: childEnv });

            let stdoutData = '';
            let stderrData = '';
            let isResolved = false;

            // Timeout
            const timeout = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    pythonProcess.kill();
                    reject(new Error(`Timeout after ${this.TIMEOUT_MS}ms`));
                }
            }, this.TIMEOUT_MS);

            // Write payload to stdin
            pythonProcess.stdin.write(payload);
            pythonProcess.stdin.end();

            pythonProcess.stdout.on('data', (data) => {
                stdoutData += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                stderrData += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (isResolved) return;
                clearTimeout(timeout);
                isResolved = true;

                if (code !== 0) {
                    reject(new Error(`Process exited with code ${code}: ${stderrData}`));
                    return;
                }

                try {
                    // Try to find JSON in output (ignore usage warnings etc if any)
                    const lines = stdoutData.trim().split('\n');
                    const jsonLine = lines[lines.length - 1]; // Assume last line is the JSON result
                    const result = JSON.parse(jsonLine);

                    if (result.error) {
                        reject(new Error(`Python error: ${result.error}`));
                    } else {
                        resolve(result);
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse JSON: ${e}. Stdout: ${stdoutData}`));
                }
            });

            pythonProcess.on('error', (err) => {
                if (isResolved) return;
                clearTimeout(timeout);
                isResolved = true;
                reject(err);
            });
        });
    }

    private resolveScriptPath(): string {
        const fromEnv = process.env.ML_INFER_SCRIPT;
        const candidates = [
            fromEnv,
            '/app/ml/infer.py', // Docker
            path.resolve(process.cwd(), 'ml', 'infer.py'), // local run from eos-telegram-bot/
            path.resolve(__dirname, '..', '..', 'ml', 'infer.py'), // when executed from dist/
        ].filter((v): v is string => Boolean(v));

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        throw new Error(
            `ML inference script not found. Checked: ${candidates.join(', ')}. ` +
            `Set ML_INFER_SCRIPT to the correct path if needed.`
        );
    }
}

export const mlService = MLService.getInstance();
