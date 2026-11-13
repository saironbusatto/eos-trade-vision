"""Fase 3 do funding-ncm-carry.md: um modelo prevê o funding dos próximos 30 dias e decide a rotação do carry.

Estrutura L2·C0 (2x no perpétuo, custos taker). A carteira é a da R1 (top 3 mensal, 1/3 cada, saída forçada); só
a nota muda: previsão do modelo no lugar da média dos últimos 30 dias. Walk-forward por ano (2022..2026): cada ano
só usa amostras cujo alvo de 30 dias termina antes de 1º de janeiro daquele ano.
  M1 ridge (λ = 10).   M2 rede de valor estilo NCM: transformer 2 camadas / 64 dims / 4 cabeças sobre os últimos
  90 dias (funding, basis, retorno, |retorno|) + contexto; Huber; checkpoint pelos últimos 90 dias da janela de
  ajuste; previsão = média das sementes 0, 1, 2.
Critério (fixado no plano): ganhar do T-bill e da R1 em >= 4 dos 5 anos, maxDD < 10%, DSR > 0,95.

    ~/.local/share/wow-voz/venv/bin/python -I ncm/carry_modelo.py [--selftest]
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import carry as c  # noqa: E402
import rotacao as ro  # noqa: E402

ALAV = 2.0
HORIZ = 30
SEQ = 90
LAMBDA = 10.0
ANOS = (2022, 2023, 2024, 2025, 2026)
SEMENTES = (0, 1, 2)
EPOCAS = 15
SAIDA = Path.home() / ".local/share/eos-ncm/diag-kl/metricas-carry-modelo.json"


def diario(S: np.ndarray, P: np.ndarray, F: np.ndarray) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Funding somado por dia (nan sem evento) e aberturas das 00 UTC de spot e perpétuo."""
    D = len(S) // 24
    f = F[:D * 24].reshape(D, 24, -1)
    n = np.isfinite(f).sum(1)
    return (pd.DataFrame(np.where(n > 0, np.nansum(f, 1), np.nan)), pd.DataFrame(S[:D * 24:24]),
            pd.DataFrame(P[:D * 24:24]))


def atributos(Fd: pd.DataFrame, Sd: pd.DataFrame, Pd: pd.DataFrame, rf_ano: np.ndarray) -> tuple[np.ndarray, list[str]]:
    """[D, N, K]: tudo conhecido às 00 UTC do dia d (funding e retornos até d-1; preços da abertura de d)."""
    an = Fd * 365
    X, nomes = [], []
    for k in (1, 3, 7, 14, 30, 90):
        X.append(an.rolling(k, min_periods=max(1, k // 2)).mean().shift(1))
        nomes.append(f"fund_{k}d")
    X.append(an.rolling(30, min_periods=15).std().shift(1))
    X.append((Fd < 0).astype(float).where(Fd.notna()).rolling(30, min_periods=15).mean().shift(1))
    basis = Pd / Sd - 1
    lr = np.log(Sd).diff()
    X += [basis, basis.rolling(7, min_periods=3).mean(), lr.rolling(7).std() * np.sqrt(365),
          lr.rolling(30).std() * np.sqrt(365), np.log(Sd).diff(7), np.log(Sd).diff(30)]
    nomes += ["fund_dp30", "frac_neg30", "basis", "basis_7d", "vol_7d", "vol_30d", "ret_7d", "ret_30d"]
    f30, f7 = X[4], X[2]
    X += [pd.DataFrame(np.repeat(rf_ano[:, None], Fd.shape[1], 1)), f30.rank(axis=1, pct=True),
          f30.sub(f30.mean(axis=1), axis=0), pd.DataFrame(np.repeat(f7.mean(axis=1).to_numpy()[:, None], Fd.shape[1], 1))]
    nomes += ["tbill", "posto_30d", "dif_universo_30d", "universo_7d"]
    return np.stack([x.to_numpy(float) for x in X], -1), nomes


def alvo(Fd: pd.DataFrame) -> np.ndarray:
    """Funding anualizado dos dias d..d+29 (nan se faltar qualquer dia: símbolo deslistado ou fim dos dados)."""
    return (Fd.rolling(HORIZ, min_periods=HORIZ).sum().shift(-(HORIZ - 1)) / HORIZ * 365).to_numpy()


def ridge(Xa: np.ndarray, ya: np.ndarray, Xt: np.ndarray) -> np.ndarray:
    mu, dp = np.nanmean(Xa, 0), np.nanstd(Xa, 0) + 1e-9
    za, zt = np.nan_to_num((Xa - mu) / dp), np.nan_to_num((Xt - mu) / dp)
    w = np.linalg.solve(za.T @ za + LAMBDA * np.eye(za.shape[1]), za.T @ (ya - ya.mean()))
    return zt @ w + ya.mean()


def rede(seq_a, ctx_a, ya, seq_v, ctx_v, yv, seq_t, ctx_t, semente: int) -> np.ndarray:
    import torch
    from torch import nn

    torch.manual_seed(semente)
    dev = "cuda" if torch.cuda.is_available() else "cpu"

    class Valor(nn.Module):
        def __init__(self, canais: int, k: int):
            super().__init__()
            self.ent = nn.Linear(canais, 64)
            self.pos = nn.Parameter(torch.zeros(SEQ, 64))
            self.enc = nn.TransformerEncoder(nn.TransformerEncoderLayer(64, 4, 128, 0.1, batch_first=True), 2)
            self.ctx = nn.Linear(k, 64)
            self.sai = nn.Sequential(nn.Linear(128, 64), nn.GELU(), nn.Linear(64, 1))

        def forward(self, s, x):
            h = self.enc(self.ent(s) + self.pos).mean(1)
            return self.sai(torch.cat([h, self.ctx(x)], -1)).squeeze(-1)

    t = lambda a: torch.tensor(a, dtype=torch.float32, device=dev)  # noqa: E731
    sa, xa, y_a, sv, xv, y_v, st, xt = map(t, (seq_a, ctx_a, ya, seq_v, ctx_v, yv, seq_t, ctx_t))
    m = Valor(seq_a.shape[-1], ctx_a.shape[-1]).to(dev)
    opt = torch.optim.AdamW(m.parameters(), 1e-3, weight_decay=1e-2)
    perda = nn.HuberLoss(delta=0.1)
    melhor, estado = float("inf"), None

    def prever(s, x):
        m.eval()
        with torch.no_grad():
            return torch.cat([m(s[i:i + 4096], x[i:i + 4096]) for i in range(0, len(s), 4096)])

    for _ in range(EPOCAS):
        m.train()
        ordem = torch.randperm(len(sa), device=dev)
        for i in range(0, len(ordem), 512):
            b = ordem[i:i + 512]
            opt.zero_grad()
            perda(m(sa[b], xa[b]), y_a[b]).backward()
            nn.utils.clip_grad_norm_(m.parameters(), 1.0)
            opt.step()
        v = perda(prever(sv, xv), y_v).item()
        if v < melhor:
            melhor, estado = v, {k: w.clone() for k, w in m.state_dict().items()}
    m.load_state_dict(estado)
    return prever(st, xt).cpu().numpy()


def spearman(a: np.ndarray, b: np.ndarray) -> float:
    return float(pd.Series(a).rank().corr(pd.Series(b).rank()))


def main() -> int:
    simbolos = [e["simbolo"] for e in json.loads((AQUI / "universo-carry.json").read_text())["simbolos"]]
    hora, S, P, PH, F = ro.carrega(simbolos)
    rf = c.juros_diarios()
    datas_h = pd.to_datetime(hora * c.HORA_MS, unit="ms")
    rf_h = rf.reindex(datas_h.normalize() - pd.Timedelta(days=1)).fillna(0).to_numpy() / 24
    Fd, Sd, Pd = diario(S, P, F)
    D, N = Fd.shape
    dias = datas_h[::24][:D]
    X, nomes = atributos(Fd, Sd, Pd, rf_h[::24][:D] * 24 * 360)
    y = alvo(Fd)
    lr = np.log(Sd).diff().to_numpy()
    canais = np.nan_to_num(np.stack([(Fd * 365).to_numpy(), (Pd / Sd - 1).to_numpy() * 100, lr * 10, np.abs(lr) * 10], -1))
    valido = np.isfinite(X[..., 4]) & np.isfinite(Sd.to_numpy()) & np.isfinite(Pd.to_numpy())
    valido[:SEQ] = False
    dd, jj = np.nonzero(valido)
    tem_y = np.isfinite(y[dd, jj])
    janela = np.arange(-SEQ, 0)
    seq = lambda m: canais[dd[m][:, None] + janela, jj[m][:, None]]  # noqa: E731
    print(f"{valido.sum()} amostras (símbolo, dia), {tem_y.sum()} com alvo; {len(nomes)} atributos", flush=True)

    prev = {"M1 ridge": np.full((D, N), np.nan), "M2 rede NCM": np.full((D, N), np.nan)}
    for ano in ANOS:
        corte = int(np.searchsorted(dias, pd.Timestamp(f"{ano}-01-01")))
        fim = int(np.searchsorted(dias, pd.Timestamp(f"{ano + 1}-01-01")))
        aj = tem_y & (dd + HORIZ <= corte)                      # o alvo termina antes do ano de teste
        tr = aj & (dd + HORIZ <= corte - SEQ)                   # rede: ajuste sem os últimos 90 dias
        va = aj & (dd >= corte - SEQ)                           # ... que escolhem o checkpoint
        te = (dd >= corte) & (dd < fim)
        assert (dd[aj] + HORIZ).max() <= corte and dd[te].min() >= corte
        mu, dp = np.nanmean(X[dd[tr], jj[tr]], 0), np.nanstd(X[dd[tr], jj[tr]], 0) + 1e-9
        z = lambda m: np.nan_to_num((X[dd[m], jj[m]] - mu) / dp)  # noqa: E731
        prev["M1 ridge"][dd[te], jj[te]] = ridge(X[dd[aj], jj[aj]], y[dd[aj], jj[aj]], X[dd[te], jj[te]])
        p = [rede(seq(tr), z(tr), y[dd[tr], jj[tr]], seq(va), z(va), y[dd[va], jj[va]], seq(te), z(te), s)
             for s in SEMENTES]
        prev["M2 rede NCM"][dd[te], jj[te]] = np.mean(p, 0)
        print(f"  {ano}: ajuste {aj.sum()}  (rede {tr.sum()} + checkpoint {va.sum()})  teste {te.sum()}", flush=True)

    inicio = int(np.searchsorted(hora, pd.Timestamp("2022-01-01").timestamp() // 3600))
    dec = ro.marcas(hora, False)
    h, ano_h = hora[inicio:], datas_h[inicio:].year.to_numpy()
    regra = ro.Regra("modelo", 3, alav=ALAV)
    base30 = X[..., 4]
    d2022 = int(np.searchsorted(dias, pd.Timestamp("2022-01-01")))
    out = {}

    def roda(nome: str, nota_d: np.ndarray | None) -> None:
        nota_h = None if nota_d is None else np.repeat(nota_d, 24, 0)[:len(hora)]
        res = ro.simula(regra, S, P, PH, F, rf_h, dec, inicio, ro.C0, nota_h)
        pat = res.pop("patrimonio")
        o = {"total": c.metricas(pat, h, rf), "anos": {int(a): c.metricas(pat[ano_h == a], h[ano_h == a], rf)
                                                      for a in np.unique(ano_h)}, **res}
        nd = base30 if nota_d is None else nota_d
        m = np.isfinite(nd) & np.isfinite(y) & (np.arange(D)[:, None] >= d2022)
        o["spearman"] = spearman(nd[m], y[m])
        o["r2"] = float(1 - ((y[m] - nd[m]) ** 2).sum() / ((y[m] - y[m].mean()) ** 2).sum())
        out[nome] = o

    roda("R1 média 30d", None)
    for nome, nd in prev.items():
        roda(nome, nd)
    r1 = out["R1 média 30d"]
    srs = [out[k]["total"]["_sr"] for k in prev]
    for nome, o in out.items():
        t = o["total"]
        linha = (f"\n{nome}: desde 2022 {t['retorno_total']:+.1%} (T-bill {t['tbill']:+.1%})  maxDD {t['max_dd']:.1%}  "
                 f"entradas {o['entradas']}  custos {o['custos']:.3f}  liquidações {o['liquidacoes']}  "
                 f"previsão: Spearman {o['spearman']:.2f}, R² {o['r2']:.2f}")
        if nome in prev:
            t["dsr"] = c.dsr(t["_sr"], srs, t["_n"], t["_assim"], t["_curt"])
            ganha = [o["anos"][a]["retorno_total"] > max(o["anos"][a]["tbill"], r1["anos"][a]["retorno_total"])
                     for a in ANOS]
            o["anos_ganhos"] = int(sum(ganha))
            o["passa"] = bool(sum(ganha) >= 4 and t["max_dd"] > -0.10 and t["dsr"] > 0.95)
            linha += f"  DSR {t['dsr']:.2f}  anos ganhos {sum(ganha)}/5  -> {'PASSA' if o['passa'] else 'NÃO PASSA'}"
        print(linha)
        print("  " + "  ".join(f"{a}: {x['retorno_total']:+.1%} vs tb {x['tbill']:+.1%}" for a, x in o["anos"].items()))
    SAIDA.write_text(json.dumps(out, indent=1))
    print(f"\n{SAIDA}")
    return 0


def selftest() -> None:
    D, N = 200, 2
    Fd = pd.DataFrame(np.full((D, N), 0.001))
    Fd.iloc[100:, 1] = 0.002
    Sd = pd.DataFrame(np.full((D, N), 100.0))
    X, nomes = atributos(Fd, Sd, Sd * 1.001, np.zeros(D))
    i = nomes.index("fund_1d")
    assert abs(X[100, 1, i] - 0.365) < 1e-9 and abs(X[101, 1, i] - 0.73) < 1e-9   # o dia d só entra em d+1
    y = alvo(Fd)
    assert abs(y[100, 1] - 0.73) < 1e-9 and abs(y[90, 1] - (10 * 0.001 + 20 * 0.002) / 30 * 365) < 1e-9
    assert np.isnan(y[D - HORIZ + 1, 0]) and np.isfinite(y[D - HORIZ, 0])
    rng = np.random.default_rng(0)
    A = rng.normal(size=(500, 3))
    w = np.array([1.0, -2.0, 0.5])
    assert np.corrcoef(ridge(A[:400], A[:400] @ w, A[400:]), A[400:] @ w)[0, 1] > 0.99
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(main())
