"""Experimento 5 (task 7): rede do tamanho do NCM como previsor de resultado, contra o ridge.

Exp 02–04 mostraram que objetivos de política aprendem "operar perde" e saturam. Aqui a rede prevê o resultado
exato (`sinal.resultados`) das 8 entradas do ridge e o bot entra na melhor se a previsão passar do limiar, igual
ao candidato ridge. Mesma frente da foto (`treino.Foto`, 16 tokens) e pilha do tamanho do NCM (6 camadas, 256,
4 cabeças); a geração hierárquica do NCM não participa.

Split interno, sem junho e sem teste: ajusta em fev–abr, confere em mai (embargo de 45 min). Normalização só de
fev–abr, a partir da foto bruta. Checkpoint pela perda em maio (não pelo lucro); 3 sementes.

    ~/.local/share/wow-voz/venv/bin/python -I ncm/exp_valor.py
"""
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import sinal as si  # noqa: E402
import treino as tn  # noqa: E402

SAIDA = tn.rp.SAIDA.parent / "diag-kl"
CORTE_MAIO = tn.sp._ms("2026-05-01")
SEMENTES, EPOCAS, LOTE, LR = (0, 1, 2), 10, 512, 3e-4


class Valor(nn.Module):
    def __init__(self, n_feat: int, dim: int = 256, camadas: int = 6, cabecas: int = 4, dropout: float = 0.1):
        super().__init__()
        self.foto = tn.Foto(n_feat, dim)
        camada = nn.TransformerEncoderLayer(dim, cabecas, 4 * dim, dropout, batch_first=True, norm_first=True)
        self.pilha = nn.TransformerEncoder(camada, camadas, enable_nested_tensor=False)
        self.cabeca = nn.Linear(dim, len(si.ACOES))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.cabeca(self.pilha(self.foto(x)).mean(1))


def separa() -> tuple[dict, dict, dict]:
    """Fev–abr (ajuste) e mai (conferência), normalizados só com fev–abr a partir da foto bruta."""
    d = tn.dados()
    tr = d["treino"]
    bruto = tn.sp.sem_teste(tn.sp.carrega())
    linhas = (bruto["parte"] == tn.sp.TREINO) & np.isin(bruto["t_ms"], tr["t_ms"])
    Xb = bruto["X"][linhas]
    assert np.array_equal(bruto["t_ms"][linhas], tr["t_ms"]), "treino fora de ordem"
    ajuste = tr["t_ms"] + tn.sp.EMBARGO_MS <= CORTE_MAIO
    confere = tr["t_ms"] >= CORTE_MAIO
    media, desvio = Xb[ajuste].mean(0), Xb[ajuste].std(0)
    desvio[desvio == 0] = 1.0
    X = np.clip((Xb - media) / desvio, -tn.CORTE_Z, tn.CORTE_Z).astype(np.float32)
    partes = [{"X": X[m], "ab": tr["ab"][m], "t_ms": tr["t_ms"][m], "Y": si.resultados(tr["ab"][m])}
              for m in (ajuste, confere)]
    print(f"ajuste fev–abr {ajuste.sum()} | conferência mai {confere.sum()} | embargo {(~ajuste & ~confere).sum()}",
          flush=True)
    return partes[0], partes[1], d["funding"]


@torch.no_grad()
def prever(net: Valor, X: np.ndarray) -> np.ndarray:
    net.eval()
    return np.concatenate([net(torch.from_numpy(X[i:i + 8192]).cuda()).float().cpu().numpy()
                           for i in range(0, len(X), 8192)]) / 1000


def treina(a: dict, c: dict, semente: int) -> tuple[Valor, list[float]]:
    torch.manual_seed(semente)
    net = Valor(a["X"].shape[1]).cuda()
    opt = torch.optim.AdamW(net.parameters(), lr=LR, weight_decay=1e-2)
    Xt, Yt = torch.from_numpy(a["X"]).cuda(), torch.from_numpy((a["Y"] * 1000).astype(np.float32)).cuda()
    Yc = torch.from_numpy((c["Y"] * 1000).astype(np.float32))
    melhor, estado, perdas = np.inf, None, []
    for ep in range(EPOCAS):
        net.train()
        for i in torch.randperm(len(Xt), device="cuda").split(LOTE):
            with torch.autocast("cuda", dtype=torch.bfloat16):
                perda = nn.functional.huber_loss(net(Xt[i]).float(), Yt[i])
            opt.zero_grad(set_to_none=True)
            perda.backward()
            torch.nn.utils.clip_grad_norm_(net.parameters(), 1.0)
            opt.step()
        p_maio = float(nn.functional.huber_loss(torch.from_numpy(prever(net, c["X"]) * 1000), Yc))
        perdas.append(p_maio)
        print(f"  semente {semente} época {ep + 1:2}: perda maio {p_maio:.4f}", flush=True)
        if p_maio < melhor:
            melhor, estado = p_maio, {k: v.detach().clone() for k, v in net.state_dict().items()}
    net.load_state_dict(estado)
    return net, perdas


def avalia(nome: str, prev: np.ndarray, c: dict, funding: dict) -> dict:
    melhor = prev.argmax(1)
    lado = np.array([si.ACOES[k][0] for k in melhor])
    dur = np.array([si.ACOES[k][1] for k in melhor])
    conf = prev.max(1)
    real = c["Y"][np.arange(len(c["Y"])), melhor]
    top = conf >= np.quantile(conf, 0.99)
    top1 = {"media": float(real[top].mean()), "positivos": float((real[top] > 0).mean()),
            "compra": float((lado[top] == 1).mean())}
    por_limiar = [{"limiar": lim, **tn.opera(c, lado, dur, conf, lim, funding)} for lim in si.LIMIARES]
    print(f"{nome:16} | 1% mais confiante: {100 * top1['media']:+.3f}%/entrada, {top1['positivos']:.0%} positivos, "
          f"{top1['compra']:.0%} compra | " + " | ".join(
              f"{100 * r['limiar']:.2f}%: {r['n']}t PF {r.get('pf', 0):.2f} {100 * r.get('composto', 0):+.1f}%"
              for r in por_limiar), flush=True)
    return {"top1": top1, "limiares": por_limiar}


def main() -> int:
    np.random.seed(0)
    a, c, funding = separa()
    commit = subprocess.run(["git", "-C", str(AQUI), "rev-parse", "--short", "HEAD"], capture_output=True,
                            text=True).stdout.strip()
    meta = {"exp": 5, "ajuste": "fev–abr", "conferencia": "mai", "sementes": list(SEMENTES), "epocas": EPOCAS,
            "lote": LOTE, "lr": LR, "commit": commit, "acoes": si.ACOES,
            "melhor_retrospecto_positivo_mai": float((c["Y"].max(1) > 0).mean())}
    t0 = time.time()
    prev_ridge = np.c_[c["X"], np.ones(len(c["X"]))] @ si.pesos_ridge(a["X"], a["Y"])
    modelos = {"ridge": avalia("ridge", prev_ridge, c, funding)}
    for s in SEMENTES:
        net, perdas = treina(a, c, s)
        modelos[f"rede_s{s}"] = {**avalia(f"rede semente {s}", prever(net, c["X"]), c, funding), "perda_maio": perdas}
    print(f"tempo {time.time() - t0:.0f}s", flush=True)
    SAIDA.mkdir(parents=True, exist_ok=True)
    (SAIDA / "metricas-exp05-valor.json").write_text(json.dumps({"meta": meta, "modelos": modelos}, indent=1,
                                                                default=float))
    print(f"-> {SAIDA}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
