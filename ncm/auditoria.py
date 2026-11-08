"""Exp 08: auditoria só de leitura do pipeline (treino fev–mai): alinhamento, controle positivo, saúde das variáveis.

    ~/.local/share/wow-voz/venv/bin/python -I ncm/auditoria.py
"""
import sys
from pathlib import Path
import numpy as np
NCM = Path(__file__).resolve().parent; sys.path.insert(0, str(NCM))
import exp_valor as ev, exp_horizonte as eh, sinal as si
rt = ev.tn.rt
a, c, funding = ev.separa()
ab, cs, m0 = eh.precos(funding)
nomes = np.array(ev.tn.sp.carrega()["nomes"]) if "nomes" in ev.tn.sp.carrega() else None
def rets(p):
    i = p["t_ms"] // rt.MINUTO_MS - m0
    return {"prev1": ab[i] / ab[i - 1] - 1, "prev15": ab[i] / ab[i - 15] - 1, "next1": ab[i + 1] / ab[i] - 1,
            "next5": ab[i + 5] / ab[i] - 1, "next15": ab[i + 15] / ab[i] - 1, "absnext15": np.abs(ab[i + 15] / ab[i] - 1),
            "absprev15": np.abs(ab[i] / ab[i - 15] - 1)}
Ra, Rc = rets(a), rets(c)
def corr(X, y):
    Xz = (X - X.mean(0)) / (X.std(0) + 1e-12); yz = (y - y.mean()) / y.std()
    return (Xz * yz[:, None]).mean(0)
print("== 1. alinhamento: correlação das variáveis com retornos (fev–abr) ==")
for k in ("prev1", "next1", "next5", "next15"):
    r = corr(a["X"], Ra[k]); o = np.argsort(-np.abs(r))[:5]
    print(f"{k:7} max|r|={np.abs(r).max():.3f}  mediana|r|={np.median(np.abs(r)):.4f}  top: " +
          ", ".join(f"{nomes[j]}={r[j]:+.3f}" for j in o))
def r2(Xa, ya, Xc, yc):
    W = si.pesos_ridge(Xa, ya[:, None]); p = (np.c_[Xc, np.ones(len(Xc))] @ W)[:, 0]
    return 1 - ((yc - p) ** 2).sum() / ((yc - ya.mean()) ** 2).sum()
print("== 2. controle positivo: R² fora da amostra em maio (ridge treinado em fev–abr; 0 = constante) ==")
for k in ("prev1", "absprev15", "absnext15", "next1", "next5", "next15"):
    print(f"{k:9} R²_mai = {r2(a['X'], Ra[k], c['X'], Rc[k]):+.4f}")
print("== 3. saúde das variáveis (fev–abr, já normalizadas) ==")
X = a["X"]; sd = X.std(0)
print("constantes:", int((sd < 1e-6).sum()), "| >5% das linhas no corte ±5:", int(((np.abs(X) >= 4.999).mean(0) > 0.05).sum()),
      "| >50% das linhas iguais a um único valor:", int(sum((np.unique(X[:, j], return_counts=True)[1].max() / len(X)) > 0.5 for j in range(X.shape[1]))))
C = np.corrcoef(X[::20].T); np.fill_diagonal(C, 0)
print("pares quase duplicados (|r|>0.98):", int((np.abs(np.triu(C)) > 0.98).sum()))
print("== 4. efeitos simples (fev–abr) ==")
print("corr(prev1, next1) =", round(float(np.corrcoef(Ra["prev1"], Ra["next1"])[0, 1]), 4),
      "| corr(prev15, next15) =", round(float(np.corrcoef(Ra["prev15"], Ra["next15"])[0, 1]), 4),
      "| corr(|prev15|, |next15|) =", round(float(np.corrcoef(Ra["absprev15"], Ra["absnext15"])[0, 1]), 4))
print("desvio de next15:", f"{100*Ra['next15'].std():.3f}%", "| custo ida e volta 0,12% = ", f"{0.12/(100*Ra['next15'].std()):.2f} desvios")
