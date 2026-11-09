"""Teoria 1: carry de funding delta-neutro (comprado no spot, vendido no perpétuo) no BTCUSDT.

Fonte da teoria: He, Manela, Ross, von Wachter, "Fundamentals of Perpetual Futures" (arXiv 2212.06888).
Período: 2020-01..2026-06. Jul–out 2026 é o teste congelado e não é lido.

Variantes registradas antes de rodar (orçamento 4, nada é ajustado aos dados):
  V1 sempre posicionado, perpétuo 1x;  V2 sempre posicionado, 2x;
  V3 1x, posicionado só se a média das 3 últimas taxas liquidadas > 0;
  V4 1x, entra se a média das 9 últimas > 0,01% (a taxa-base da Binance) e sai se < 0.

Execução: preços = abertura da hora; decisão com a taxa já liquidada, ordem na hora seguinte; o funding da hora h
vale para a posição montada antes de h. Custos por perna: spot 0,10% + 0,01%, perpétuo 0,05% + 0,01%. Rebalanceia
quando a margem do perpétuo cai à metade ou dobra; liquidação se a máxima da hora consome a margem (manutenção 0,4%).

    ~/.local/share/wow-voz/venv/bin/python -I ncm/carry.py [--simbolo ETHUSDT] [--selftest]
"""
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from statistics import NormalDist

import numpy as np
import pandas as pd

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import agregados as ag  # noqa: E402
from dados_binance import RAW, meses  # noqa: E402

SIMBOLO = sys.argv[sys.argv.index("--simbolo") + 1] if "--simbolo" in sys.argv else "BTCUSDT"
CONJ = ("futuros_klines_1m", "spot_klines_1m", "futuros_funding")
_ARQ = {"futuros_klines_1m": "{s}-1m-{m}.zip", "spot_klines_1m": "{s}-1m-{m}.zip", "futuros_funding": "{s}-fundingRate-{m}.zip"}
# meses em que os três conjuntos existem (SOL só lista em 2020-09); jul–out 2026 nunca entra
MESES = [m for m in meses("2020-01", "2026-06")
         if all((RAW / c / SIMBOLO / _ARQ[c].format(s=SIMBOLO, m=m)).exists() for c in CONJ)]
JUROS = RAW / "juros" / "DTB3.csv"     # T-bill 3 meses, FRED (St. Louis Fed), % ao ano, base 360
HORA_MS = 3_600_000
CUSTO_SPOT = 0.0010 + 0.0001
CUSTO_PERP = 0.0005 + 0.0001
MANUTENCAO = 0.004
TAXA_BASE = 0.0001
SAIDA = Path.home() / f".local/share/eos-ncm/diag-kl/metricas-carry-{SIMBOLO}.json"


@dataclass(frozen=True)
class Variante:
    nome: str
    alav: float
    janela: int = 0          # 0 = sempre posicionado
    entra: float = 0.0
    sai: float = 0.0
    sobre_juros: bool = False  # limiares em taxa anual acima do T-bill; fora da posição o caixa rende o T-bill


VARIANTES = (
    Variante("V1 sempre 1x", 1.0),
    Variante("V2 sempre 2x", 2.0),
    Variante("V3 média3>0 1x", 1.0, 3, 0.0, 0.0),
    Variante("V4 média9 histerese 1x", 1.0, 9, TAXA_BASE, 0.0),
    Variante("V5 funding>T-bill+2pp 1x", 1.0, 9, 0.02, 0.0, True),
)


def horas(conjunto: str) -> pd.DataFrame:
    # dias que faltam no arquivo mensal vêm dos diários (ex.: SOL fev/abr 2022), em <conjunto>_diario/
    diarios = sorted((RAW / f"{conjunto}_diario" / SIMBOLO).glob("*.zip"))
    k = pd.concat([ag.klines_1m(RAW / conjunto / SIMBOLO / f"{SIMBOLO}-1m-{m}.zip") for m in MESES]
                  + [ag.klines_1m(z) for z in diarios])
    k = k[~k.index.duplicated()].sort_index()
    g = k.groupby(k.index // 60)
    return pd.DataFrame({"abertura": g["abertura"].first(), "maxima": g["maxima"].max()})


def carrega() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Grade horária: (hora, spot, perp, máxima do perp, funding liquidado na hora ou nan)."""
    perp, spot = horas("futuros_klines_1m"), horas("spot_klines_1m")
    h = np.arange(perp.index.min(), perp.index.max() + 1)
    for nome, x in (("perp", perp), ("spot", spot)):
        falta = ~np.isin(h, x.index)
        seq = max((len(b) for b in "".join("1" if f else "0" for f in falta).split("0")), default=0)
        print(f"  {nome}: {falta.sum()} horas sem dado, maior sequência {seq} h (preenchidas com a anterior)")
    p = perp.reindex(h).ffill()
    s = spot["abertura"].reindex(h).ffill().bfill()
    f = pd.concat([ag.funding(RAW / "futuros_funding" / SIMBOLO / f"{SIMBOLO}-fundingRate-{m}.zip") for m in MESES])
    f = f.groupby(np.round(f.index / HORA_MS).astype(np.int64)).last().reindex(h)
    return h, s.to_numpy(), p["abertura"].to_numpy(), p["maxima"].to_numpy(), f.to_numpy()


def simula(v: Variante, s: np.ndarray, fp: np.ndarray, fmax: np.ndarray, taxa: np.ndarray,
           rf_ano: np.ndarray | None = None) -> dict:
    """rf_ano[i] = T-bill anual conhecido na hora i (do dia anterior); só a V5 usa."""
    """Patrimônio por hora (começa em 1) e contadores. q = BTC em cada perna; m = carteira do perpétuo."""
    e, q, m = 1.0, 0.0, 0.0
    alvo_spot = v.alav / (1 + v.alav)
    pat = np.empty(len(s))
    c = {"funding": 0.0, "custos": 0.0, "operacoes": 0, "rebalanceios": 0, "liquidacoes": 0, "horas_dentro": 0}
    ultimas: list[float] = []
    quer = v.janela == 0
    for i in range(len(s)):
        if q:
            # ponytail: máxima do último preço, mais severa que a Binance (liquida pelo mark price); a única marcação
            # (ETH 2020-03-13, pavio a 323 com mark 119,5) foi falsa. Trocar por markPriceKlines se voltar a marcar.
            if m - q * max(fmax[i - 1] - fp[i - 1], 0) < MANUTENCAO * q * fmax[i - 1]:   # na máxima da hora i-1
                c["liquidacoes"] += 1
            m += q * (fp[i - 1] - fp[i])
            if not math.isnan(taxa[i]):
                c["funding"] += q * fp[i] * taxa[i]
                m += q * fp[i] * taxa[i]
            c["horas_dentro"] += 1
        if not math.isnan(taxa[i]) and v.janela:
            ultimas = (ultimas + [taxa[i]])[-v.janela:]
        if not q and v.sobre_juros:
            e *= 1 + rf_ano[i] / 360 / 24
        e_agora = q * s[i] + m if q else e
        if q and not quer:
            custo = q * (s[i] * CUSTO_SPOT + fp[i] * CUSTO_PERP)
            e, q, m = e_agora - custo, 0.0, 0.0
            c["custos"] += custo
            c["operacoes"] += 1
        elif not q and quer:
            q = e * alvo_spot / s[i]
            custo = q * (s[i] * CUSTO_SPOT + fp[i] * CUSTO_PERP)
            m = e - q * s[i] - custo
            c["custos"] += custo
            c["operacoes"] += 1
        elif q and not (0.5 / v.alav <= m / (q * fp[i]) <= 2 / v.alav):
            novo = e_agora * alvo_spot / s[i]
            custo = abs(novo - q) * (s[i] * CUSTO_SPOT + fp[i] * CUSTO_PERP)
            q, m = novo, e_agora - novo * s[i] - custo
            c["custos"] += custo
            c["rebalanceios"] += 1
        pat[i] = q * s[i] + m if q else e
        if v.janela and len(ultimas) == v.janela:
            media = sum(ultimas) / v.janela
            if v.sobre_juros:
                media = media * 1095 - rf_ano[i]
            quer = media > v.entra if not q else media >= v.sai
    return {"patrimonio": pat, **c}


def dsr(sr: float, sr_todos: list[float], n: int, assim: float, curt: float) -> float:
    """Deflated Sharpe (Bailey & López de Prado 2014), Sharpe diário não anualizado; curt não-excesso."""
    z, g = NormalDist().inv_cdf, 0.5772156649
    k = len(sr_todos)
    sr0 = float(np.std(sr_todos, ddof=1)) * ((1 - g) * z(1 - 1 / k) + g * z(1 - 1 / (k * math.e)))
    den = math.sqrt(max(1 - assim * sr + (curt - 1) / 4 * sr * sr, 1e-12))
    return NormalDist().cdf((sr - sr0) * math.sqrt(n - 1) / den)


def juros_diarios() -> pd.Series:
    """Rendimento de um dia corrido do T-bill, por data (fim de semana/feriado repete a última taxa)."""
    j = pd.read_csv(JUROS, index_col=0, parse_dates=True).iloc[:, 0]
    j = pd.to_numeric(j, errors="coerce").ffill()
    j = j.reindex(pd.date_range(j.index.min(), "2026-06-30")).ffill()
    return j / 100 / 360


def metricas(pat: np.ndarray, hora: np.ndarray, rf: pd.Series | None = None) -> dict:
    dia = pd.Series(pat, index=pd.to_datetime(hora * HORA_MS, unit="ms")).resample("1D").last()
    r = dia.pct_change().dropna()
    extra = {}
    if rf is not None:
        rfd = rf.reindex(r.index.normalize()).fillna(0).to_numpy()
        ex = r.to_numpy() - rfd
        extra = {"tbill": float(np.prod(1 + rfd) - 1),
                 "sharpe_excesso": float(ex.mean() / ex.std() * math.sqrt(365)) if ex.std() else 0.0}
    anos = len(r) / 365
    pico = np.maximum.accumulate(pat)
    sr = float(r.mean() / r.std()) if r.std() else 0.0
    return {"retorno_total": float(pat[-1] / pat[0] - 1), "cagr": float((pat[-1] / pat[0]) ** (1 / anos) - 1),
            "sharpe_anual": sr * math.sqrt(365), "max_dd": float((pat / pico - 1).min()),
            "_sr": sr, "_n": len(r), "_assim": float(r.skew()), "_curt": float(r.kurt() + 3), **extra}


def main() -> int:
    hora, s, fp, fmax, taxa = carrega()
    rf = juros_diarios()
    dia_ant = pd.to_datetime(hora * HORA_MS, unit="ms").normalize() - pd.Timedelta(days=1)
    rf_hora = (rf.reindex(dia_ant).fillna(0) * 360).to_numpy()   # taxa anual de ontem: sem olhar o futuro
    print(f"{SIMBOLO} {MESES[0]}..{MESES[-1]}: {len(hora)} horas, {np.isfinite(taxa).sum()} eventos de funding", flush=True)
    ano = pd.to_datetime(hora * HORA_MS, unit="ms").year.to_numpy()
    out = {}
    for v in VARIANTES:
        r = simula(v, s, fp, fmax, taxa, rf_hora)
        pat = r.pop("patrimonio")
        tudo = metricas(pat, hora, rf)
        por_ano = {int(a): metricas(pat[ano == a], hora[ano == a], rf) for a in np.unique(ano)}
        out[v.nome] = {"total": tudo, "anos": por_ano, **r, "tempo_dentro": r["horas_dentro"] / len(hora)}
    srs = [o["total"]["_sr"] for o in out.values()]
    for nome, o in out.items():
        t = o["total"]
        t["dsr"] = dsr(t["_sr"], srs, t["_n"], t["_assim"], t["_curt"])
        print(f"\n{nome}: total {t['retorno_total']:+.1%}  CAGR {t['cagr']:+.2%}  Sharpe {t['sharpe_anual']:.2f}  "
              f"maxDD {t['max_dd']:.2%}  DSR {t['dsr']:.3f}  T-bill {t['tbill']:+.1%}  Sharpe-excesso {t['sharpe_excesso']:.2f}")
        print(f"  funding {o['funding']:+.4f}  custos {o['custos']:.4f}  ops {o['operacoes']}  "
              f"rebal {o['rebalanceios']}  liquidações {o['liquidacoes']}  dentro {o['tempo_dentro']:.0%}")
        print("  " + "  ".join(f"{a}: {m['retorno_total']:+.1%} vs tb {m['tbill']:+.1%}" for a, m in o["anos"].items()))
    SAIDA.write_text(json.dumps(out, indent=1))
    print(f"\n{SAIDA}")
    return 0


def selftest() -> None:
    n = 24 * 30
    s = np.full(n, 100.0)
    taxa = np.full(n, np.nan)
    taxa[8::8] = 0.0001
    r = simula(VARIANTES[0], s, s, s, taxa)
    eventos = len(taxa[8::8])
    esperado = 1 - 0.5 * (CUSTO_SPOT + CUSTO_PERP) + 0.5 * 0.0001 * eventos
    assert abs(r["patrimonio"][-1] - esperado) < 1e-4, (r["patrimonio"][-1], esperado)
    assert r["liquidacoes"] == 0 and r["rebalanceios"] == 0
    sobe = np.linspace(100, 300, n)                     # o BTC triplica: precisa rebalancear, sem liquidar
    r = simula(VARIANTES[0], sobe, sobe, sobe * 1.001, np.full(n, np.nan))
    assert r["rebalanceios"] >= 1 and r["liquidacoes"] == 0
    assert abs(r["patrimonio"][-1] - 1) < 0.01         # delta-neutro: o preço não move o patrimônio
    ciclo = np.full(n, np.nan)
    ciclo[8::8] = -0.0005
    ciclo[8:32:8] = 0.0005                              # 3 positivas, depois negativas
    assert simula(VARIANTES[2], s, s, s, ciclo)["operacoes"] == 2   # entra depois das positivas, sai nas negativas
    alta = np.full(n, np.nan)
    alta[8::8] = 0.0001                                 # ~11% a.a. contra juros de 5%: entra
    r = simula(VARIANTES[4], s, s, s, alta, np.full(n, 0.05))
    assert r["operacoes"] == 1
    r = simula(VARIANTES[4], s, s, s, alta, np.full(n, 0.20))   # juros de 20%: fica no caixa rendendo juros
    assert r["operacoes"] == 0 and abs(r["patrimonio"][-1] - (1 + 0.20 / 360 / 24) ** n) < 1e-9
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(main())
