"""Verificações da task 2 (ncm-live-trading.md):

1. paridade: ofa_legado == JS compilado do bot (eos-telegram-bot/dist/ofa) nos mesmos dados;
2. sem futuro: a foto do minuto m não muda quando tudo o que vem depois de m é adulterado;
3. o OFA corrigido faz a diagonal e os stacks do jeito documentado.

    ~/.local/share/wow-voz/venv/bin/python -I ncm/teste_replay.py
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import agregados as ag  # noqa: E402
import ofa_corrigido as oc  # noqa: E402
import ofa_legado as ol  # noqa: E402
import replay as rp  # noqa: E402
from dados_binance import RAW, limites_mes  # noqa: E402

DIST = AQUI.parent / "eos-telegram-bot/dist/ofa"
JS = """
const imb = require(process.argv[1] + '/imbalanceDetector.js');
const sm = require(process.argv[1] + '/smartMoneyFilter.js');
const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const out = d.casos.map(c => {
  const levels = c.precos.map((p, i) => ({price: p, bidVolume: c.venda[i], askVolume: c.compra[i], delta: 0}));
  const ims = imb.detectImbalances(levels);
  const st = imb.detectStackedImbalances(ims).map(s => ({count: s.count, direction: s.direction, strength: s.strength}));
  return {imb: ims.map(i => [i.price, i.ratio, i.direction]), stacks: st};
});
const t = d.trades.map(x => ({price: x[0], quantity: x[1], timestamp: x[2], isBuyerMaker: x[3]}));
const r = sm.calculateSmartMoneyDelta(t);
console.log(JSON.stringify({casos: out, sm: {bias: r.smartMoneyBias, total: r.totalDelta, smart: r.smartDelta,
  div: r.divergence, whales: r.whaleTrades}}));
"""


def casos_sinteticos(rng: np.random.Generator, n: int) -> list[dict]:
    out = []
    for _ in range(n):
        k = int(rng.integers(2, 60))
        precos = np.sort(rng.choice(np.arange(100000, 100600), k, replace=False))[::-1] / 10
        vazio = rng.random((2, k)) < 0.3
        venda = np.where(vazio[0], 0, rng.lognormal(8, 1.5, k)).round(2)
        compra = np.where(vazio[1], 0, rng.lognormal(8, 1.5, k)).round(2)
        out.append({"precos": precos.tolist(), "venda": venda.tolist(), "compra": compra.tolist()})
    return out


def testa_paridade() -> None:
    rng = np.random.default_rng(7)
    casos = casos_sinteticos(rng, 300)
    n = 5000
    trades = [[float(p), float(q), 1_790_812_800_000 + i * 100, bool(m)]
              for i, (p, q, m) in enumerate(zip(rng.uniform(99_000, 101_000, n), rng.lognormal(-3, 2, n),
                                                rng.random(n) < 0.5))]
    js = subprocess.run(["node", "-e", JS, str(DIST)], input=json.dumps({"casos": casos, "trades": trades}),
                        capture_output=True, text=True, check=True, cwd=AQUI.parent / "eos-telegram-bot")
    ref = json.loads(js.stdout.strip().splitlines()[-1])
    for c, r in zip(casos, ref["casos"]):
        p, v, cp = (np.array(c[k]) for k in ("precos", "venda", "compra"))
        py = ol.detect_imbalances(p, v, cp)
        assert rp.detect_imbalances_np(p, v, cp) == py, "versão vetorizada difere da fiel"
        assert len(py) == len(r["imb"]) and all(
            a[0] == b[0] and abs(a[1] - b[1]) < 1e-9 and a[2] == b[2] for a, b in zip(py, r["imb"])), "imbalances"
        assert ol.detect_stacked(py) == r["stacks"], "stacks"
    a = np.array(trades, dtype=object)
    x = ag.de_trades(a[:, 0].astype(float), a[:, 1].astype(float), a[:, 2].astype(np.int64), a[:, 3].astype(bool),
                     int(trades[0][2]) // ag.MINUTO_MS, 10)
    sm = ol.smart_money(x.fluxo.sum(axis=0), int(x.n_whale.sum()), int(x.n_trades.sum()))
    r = ref["sm"]
    assert sm["bias"] == {"BULLISH": 1, "BEARISH": -1, "NEUTRAL": 0}[r["bias"]], "bias"
    assert abs(sm["total_delta"] - r["total"]) < 1e-6 * max(1, abs(r["total"])), "totalDelta"
    assert abs(sm["smart_delta"] - r["smart"]) < 1e-6 * max(1, abs(r["smart"])), "smartDelta"
    assert sm["divergencia"] == int(r["div"]) and sm["whales"] == r["whales"], "divergência/whales"
    print(f"paridade ok: {len(casos)} footprints e {n} trades iguais ao JS do bot")


def _adultera_depois(df: pd.DataFrame, m: int, rng: np.random.Generator) -> pd.DataFrame:
    out = df.copy()
    depois = out.index > m
    for c in out.columns:
        out.loc[depois, c] = out.loc[depois, c].to_numpy() * rng.uniform(0.5, 1.5, int(depois.sum()))
    return out


def testa_sem_futuro() -> None:
    rng = np.random.default_rng(11)
    mes = "2026-02"
    bloco = next(ag._blocos(RAW / "futuros_aggtrades/BTCUSDT" / f"BTCUSDT-aggTrades-{mes}.zip"))
    preco, qtd = bloco["price"].to_numpy(float), bloco["quantity"].to_numpy(float)
    ts = bloco["ts"].to_numpy(np.int64)
    maker = np.isin(bloco["maker"].to_numpy(dtype=object), ["true", "True", "1"])
    ini = limites_mes(mes)[0] // ag.MINUTO_MS
    n = int(ts[-1] // ag.MINUTO_MS) - ini  # o último minuto do bloco pode estar incompleto: fica de fora
    kf = rp.carrega_klines("futuros_klines_1m", "BTCUSDT", [mes])
    ks = rp.carrega_klines("spot_klines_1m", "BTCUSDT", [mes])
    fut, spot, funding = rp.carrega_contexto("BTCUSDT", [mes])
    x = ag.de_trades(preco, qtd, ts, maker, ini, n)
    candidatos = [m for m in range(ini + rp.HIST_MIN + 1, ini + n - 30, 2) if rp.valido(x, fut, spot, m)]
    assert len(candidatos) > 20, f"poucos minutos válidos no 1º bloco: {len(candidatos)}"
    escolhidos = [int(m) for m in rng.choice(candidatos, 12, replace=False)]
    for m in escolhidos:
        f1 = rp.foto(x, fut, spot, funding, m)
        dep = ts >= (m + 1) * ag.MINUTO_MS
        p2, q2, mk2 = preco.copy(), qtd.copy(), maker.copy()
        p2[dep] *= rng.uniform(0.9, 1.1, int(dep.sum()))
        q2[dep] = rng.permutation(q2[dep])
        mk2[dep] = ~mk2[dep]
        x2 = ag.de_trades(p2, q2, ts, mk2, ini, n)
        fut2, spot2 = rp.Velas15(_adultera_depois(kf, m, rng)), rp.Velas15(_adultera_depois(ks, m, rng))
        f2 = rp.foto(x2, fut2, spot2, funding, m)
        dif = [k for k in f1 if not (f1[k] == f2[k] or (np.isnan(f1[k]) and np.isnan(f2[k])))]
        assert not dif, f"minuto {m}: foto mudou com dados do futuro em {dif[:8]}"
    print(f"sem futuro ok: {len(escolhidos)} minutos, {len(f1)} features idênticas com o futuro adulterado")


def testa_corrigido() -> None:
    compra = np.array([0, 0, 900, 900, 900, 10.0])
    venda = np.array([100, 100, 100, 0, 0, 0.0])
    r = oc.imbalances_vela(compra, venda)
    assert r["compra"] == 2 and r["stack_compra"] == 2, r  # níveis 2 e 3 contra a venda do nível de baixo
    assert r["venda"] == 0, r
    assert oc._maior_sequencia(np.array([1, 1, 0, 1, 1, 1], bool)) == 3
    print("corrigido ok")


if __name__ == "__main__":
    testa_corrigido()
    testa_paridade()
    testa_sem_futuro()
