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

MESES = meses("2020-01", "2026-06")     # 2020 só alimenta o treino da fase 3; a operação começa em INICIO
INICIO = "2021-01-01"
JANELA_H = 30 * 24
MIN_EVENTOS = 60               # ~20 dias de funding de 8 h dentro da janela
SAIDA_24H = -0.003
REGIME_LIGA = 0.02            # liga com 2 pontos acima do T-bill; desliga abaixo de 0
PREENCHE_H = 24                # buraco maior que isso = símbolo indisponível
SAIDA = Path.home() / ".local/share/eos-ncm/diag-kl/metricas-rotacao.json"
C0 = (c.CUSTO_SPOT, c.CUSTO_PERP)        # taker + slippage nas duas pernas
C1 = (0.00075 + 0.0001, 0.00018)         # taxas em BNB; perpétuo como maker (preenchimento suposto)


@dataclass(frozen=True)
class Regra:
    nome: str
    k: int
    semanal: bool = False
    filtro: bool = True          # exige funding anualizado > T-bill
    alav: float = 1.0            # alavancagem do perpétuo: fração do capital no spot = alav/(1+alav)
    oraculo: bool = False        # DIAGNÓSTICO, não é estratégia: ordena pelo funding dos 30 dias SEGUINTES
    regime: bool = False         # opção 2: só opera com o funding médio do universo acima do T-bill
    so: tuple[int, ...] = ()     # restringe a carteira a estes índices do universo (vazio = todos)


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
        if (RAW / "futuros_markprice_1h" / s).is_dir():
            mk = _horas("futuros_markprice_1h", s, grade)["maxima"].to_numpy()
            PH[:, j] = np.where(np.isfinite(mk), mk, PH[:, j])
        zs = [RAW / "futuros_funding" / s / f"{s}-fundingRate-{m}.zip" for m in MESES]
        f = pd.concat([ag.funding(z) for z in zs if z.exists()])
        f = f.groupby(np.round(f.index / c.HORA_MS).astype(np.int64)).sum()
        F[:, j] = f.reindex(grade)
    return grade, S, P, PH, F


def simula(r: Regra, S: np.ndarray, P: np.ndarray, PH: np.ndarray, F: np.ndarray, rf_h: np.ndarray,
           decide: np.ndarray, inicio: int, custo: tuple[float, float] = C0,
           nota_ext: np.ndarray | None = None, reordena: np.ndarray | None = None) -> dict:
    """PH = máxima horária do mark price (ou do último preço onde não há mark). Liquidação é perda real."""
    T, N = S.shape
    alvo = r.alav / (1 + r.alav)
    cs = np.cumsum(np.nan_to_num(F), 0)
    cn = np.cumsum(np.isfinite(F), 0)
    caixa, q, m = 1.0, np.zeros(N), np.zeros(N)
    us, up = np.zeros(N), np.zeros(N)                      # último preço válido de cada posição
    sair: set[int] = set()
    ligado = False
    pat = np.ones(T)
    cont = {"funding": 0.0, "custos": 0.0, "entradas": 0, "saidas_forcadas": 0, "deslistados": 0,
            "rebalanceios": 0, "liquidacoes": 0, "soma_posicoes": 0, "ligacoes": 0, "horas_ligado": 0}

    def fecha(j: int) -> None:
        nonlocal caixa
        gasto = q[j] * (us[j] * custo[0] + up[j] * custo[1])
        caixa += q[j] * us[j] + m[j] - gasto
        cont["custos"] += gasto
        q[j] = m[j] = 0.0
        sair.discard(j)

    def abre(j: int, tamanho: float, i: int) -> None:
        nonlocal caixa
        q[j] = tamanho * alvo / S[i, j]
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
            if m[j] - q[j] * max(PH[i - 1, j] - up[j], 0) < c.MANUTENCAO * q[j] * PH[i - 1, j]:
                cont["liquidacoes"] += 1          # perde a margem; vende o spot na abertura seguinte
                gasto = q[j] * S[i, j] * custo[0]
                caixa += q[j] * S[i, j] - gasto
                cont["custos"] += gasto
                q[j] = m[j] = 0.0
                sair.discard(j)
                continue
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
            elif not 0.5 / r.alav <= m[j] / (q[j] * P[i, j]) <= 2 / r.alav:
                e = q[j] * S[i, j] + m[j]
                novo = e * alvo / S[i, j]
                gasto = abs(novo - q[j]) * (S[i, j] * custo[0] + P[i, j] * custo[1])
                q[j], m[j] = novo, e - novo * S[i, j] - gasto
                cont["custos"] += gasto
                cont["rebalanceios"] += 1
        if decide[i]:
            nota = (cs[i - 1] - cs[i - 1 - JANELA_H]) / 30 * 365          # funding anualizado, só o já liquidado
            if nota_ext is not None:                      # previsão de um modelo (fase 3), em taxa anual
                nota = nota_ext[i]
            if r.oraculo:
                passo = 7 * 24 if r.semanal else JANELA_H
                nota = (cs[min(i - 1 + passo, T - 1)] - cs[i - 1]) / (passo / 24) * 365
            ok = np.isfinite(nota) & np.isfinite(S[i]) & np.isfinite(P[i]) & (cn[i - 1] - cn[i - 1 - JANELA_H] >= MIN_EVENTOS)
            manter = False
            if r.regime:                                  # sinal do universo inteiro, antes de qualquer filtro
                sinal = float(np.mean(nota[ok])) * alvo - rf_h[i] * 24 * 360 if ok.any() else -1.0
                antes, ligado = ligado, (sinal > REGIME_LIGA if not ligado else sinal >= 0)
                cont["ligacoes"] += int(ligado and not antes)
                if not ligado:
                    ok[:] = False                         # fecha tudo e fica no caixa
                manter = ligado and antes and not reordena[i]
            if r.so:
                ok &= np.isin(np.arange(N), r.so)
            if r.filtro:
                ok &= nota > rf_h[i] * 24 * 360
            escolhidos = [int(j) for j in np.argsort(-np.where(ok, nota, -np.inf))[:r.k] if ok[j]]
            if manter:
                escolhidos = [int(j) for j in np.flatnonzero(q)]
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
        cont["horas_ligado"] += int(ligado)
        pat[i] = caixa + float(np.sum(q * us + m))
    cont["posicoes_medias"] = cont.pop("soma_posicoes") / (T - inicio)
    return {"patrimonio": pat[inicio:], **cont}


def marcas(hora: np.ndarray, semanal: bool) -> np.ndarray:
    d = pd.to_datetime(hora * c.HORA_MS, unit="ms")
    return np.asarray((d.hour == 0) & ((d.dayofweek == 0) if semanal else (d.day == 1)))


def opcao1(hora, S, P, PH, F, rf_h, rf, inicio) -> int:
    """Passo A da opção 1: teto do oráculo por estrutura; passo B: R1 na primeira estrutura com folga."""
    h = hora[inicio:]
    pos = pd.to_datetime(h * c.HORA_MS, unit="ms").year.to_numpy() >= 2022
    dec = marcas(hora, False)
    out, com_folga = {}, None
    for nome_c, custo in (("C0", C0), ("C1", C1)):
        for alav in (1.0, 2.0, 3.0):
            res = simula(Regra("oráculo", 3, alav=alav, oraculo=True), S, P, PH, F, rf_h, dec, inicio, custo)
            d = c.metricas(res["patrimonio"][pos], h[pos], rf)
            folga = d["retorno_total"] - d["tbill"]
            ok = folga >= 0.05 and res["liquidacoes"] == 0 and d["max_dd"] > -0.10
            out[f"L{alav:.0f}-{nome_c}"] = {"oraculo_desde_2022": d["retorno_total"], "tbill": d["tbill"], "folga": folga,
                                         "max_dd": d["max_dd"], "liquidacoes": res["liquidacoes"],
                                         "custos": res["custos"], "tem_folga": ok}
            print(f"L{alav:.0f}-{nome_c}: oráculo desde 2022 {d['retorno_total']:+.1%}  T-bill {d['tbill']:+.1%}  folga "
                  f"{folga:+.1%}  maxDD {d['max_dd']:.1%}  liquidações {res['liquidacoes']}  rebal {res['rebalanceios']}  "
                  f"custos {res['custos']:.3f}  -> {'TEM FOLGA' if ok else 'sem folga'}", flush=True)
    ordem = ["L1-C1", "L2-C0", "L2-C1", "L3-C0", "L3-C1"]
    com_folga = next((k for k in ordem if out[k]["tem_folga"]), None)
    print(f"\nprimeira estrutura com folga: {com_folga}")
    if com_folga:
        alav, custo = float(com_folga[1]), (C0 if com_folga.endswith("C0") else C1)
        res = simula(Regra("R1", 3, alav=alav), S, P, PH, F, rf_h, dec, inicio, custo)
        pat = res.pop("patrimonio")
        ano = pd.to_datetime(h * c.HORA_MS, unit="ms").year.to_numpy()
        d, t = c.metricas(pat[pos], h[pos], rf), c.metricas(pat, h, rf)
        print(f"R1 em {com_folga}: total {t['retorno_total']:+.1%}  desde 2022 {d['retorno_total']:+.1%} (T-bill "
              f"{d['tbill']:+.1%})  maxDD {t['max_dd']:.1%}  liquidações {res['liquidacoes']}  custos {res['custos']:.3f}")
        anos = {int(a): c.metricas(pat[ano == a], h[ano == a], rf) for a in np.unique(ano)}
        print("  " + "  ".join(f"{a}: {x['retorno_total']:+.1%} vs tb {x['tbill']:+.1%}" for a, x in anos.items()))
        out["R1"] = {"estrutura": com_folga, "total": t, "desde_2022": d, "anos": anos, **res}
    SAIDA.with_name("metricas-rotacao-opcao1.json").write_text(json.dumps(out, indent=1))
    return 0


def opcao2(simbolos, hora, S, P, PH, F, rf_h, rf, inicio) -> int:
    """Carry como estratégia de regime (L2·C0): G1 top 3, G2 só BTC e ETH, G3 todos iguais."""
    d = pd.to_datetime(hora * c.HORA_MS, unit="ms")
    semanal = np.asarray((d.hour == 0) & (d.dayofweek == 0))
    reordena = semanal & np.asarray(d.day <= 7)
    h, ano = hora[inicio:], d[inicio:].year.to_numpy()
    pos = ano >= 2022
    maiores = tuple(simbolos.index(x) for x in ("BTCUSDT", "ETHUSDT"))
    regras = (Regra("G1 regime top3", 3, alav=2.0, regime=True),
              Regra("G2 regime BTC+ETH", 2, alav=2.0, regime=True, filtro=False, so=maiores),
              Regra("G3 regime todos", 30, alav=2.0, regime=True, filtro=False))
    out = {}
    for r in regras:
        res = simula(r, S, P, PH, F, rf_h, semanal, inicio, C0, None, reordena)
        pat = res.pop("patrimonio")
        out[r.nome] = {"total": c.metricas(pat, h, rf), "desde_2022": c.metricas(pat[pos], h[pos], rf),
                       "anos": {int(a): c.metricas(pat[ano == a], h[ano == a], rf) for a in np.unique(ano)}, **res}
    srs = [o["desde_2022"]["sharpe_excesso"] / np.sqrt(365) for o in out.values()]
    for (nome, o), sr in zip(out.items(), srs):
        dd = o["desde_2022"]
        dd["dsr_excesso"] = c.dsr(sr, srs, dd["_n"], dd["_assim"], dd["_curt"])
        folga = dd["retorno_total"] - dd["tbill"]
        pior = min(o["anos"][a]["retorno_total"] - o["anos"][a]["tbill"] for a in o["anos"] if a >= 2022)
        o["passa"] = bool(folga >= 0.05 and pior >= -0.005 and dd["max_dd"] > -0.10 and dd["dsr_excesso"] > 0.95)
        print(f"\n{nome}: desde 2022 {dd['retorno_total']:+.1%} (T-bill {dd['tbill']:+.1%}, folga {folga:+.1%})  pior ano "
              f"vs T-bill {pior:+.1%}  maxDD {dd['max_dd']:.1%}  DSR-excesso {dd['dsr_excesso']:.2f}  -> "
              f"{'PASSA' if o['passa'] else 'NÃO PASSA'}")
        print(f"  ligou {o['ligacoes']} vezes desde 2021, ligado {o['horas_ligado'] / len(h):.0%} do tempo; entradas "
              f"{o['entradas']}  custos {o['custos']:.3f}  saídas forçadas {o['saidas_forcadas']}  liquidações "
              f"{o['liquidacoes']}")
        print("  " + "  ".join(f"{a}: {x['retorno_total']:+.1%} vs tb {x['tbill']:+.1%}" for a, x in o["anos"].items()))
    SAIDA.with_name("metricas-rotacao-opcao2.json").write_text(json.dumps(out, indent=1))
    return 0


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
    if "--opcao2" in sys.argv:
        return opcao2(simbolos, hora, S, P, PH, F, rf_h, rf, inicio)
    if "--opcao1" in sys.argv:
        return opcao1(hora, S, P, PH, F, rf_h, rf, inicio)
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
    r3 = simula(Regra("t", 1, alav=3.0), S, S, S, F, zero, decide, ini)       # 3x: 75% do capital recebe funding
    esp3 = 1 - 0.75 * (c.CUSTO_SPOT + c.CUSTO_PERP) + 0.75 * 0.0003 * eventos
    assert abs(r3["patrimonio"][-1] - esp3) < 1e-6, (r3["patrimonio"][-1], esp3)
    pico = S.copy()
    pico[ini + 50, 1] = 150.0                             # máxima +50% numa hora: liquida a 3x, não a 1x
    assert simula(Regra("t", 1), S, S, pico, F, zero, decide, ini)["liquidacoes"] == 0
    rl = simula(Regra("t", 1, alav=3.0), S, S, pico, F, zero, decide, ini)
    assert rl["liquidacoes"] == 1 and rl["patrimonio"][-1] < 0.78   # perdeu a margem (25% do capital)
    Fr = np.full((T, 3), np.nan)                          # regime: funding alto só na 1ª metade do período operado
    Fr[8::8] = -0.00001
    Fr[8:ini + 24 * 40:8] = 0.0003
    toda = np.zeros(T, bool)
    toda[ini::24 * 7] = True
    rg = simula(Regra("t", 3, alav=2.0, regime=True, filtro=False), S, S, S, Fr, zero, toda, ini, C0, None, toda)
    assert rg["ligacoes"] == 1 and 0.3 < rg["horas_ligado"] / (T - ini) < 0.9 and rg["entradas"] == 3
    assert rg["patrimonio"][-1] == rg["patrimonio"][-24 * 7]           # desligado: caixa parado (juros 0)
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(main())
