import { spawn } from 'child_process';
import path from 'path';

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
    private readonly TIMEOUT_MS = 500; // 500ms max for inference
    private readonly SCRIPT_PATH = '/app/ml/infer.py'; // Path in Docker container

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

        // 3. Spawn Python process with timeout
        try {
            const result = await this.runPythonInference(payload);

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
            console.error(`[ML] Error inference for ${symbol}:`, error);
            // Fallback SAFE for Lite Mode: ALLOW TRADE (Bypass ML)
            // Servidor sem espaço para Python -> Bot opera com regras clássicas
            return {
                should_trade: true,
                direction: 'NO-TRADE',
                confidence: 0,
                reasons: [`Inference Error (Bypass): ${error instanceof Error ? error.message : String(error)}`]
            };
        }
    }

    private runPythonInference(payload: string): Promise<MLInferenceResult> {
        return new Promise((resolve, reject) => {
            const pythonProcess = spawn('python3', [this.SCRIPT_PATH]);

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
}

export const mlService = MLService.getInstance();
