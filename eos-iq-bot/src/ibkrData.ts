/**
 * IBKR Data Service - Conexão direta com Interactive Brokers Gateway
 * Usando @stoqey/ib para baixa latência em dados de mercado Forex
 */

import IBApi, { EventName, Contract, SecType, WhatToShow } from '@stoqey/ib';

export interface IBKRQuote {
    pair: string;
    bid: number;
    ask: number;
    last: number;
    timestamp: number;
}

export interface IBKRBar {
    datetime: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

// Constantes de TickType da API do IBKR
const TICK_BID = 1;
const TICK_ASK = 2;
const TICK_LAST = 4;
const TICK_DELAYED_BID = 66;
const TICK_DELAYED_ASK = 67;
const TICK_DELAYED_LAST = 68;
const TICK_LAST_TIMESTAMP = 45;
const TICK_DELAYED_LAST_TIMESTAMP = 88;

class IBKRDataService {
    private ib: IBApi;
    private connected: boolean = false;
    private quotes: Map<string, IBKRQuote> = new Map();
    private tickerIdMap: Map<number, string> = new Map(); // tickerId -> pair
    private pairTickerMap: Map<string, number> = new Map(); // pair -> tickerId
    private nextTickerId: number = 1;
    private reconnectInterval: ReturnType<typeof setInterval> | null = null;

    // Configuração
    private readonly HOST = process.env.IBKR_HOST || '127.0.0.1';
    private readonly PORT = parseInt(process.env.IBKR_PORT || '4001');
    private readonly CLIENT_ID = parseInt(process.env.IBKR_CLIENT_ID || '1');

    constructor() {
        this.ib = new IBApi({
            host: this.HOST,
            port: this.PORT,
            clientId: this.CLIENT_ID
        });

        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        // Conexão estabelecida
        this.ib.on(EventName.connected, () => {
            console.log('[IBKR] Conectado ao Gateway!');
            this.connected = true;
            // Solicita dados delayed (gratuitos) se não tiver market data subscription
            this.ib.reqMarketDataType(3); // 1=Live, 2=Frozen, 3=Delayed, 4=DelayedFrozen
        });

        // Desconexão
        this.ib.on(EventName.disconnected, () => {
            console.log('[IBKR] Desconectado do Gateway');
            this.connected = false;
        });

        // Erros
        this.ib.on(EventName.error, (err: Error, code: number, reqId: number) => {
            // Ignora alguns warnings comuns
            if (code === 2104 || code === 2106 || code === 2158) {
                // Market data farm connection status
                return;
            }
            console.error(`[IBKR] Error ${code} (reqId: ${reqId}):`, err.message);
        });

        // Tick de preço
        this.ib.on(EventName.tickPrice, (tickerId: number, field: number, price: number) => {
            const pair = this.tickerIdMap.get(tickerId);
            if (!pair) return;

            const quote = this.quotes.get(pair) || { pair, bid: 0, ask: 0, last: 0, timestamp: 0 };

            switch (field) {
                case TICK_BID:
                case TICK_DELAYED_BID:
                    quote.bid = price;
                    break;
                case TICK_ASK:
                case TICK_DELAYED_ASK:
                    quote.ask = price;
                    break;
                case TICK_LAST:
                case TICK_DELAYED_LAST:
                    quote.last = price;
                    break;
            }

            quote.timestamp = Date.now();
            this.quotes.set(pair, quote);
        });

        // Tick de timestamp
        this.ib.on(EventName.tickString, (tickerId: number, field: number, value: string) => {
            if (field === TICK_LAST_TIMESTAMP || field === TICK_DELAYED_LAST_TIMESTAMP) {
                const pair = this.tickerIdMap.get(tickerId);
                if (pair) {
                    const quote = this.quotes.get(pair);
                    if (quote) {
                        quote.timestamp = parseInt(value) * 1000;
                        this.quotes.set(pair, quote);
                    }
                }
            }
        });
    }

    async connect(): Promise<boolean> {
        if (this.connected) return true;

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.error('[IBKR] Timeout ao conectar');
                resolve(false);
            }, 10000);

            this.ib.once(EventName.connected, () => {
                clearTimeout(timeout);
                resolve(true);
            });

            this.ib.once(EventName.error, () => {
                clearTimeout(timeout);
                resolve(false);
            });

            console.log(`[IBKR] Conectando a ${this.HOST}:${this.PORT}...`);
            this.ib.connect();
        });
    }

    disconnect(): void {
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        this.ib.disconnect();
        this.connected = false;
    }

    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Cria um contrato Forex para o IBKR
     */
    private createForexContract(pair: string): Contract {
        // pair = "EUR/USD" ou "EURUSD"
        const cleanPair = pair.replace('/', '').toUpperCase();
        const base = cleanPair.slice(0, 3);
        const quote = cleanPair.slice(3, 6);

        return {
            symbol: base,
            secType: SecType.CASH,
            currency: quote,
            exchange: 'IDEALPRO'
        };
    }

    /**
     * Subscreve para receber ticks de um par Forex
     */
    subscribePair(pair: string): void {
        if (!this.connected) {
            console.warn('[IBKR] Não conectado. Tentando conectar antes de subscrever...');
            return;
        }

        // Verifica se já está subscrito
        if (this.pairTickerMap.has(pair)) {
            return;
        }

        const tickerId = this.nextTickerId++;
        const contract = this.createForexContract(pair);

        this.tickerIdMap.set(tickerId, pair);
        this.pairTickerMap.set(pair, tickerId);

        // Inicializa quote vazio
        this.quotes.set(pair, { pair, bid: 0, ask: 0, last: 0, timestamp: 0 });

        console.log(`[IBKR] Subscrevendo ${pair} (tickerId: ${tickerId})`);
        this.ib.reqMktData(tickerId, contract, '', false, false);
    }

    /**
     * Cancela subscrição de um par
     */
    unsubscribePair(pair: string): void {
        const tickerId = this.pairTickerMap.get(pair);
        if (tickerId) {
            this.ib.cancelMktData(tickerId);
            this.tickerIdMap.delete(tickerId);
            this.pairTickerMap.delete(pair);
            this.quotes.delete(pair);
            console.log(`[IBKR] Cancelada subscrição de ${pair}`);
        }
    }

    /**
     * Obtém o último quote de um par
     */
    getQuote(pair: string): IBKRQuote | null {
        return this.quotes.get(pair) || null;
    }

    /**
     * Obtém o preço atual (mid-price se bid/ask disponíveis)
     */
    getPrice(pair: string): number | null {
        const quote = this.quotes.get(pair);
        if (!quote) return null;

        // Prioridade: last > midpoint
        if (quote.last > 0) return quote.last;
        if (quote.bid > 0 && quote.ask > 0) return (quote.bid + quote.ask) / 2;
        if (quote.bid > 0) return quote.bid;
        if (quote.ask > 0) return quote.ask;

        return null;
    }

    /**
     * Verifica se tem dados válidos para um par (recebido nos últimos N segundos)
     */
    hasValidData(pair: string, maxAgeSeconds: number = 60): boolean {
        const quote = this.quotes.get(pair);
        if (!quote || quote.timestamp === 0) return false;

        const age = (Date.now() - quote.timestamp) / 1000;
        return age < maxAgeSeconds;
    }

    /**
     * Requisita dados históricos
     */
    async getHistoricalData(pair: string, duration: string = '1 D', barSize: string = '1 hour'): Promise<IBKRBar[]> {
        if (!this.connected) {
            throw new Error('IBKR não conectado');
        }

        return new Promise((resolve, reject) => {
            const reqId = this.nextTickerId++;
            const contract = this.createForexContract(pair);
            const bars: IBKRBar[] = [];

            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('Timeout ao obter dados históricos'));
            }, 30000);

            const cleanup = () => {
                clearTimeout(timeout);
                // Remove listener específico é complexo, usamos flag
            };

            // Handler genérico para dados históricos
            const handleData = (_reqId: number, bar: any) => {
                if (_reqId !== reqId) return;

                // Verifica se é o marcador de fim (time vazio ou especial)
                if (!bar || bar.time === '' || (typeof bar.time === 'string' && bar.time.startsWith('finished'))) {
                    cleanup();
                    resolve(bars);
                    return;
                }

                bars.push({
                    datetime: String(bar.time),
                    open: Number(bar.open),
                    high: Number(bar.high),
                    low: Number(bar.low),
                    close: Number(bar.close),
                    volume: Number(bar.volume || 0)
                });
            };

            // @ts-ignore - API tem tipagem incompleta
            this.ib.on(EventName.historicalData, handleData);

            this.ib.reqHistoricalData(
                reqId,
                contract,
                '', // endDateTime (vazio = agora)
                duration,
                barSize as any, // Cast necessário para contornar tipos
                WhatToShow.MIDPOINT,
                1, // useRTH
                1, // formatDate
                false // keepUpToDate
            );
        });
    }

    /**
     * Testa a conexão obtendo um quote
     */
    async testConnection(): Promise<boolean> {
        if (!this.connected) {
            const connected = await this.connect();
            if (!connected) return false;
        }

        try {
            // Tenta obter dados históricos de EURUSD
            const bars = await this.getHistoricalData('EUR/USD', '60 S', '1 min');
            if (bars.length > 0) {
                console.log(`[IBKR] Conexão OK! EUR/USD último preço: ${bars[bars.length - 1].close}`);
                return true;
            }
        } catch (e) {
            console.error('[IBKR] Teste de conexão falhou:', e);
        }
        return false;
    }
}

// Exporta singleton
export const ibkrData = new IBKRDataService();
