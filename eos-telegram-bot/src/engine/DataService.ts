/**
 * DataService - Singleton que gerencia o DataEngine
 * 
 * Ponto de acesso global para os modulos OFA consumirem
 * dados do buffer em vez de fazer REST calls diretos.
 */

import { DataEngine } from './DataEngine';
import { StreamManager } from './StreamManager';
import { GapFiller } from './GapFiller';
import { MarketDataBuffer } from './MarketDataBuffer';
import { HealthState, MarketTrade } from './types';

// Singleton instance
let instance: DataService | null = null;

export interface TradeData {
    price: number;
    quantity: number;
    isBuyerMaker: boolean;
    timestamp: number;
}

export class DataService {
    private engine: DataEngine;
    private buffers: Map<string, MarketDataBuffer> = new Map();
    private initialized = false;

    private constructor() {
        const streamManager = new StreamManager();
        const gapFiller = new GapFiller();
        this.engine = new DataEngine(streamManager, gapFiller);

        // Expor buffers internos (hack temporario, ideally engine should expose this)
        (this.engine as any).buffers = this.buffers;
    }

    public static getInstance(): DataService {
        if (!instance) {
            instance = new DataService();
        }
        return instance;
    }

    /**
     * Inicializa o DataService com os simbolos desejados
     */
    public async initialize(symbols: string[]): Promise<void> {
        if (this.initialized) {
            console.warn('[DataService] Already initialized');
            return;
        }

        console.log(`[DataService] Initializing with ${symbols.length} symbols...`);
        await this.engine.start(symbols);
        this.initialized = true;
    }

    /**
     * Aguarda até que um simbolo esteja pronto (LIVE_OK)
     */
    public async waitForReady(symbol: string, timeoutMs = 120000): Promise<boolean> {
        const start = Date.now();

        return new Promise((resolve) => {
            const check = () => {
                const status = this.engine.getStatus(symbol.toUpperCase());
                if (status?.state === 'LIVE_OK') {
                    resolve(true);
                    return;
                }

                if (Date.now() - start > timeoutMs) {
                    console.warn(`[DataService] Timeout waiting for ${symbol}`);
                    resolve(false);
                    return;
                }

                setTimeout(check, 1000);
            };
            check();
        });
    }

    /**
     * Retorna trades dos ultimos N minutos para um simbolo
     * Substitui as chamadas REST legadas em SmartMoneyFilter e Footprint
     */
    public getTrades(symbol: string, minutes: number = 60): TradeData[] {
        const status = this.engine.getStatus(symbol.toUpperCase());
        if (!status) {
            console.warn(`[DataService] Symbol ${symbol} not found`);
            return [];
        }

        if (status.state !== 'LIVE_OK' && status.state !== 'DEGRADED') {
            console.warn(`[DataService] Symbol ${symbol} not ready (state: ${status.state})`);
            return [];
        }

        // Acessar buffer via metodo publico
        const buffer = this.engine.getBuffer(symbol.toUpperCase());
        if (!buffer) {
            console.warn(`[DataService] No buffer for ${symbol}`);
            return [];
        }

        // Pegar trades da janela solicitada
        const trades = buffer.getTradesInWindow(minutes);

        return trades.map(t => ({
            price: t.price,
            quantity: t.qty,
            isBuyerMaker: !t.isBuyer,
            timestamp: t.time
        }));
    }

    /**
     * Retorna status de um simbolo
     */
    public getStatus(symbol: string): { state: HealthState; coverage: number; count: number } | null {
        const status = this.engine.getStatus(symbol.toUpperCase());
        if (!status) return null;

        return {
            state: status.state,
            coverage: status.stats.coverageSec,
            count: status.stats.count
        };
    }

    /**
     * Para o servico
     */
    public stop(): void {
        this.engine.stop();
        this.initialized = false;
        instance = null;
    }

    /**
     * Verifica se o simbolo esta pronto para trading
     */
    public isReady(symbol: string): boolean {
        const status = this.engine.getStatus(symbol.toUpperCase());
        return status?.state === 'LIVE_OK';
    }

    /**
     * Registra callback para quando simbolo ficar pronto
     */
    public onReady(callback: (symbol: string) => void): void {
        this.engine.on('signal_ready', callback);
    }

    /**
     * Registra callback para mudanca de estado
     */
    public onStateChange(callback: (symbol: string, oldState: HealthState, newState: HealthState) => void): void {
        this.engine.on('state_change', callback);
    }
}

// Export singleton getter
export function getDataService(): DataService {
    return DataService.getInstance();
}
