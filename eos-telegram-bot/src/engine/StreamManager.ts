import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { ENGINE_CONFIG } from './config';
import { BinanceAggTrade } from './types';

interface StreamManagerEvents {
    connected: () => void;
    disconnected: () => void;
    message: (data: BinanceAggTrade) => void;
    error: (err: Error) => void;
    reconnecting: (attempt: number, delay: number) => void;
}

export class StreamManager extends EventEmitter {
    private ws: WebSocket | null = null;
    private streams: string[] = [];
    private shouldReconnect = true;
    private reconnectAttempts = 0;
    private pingInterval: NodeJS.Timeout | null = null;
    private watchdogTimer: NodeJS.Timeout | null = null;
    private lastMessageTime = 0;

    private readonly BASE_URL = 'wss://stream.binance.com:9443/ws';
    private readonly WATCHDOG_INTERVAL_MS = 30000; // 30s sem mensagem = problema

    constructor() {
        super();
    }

    /**
     * Conecta ao WebSocket da Binance com os streams especificados
     * @param streams Array de streams (ex: ['btcusdt@aggTrade', 'ethusdt@aggTrade'])
     */
    public connect(streams: string[]): void {
        this.streams = streams.map(s => s.toLowerCase());
        this.shouldReconnect = true;
        this.reconnectAttempts = 0;
        this.doConnect();
    }

    private doConnect(): void {
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
        }

        const url = this.streams.length > 0
            ? `${this.BASE_URL}/${this.streams.join('/')}`
            : this.BASE_URL;

        console.log(`[StreamManager] Connecting to ${url}`);

        try {
            this.ws = new WebSocket(url);
            this.ws.on('open', this.onOpen.bind(this));
            this.ws.on('message', this.onMessage.bind(this));
            this.ws.on('close', this.onClose.bind(this));
            this.ws.on('error', this.onError.bind(this));
            this.ws.on('pong', this.onPong.bind(this));
        } catch (err) {
            console.error('[StreamManager] Connection error:', err);
            this.scheduleReconnect();
        }
    }

    private onOpen(): void {
        console.log('[StreamManager] Connected');
        this.reconnectAttempts = 0;
        this.lastMessageTime = Date.now();
        this.emit('connected');
        this.startHeartbeat();
        this.startWatchdog();
    }

    private onMessage(data: WebSocket.RawData): void {
        this.lastMessageTime = Date.now();

        try {
            const msg = JSON.parse(data.toString());

            // Ignorar respostas de subscription
            if (msg.result !== undefined && msg.id !== undefined) {
                return;
            }

            // Processar aggTrade
            if (msg.e === 'aggTrade') {
                this.emit('message', msg as BinanceAggTrade);
            }
        } catch (e) {
            console.error('[StreamManager] Parse error:', e);
        }
    }

    private onClose(code: number, reason: Buffer): void {
        console.warn(`[StreamManager] Disconnected: ${code} - ${reason.toString()}`);
        this.cleanup();
        this.emit('disconnected');

        if (this.shouldReconnect) {
            this.scheduleReconnect();
        }
    }

    private onError(err: Error): void {
        console.error('[StreamManager] WebSocket error:', err);
        this.emit('error', err);
    }

    private onPong(): void {
        // Heartbeat response received
        this.lastMessageTime = Date.now();
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.ping();
            }
        }, 3 * 60 * 1000); // Ping a cada 3 minutos (Binance requer < 24h)
    }

    private stopHeartbeat(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    private startWatchdog(): void {
        this.stopWatchdog();
        this.watchdogTimer = setInterval(() => {
            const silenceDuration = Date.now() - this.lastMessageTime;
            if (silenceDuration > this.WATCHDOG_INTERVAL_MS) {
                console.warn(`[StreamManager] Watchdog triggered: ${silenceDuration}ms silence`);
                // Forcar reconexao
                if (this.ws) {
                    this.ws.terminate();
                }
            }
        }, 10000); // Checar a cada 10s
    }

    private stopWatchdog(): void {
        if (this.watchdogTimer) {
            clearInterval(this.watchdogTimer);
            this.watchdogTimer = null;
        }
    }

    private scheduleReconnect(): void {
        this.reconnectAttempts++;

        // Backoff exponencial: 1s, 2s, 4s, 8s, ... até MAX_BACKOFF_MS
        const delay = Math.min(
            ENGINE_CONFIG.INITIAL_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
            ENGINE_CONFIG.MAX_BACKOFF_MS
        );

        console.log(`[StreamManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        this.emit('reconnecting', this.reconnectAttempts, delay);

        setTimeout(() => {
            if (this.shouldReconnect) {
                this.doConnect();
            }
        }, delay);
    }

    private cleanup(): void {
        this.stopHeartbeat();
        this.stopWatchdog();
    }

    /**
     * Adiciona novos streams à conexão existente
     */
    public subscribe(streams: string[]): void {
        const newStreams = streams.map(s => s.toLowerCase());
        this.streams.push(...newStreams);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const payload = {
                method: 'SUBSCRIBE',
                params: newStreams,
                id: Date.now()
            };
            this.ws.send(JSON.stringify(payload));
        }
    }

    /**
     * Remove streams da conexão
     */
    public unsubscribe(streams: string[]): void {
        const toRemove = streams.map(s => s.toLowerCase());
        this.streams = this.streams.filter(s => !toRemove.includes(s));

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const payload = {
                method: 'UNSUBSCRIBE',
                params: toRemove,
                id: Date.now()
            };
            this.ws.send(JSON.stringify(payload));
        }
    }

    /**
     * Desconecta e para tentativas de reconexão
     */
    public disconnect(): void {
        this.shouldReconnect = false;
        this.cleanup();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    public isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    public getReconnectAttempts(): number {
        return this.reconnectAttempts;
    }
}
