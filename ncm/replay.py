"""Task 2 do ncm-live-trading.md: a "foto" do mercado no fim de cada minuto, usando só o que já tinha acontecido.

A decisão do minuto m acontece em t = (m+1)*60s, quando o candle m fecha. A foto junta:
  - legado:    o OFA do bot portado fielmente (ofa_legado), inclusive vela aberta e klines de 15m do spot;
  - corrigido: o mesmo OFA sem os defeitos (ofa_corrigido), só com velas de 15m de futuros fechadas;
  - bruto:     fluxo por tamanho de trade e retornos dos últimos minutos, hora, dia, funding e basis.
Nada é normalizado aqui: médias e escalas são ajustadas só no treino (task 7).

    ~/.local/share/wow-voz/venv/bin/python -I ncm/replay.py                 # BTCUSDT 2026-02..2026-10
    ~/.local/share/wow-voz/venv/bin/python -I ncm/replay.py --ate 2026-02 --max-minutos 2000
"""
import argparse
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import agregados as ag  # noqa: E402
import ofa_corrigido as oc  # noqa: E402
import ofa_legado as ol  # noqa: E402
from dados_binance import RAW, limites_mes, meses  # noqa: E402

SAIDA = Path.home() / ".local/share/eos-ncm/fotos"
VELA = 15  # minutos
JANELA_SM, JANELA_IMB, JANELA_ABS = 15, 60, 120  # minutos, como no bot
VELAS_VP, VELAS_IND = 100, 20
HIST_MIN = (VELAS_VP + 1) * VELA  # minutos de klines exigidos antes de m
HIST_TRADES = JANELA_ABS + VELA  # minutos de trades exigidos antes de m
N_BRUTO_1M, N_BRUTO_15M = 15, 8
# ponytail: passo do nível corrigido = 1/4 do movimento típico de 1m; é um botão, ajustar se a task 6 pedir
FRACAO_PASSO = 0.25


class Velas15:
    """Klines 1m contíguos -> agregados de 15m por índice de vela (minuto // 15)."""

    def __init__(self, k: pd.DataFrame) -> None:
        self.m0 = int(k.index.min())
        k = k.reindex(np.arange(self.m0, int(k.index.max()) + 1))
        self.presente = k["fechamento"].notna().to_numpy()
        self.ab, self.mx, self.mn, self.fe = (k[c].to_numpy() for c in ("abertura", "maxima", "minima", "fechamento"))
        self.vol, self.usd = k["volume"].to_numpy(), k["volume_usd"].to_numpy()
        self.ok_acum = np.r_[0, np.cumsum(self.presente)]

    def completo(self, ini: int, fim: int) -> bool:
        """Todos os minutos [ini, fim) presentes."""
        a, b = ini - self.m0, fim - self.m0
        return a >= 0 and b <= len(self.presente) and self.ok_acum[b] - self.ok_acum[a] == b - a

    def velas(self, primeira: int, ultima: int, ate_minuto: int) -> np.ndarray:
        """Velas [primeira..ultima] (índices de 15m); a última é cortada em ate_minuto (inclusive).
        Colunas: abertura, máxima, mínima, fechamento, volume, volume_usd."""
        out = np.empty((ultima - primeira + 1, 6))
        for j, v in enumerate(range(primeira, ultima + 1)):
            a, b = v * VELA - self.m0, min((v + 1) * VELA, ate_minuto + 1) - self.m0
            out[j] = (self.ab[a], self.mx[a:b].max(), self.mn[a:b].min(), self.fe[b - 1], self.vol[a:b].sum(),
                      self.usd[a:b].sum())
        return out


def _velas_legado(x: ag.Minutos, m: int, janela: int, com_niveis: bool) -> list[ol.Vela]:
    """generateFootprint(janela): trades de (t - janela, t], agrupados em velas de 15m pelo relógio."""
    s = ag.fatia(x, m - janela + 1, m + 1)
    vela_min = (s.m0 + np.arange(s.n)) // VELA
    tem = s.n_trades > 0
    if com_niveis:
        chave = ((s.m0 + s.fp_minuto) // VELA).astype(np.int64) * (1 << 34) + s.fp_centavos
        u, inv = np.unique(chave, return_inverse=True)
        compra = np.bincount(inv, s.fp_compra, len(u))
        venda = np.bincount(inv, s.fp_venda, len(u))
        v_u, cent_u = u >> 34, u & ((1 << 34) - 1)
    out = []
    for v in np.unique(vela_min[tem]):
        sel = np.flatnonzero((vela_min == v) & tem)
        if com_niveis:
            k = np.flatnonzero(v_u == v)[::-1]  # preço decrescente, como o TS deixa
            precos, vd, cp = cent_u[k] / 100.0, venda[k], compra[k]
        else:
            fl = s.fluxo[sel].sum(axis=(0, 1))
            precos, vd, cp = np.zeros(1), np.array([fl[1]]), np.array([fl[0]])
        out.append(ol.Vela(int(v), float(s.abertura[sel[0]]), float(s.fechamento[sel[-1]]), precos, vd, cp))
    return out


def detect_imbalances_np(precos: np.ndarray, venda: np.ndarray, compra: np.ndarray) -> list[tuple[float, float, str]]:
    """Mesma saída e ordem de ol.detect_imbalances, vetorizada (o footprint de 1 tick tem milhares de níveis)."""
    if len(precos) < 2:
        return []
    with np.errstate(divide="ignore", invalid="ignore"):
        rb = np.where((venda[:-1] > 0) & (compra[1:] > 0), compra[1:] / venda[:-1], 0.0)
        rs = np.where((compra[:-1] > 0) & (venda[1:] > 0), venda[1:] / compra[:-1], 0.0)
    b, s = rb >= ol.IMBALANCE_RATIO, rs >= ol.IMBALANCE_RATIO
    out = []
    for j in np.flatnonzero(b | s):
        if b[j]:
            out.append((float(precos[j + 1]), float(rb[j]), "BUY"))
        if s[j]:
            out.append((float(precos[j + 1]), float(rs[j]), "SELL"))
    return out


def _janela(arr: np.ndarray, x: ag.Minutos, m: int, n: int) -> np.ndarray:
    """Os n minutos que terminam em m (inclusive)."""
    return arr[m - n + 1 - x.m0: m + 1 - x.m0]


def legado(x: ag.Minutos, spot: Velas15, m: int) -> dict:
    sm = ol.smart_money(_janela(x.fluxo, x, m, JANELA_SM).sum(axis=0), int(_janela(x.n_whale, x, m, JANELA_SM).sum()),
                        int(_janela(x.n_trades, x, m, JANELA_SM).sum()))
    imb = ol.analyze_imbalances(_velas_legado(x, m, JANELA_IMB, True), detect_imbalances_np)
    absor = ol.analyze_absorption(_velas_legado(x, m, JANELA_ABS, False))
    v_atual = m // VELA
    k100 = spot.velas(v_atual - VELAS_VP + 1, v_atual, m)  # inclui a vela aberta, como o REST
    vp = ol.volume_profile(k100[:, 1], k100[:, 2], k100[:, 5], float(spot.fe[m - spot.m0]))
    ind = ol.indicadores(k100[-VELAS_IND:, 3], k100[-VELAS_IND:, 4])
    d = ol.direcao(sm, vp, imb, absor, ind)
    f = ol.features_f(sm, vp, imb, absor, ind)
    return {**{f"leg_sm_{k}": v for k, v in sm.items()}, **{f"leg_imb_{k}": v for k, v in imb.items()},
            **{f"leg_abs_{k}": v for k, v in absor.items()}, "leg_vp_contexto": vp["contexto"],
            **{f"leg_ind_{k}": v for k, v in ind.items()}, **{f"leg_{k}": v for k, v in d.items()},
            **{f"leg_{k}": v for k, v in f.items()}}


def corrigido(x: ag.Minutos, fut: Velas15, m: int) -> dict:
    ultima = (m + 1) // VELA - 1  # última vela de 15m fechada em t
    fe = _janela(x.fechamento, x, m, 60)
    sigma = float(np.diff(np.log(fe)).std())
    preco = float(fe[-1])
    passo = max(0.01, FRACAO_PASSO * preco * sigma)

    velas_imb = []
    for v in range(ultima - JANELA_IMB // VELA + 1, ultima + 1):
        s = ag.fatia(x, v * VELA, (v + 1) * VELA)
        velas_imb.append(oc.agrupa_niveis(s.fp_centavos, s.fp_compra, s.fp_venda, passo))
    imb = oc.imbalances(velas_imb)

    n_abs = JANELA_ABS // VELA
    a, b = (ultima - n_abs + 1) * VELA - x.m0, (ultima + 1) * VELA - x.m0
    fl = x.fluxo[a:b].sum(axis=1).reshape(n_abs, VELA, 2).sum(axis=1)
    absor = oc.absorcao(x.abertura[a:b].reshape(n_abs, VELA)[:, 0], x.fechamento[a:b].reshape(n_abs, VELA)[:, -1],
                        fl.sum(axis=1), fl[:, 0] - fl[:, 1])

    k = fut.velas(ultima - VELAS_VP + 1, ultima, (ultima + 1) * VELA - 1)
    vp = oc.volume_profile(k[:, 1], k[:, 2], k[:, 5], preco)
    ind = oc.indicadores(k[-VELAS_IND:, 3], k[-VELAS_IND:, 4])
    return {**{f"cor_imb_{c}": v for c, v in imb.items()}, **{f"cor_abs_{c}": v for c, v in absor.items()},
            **{f"cor_vp_{c}": v for c, v in vp.items()}, **{f"cor_ind_{c}": v for c, v in ind.items()},
            "cor_sigma_1m": sigma, "cor_passo_rel": passo / preco}


def bruto(x: ag.Minutos, fut: Velas15, spot: Velas15, funding: pd.Series, m: int) -> dict:
    i = m - x.m0
    fl = np.log1p(_janela(x.fluxo, x, m, N_BRUTO_1M).reshape(N_BRUTO_1M, 8))
    r1 = np.diff(np.log(_janela(x.fechamento, x, m, N_BRUTO_1M + 1)))
    ultima = (m + 1) // VELA - 1
    f15 = fut.fe[np.arange(ultima - N_BRUTO_15M, ultima + 1) * VELA + VELA - 1 - fut.m0]
    r15 = np.diff(np.log(f15))
    hora = (m % 1440) / 60.0
    dia = ((m // 1440) + 4) % 7  # 1970-01-01 foi quinta: 0 = domingo, como getUTCDay
    j = funding.index.searchsorted((m + 1) * ag.MINUTO_MS, side="right") - 1
    out = {f"raw_fl_{a}_{b}": float(fl[a, b]) for a in range(N_BRUTO_1M) for b in range(8)}
    out.update({f"raw_r1m_{a}": float(r1[a]) for a in range(N_BRUTO_1M)})
    out.update({f"raw_r15m_{a}": float(r15[a]) for a in range(N_BRUTO_15M)})
    out.update({
        "raw_whales_15m": float(_janela(x.n_whale, x, m, 15).sum()), "raw_trades_1m": float(np.log1p(x.n_trades[i])),
        "raw_hora_sin": float(np.sin(2 * np.pi * hora / 24)), "raw_hora_cos": float(np.cos(2 * np.pi * hora / 24)),
        "raw_dia_sin": float(np.sin(2 * np.pi * dia / 7)), "raw_dia_cos": float(np.cos(2 * np.pi * dia / 7)),
        "raw_hora_utc": float(m % 1440 // 60), "raw_dia_utc": float(dia),
        "raw_funding": float(funding.iat[j]) if j >= 0 else 0.0,
        "raw_basis": float(x.fechamento[i] / spot.fe[m - spot.m0] - 1),
    })
    return out


def valido(x: ag.Minutos, fut: Velas15, spot: Velas15, m: int) -> bool:
    """Histórico completo: trades em todos os minutos da janela longa e klines de 25h nos dois mercados."""
    i = m - x.m0
    if i - HIST_TRADES + 1 < 0 or i >= x.n or (x.n_trades[i - HIST_TRADES + 1: i + 1] == 0).any():
        return False
    return fut.completo(m - HIST_MIN, m + 1) and spot.completo(m - HIST_MIN, m + 1)


def foto(x: ag.Minutos, fut: Velas15, spot: Velas15, funding: pd.Series, m: int) -> dict:
    return {**legado(x, spot, m), **corrigido(x, fut, m), **bruto(x, fut, spot, funding, m)}


def carrega_klines(conjunto: str, simbolo: str, lista: list[str]) -> pd.DataFrame:
    k = pd.concat([ag.klines_1m(RAW / conjunto / simbolo / f"{simbolo}-1m-{mes}.zip") for mes in lista])
    return k[~k.index.duplicated()].sort_index()


def carrega_contexto(simbolo: str, lista: list[str]) -> tuple[Velas15, Velas15, pd.Series]:
    fut = Velas15(carrega_klines("futuros_klines_1m", simbolo, lista))
    spot = Velas15(carrega_klines("spot_klines_1m", simbolo, lista))
    funding = pd.concat([ag.funding(RAW / "futuros_funding" / simbolo / f"{simbolo}-fundingRate-{mes}.zip")
                         for mes in lista]).sort_index()
    return fut, spot, funding


def roda(simbolo: str, lista: list[str], max_minutos: int | None) -> None:
    SAIDA.mkdir(parents=True, exist_ok=True)
    fut, spot, funding = carrega_contexto(simbolo, lista)
    cauda: ag.Minutos | None = None
    for mes in lista:
        ini, fim = (v // ag.MINUTO_MS for v in limites_mes(mes))
        t0 = time.time()
        x = ag.do_mes(RAW / "futuros_aggtrades" / simbolo / f"{simbolo}-aggTrades-{mes}.zip", ini, fim - ini)
        print(f"{mes}: trades agregados em {time.time() - t0:.0f}s", flush=True)
        if cauda is not None:
            x = ag.junta(cauda, x)
        n = fim - ini if max_minutos is None else min(max_minutos, fim - ini)
        nomes: list[str] | None = None
        linhas, ok = [], np.zeros(n, bool)
        t0 = time.time()
        for j, m in enumerate(range(ini, ini + n)):
            ok[j] = valido(x, fut, spot, m)
            f = foto(x, fut, spot, funding, m) if ok[j] else None
            if f is not None and nomes is None:
                nomes = list(f)
            linhas.append(f)
        largura = len(nomes) if nomes else 0
        X = np.full((n, largura), np.nan, np.float32)
        for j, f in enumerate(linhas):
            if f is not None:
                X[j] = [f[k] for k in nomes]
        destino = SAIDA / f"{simbolo}-{mes}.npz"
        np.savez_compressed(destino, t_ms=(np.arange(ini, ini + n, dtype=np.int64) + 1) * ag.MINUTO_MS, valido=ok,
                            preco=x.fechamento[ini - x.m0: ini + n - x.m0], X=X, nomes=np.array(nomes or []))
        dt = time.time() - t0
        print(f"{mes}: {n} minutos, {int(ok.sum())} válidos, {largura} features, {dt:.0f}s "
              f"({1000 * dt / max(n, 1):.1f} ms/min) -> {destino}", flush=True)
        cauda = ag.fatia(x, fim - HIST_TRADES - N_BRUTO_1M, fim)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--simbolo", default="BTCUSDT")
    p.add_argument("--de", default="2026-02")
    p.add_argument("--ate", default="2026-10")
    p.add_argument("--max-minutos", type=int)
    a = p.parse_args()
    roda(a.simbolo, meses(a.de, a.ate), a.max_minutos)
    return 0


if __name__ == "__main__":
    sys.exit(main())
