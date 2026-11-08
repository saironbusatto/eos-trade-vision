import { CandleStream, CUSTO_IDA_VOLTA_PCT, fechados, Kline1m, resultadoLiquido, sqliteUtcMs, tocou } from "./candleStream";

describe("rótulo com taxa", () => {
    test("custo de ida e volta é o do simulador (0,12%)", () => {
        expect(CUSTO_IDA_VOLTA_PCT).toBeCloseTo(0.12);
    });
    test("lucro bruto menor que a taxa é LOSS", () => {
        expect(resultadoLiquido(0)).toBe("LOSS");
        expect(resultadoLiquido(0.10)).toBe("LOSS");
        expect(resultadoLiquido(0.12)).toBe("LOSS");
    });
    test("só é WIN se sobrar dinheiro depois da taxa", () => {
        expect(resultadoLiquido(0.13)).toBe("WIN");
        expect(resultadoLiquido(-0.5)).toBe("LOSS");
    });
});

describe("created_at do SQLite", () => {
    test("sem fuso é lido como UTC, não como hora local", () => {
        expect(sqliteUtcMs("2026-11-07 12:00:00")).toBe(Date.UTC(2026, 10, 7, 12, 0, 0));
    });
    test("com fuso explícito é respeitado", () => {
        expect(sqliteUtcMs("2026-11-07T12:00:00Z")).toBe(Date.UTC(2026, 10, 7, 12));
        expect(sqliteUtcMs("2026-11-07T09:00:00-03:00")).toBe(Date.UTC(2026, 10, 7, 12));
    });
});

describe("candle em formação", () => {
    test("descarta o candle cujo fechamento ainda não passou", () => {
        const agora = 1_000_000;
        const kl = [[0, "1", "1", "1", "1", "1", agora - 1], [0, "1", "1", "1", "1", "1", agora + 899_999]];
        expect(fechados(kl, agora)).toEqual([kl[0]]);
    });
});

describe("stop e alvo", () => {
    test("compra: alvo acima, stop abaixo", () => {
        expect(tocou("BUY", 99, 101, 101.5, 100)).toEqual({ tipo: "ALVO", preco: 101 });
        expect(tocou("BUY", 99, 101, 100.5, 98.9)).toEqual({ tipo: "STOP", preco: 99 });
        expect(tocou("BUY", 99, 101, 100.5, 99.5)).toBeNull();
    });
    test("venda: alvo abaixo, stop acima", () => {
        expect(tocou("SELL", 101, 99, 100, 98.9)).toEqual({ tipo: "ALVO", preco: 99 });
        expect(tocou("SELL", 101, 99, 101.2, 100)).toEqual({ tipo: "STOP", preco: 101 });
    });
    test("stop e alvo no mesmo candle: assume o stop", () => {
        expect(tocou("BUY", 99, 101, 102, 98)).toEqual({ tipo: "STOP", preco: 99 });
        expect(tocou("SELL", 101, 99, 102, 98)).toEqual({ tipo: "STOP", preco: 101 });
    });
});

describe("mensagens do stream", () => {
    const msg = (i: string, x: boolean) => JSON.stringify({
        stream: `btcusdt@kline_${i}`,
        data: { e: "kline", s: "BTCUSDT", k: { t: 1000, T: 900_999, i, h: "101", l: "99", c: "100", x } },
    });
    const processa = (cs: CandleStream, texto: string) => (cs as unknown as { processa(t: string): void }).processa(texto);

    test("15m só avisa quando o candle fecha, com o horário de fechamento", () => {
        const cs = new CandleStream();
        const fechou = jest.fn();
        cs.on("fechou15m", fechou);
        processa(cs, msg("15m", false));
        expect(fechou).not.toHaveBeenCalled();
        processa(cs, msg("15m", true));
        expect(fechou).toHaveBeenCalledWith("BTCUSDT", 901_000);
    });
    test("1m repassa máxima, mínima e preço atual", () => {
        const cs = new CandleStream();
        const recebidos: Kline1m[] = [];
        cs.on("kline1m", (k: Kline1m) => recebidos.push(k));
        processa(cs, msg("1m", false));
        expect(recebidos).toEqual([{ simbolo: "BTCUSDT", inicioMs: 1000, high: 101, low: 99, close: 100, fechado: false }]);
    });
    test("mensagem inválida é descartada sem quebrar", () => {
        const cs = new CandleStream();
        const erro = jest.spyOn(console, "error").mockImplementation(() => undefined);
        expect(() => processa(cs, "{nao json")).not.toThrow();
        erro.mockRestore();
    });
});
