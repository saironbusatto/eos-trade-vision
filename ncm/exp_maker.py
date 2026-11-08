"""Experimento 6 (task 7): o Exp 05 com custo maker. Muda SÓ a execução; modelos, split e ações iguais.

Os modelos (ridge e a rede do Exp 05, 3 sementes) aprendem o resultado BRUTO das 8 entradas em fev–abr e são
conferidos em mai (embargo 45 min). Junho e o teste ficam fechados. Três níveis de custo:
- T: taker nas duas pernas + slippage (o de antes, ~0,12% ida e volta);
- A: entrada maker realista: limite na abertura do candle 0, preenchida só se o preço ATRAVESSAR o limite nos
     primeiros ESPERA candles (senão não entra); saída a mercado (taker + slippage) no mesmo minuto de antes;
- B: teto otimista: maker nas duas pernas, sempre preenchido, sem slippage (0,04%). Se nem B lucra, maker não salva.
Regra do bot: entra na ação de maior bruto previsto se (bruto previsto - custo esperado do nível) >= limiar.

    ~/.local/share/wow-voz/venv/bin/python -I ncm/exp_maker.py
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import exp_valor as ev  # noqa: E402
import sinal as si  # noqa: E402

rt, rp = ev.tn.rt, ev.tn.rp
C = rt.Custos()
ESPERA = 3  # candles para a ordem limite de entrada atravessar
CUSTO = {"T": 2 * (C.taker + C.slippage), "A": C.maker + C.taker + C.slippage, "B": 2 * C.maker}
LADO = np.array([a[0] for a in si.ACOES])
DUR = np.array([a[1] for a in si.ACOES])


def faixa(t_ms: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Mínima e máxima dos ESPERA primeiros candles de cada minuto de decisão (futuros 1m)."""
    kl = rp.carrega_klines("futuros_klines_1m", "BTCUSDT", rp.meses("2026-02", "2026-07"))
    m0 = int(kl.index.min())
    kl = kl.reindex(range(m0, int(kl.index.max()) + 1))
    i = t_ms // rt.MINUTO_MS - m0
    jan = i[:, None] + np.arange(ESPERA)
    mn, mx = kl["minima"].to_numpy(float)[jan], kl["maxima"].to_numpy(float)[jan]
    assert not (np.isnan(mn).any() or np.isnan(mx).any()), "buraco nas klines da janela de entrada"
    return mn.min(1), mx.max(1)


def realizados(p: dict) -> dict:
    """(N, 8) por nível: resultado líquido simples; nan = ordem maker não preenchida (sem trade)."""
    ab0, abd = p["ab"][:, :1], p["ab"][:, DUR]
    bruto = LADO * (abd / ab0 - 1)
    taker = LADO * (abd * (1 - LADO * C.slippage) / (ab0 * (1 + LADO * C.slippage)) - 1) - 2 * C.taker
    mn, mx = faixa(p["t_ms"])
    cruzou = np.where(LADO == 1, mn[:, None] < ab0, mx[:, None] > ab0)
    maker = LADO * (abd * (1 - LADO * C.slippage) / ab0 - 1) - C.maker - C.taker
    return {"bruto": bruto, "T": taker, "A": np.where(cruzou, maker, np.nan), "B": bruto - 2 * C.maker}


def opera(t_ms: np.ndarray, r: np.ndarray, conf: np.ndarray, dur: np.ndarray, limiar: float) -> dict:
    """Uma posição por vez. Ordem não preenchida ocupa só a ESPERA. Sem funding (no máximo uma cobrança)."""
    pnl, livre = [], 0
    for j in np.flatnonzero(conf >= limiar):
        t = int(t_ms[j])
        if t < livre:
            continue
        if np.isnan(r[j]):
            livre = t + ESPERA * rt.MINUTO_MS
            continue
        pnl.append(float(r[j]))
        livre = t + int(dur[j]) * rt.MINUTO_MS
    x = np.array(pnl)
    ganho, perda = x[x > 0].sum(), -x[x < 0].sum()
    return {"limiar": limiar, "n": len(x), "pf": float(ganho / perda) if perda else None,
            "composto": float(np.prod(1 + x) - 1) if len(x) else 0.0, "media": float(x.mean()) if len(x) else None}


def avalia(nome: str, prev: np.ndarray, c: dict, R: dict) -> dict:
    a = prev.argmax(1)
    linha = np.arange(len(a))
    out = {}
    for nivel in ("T", "A", "B"):
        conf = prev.max(1) - CUSTO[nivel]
        r = R[nivel][linha, a]
        top = conf >= np.quantile(conf, 0.99)
        cheios = r[top][~np.isnan(r[top])]
        out[nivel] = {"top1_media": float(cheios.mean()), "top1_preenchidas": float(len(cheios) / top.sum()),
                      "top1_positivos": float((cheios > 0).mean()),
                      "limiares": [opera(c["t_ms"], r, conf, DUR[a], lim) for lim in si.LIMIARES]}
        print(f"{nome:15} {nivel} | 1%: {100 * out[nivel]['top1_media']:+.3f}%/entrada "
              f"({out[nivel]['top1_preenchidas']:.0%} preench.) | " + " | ".join(
                  f"{100 * x['limiar']:.2f}%: {x['n']}t PF {x['pf'] or 0:.2f} {100 * x['composto']:+.1f}%"
                  for x in out[nivel]["limiares"]), flush=True)
    return out


def main() -> int:
    np.random.seed(0)
    a, c, _ = ev.separa()
    Ra, Rc = realizados(a), realizados(c)
    ag, cg = {**a, "Y": Ra["bruto"]}, {**c, "Y": Rc["bruto"]}  # os modelos aprendem o bruto
    base = {n: {"media_todas_entradas": float(np.nanmean(Rc[n])),
                "preenchimento": float(np.mean(~np.isnan(Rc[n]))),
                "melhor_retrospecto_positivo": float((np.nan_to_num(Rc[n], nan=-1).max(1) > 0).mean())}
            for n in ("T", "A", "B")}
    print("mai, todas as entradas:", {n: f"{100 * v['media_todas_entradas']:+.3f}% (preench. {v['preenchimento']:.0%})"
                                      for n, v in base.items()}, flush=True)
    modelos = {"constante": avalia("constante", np.broadcast_to(ag["Y"].mean(0), cg["Y"].shape).copy(), c, Rc),
               "ridge": avalia("ridge", np.c_[c["X"], np.ones(len(c["X"]))] @ si.pesos_ridge(a["X"], ag["Y"]), c, Rc)}
    for s in ev.SEMENTES:
        net, perdas = ev.treina(ag, cg, s)
        modelos[f"rede_s{s}"] = {**avalia(f"rede semente {s}", ev.prever(net, c["X"]), c, Rc), "perda_maio": perdas}
    commit = subprocess.run(["git", "-C", str(AQUI), "rev-parse", "--short", "HEAD"], capture_output=True,
                            text=True).stdout.strip()
    meta = {"exp": 6, "custos": CUSTO, "espera": ESPERA, "commit": commit, "sementes": list(ev.SEMENTES)}
    (ev.SAIDA / "metricas-exp06-maker.json").write_text(
        json.dumps({"meta": meta, "base": base, "modelos": modelos}, indent=1, default=float))
    print(f"-> {ev.SAIDA}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
