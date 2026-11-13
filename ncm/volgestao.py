"""Teoria 3: exposição gerida pela volatilidade (comprado no ativo, peso inverso à volatilidade recente).

Fontes: Moreira & Muir 2017, "Volatility-Managed Portfolios", J. Finance 72(4); Harvey et al. 2018, "The Impact of
Volatility Targeting", J. Portfolio Management 45(1). Contra: Cederburg, O'Doherty, Wang & Yan 2020, "On the
performance of volatility-managed portfolios", J. Financial Economics 138(1) (o ganho some fora da amostra).

Variantes registradas antes de rodar (4 por ativo; BTC e ETH; nada ajustado aos dados). Alvo fixo de 50% a.a.:
  V1 peso = alvo/σ30d, máx 1x (spot);   V2 = alvo/σ7d, máx 1x (spot);
  V3 peso = (alvo/σ30d)², máx 1x (spot, forma de Moreira & Muir);   V4 = V1 com máx 2x no perpétuo (paga funding).
σ = desvio dos retornos log horários do spot na janela, anualizado. Decisão às 00 UTC com dados até aquela hora;
só negocia se o peso mudar mais de 0,10. Nas variantes spot o caixa não usado rende o T-bill; no perpétuo, 0.
Comparação: buy & hold do spot (peso 1, sem juros). H1: Sharpe em excesso maior que o buy & hold em 2020–22 E 2023–26.

    ~/.local/share/wow-voz/venv/bin/python -I ncm/volgestao.py [--simbolo ETHUSDT] [--selftest]
"""
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import carry as c  # noqa: E402  (lê --simbolo da linha de comando)

ALVO = 0.50
FAIXA = 0.10
HORAS_ANO = 24 * 365
INICIO_H = 30 * 24            # todas as variantes e o buy & hold começam quando a janela de 30 d existe
METADES = {"2020-22": (2020, 2022), "2023-26": (2023, 2026)}
SAIDA = Path.home() / f".local/share/eos-ncm/diag-kl/metricas-volgestao-{c.SIMBOLO}.json"


@dataclass(frozen=True)
class Variante:
    nome: str
    janela_d: int
    potencia: int
    teto: float
    perp: bool = False


VARIANTES = (
    Variante("V1 alvo/σ30d 1x", 30, 1, 1.0),
    Variante("V2 alvo/σ7d 1x", 7, 1, 1.0),
    Variante("V3 (alvo/σ30d)² 1x", 30, 2, 1.0),
    Variante("V4 alvo/σ30d 2x perp", 30, 1, 2.0, True),
)


def sigma(s: np.ndarray, janela_d: int) -> np.ndarray:
    """σ anualizado em i usando os retornos até a abertura da hora i (nada do futuro)."""
    lr = np.diff(np.log(s), prepend=np.log(s[0]))
    return pd.Series(lr).rolling(janela_d * 24).std().to_numpy() * math.sqrt(HORAS_ANO)


def simula(peso_alvo: np.ndarray, r: np.ndarray, decide: np.ndarray, rf_h: np.ndarray, taxa: np.ndarray,
           custo: float, perp: bool) -> dict:
    """Patrimônio por hora. peso_alvo[i] só vale nas horas `decide`; r[i] = retorno de i-1 a i."""
    pat = np.empty(len(r))
    p, w, ops, custos, soma_w = 1.0, 0.0, 0, 0.0, 0.0
    for i in range(len(r)):
        if i:
            p *= 1 + w * r[i] + (0.0 if perp else (1 - w) * rf_h[i])
            if perp and w and not math.isnan(taxa[i]):
                p -= p * w * taxa[i]               # comprado no perpétuo paga funding positivo
        if decide[i] and not math.isnan(peso_alvo[i]) and abs(peso_alvo[i] - w) > FAIXA:
            gasto = abs(peso_alvo[i] - w) * p * custo
            p -= gasto
            custos += gasto
            w = peso_alvo[i]
            ops += 1
        soma_w += w
        pat[i] = p
    return {"patrimonio": pat, "operacoes": ops, "custos": custos, "peso_medio": soma_w / len(r)}


def resume(pat: np.ndarray, hora: np.ndarray, rf: pd.Series) -> dict:
    ano = pd.to_datetime(hora * c.HORA_MS, unit="ms").year.to_numpy()
    out = {"total": c.metricas(pat, hora, rf),
           "anos": {int(a): c.metricas(pat[ano == a], hora[ano == a], rf) for a in np.unique(ano)}}
    for nome, (a, b) in METADES.items():
        m = (ano >= a) & (ano <= b)
        out[nome] = c.metricas(pat[m], hora[m], rf)
    return out


def main() -> int:
    hora, s, fp, _, taxa = c.carrega()
    rf = c.juros_diarios()
    dia_ant = pd.to_datetime(hora * c.HORA_MS, unit="ms").normalize() - pd.Timedelta(days=1)
    rf_h = (rf.reindex(dia_ant).fillna(0)).to_numpy() / 24          # rendimento de uma hora
    r_s = np.diff(s, prepend=s[0]) / np.r_[s[0], s[:-1]]
    r_p = np.diff(fp, prepend=fp[0]) / np.r_[fp[0], fp[:-1]]
    decide = (hora % 24) == 0
    sigs = {j: sigma(s, j)[INICIO_H:] for j in {v.janela_d for v in VARIANTES}}
    sl = slice(INICIO_H, None)
    hora, r_s, r_p, decide, rf_h, taxa = hora[sl], r_s[sl], r_p[sl], decide[sl], rf_h[sl], taxa[sl]
    print(f"{c.SIMBOLO}: {len(hora)} horas a partir de {pd.to_datetime(hora[0] * c.HORA_MS, unit='ms')}", flush=True)

    so_inicio = np.zeros(len(r_s), bool)
    so_inicio[0] = True
    bh = simula(np.ones(len(r_s)), r_s, so_inicio, np.zeros(len(r_s)), taxa, c.CUSTO_SPOT, False)
    out = {"buy&hold": {**resume(bh.pop("patrimonio"), hora, rf), **bh}}
    for v in VARIANTES:
        alvo = np.minimum(v.teto, (ALVO / sigs[v.janela_d]) ** v.potencia)
        r = simula(alvo, r_p if v.perp else r_s, decide, rf_h, taxa, c.CUSTO_PERP if v.perp else c.CUSTO_SPOT, v.perp)
        out[v.nome] = {**resume(r.pop("patrimonio"), hora, rf), **r}

    srs = [o["total"]["_sr"] for k, o in out.items() if k != "buy&hold"]
    bh_m = out["buy&hold"]
    for nome, o in out.items():
        t = o["total"]
        if nome != "buy&hold":
            t["dsr"] = c.dsr(t["_sr"], srs, t["_n"], t["_assim"], t["_curt"])
        ganha = [o[m]["sharpe_excesso"] > bh_m[m]["sharpe_excesso"] for m in METADES]
        print(f"\n{nome}: total {t['retorno_total']:+.0%}  CAGR {t['cagr']:+.1%}  Sharpe-exc {t['sharpe_excesso']:.2f}  "
              f"maxDD {t['max_dd']:.0%}  peso médio {o['peso_medio']:.2f}  ops {o['operacoes']}  custos {o['custos']:.3f}"
              + (f"  DSR {t['dsr']:.2f}" if "dsr" in t else ""))
        print("  metades Sharpe-exc: " + "  ".join(f"{m} {o[m]['sharpe_excesso']:.2f} (dd {o[m]['max_dd']:.0%})"
                                                   for m in METADES)
              + ("" if nome == "buy&hold" else f"  -> ganha do B&H nas duas: {all(ganha)}"))
        print("  " + "  ".join(f"{a}: {m['retorno_total']:+.0%}" for a, m in o["anos"].items()))
    SAIDA.write_text(json.dumps(out, indent=1))
    print(f"\n{SAIDA}")
    return 0


def selftest() -> None:
    n = 24 * 60
    s = 100 * np.exp(np.cumsum(np.where(np.arange(n) % 2, 0.01, -0.01)))   # vai e volta: σ conhecido
    sg = sigma(s, 30)
    esperado = 0.01 * math.sqrt(HORAS_ANO) * math.sqrt(720 / 719)           # desvio amostral (ddof=1)
    assert abs(sg[-1] - esperado) < 1e-9 and np.isnan(sg[30 * 24 - 2])
    r = np.zeros(n)
    decide = (np.arange(n) % 24) == 0
    peso = np.full(n, 0.5)
    out = simula(peso, r, decide, np.zeros(n), np.full(n, np.nan), 0.001, False)
    assert out["operacoes"] == 1 and abs(out["patrimonio"][-1] - (1 - 0.5 * 0.001)) < 1e-12
    peso[100:] = 0.55                                                       # mudança menor que a faixa: não negocia
    assert simula(peso, r, decide, np.zeros(n), np.full(n, np.nan), 0.001, False)["operacoes"] == 1
    caixa = simula(np.zeros(n), r, decide, np.full(n, 1e-5), np.full(n, np.nan), 0.001, False)
    assert abs(caixa["patrimonio"][-1] - (1 + 1e-5) ** (n - 1)) < 1e-9     # fora do mercado rende o T-bill
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(main())
