// Janelas do bot (task 4 do ncm-live-trading.md): decidir no FECHAMENTO do candle, nunca com o candle aberto,
// checar stop/alvo pelo stream e rotular WIN pelo PnL líquido. Funções puras exportadas para teste.
import { EventEmitter } from "events";
import WebSocket from "ws";

// Ida e volta igual ao simulador honesto (ncm/rotulos.py): taker 0,05% + slippage 0,01% por perna.
export const CUSTO_IDA_VOLTA_PCT = 2 * (0.05 + 0.01);
const WS_BASE = "wss://stream.binance.com:9443/stream?streams=";
const RECONEXAO_MS = 5000;

export type Resultado = "WIN" | "LOSS";

/** WIN só se sobrou dinheiro depois das taxas. `brutoPct` é o resultado do preço, em %. */
export function resultadoLiquido(brutoPct: number): Resultado {
    return brutoPct - CUSTO_IDA_VOLTA_PCT > 0 ? "WIN" : "LOSS";
}

/** `created_at` do SQLite (CURRENT_TIMESTAMP) é UTC sem fuso; `new Date()` leria como hora local. */
export function sqliteUtcMs(ts: string): number {
    const temFuso = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(ts);
    return new Date(temFuso ? ts : `${ts.replace(" ", "T")}Z`).getTime();
}

/** Só candles REST já fechados (closeTime k[6] no passado): descarta o candle em formação. */
export function fechados<T extends unknown[]>(klines: T[], agoraMs: number = Date.now()): T[] {
    return klines.filter(k => Number(k[6]) < agoraMs);
}

export interface Toque {
    tipo: "STOP" | "ALVO";
    preco: number;
}

/** Stop ou alvo tocado na faixa [low, high]. Os dois no mesmo candle: assume o stop (conservador, igual ao simulador). */
export function tocou(acao: "BUY" | "SELL", stop: number, alvo: number, high: number, low: number): Toque | null {
    const bateuStop = acao === "BUY" ? low <= stop : high >= stop;
    const bateuAlvo = acao === "BUY" ? high >= alvo : low <= alvo;
    if (bateuStop) return { tipo: "STOP", preco: stop };
    if (bateuAlvo) return { tipo: "ALVO", preco: alvo };
    return null;
}

export interface Kline1m {
    simbolo: string;
    inicioMs: number;
    high: number;
    low: number;
    close: number;
    fechado: boolean;
}

/**
 * Stream de candles da Binance spot. Eventos:
 * - `fechou15m` (simbolo, fechamentoMs): candle de 15m fechou (x=true).
 * - `kline1m` (Kline1m): cada atualização do candle de 1m (preço ao vivo + máxima/mínima).
 */
export class CandleStream extends EventEmitter {
    private ws: WebSocket | null = null;
    private ativo = false;

    start(simbolos: string[]): void {
        this.ativo = true;
        const streams = simbolos.flatMap(s => [`${s.toLowerCase()}@kline_15m`, `${s.toLowerCase()}@kline_1m`]);
        this.conecta(streams);
    }

    stop(): void {
        this.ativo = false;
        this.ws?.close();
    }

    private conecta(streams: string[]): void {
        const ws = new WebSocket(WS_BASE + streams.join("/"));
        this.ws = ws;
        ws.on("open", () => console.log(`[CandleStream] conectado (${streams.length} streams)`));
        ws.on("message", (raw: WebSocket.RawData) => this.processa(raw.toString()));
        ws.on("error", (err: Error) => console.error("[CandleStream] erro:", err.message));
        ws.on("close", () => {
            if (!this.ativo) return;
            console.warn(`[CandleStream] desconectado, reconectando em ${RECONEXAO_MS / 1000}s`);
            setTimeout(() => this.ativo && this.conecta(streams), RECONEXAO_MS);
        });
    }

    private processa(texto: string): void {
        let msg: { data?: { e?: string; s?: string; k?: Record<string, unknown> } };
        try {
            msg = JSON.parse(texto);
        } catch {
            console.error("[CandleStream] mensagem inválida descartada");
            return;
        }
        const k = msg.data?.k;
        if (msg.data?.e !== "kline" || !k || typeof msg.data.s !== "string") return;
        if (k.i === "15m") {
            if (k.x === true) this.emit("fechou15m", msg.data.s, Number(k.T) + 1);
            return;
        }
        this.emit("kline1m", {
            simbolo: msg.data.s,
            inicioMs: Number(k.t),
            high: Number(k.h),
            low: Number(k.l),
            close: Number(k.c),
            fechado: k.x === true,
        } as Kline1m);
    }
}
