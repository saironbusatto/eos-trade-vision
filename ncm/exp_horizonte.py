"""Experimento 7 (task 7): o Exp 06 com horizontes longos (1, 2, 4, 8 h). Muda SÓ o horizonte das ações.

Mesmas fotos e modelos (ridge e a rede do Exp 05, 3 sementes) aprendendo o bruto de 8 ações (comprado/vendido x
1/2/4/8 h); mesmos três níveis de custo do Exp 06 (T taker, A maker na entrada realista, B teto otimista).
Cuidados novos por causa do horizonte:
- embargo de 8 h: ajuste só com t + 8 h <= 01/05; conferência só com t >= 01/05 e t + 8 h <= 01/06 (junho intacto);
- funding cobrado em cada ação (8 h sempre pega uma cobrança).

    ~/.local/share/wow-voz/venv/bin/python -I ncm/exp_horizonte.py
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import exp_maker as em  # noqa: E402
import exp_valor as ev  # noqa: E402
import sinal as si  # noqa: E402

rt, rp, sp = ev.tn.rt, ev.tn.rp, ev.tn.sp
C = em.C
HORAS = [1, 2, 4, 8]
ACOES = [(lado, 60 * h) for lado in (1, -1) for h in HORAS]
LADO = np.array([a[0] for a in ACOES])
DUR = np.array([a[1] for a in ACOES])
H_MS = DUR.max() * rt.MINUTO_MS
CORTE_JUNHO = sp._ms("2026-06-01")
LIMIARES = [0.0, 0.0025, 0.005, 0.01, 0.02]  # movimentos de horas são maiores: limiares maiores que os do Exp 05


def precos(funding: dict[int, float]) -> tuple[np.ndarray, np.ndarray, int]:
    """Aberturas de futuros 1m e funding acumulado por minuto (cs[i] = soma das cobranças antes do minuto i)."""
    kl = rp.carrega_klines("futuros_klines_1m", "BTCUSDT", rp.meses("2026-02", "2026-07"))
    m0 = int(kl.index.min())
    ab = kl.reindex(range(m0, int(kl.index.max()) + 1))["abertura"].to_numpy(float)
    taxa = np.zeros(len(ab) + 1)
    for t, r in funding.items():
        k = int(t) // rt.MINUTO_MS - m0 + 1  # cobrança durante o minuto k-1 conta para quem segura até o fim dele
        if 0 <= k < len(taxa):
            taxa[k] += r
    return ab, np.cumsum(taxa), m0


def realizados(p: dict, ab: np.ndarray, cs: np.ndarray, m0: int) -> dict:
    """(N, 8) por nível, líquido e com funding; nan = maker não preenchido (A) ou janela com buraco."""
    i = p["t_ms"] // rt.MINUTO_MS - m0
    ab0, abd = ab[i][:, None], ab[i[:, None] + DUR]
    fund = LADO * (cs[i[:, None] + DUR] - cs[i][:, None])  # comprado paga funding positivo
    bruto = LADO * (abd / ab0 - 1)
    taker = LADO * (abd * (1 - LADO * C.slippage) / (ab0 * (1 + LADO * C.slippage)) - 1) - 2 * C.taker - fund
    mn, mx = em.faixa(p["t_ms"])
    cruzou = np.where(LADO == 1, mn[:, None] < ab0, mx[:, None] > ab0)
    maker = LADO * (abd * (1 - LADO * C.slippage) / ab0 - 1) - C.maker - C.taker - fund
    return {"bruto": bruto, "T": taker, "A": np.where(cruzou, maker, np.nan), "B": bruto - 2 * C.maker - fund}


def recorta(p: dict, m: np.ndarray) -> dict:
    return {k: v[m] for k, v in p.items()}


def avalia(nome: str, prev: np.ndarray, c: dict, R: dict) -> dict:
    a = prev.argmax(1)
    linha = np.arange(len(a))
    out = {}
    for nivel in ("T", "A", "B"):
        conf = prev.max(1) - em.CUSTO[nivel]
        r = R[nivel][linha, a]
        top = conf >= np.quantile(conf, 0.99)
        cheios = r[top][~np.isnan(r[top])]
        out[nivel] = {"top1_media": float(cheios.mean()), "top1_positivos": float((cheios > 0).mean()),
                      "top1_compra": float((LADO[a][top] == 1).mean()),
                      "limiares": [em.opera(c["t_ms"], r, conf, DUR[a], lim) for lim in LIMIARES]}
        print(f"{nome:15} {nivel} | 1%: {100 * out[nivel]['top1_media']:+.3f}%/entrada "
              f"({out[nivel]['top1_positivos']:.0%} pos., {out[nivel]['top1_compra']:.0%} compra) | " + " | ".join(
                  f"{100 * x['limiar']:.2f}%: {x['n']}t PF {x['pf'] or 0:.2f} {100 * x['composto']:+.1f}%"
                  for x in out[nivel]["limiares"]), flush=True)
    return out


def main() -> int:
    global CORTE_JUNHO
    np.random.seed(0)
    dobra = "abr" if "--abr" in sys.argv else "mai"
    if dobra == "abr":  # segunda dobra: ajusta fev–mar, confere abr (normalização só de fev–mar); maio não entra
        ev.CORTE_MAIO, CORTE_JUNHO = sp._ms("2026-04-01"), sp._ms("2026-05-01")
    a, c, funding = ev.separa()
    ab, cs, m0 = precos(funding)
    a = recorta(a, a["t_ms"] + H_MS <= ev.CORTE_MAIO)
    c = recorta(c, c["t_ms"] + H_MS < CORTE_JUNHO)
    Ra, Rc = realizados(a, ab, cs, m0), realizados(c, ab, cs, m0)
    ok_a, ok_c = ~np.isnan(Ra["bruto"]).any(1), ~np.isnan(Rc["bruto"]).any(1)
    a, c = recorta(a, ok_a), recorta(c, ok_c)
    Ra, Rc = ({k: v[ok] for k, v in R.items()} for R, ok in ((Ra, ok_a), (Rc, ok_c)))
    print(f"ajuste {len(a['t_ms'])} | conferência {len(c['t_ms'])} | janelas com buraco {(~ok_a).sum()}+{(~ok_c).sum()}",
          flush=True)
    assert c["t_ms"].max() + H_MS < CORTE_JUNHO and a["t_ms"].max() + H_MS <= ev.CORTE_MAIO
    ag, cg = {**a, "Y": Ra["bruto"]}, {**c, "Y": Rc["bruto"]}
    base = {n: {"media_por_acao": [float(x) for x in np.nanmean(Rc[n], 0)],
                "preenchimento": float(np.mean(~np.isnan(Rc[n])))} for n in ("T", "A", "B")}
    for n, v in base.items():
        print(f"mai {n}, média por ação %:", np.round(100 * np.array(v["media_por_acao"]), 3), flush=True)
    btc_mai = float(ab[c["t_ms"][-1] // rt.MINUTO_MS - m0] / ab[c["t_ms"][0] // rt.MINUTO_MS - m0] - 1)
    modelos = {"constante": avalia("constante", np.broadcast_to(ag["Y"].mean(0), cg["Y"].shape).copy(), c, Rc),
               "ridge": avalia("ridge", np.c_[c["X"], np.ones(len(c["X"]))] @ si.pesos_ridge(a["X"], ag["Y"]), c, Rc)}
    for s in ev.SEMENTES:
        net, perdas = ev.treina(ag, cg, s)
        modelos[f"rede_s{s}"] = {**avalia(f"rede semente {s}", ev.prever(net, c["X"]), c, Rc), "perda_maio": perdas}
    commit = subprocess.run(["git", "-C", str(AQUI), "rev-parse", "--short", "HEAD"], capture_output=True,
                            text=True).stdout.strip()
    meta = {"exp": 7, "dobra": dobra, "acoes": ACOES, "limiares": LIMIARES, "custos": em.CUSTO, "commit": commit,
            "sementes": list(ev.SEMENTES), "n_ajuste": len(a["t_ms"]), "n_conferencia": len(c["t_ms"]),
            "btc_mai": btc_mai}
    (ev.SAIDA / f"metricas-exp07-horizonte{'' if dobra == 'mai' else '-abr'}.json").write_text(
        json.dumps({"meta": meta, "base": base, "modelos": modelos}, indent=1, default=float))
    print(f"-> {ev.SAIDA}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
