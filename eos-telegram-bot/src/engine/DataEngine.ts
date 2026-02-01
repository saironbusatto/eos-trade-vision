import { EventEmitter } from 'events';
import { StreamManager } from './StreamManager';
import { MarketDataBuffer } from './MarketDataBuffer';
import { GapFiller } from './GapFiller';
import { HealthState, BinanceAggTrade } from './types';
import { ENGINE_CONFIG } from './config';

interface SymbolContext {
    buffer: MarketDataBuffer;
    state: HealthState;
    incomingQueue: BinanceAggTrade[];
    firstWsId: number | null;
    firstWsTime: number | null;
    warmupPromise: Promise<void> | null;
}

export interface DataEngineEvents {
    signal_ready: (symbol: string) => void;
    state_change: (symbol: string, oldState: HealthState, newState: HealthState) => void;
    gap_detected: (symbol: string, fromId: number, toId: number) => void;
    error: (symbol: string, error: Error) => void;
}

export class DataEngine extends EventEmitter {
    private contexts: Map<string, SymbolContext> = new Map();
    private healthCheckInterval: NodeJS.Timeout | null = null;

    constructor(
        private streamManager: StreamManager,
        private gapFiller: GapFiller
    ) {
        super();
        this.setupStreamListeners();
    }

    private setupStreamListeners(): void {
        this.streamManager.on('message', this.handleStreamMessage.bind(this));
        this.streamManager.on('connected', () => {
            console.log('[DataEngine] Stream connected');
        });
        this.streamManager.on('disconnected', () => {
            console.log('[DataEngine] Stream disconnected');
            // Marcar todos como OFFLINE
            for (const [symbol, ctx] of this.contexts) {
                if (ctx.state !== 'COLD') {
                    this.transition(symbol, 'OFFLINE');
                }
            }
        });
    }

    /**
     * Inicia o engine para os símbolos especificados
     */
    public async start(symbols: string[]): Promise<void> {
        if (symbols.length > ENGINE_CONFIG.MAX_SYMBOLS) {
            throw new Error(`Max ${ENGINE_CONFIG.MAX_SYMBOLS} symbols allowed`);
        }

        // Inicializar contextos
        for (const symbol of symbols) {
            this.contexts.set(symbol.toUpperCase(), {
                buffer: new MarketDataBuffer(symbol.toUpperCase()),
                state: 'COLD',
                incomingQueue: [],
                firstWsId: null,
                firstWsTime: null,
                warmupPromise: null
            });
        }

        // Conectar streams
        const streams = symbols.map(s => `${s.toLowerCase()}@aggTrade`);
        this.streamManager.connect(streams);

        // Marcar todos como WARMING
        for (const symbol of symbols) {
            this.transition(symbol.toUpperCase(), 'WARMING');
        }

        // Iniciar health check periodico
        this.startHealthCheck();
    }

    /**
     * Para o engine
     */
    public stop(): void {
        this.stopHealthCheck();
        this.streamManager.disconnect();
        this.contexts.clear();
    }

    /**
     * Retorna status de um símbolo
     */
    public getStatus(symbol: string): { state: HealthState; stats: ReturnType<MarketDataBuffer['getStats']> } | null {
        const ctx = this.contexts.get(symbol.toUpperCase());
        if (!ctx) return null;

        return {
            state: ctx.state,
            stats: ctx.buffer.getStats()
        };
    }

    /**
     * Retorna status de todos os símbolos
     */
    public getAllStatus(): Map<string, { state: HealthState; stats: ReturnType<MarketDataBuffer['getStats']> }> {
        const result = new Map();
        for (const [symbol, ctx] of this.contexts) {
            result.set(symbol, {
                state: ctx.state,
                stats: ctx.buffer.getStats()
            });
        }
        return result;
    }

    /**
     * Retorna o buffer de um simbolo para consumo externo
     */
    public getBuffer(symbol: string): MarketDataBuffer | null {
        const ctx = this.contexts.get(symbol.toUpperCase());
        return ctx?.buffer || null;
    }

    private async handleStreamMessage(msg: BinanceAggTrade): Promise<void> {
        const symbol = msg.s.toUpperCase();
        const ctx = this.contexts.get(symbol);
        if (!ctx) return;

        if (ctx.state === 'WARMING') {
            // Fase de enfileiramento
            ctx.incomingQueue.push(msg);

            // Primeiro evento WS: disparar warmup
            if (ctx.firstWsId === null) {
                ctx.firstWsId = msg.a;
                ctx.firstWsTime = msg.T;
                console.log(`[DataEngine] First WS event for ${symbol}: ID=${msg.a}`);
                ctx.warmupPromise = this.performWarmUp(symbol);
            }
        }
        else if (ctx.state === 'LIVE_OK' || ctx.state === 'DEGRADED') {
            // Fase live: inserir diretamente
            const success = ctx.buffer.insertRealtime(msg);

            if (!success) {
                // Gap detectado
                const lastId = ctx.buffer.getLastId();
                const gapFrom = lastId + 1;
                const gapTo = msg.a - 1;

                console.warn(`[DataEngine] Gap detected for ${symbol}: ${gapFrom} -> ${gapTo}`);
                this.emit('gap_detected', symbol, gapFrom, gapTo);

                // Tentar preencher
                this.handleGap(symbol, gapFrom, gapTo, msg);
            }
        }
    }

    private async performWarmUp(symbol: string): Promise<void> {
        const ctx = this.contexts.get(symbol);
        if (!ctx || ctx.firstWsId === null || ctx.firstWsTime === null) return;

        console.log(`[DataEngine] Starting warmup for ${symbol}`);

        try {
            // Buscar histórico: NOW - (60min + margem) até firstWsTime
            const startTime = Date.now() - (ENGINE_CONFIG.WINDOW_SIZE_MS + ENGINE_CONFIG.WARMUP_MARGIN_MS);
            const endTime = ctx.firstWsTime;

            const history = await this.gapFiller.fillByTimeRange(symbol, startTime, endTime);

            // Inserir histórico no buffer
            ctx.buffer.insertMany(history);

            // Inserir fila de eventos WS (pode ter overlap, buffer faz dedup)
            ctx.buffer.insertMany(ctx.incomingQueue);

            // Limpar fila
            ctx.incomingQueue = [];

            // Verificar cobertura
            const stats = ctx.buffer.getStats();
            console.log(`[DataEngine] Warmup complete for ${symbol}: ${stats.count} trades, ${stats.coverageSec.toFixed(1)}s coverage`);

            if (stats.coverageSec >= ENGINE_CONFIG.TARGET_COVERAGE_SEC) {
                this.transition(symbol, 'LIVE_OK');
                this.emit('signal_ready', symbol);
            } else {
                console.warn(`[DataEngine] Warmup incomplete for ${symbol}: only ${stats.coverageSec.toFixed(1)}s coverage`);
                this.transition(symbol, 'DEGRADED');
            }

        } catch (err) {
            console.error(`[DataEngine] Warmup failed for ${symbol}:`, err);
            this.emit('error', symbol, err as Error);
            this.transition(symbol, 'DEGRADED');
        }
    }

    private async handleGap(symbol: string, fromId: number, toId: number, pendingMsg: BinanceAggTrade): Promise<void> {
        const ctx = this.contexts.get(symbol);
        if (!ctx) return;

        const gapSize = toId - fromId + 1;

        // Marcar como DEGRADED durante recuperação
        if (ctx.state === 'LIVE_OK') {
            this.transition(symbol, 'DEGRADED');
        }

        if (gapSize > ENGINE_CONFIG.SMALL_GAP_MAX_TRADES) {
            // Gap muito grande: resetar e re-warmup
            console.error(`[DataEngine] Gap too large for ${symbol} (${gapSize}), resetting...`);
            ctx.buffer = new MarketDataBuffer(symbol);
            ctx.firstWsId = null;
            ctx.firstWsTime = null;
            ctx.incomingQueue = [pendingMsg];
            this.transition(symbol, 'WARMING');
            // Proximo evento WS vai disparar novo warmup
            return;
        }

        try {
            // Preencher gap via REST
            const filledTrades = await this.gapFiller.fillByIdRange(symbol, fromId, toId);
            ctx.buffer.insertMany(filledTrades);

            // Inserir a mensagem pendente
            ctx.buffer.insertRealtime(pendingMsg);

            console.log(`[DataEngine] Gap filled for ${symbol}: ${filledTrades.length} trades recovered`);

            // Voltar para LIVE_OK
            this.transition(symbol, 'LIVE_OK');

        } catch (err) {
            console.error(`[DataEngine] Gap fill failed for ${symbol}:`, err);
            this.emit('error', symbol, err as Error);
        }
    }

    private startHealthCheck(): void {
        this.stopHealthCheck();

        this.healthCheckInterval = setInterval(() => {
            const now = Date.now();

            for (const [symbol, ctx] of this.contexts) {
                if (ctx.state === 'COLD' || ctx.state === 'WARMING' || ctx.state === 'OFFLINE') {
                    continue;
                }

                const stats = ctx.buffer.getStats();

                // Verificar lag
                if (stats.lagMs > ENGINE_CONFIG.MAX_LAG_MS && ctx.state === 'LIVE_OK') {
                    console.warn(`[DataEngine] High lag for ${symbol}: ${stats.lagMs}ms`);
                    this.transition(symbol, 'DEGRADED');
                }

                // Recuperar de DEGRADED se lag normalizar
                if (ctx.state === 'DEGRADED' && stats.lagMs < 500 && stats.coverageSec >= ENGINE_CONFIG.TARGET_COVERAGE_SEC) {
                    this.transition(symbol, 'LIVE_OK');
                }
            }
        }, 5000); // Checar a cada 5s
    }

    private stopHealthCheck(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    private transition(symbol: string, newState: HealthState): void {
        const ctx = this.contexts.get(symbol);
        if (!ctx) return;

        const oldState = ctx.state;
        if (oldState === newState) return;

        ctx.state = newState;
        console.log(`[DataEngine] ${symbol}: ${oldState} -> ${newState}`);
        this.emit('state_change', symbol, oldState, newState);
    }
}
