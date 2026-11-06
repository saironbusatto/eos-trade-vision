"""Reteste das teorias antigas no simulador honesto (task 6 do ncm-live-trading.md). Regras fixas, sem NCM.

Sinal-base = o do bot: direção do OFA legado com score >= 70 (MIN_SCORE). Stop/alvo = calculateRiskPercents do
trendingScanner.ts; prazo 45 min (SIGNAL_MAX_AGE_MIN). Decisão a cada minuto fechado, uma posição por vez.
Só usa fev–jun e 01–06/jul: o teste (07/jul–out) fica fechado para a task 8.

- sem_filtro, super_setup (score >= 80), smart_money (bias alinhado), blocked_hours (1,2,3,14,22,23 UTC),
  subset_julho (dias 3,5,6 x células 12:SELL,7:BUY,9:SELL,8:BUY), hora_direcao (células com IC95 da média > 0
  aprendidas SÓ no treino fev–mai, com >= 80 trades).
- Execução: TAKER na abertura; MAKER 0,05% melhor (suggestLimitPrice) esperando 5 min, sem preenchimento =
  perde o trade ou vira taker.

    ~/.local/share/wow-voz/venv/bin/python -I ncm/teorias.py
"""
import sys
from pathlib import Path

import numpy as np

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import replay as rp  # noqa: E402
import rotulos as rt  # noqa: E402
import split as sp  # noqa: E402

MIN_SCORE, SUPER_SCORE = 70, 80
PRAZO, ESPERA_MAKER, SPREAD_MAKER = 45, 5, 0.0005
FOLGA = PRAZO + ESPERA_MAKER + 2  # candles que o gabarito de uma decisão pode olhar
BLOCKED_HOURS = [1, 2, 3, 14, 22, 23]
SUBSET_DIAS = [3, 5, 6]
SUBSET_CELULAS = {(12, -1), (7, 1), (9, -1), (8, 1)}
CELULA_MIN_TRADES = 80
PERIODOS = {"fev–mai (treino)": ("2026-02-01", "2026-06-01"), "jun (validação)": ("2026-06-01", "2026-07-01"),
            "01–06/jul": ("2026-07-01", "2026-07-07")}
WIKI = AQUI.parent / "wiki/project-system/theory-retest-btc.md"


def risco(vol15m: float, score: float, momento: float) -> tuple[float, float]:
    """calculateRiskPercents: (stop, alvo) em fração."""
    stop = min(max(vol15m * 100 * 0.70, 0.45), 0.95)
    razao = 0.80
    if score >= 85 and abs(momento) >= 0.003:
        razao = min(1.0, razao + 0.1)
    if abs(momento) <= 0.0015:
        razao = max(0.65, razao - 0.1)
    alvo = min(max(stop * razao, 0.35), 0.90)
    return round(stop, 3) / 100, round(alvo, 3) / 100


def _sel(c: dict[str, np.ndarray], m: np.ndarray) -> dict[str, np.ndarray]:
    return {k: v[m] for k, v in c.items()}


def regras(c: dict[str, np.ndarray], celulas_hd: set[tuple[int, int]]) -> dict[str, np.ndarray]:
    """Máscara de entrada por teoria (direção em c['dir'])."""
    base = (c["dir"] != 0) & (c["score"] >= MIN_SCORE)
    hd = np.array([(h, d) in celulas_hd for h, d in zip(c["hora"], c["dir"])], bool)
    sub = np.array([(h, d) in SUBSET_CELULAS for h, d in zip(c["hora"], c["dir"])], bool)
    return {
        "sem_filtro": base,
        "super_setup": base & (c["score"] >= SUPER_SCORE),
        "smart_money": base & (c["sm"] == c["dir"]),
        "blocked_hours": base & ~np.isin(c["hora"], BLOCKED_HOURS),
        "subset_julho": base & np.isin(c["dia"], SUBSET_DIAS) & sub,
        "hora_direcao": base & hd,
    }


def simula(c: dict[str, np.ndarray], entra: np.ndarray, k: dict[str, np.ndarray], m0: int, execucao: str,
           funding: dict[int, float]) -> list[dict]:
    """Uma posição por vez; depois de sair, volta a olhar o minuto seguinte à saída."""
    trades, livre_ms = [], 0
    for j in np.flatnonzero(entra):
        t = int(c["t_ms"][j])
        if t < livre_ms:
            continue
        i = t // rt.MINUTO_MS - m0  # candle que abre em t
        ab, mx, mn = (k[col][i: i + FOLGA] for col in ("abertura", "maxima", "minima"))
        if len(ab) < FOLGA or np.isnan(ab).any():
            continue
        lado = int(c["dir"][j])
        stop, alvo = risco(c["vol"][j], c["score"][j], c["mom"][j])
        kw = {}
        if execucao != "taker":
            kw = {"limite": float(c["preco"][j]) * (1 - lado * SPREAD_MAKER), "espera": ESPERA_MAKER,
                  "sem_preenchimento": "perde" if execucao == "maker/perde" else "taker"}
        r = rt.ordem(ab, mx, mn, t, lado, stop, alvo, PRAZO, funding=funding, **kw)
        if not r["preenchida"]:
            livre_ms = t + ESPERA_MAKER * rt.MINUTO_MS
            continue
        trades.append({"lado": lado, "hora": int(c["hora"][j]), "pnl": r["pnl_liquido"]})
        livre_ms = t + (r["minuto_saida"] + 1) * rt.MINUTO_MS
    return trades


def metricas(trades: list[dict]) -> dict:
    p = np.array([x["pnl"] for x in trades])
    if not len(p):
        return {"n": 0}
    curva = np.cumprod(1 + p)
    ganho, perda = p[p > 0].sum(), -p[p < 0].sum()
    lados = np.array([x["lado"] for x in trades])
    return {"n": len(p), "long": int((lados == 1).sum()), "short": int((lados == -1).sum()),
            "acerto": float((p > 0).mean()), "media": float(p.mean()), "pf": float(ganho / perda) if perda else np.inf,
            "composto": float(curva[-1] - 1), "dd": float((1 - curva / np.maximum.accumulate(curva)).max())}


def celulas_hora_direcao(trades: list[dict]) -> set[tuple[int, int]]:
    """Células (hora, direção) com >= 80 trades e limite inferior do IC95 da média > 0 (como getEdgeMatrix)."""
    out = set()
    for h in range(24):
        for d in (1, -1):
            p = np.array([x["pnl"] for x in trades if x["hora"] == h and x["lado"] == d])
            if len(p) >= CELULA_MIN_TRADES and p.mean() - 1.96 * p.std(ddof=1) / np.sqrt(len(p)) > 0:
                out.add((h, d))
    return out


def _colunas(d: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    idx = {str(n): i for i, n in enumerate(d["nomes"])}
    t = d["t_ms"]
    return {"t_ms": t, "preco": d["preco"], "score": d["X"][:, idx["leg_score"]],
            "dir": d["X"][:, idx["leg_direcao"]].astype(int), "sm": d["X"][:, idx["leg_sm_bias"]].astype(int),
            "vol": d["X"][:, idx["leg_ind_volatilidade"]], "mom": d["X"][:, idx["leg_ind_momento"]],
            "hora": (t // 3_600_000 % 24).astype(int), "dia": ((t // 86_400_000 + 4) % 7).astype(int)}


def _fmt(m: dict) -> str:
    if not m["n"]:
        return "0 | – | – | – | – | –"
    return (f"{m['n']} ({m['long']}L/{m['short']}S) | {100 * m['acerto']:.0f}% | {100 * m['media']:+.3f}% | "
            f"{m['pf']:.2f} | {100 * m['composto']:+.1f}% | {100 * m['dd']:.1f}%")


def main() -> int:
    d = sp.carrega()
    inicio_teste = sp.PARTES[sp.TESTE][0]
    c = _colunas(sp._filtra(d, d["t_ms"] < inicio_teste - FOLGA * rt.MINUTO_MS))  # nada do teste, nem no gabarito
    del d
    meses = rp.meses("2026-02", "2026-07")
    kl = rp.carrega_klines("futuros_klines_1m", "BTCUSDT", meses)
    m0 = int(kl.index.min())
    kl = kl.reindex(range(m0, int(kl.index.max()) + 1))
    k = {col: kl[col].to_numpy(float) for col in ("abertura", "maxima", "minima")}
    _, _, fs = rp.carrega_contexto("BTCUSDT", meses)
    funding = {int(t): float(r) for t, r in fs.items()}

    ct = _sel(c, c["t_ms"] < sp._ms("2026-06-01"))
    celulas = celulas_hora_direcao(simula(ct, regras(ct, set())["sem_filtro"], k, m0, "taker", funding))

    linhas = []
    for periodo, (ini, fim) in PERIODOS.items():
        cp = _sel(c, (c["t_ms"] >= sp._ms(ini)) & (c["t_ms"] < sp._ms(fim)))
        for nome, entra in regras(cp, celulas).items():
            for execucao in ("taker", "maker/perde", "maker/taker"):
                linhas.append(f"| {periodo} | {nome} | {execucao} | "
                              f"{_fmt(metricas(simula(cp, entra, k, m0, execucao, funding)))} |")
                print(linhas[-1], flush=True)
    WIKI.write_text(_pagina(linhas, celulas))
    print(f"-> {WIKI}")
    return 0


def _pagina(linhas: list[str], celulas: set[tuple[int, int]]) -> str:
    cel = ", ".join(f"{h}:{'BUY' if dd == 1 else 'SELL'}" for h, dd in sorted(celulas)) or "none"
    return f"""---
title: Theory Retest BTC
aliases:
  - Theory Retest BTC
tags:
  - ncm
  - backtest
status: active
updated: 2026-11-05
---

# Theory Retest BTC

Task 6 of `ncm-live-trading.md`: the old EOS theories as fixed rules on BTCUSDT futures, in the honest simulator
(`ncm/rotulos.py`): entry at the open of the candle after the decision, fees 0.05% taker / 0.02% maker, slippage 0.01%,
maker fills only if price trades through, stop and target in the same candle = stop, funding included. Generated by
`ncm/teorias.py`. The test period (07/jul–out) is not touched.

Base signal = legacy OFA direction with score >= 70, decided at every closed minute, one position at a time.
Stop/target = `calculateRiskPercents`, 45 min time limit. Return per trade on 1x notional; compounded and drawdown
on the trade sequence.

`hora_direcao` cells learned on fev–mai only (>= 80 trades, CI95 low of mean > 0): **{cel}**. Its fev–mai row is
in-sample.

| Period | Theory | Execution | Trades | Win | Mean/trade | PF | Compounded | Max DD |
|---|---|---|---|---|---|---|---|---|
""" + "\n".join(linhas) + "\n\nSee also: [[NCM Handoff 2026-11-05]], [[Validated Subset Filter]].\n"


if __name__ == "__main__":
    sys.exit(main())
