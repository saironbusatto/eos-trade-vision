"""Fase 2 do funding-ncm-carry.md: carry de funding com rotação entre 30 símbolos por regra fixa (sem modelo).

Regras registradas antes de rodar (orçamento: 4 das 20 variantes):
  R1 (principal) no início do mês: os 3 símbolos de maior funding médio dos últimos 30 dias, 1/3 do capital cada,
     só se o funding anualizado > T-bill; o resto fica em caixa rendendo o T-bill.
  R2 = R1 com os 5 maiores (1/5 cada).   R3 = R1 com decisão semanal (segunda 00 UTC).
  B0 referência: todos os símbolos disponíveis, pesos iguais, sem filtro, mensal.
Cada posição é um carry 1x (metade spot, metade margem do perpétuo vendido), como a V1 do carry.py.
Saída forçada: funding somado das últimas 24 h < -0,3% -> fecha na hora seguinte e só volta na próxima decisão.
Símbolo deslistado (preço some): fecha no último preço. Custos do carry.py (spot 0,11%, perpétuo 0,06% por perna).
Operação de 2021-01 a 2026-06 (o universo foi fixado com dados de 2020-12). Jul–out 2026 não é lido.
Critério de parada: R1 precisa ganhar do T-bill no total de 2022..2026-06.

    ~/.local/share/wow-voz/venv/bin/python -I ncm/rotacao.py [--selftest]
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
import agregados as ag  # noqa: E402
import carry as c  # noqa: E402
from dados_binance import RAW, meses  # noqa: E402

MESES = meses("2020-11", "2026-06")
INICIO = "2021-01-01"
JANELA_H = 30 * 24
MIN_EVENTOS = 60               # ~20 dias de funding de 8 h dentro da janela
SAIDA_24H = -0.003
PREENCHE_H = 24                # buraco maior que isso = símbolo indisponível
SAIDA = Path.home() / ".local/share/eos-ncm/diag-kl/metricas-rotacao.json"


@dataclass(frozen=True)
class Regra:
    nome: str
    k: int
    semanal: bool = False
    filtro: bool = True          # exige funding anualizado > T-bill
    oraculo: bool = False        # DIAGNÓSTICO, não é estratégia: ordena pelo funding dos 30 dias SEGUINTES


REGRAS = (
    Regra("R1 top3 mensal", 3),
    Regra("R2 top5 mensal", 5),
    Regra("R3 top3 semanal", 3, semanal=True),
    Regra("B0 todos iguais", 30, filtro=False),
    Regra("TETO oráculo top3 mensal (olha o futuro)", 3, oraculo=True),
    Regra("TETO oráculo top3 semanal (olha o futuro)", 3, semanal=True, oraculo=True),
)


def _horas(conjunto: str, simbolo: str, grade: np.ndarray) -> pd.DataFrame:
    zs = [RAW / conjunto / simbolo / f"{simbolo}-1h-{m}.zip" for m in MESES]
    k = pd.concat([ag.klines_1m(z) for z in zs if z.exists()])
    k = k[~k.index.duplicated()].sort_index()
    k.index = k.index // 60
    return k[["abertura", "maxima"]].reindex(grade).ffill(limit=PREENCHE_H)


def carrega(simbolos: list[str]) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """(hora, spot, perp, máxima do perp, funding) em grade horária [T, N]; nan = sem dado."""
    h0 = int(pd.Timestamp(f"{MESES[0]}-01").timestamp() // 3600)
    h1 = int(pd.Timestamp("2026-07-01").timestamp() // 3600)
    grade = np.arange(h0, h1)
    S, P, PH, F = (np.full((len(grade), len(simbolos)), np.nan) for _ in range(4))
    for j, s in enumerate(simbolos):
        p, sp = _horas("futuros_klines_1h", s, grade), _horas("spot_klines_1h", s, grade)
        S[:, j], P[:, j], PH[:, j] = sp["abertura"], p["abertura"], p["maxima"]
        zs = [RAW / "futuros_funding" / s / f"{s}-fundingRate-{m}.zip" for m in MESES]
        f = pd.concat([ag.funding(z) for z in zs if z.exists()])
        f = f.groupby(np.round(f.index / c.HORA_MS).astype(np.int64)).sum()
        F[:, j] = f.reindex(grade)
    return grade, S, P, PH, F


def simula(r: Regra, S: np.ndarray, P: np.ndarray, PH: np.ndarray, F: np.ndarray, rf_h: np.ndarray,
           decide: np.ndarray, inicio: int) -> dict:
    T, N = S.shape
    cs = np.cumsum(np.nan_to_num(F), 0)
    cn = np.cumsum(np.isfinite(F), 0)
    custo = c.CUSTO_SPOT, c.CUSTO_PERP
    caixa, q, m = 1.0, np.zeros(N), np.zeros(N)
    us, up = np.zeros(N), np.zeros(N)                      # último preço válido de cada posição
    sair: set[int] = set()
    pat = np.ones(T)
    cont = {"funding": 0.0, "custos": 0.0, "entradas": 0, "saidas_forcadas": 0, "deslistados": 0,
            "rebalanceios": 0, "liquidacoes": 0, "soma_posicoes": 0}

    def fecha(j: int) -> None:
        nonlocal caixa
        gasto = q[j] * (us[j] * custo[0] + up[j] * custo[1])
        caixa += q[j] * us[j] + m[j] - gasto
        cont["custos"] += gasto
        q[j] = m[j] = 0.0
        sair.discard(j)

    def abre(j: int, tamanho: float, i: int) -> None:
        nonlocal caixa
        q[j] = tamanho * 0.5 / S[i, j]
        gasto = q[j] * (S[i, j] * custo[0] + P[i, j] * custo[1])
        m[j] = tamanho - q[j] * S[i, j] - gasto
        us[j], up[j] = S[i, j], P[i, j]
        caixa -= tamanho
        cont["custos"] += gasto
        cont["entradas"] += 1

    for i in range(inicio, T):
        caixa *= 1 + rf_h[i]
        for j in np.flatnonzero(q):
            if not (math.isfinite(S[i, j]) and math.isfinite(P[i, j])):
                cont["deslistados"] += 1
                fecha(j)
                continue
            # ponytail: máxima do último preço, mais severa que o mark price que a Binance usa (ver carry.py)
            if m[j] - q[j] * max(PH[i - 1, j] - up[j], 0) < c.MANUTENCAO * q[j] * PH[i - 1, j]:
                cont["liquidacoes"] += 1
            m[j] += q[j] * (up[j] - P[i, j])
            us[j], up[j] = S[i, j], P[i, j]
            if math.isfinite(F[i, j]):
                m[j] += q[j] * P[i, j] * F[i, j]
                cont["funding"] += q[j] * P[i, j] * F[i, j]
            if j in sair:
                fecha(j)
            elif cs[i, j] - cs[i - 24, j] < SAIDA_24H:
                sair.add(j)
                cont["saidas_forcadas"] += 1
            elif not 0.5 <= m[j] / (q[j] * P[i, j]) <= 2:
                e = q[j] * S[i, j] + m[j]
                novo = e * 0.5 / S[i, j]
                gasto = abs(novo - q[j]) * (S[i, j] * custo[0] + P[i, j] * custo[1])
                q[j], m[j] = novo, e - novo * S[i, j] - gasto
                cont["custos"] += gasto
                cont["rebalanceios"] += 1
        if decide[i]:
            nota = (cs[i - 1] - cs[i - 1 - JANELA_H]) / 30 * 365          # funding anualizado, só o já liquidado
            if r.oraculo:
                passo = 7 * 24 if r.semanal else JANELA_H
                nota = (cs[min(i - 1 + passo, T - 1)] - cs[i - 1]) / (passo / 24) * 365
            ok = np.isfinite(S[i]) & np.isfinite(P[i]) & (cn[i - 1] - cn[i - 1 - JANELA_H] >= MIN_EVENTOS)
            if r.filtro:
                ok &= nota > rf_h[i] * 24 * 360
            escolhidos = [int(j) for j in np.argsort(-np.where(ok, nota, -np.inf))[:r.k] if ok[j]]
            for j in np.flatnonzero(q):
                if j not in escolhidos:
                    fecha(j)
            novos = [j for j in escolhidos if not q[j]]
            if novos:
                total = caixa + float(np.sum(q * us + m))
                tamanho = min(total / r.k, caixa / len(novos))
                for j in novos:
                    abre(j, tamanho, i)
        cont["soma_posicoes"] += int(np.count_nonzero(q))
        pat[i] = caixa + float(np.sum(q * us + m))
    cont["posicoes_medias"] = cont.pop("soma_posicoes") / (T - inicio)
    return {"patrimonio": pat[inicio:], **cont}


def marcas(hora: np.ndarray, semanal: bool) -> np.ndarray:
    d = pd.to_datetime(hora * c.HORA_MS, unit="ms")
    return np.asarray((d.hour == 0) & ((d.dayofweek == 0) if semanal else (d.day == 1)))


def main() -> int:
    simbolos = [e["simbolo"] for e in json.loads((AQUI / "universo-carry.json").read_text())["simbolos"]]
    hora, S, P, PH, F = carrega(simbolos)
    inicio = int(np.searchsorted(hora, pd.Timestamp(INICIO).timestamp() // 3600))
    rf = c.juros_diarios()
    dia_ant = pd.to_datetime(hora * c.HORA_MS, unit="ms").normalize() - pd.Timedelta(days=1)
    rf_h = rf.reindex(dia_ant).fillna(0).to_numpy() / 24
    disp = np.isfinite(S) & np.isfinite(P)
    print(f"{len(simbolos)} símbolos, {len(hora) - inicio} horas desde {INICIO}; disponíveis no início "
          f"{disp[inicio].sum()}, no fim {disp[-1].sum()}", flush=True)
    h, ano = hora[inicio:], pd.to_datetime(hora[inicio:] * c.HORA_MS, unit="ms").year.to_numpy()
    out = {}
    for r in REGRAS:
        res = simula(r, S, P, PH, F, rf_h, marcas(hora, r.semanal), inicio)
        pat = res.pop("patrimonio")
        pos = ano >= 2022
        out[r.nome] = {"total": c.metricas(pat, h, rf), "desde_2022": c.metricas(pat[pos], h[pos], rf),
                       "anos": {int(a): c.metricas(pat[ano == a], h[ano == a], rf) for a in np.unique(ano)}, **res}
    srs = [o["total"]["_sr"] for k, o in out.items() if "TETO" not in k]
    for nome, o in out.items():
        t, d = o["total"], o["desde_2022"]
        t["dsr"] = c.dsr(t["_sr"], srs, t["_n"], t["_assim"], t["_curt"])
        print(f"\n{nome}: total {t['retorno_total']:+.1%} (T-bill {t['tbill']:+.1%})  desde 2022 "
              f"{d['retorno_total']:+.1%} (T-bill {d['tbill']:+.1%})  Sharpe-exc {t['sharpe_excesso']:.2f}  "
              f"maxDD {t['max_dd']:.1%}  DSR {t['dsr']:.2f}")
        print(f"  funding {o['funding']:+.3f}  custos {o['custos']:.3f}  entradas {o['entradas']}  "
              f"saídas forçadas {o['saidas_forcadas']}  deslistados {o['deslistados']}  rebal {o['rebalanceios']}  "
              f"liquidações {o['liquidacoes']}  posições médias {o['posicoes_medias']:.1f}")
        print("  " + "  ".join(f"{a}: {x['retorno_total']:+.1%} vs tb {x['tbill']:+.1%}" for a, x in o["anos"].items()))
    SAIDA.write_text(json.dumps(out, indent=1))
    print(f"\n{SAIDA}")
    return 0


def selftest() -> None:
    T, ini = 24 * 120, 24 * 40
    S = np.full((T, 3), 100.0)
    F = np.full((T, 3), np.nan)
    F[8::8] = 0.0
    F[8::8, 1] = 0.0003                                   # só o símbolo 1 paga
    decide = np.zeros(T, bool)
    decide[ini] = True
    zero = np.zeros(T)
    r = simula(Regra("t", 1), S, S, S, F, zero, decide, ini)
    eventos = len(range(8, T, 8)) - len(range(8, ini + 1, 8))
    esperado = 1 - 0.5 * (c.CUSTO_SPOT + c.CUSTO_PERP) + 0.5 * 0.0003 * eventos
    assert r["entradas"] == 1 and abs(r["patrimonio"][-1] - esperado) < 1e-6, (r["patrimonio"][-1], esperado)
    assert simula(Regra("t", 1), S, S, S, F, np.full(T, 1e-4), decide, ini)["entradas"] == 0  # juros > funding
    F2 = F.copy()
    F2[ini + 80, 1] = -0.02                               # crise: sai na hora seguinte
    r = simula(Regra("t", 1), S, S, S, F2, zero, decide, ini)
    assert r["saidas_forcadas"] == 1 and r["posicoes_medias"] < 0.1
    S3 = S.copy()
    S3[ini + 100:, 1] = np.nan                            # deslistado: fecha no último preço
    r = simula(Regra("t", 1), S3, S3, S3, F, zero, decide, ini)
    assert r["deslistados"] == 1 and abs(r["patrimonio"][-1] - r["patrimonio"][101]) < 1e-12
    sobe = S.copy()
    sobe[:, 1] = np.linspace(100, 400, T)                 # o preço quadruplica: delta-neutro, rebalanceia
    r = simula(Regra("t", 1), sobe, sobe, sobe, F, zero, decide, ini)
    assert r["rebalanceios"] >= 1 and r["liquidacoes"] == 0 and abs(r["patrimonio"][-1] - esperado) < 0.01
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(main())
