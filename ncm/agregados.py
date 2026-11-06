"""aggTrades de um mês -> tabelas por minuto, a matéria-prima das fotos (task 2 do ncm-live-trading.md).

Tudo é indexado pelo minuto absoluto (`ts_ms // 60_000`). Nada aqui olha para frente: cada minuto só soma os próprios
trades. As janelas (15, 60, 120 min) são montadas depois, em replay.py, somando minutos já fechados.
"""
import csv
import io
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

MINUTO_MS = 60_000
# classifyTrade de smartMoneyFilter.ts: <500 IGNORE, <5k RETAIL, <25k SMART, senão WHALE
LIMITES_USD = np.array([500.0, 5_000.0, 25_000.0])
CLASSES = ("ignore", "retail", "smart", "whale")
PESOS = np.array([0.0, 1.0, 3.0, 10.0])
LINHAS_POR_BLOCO = 4_000_000


@dataclass(frozen=True)
class Minutos:
    """Minutos [m0, m0+n). Arrays de tamanho n, exceto o footprint (uma linha por minuto x preço em centavos)."""

    m0: int
    abertura: np.ndarray  # preço do 1º trade do minuto (nan se não houve trade)
    maxima: np.ndarray
    minima: np.ndarray
    fechamento: np.ndarray
    n_trades: np.ndarray  # int64
    fluxo: np.ndarray  # [n, 4 classes, 2 lados(0=compra agressora, 1=venda)] em USD
    n_whale: np.ndarray  # trades >= 25k USD
    fp_minuto: np.ndarray  # int32, offset desde m0, ordenado por (minuto, centavos)
    fp_centavos: np.ndarray  # int64, round(preço*100) como no footprint.ts
    fp_compra: np.ndarray  # float64, USD agressão de compra (askVolume no TS)
    fp_venda: np.ndarray  # float64, USD agressão de venda (bidVolume no TS)

    @property
    def n(self) -> int:
        return len(self.fechamento)


def _blocos(zip_path: Path):
    """Lê o CSV do zip em blocos, só as colunas usadas."""
    with zipfile.ZipFile(zip_path) as z, z.open(z.namelist()[0]) as f:
        tem_cab = not f.readline().decode()[0].isdigit()
    with zipfile.ZipFile(zip_path) as z, z.open(z.namelist()[0]) as f:
        nomes = ["id", "price", "quantity", "first", "last", "ts", "maker"]
        yield from pd.read_csv(
            f,
            header=0 if tem_cab else None,
            names=nomes,
            usecols=["price", "quantity", "ts", "maker"],
            dtype={"price": "float64", "quantity": "float64", "ts": "int64", "maker": "string"},
            chunksize=LINHAS_POR_BLOCO,
        )


def de_trades(preco: np.ndarray, qtd: np.ndarray, ts: np.ndarray, maker: np.ndarray, m0: int, n: int) -> Minutos:
    """Agrega trades já em ordem cronológica nos minutos [m0, m0+n)."""
    minuto = ts // MINUTO_MS - m0
    dentro = (minuto >= 0) & (minuto < n)
    preco, qtd, minuto, maker = preco[dentro], qtd[dentro], minuto[dentro], maker[dentro]
    usd = preco * qtd
    lado = maker.astype(np.int64)  # isBuyerMaker -> venda agressora
    classe = np.searchsorted(LIMITES_USD, usd, side="right")

    n_trades = np.bincount(minuto, minlength=n)
    fluxo = np.bincount((minuto * 4 + classe) * 2 + lado, weights=usd, minlength=n * 8).reshape(n, 4, 2)
    n_whale = np.bincount(minuto, weights=(classe == 3), minlength=n).astype(np.int64)

    abertura = np.full(n, np.nan)
    fechamento = np.full(n, np.nan)
    maxima = np.full(n, np.nan)
    minima = np.full(n, np.nan)
    if len(minuto):
        primeiro = np.r_[True, minuto[1:] != minuto[:-1]]
        ultimo = np.r_[minuto[1:] != minuto[:-1], True]
        abertura[minuto[primeiro]] = preco[primeiro]
        fechamento[minuto[ultimo]] = preco[ultimo]
        np.fmax.at(maxima, minuto, preco)
        np.fmin.at(minima, minuto, preco)

    centavos = np.rint(preco * 100).astype(np.int64)
    chave = minuto.astype(np.int64) * (1 << 34) + centavos  # centavos < 2^34 (US$ 171 mi)
    u, inv = np.unique(chave, return_inverse=True)
    compra = np.bincount(inv, weights=np.where(lado == 0, usd, 0.0), minlength=len(u))
    venda = np.bincount(inv, weights=np.where(lado == 1, usd, 0.0), minlength=len(u))
    return Minutos(
        m0, abertura, maxima, minima, fechamento, n_trades, fluxo, n_whale,
        (u >> 34).astype(np.int32), u & ((1 << 34) - 1), compra, venda,
    )


def junta(a: Minutos, b: Minutos) -> Minutos:
    """Concatena dois intervalos contíguos (a antes de b)."""
    assert a.m0 + a.n == b.m0, "intervalos não contíguos"

    def c(x: np.ndarray, y: np.ndarray) -> np.ndarray:
        return np.concatenate([x, y])

    return Minutos(
        a.m0, c(a.abertura, b.abertura), c(a.maxima, b.maxima), c(a.minima, b.minima),
        c(a.fechamento, b.fechamento), c(a.n_trades, b.n_trades), c(a.fluxo, b.fluxo), c(a.n_whale, b.n_whale),
        c(a.fp_minuto, b.fp_minuto + a.n), c(a.fp_centavos, b.fp_centavos), c(a.fp_compra, b.fp_compra),
        c(a.fp_venda, b.fp_venda),
    )


def fatia(x: Minutos, ini: int, fim: int) -> Minutos:
    """Minutos absolutos [ini, fim) de x."""
    i, f = ini - x.m0, fim - x.m0
    a, b = np.searchsorted(x.fp_minuto, [i, f])
    return Minutos(
        ini, x.abertura[i:f], x.maxima[i:f], x.minima[i:f], x.fechamento[i:f], x.n_trades[i:f], x.fluxo[i:f],
        x.n_whale[i:f], x.fp_minuto[a:b] - i, x.fp_centavos[a:b], x.fp_compra[a:b], x.fp_venda[a:b],
    )


def _de_bloco(b: pd.DataFrame, m0: int, n: int) -> Minutos:
    maker = b["maker"].to_numpy(dtype=object)
    return de_trades(b["price"].to_numpy(float), b["quantity"].to_numpy(float), b["ts"].to_numpy(np.int64),
                     np.isin(maker, ["true", "True", "1"]), m0, n)


def do_mes(zip_path: Path, m0: int, n: int) -> Minutos:
    """Lê o zip de aggTrades do mês em blocos; o último minuto de cada bloco passa para o próximo (não é cortado)."""
    partes: list[Minutos] = []
    sobra: pd.DataFrame | None = None
    inicio = m0
    for bloco in _blocos(zip_path):
        if sobra is not None and len(sobra):
            bloco = pd.concat([sobra, bloco], ignore_index=True)
        minuto = bloco["ts"].to_numpy() // MINUTO_MS
        ultimo_min = int(minuto[-1])
        sobra = bloco[minuto >= ultimo_min]
        fim = min(ultimo_min, m0 + n)
        if fim > inicio:
            partes.append(_de_bloco(bloco[minuto < ultimo_min], inicio, fim - inicio))
            inicio = fim
    if m0 + n > inicio:
        s = sobra if sobra is not None else pd.DataFrame({"price": [], "quantity": [], "ts": [], "maker": []})
        partes.append(_de_bloco(s, inicio, m0 + n - inicio))
    out = partes[0]
    for p in partes[1:]:
        out = junta(out, p)
    return out


def klines_1m(zip_path: Path) -> pd.DataFrame:
    """Klines 1m de um zip (spot vem em microssegundos desde 2025; futuros em ms). Índice = minuto absoluto."""
    with zipfile.ZipFile(zip_path) as z, z.open(z.namelist()[0]) as f:
        linhas = [r for r in csv.reader(io.TextIOWrapper(f, encoding="utf-8")) if r and r[0].isdigit()]
    a = np.array(linhas, dtype=object)
    t = a[:, 0].astype(np.int64)
    t = np.where(t > 10**14, t // 1000, t)
    df = pd.DataFrame({
        "abertura": a[:, 1].astype(float), "maxima": a[:, 2].astype(float), "minima": a[:, 3].astype(float),
        "fechamento": a[:, 4].astype(float), "volume": a[:, 5].astype(float), "volume_usd": a[:, 7].astype(float),
    }, index=t // MINUTO_MS)
    return df[~df.index.duplicated()]


def funding(zip_path: Path) -> pd.Series:
    """last_funding_rate por instante de cálculo (ms)."""
    with zipfile.ZipFile(zip_path) as z, z.open(z.namelist()[0]) as f:
        df = pd.read_csv(f)
    return pd.Series(df["last_funding_rate"].to_numpy(float), index=df["calc_time"].to_numpy(np.int64))
