"""Experimento 4 (task 7): recompensa esperada exata nos 91 planos em vez de sortear (GRPO).

Igual ao Exp 03 (partida `modelo-op`, LR, beta, semente, 1000 passos, só treino fev–mai) com UMA mudança: em vez
de sortear 8 planos por minuto e usar a vantagem do grupo, calcula a probabilidade que o NCM dá aos códigos de cada
um dos 91 planos possíveis, renormaliza entre eles (pi) e maximiza  sum pi(plano)*R(plano) - beta*KL(pi || pi_aq),
com R exato do simulador para todos os planos. Sem ruído de sorteio: todo minuto dá gradiente para toda ação.
Métrica principal igual às anteriores: resultado médio por entrada dos planos SORTEADOS (o que o bot executaria).

    ~/.local/share/wow-voz/venv/bin/python -I ncm/exp_esperanca.py
"""
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import torch
from omegaconf import OmegaConf

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import diagnostico_grpo as dg  # noqa: E402
import exp_operacao as eo  # noqa: E402
import rotulos as rt  # noqa: E402
import treino as tn  # noqa: E402

PARTIDA = tn.rp.SAIDA.parent / "modelo-op"
SAIDA = tn.rp.SAIDA.parent / "diag-kl"
PASSOS, CADA, BETA, SEMENTE = 1000, 50, 0.1, 0
MINUTOS, BLOCO = 8, 4  # minutos por passo; minutos por passada (8 x 91 sequências não cabem de uma vez)


def recompensas(ab: np.ndarray) -> np.ndarray:
    """(N, 91): resultado exato de cada plano; coluna 0 = fora (0), depois eo.ACOES na ordem."""
    n = len(ab)
    return np.c_[np.zeros(n), np.stack([rt.recompensa_lote(ab, np.full(n, lado), np.full(n, dur))
                                        for lado, dur in eo.ACOES], 1)]


def log_massa(net, vq, fo: torch.Tensor, codigos: torch.Tensor) -> torch.Tensor:
    """(B, 91): log p(códigos canônicos de cada plano | foto)."""
    idx = codigos.repeat(len(fo), 1)
    with torch.autocast("cuda", dtype=torch.bfloat16):
        lg = net(tn.entrada(net, vq, fo.repeat_interleave(len(codigos), 0), idx))
    return lg.float().log_softmax(-1).gather(-1, idx.unsqueeze(-1)).squeeze(-1).sum(1).view(len(fo), -1)


def passo(net, ref, vq, opt, codigos: torch.Tensor, tr: dict, X: torch.Tensor) -> dict:
    j = np.random.randint(0, len(X), MINUTOS)
    R = torch.tensor(recompensas(tr["ab"][j]) * tn.ESCALA, device=tn.DISP, dtype=torch.float)
    opt.zero_grad(set_to_none=True)
    net.train()
    st = {"entra_pi": [], "entrada_esperada": [], "kl": [], "massa_canonica": []}
    for b in range(0, MINUTOS, BLOCO):
        fo, Rb = X[j[b:b + BLOCO]].to(tn.DISP), R[b:b + BLOCO]
        lm = log_massa(net, vq, fo, codigos)
        with torch.no_grad():
            lref = log_massa(ref, vq, fo, codigos).log_softmax(1)
        logpi = lm.log_softmax(1)
        pi = logpi.exp()
        kl = (pi * (logpi - lref)).sum(1)
        (((-(pi * Rb).sum(1)) + BETA * kl).sum() / MINUTOS).backward()
        p_entra = 1 - pi[:, 0]
        st["entra_pi"] += p_entra.tolist()
        st["entrada_esperada"] += ((pi[:, 1:] * Rb[:, 1:]).sum(1) / p_entra.clamp(min=1e-9) / tn.ESCALA).tolist()
        st["kl"] += kl.tolist()
        st["massa_canonica"] += torch.logsumexp(lm, 1).exp().tolist()
    norma = float(torch.nn.utils.clip_grad_norm_(net.parameters(), 1.0))
    opt.step()
    return {**{k: float(np.mean(v)) for k, v in st.items()}, "grad_norma": norma}


@torch.no_grad()
def amostrado(net, vq, tr: dict, X: torch.Tensor) -> dict:
    """A métrica principal dos Exp 02/03: sorteia 32 x 8 planos e mede o que o bot executaria."""
    j = np.random.randint(0, len(X), tn.GRUPOS)
    fo = X[j].to(tn.DISP).repeat_interleave(tn.K, 0)
    _, planos = tn.sorteia(net, vq, fo, 1.0)
    lado, dur = rt.primeira_operacao(planos)
    rec = rt.recompensa_lote(np.repeat(tr["ab"][j], tn.K, 0), lado, dur)
    r_in = rec[lado != 0]
    return {"entra": float((lado != 0).mean()), "rec_entradas": float(r_in.mean()) if len(r_in) else None,
            "entradas_positivas": float((r_in > 0).mean()) if len(r_in) else None}


def main() -> int:
    torch.manual_seed(SEMENTE)
    np.random.seed(SEMENTE)
    dg.R1 = PARTIDA
    cfg = OmegaConf.load(PARTIDA / "config.yaml")
    vq = tn.VQVAE(**cfg.tokenizer.vqvae).to(tn.DISP).eval()
    vq.load_state_dict(torch.load(PARTIDA / "tokenizador.pt", map_location="cpu", weights_only=True)["model"])
    for p in vq.parameters():
        p.requires_grad_(False)
    net, ref = dg.carrega_r1(cfg, vq), dg.carrega_r1(cfg, vq).eval()
    for p in ref.parameters():
        p.requires_grad_(False)
    todos = eo.planos(np.r_[0, [a[0] for a in eo.ACOES]], np.r_[0, [a[1] for a in eo.ACOES]]).to(tn.DISP)
    with torch.no_grad():
        codigos = vq.encode(todos)
        assert (vq.decode(codigos).argmax(-1) == todos).all(), "códigos canônicos não reconstroem os 91 planos"
    d = tn.dados()
    tr, X = d["treino"], torch.from_numpy(d["treino"]["X"])
    opt = torch.optim.AdamW(net.parameters(), lr=tn.LR_GRPO, weight_decay=0.0)
    commit = subprocess.run(["git", "-C", str(AQUI), "rev-parse", "--short", "HEAD"], capture_output=True,
                            text=True).stdout.strip()
    meta = {"exp": 4, "beta": BETA, "passos": PASSOS, "minutos_por_passo": MINUTOS, "lr": tn.LR_GRPO,
            "semente": SEMENTE, "commit": commit, "partida": str(PARTIDA / "gerador.pt"),
            "dados": "treino fev–mai (sem junho, sem teste)"}
    print(json.dumps(meta, ensure_ascii=False), flush=True)
    registros, acum, t0 = [], [], time.time()
    for k in range(PASSOS):
        tn._ajusta_lr(opt, tn.lr_suave(k, tn.PASSOS_GRPO, tn.LR_GRPO))
        acum.append(passo(net, ref, vq, opt, codigos, tr, X))
        if (k + 1) % CADA == 0 or k == 0:
            m = {c: float(np.mean([x[c] for x in acum])) for c in acum[0]}
            s = amostrado(net, vq, tr, X)
            registros.append({"passo": k + 1, **m, **{f"amostra_{c}": v for c, v in s.items()}})
            r_in = "–" if s["rec_entradas"] is None else f"{100 * s['rec_entradas']:+.3f}%"
            print(f"passo {k + 1:5} | sorteado: entra {s['entra']:.1%} entradas {r_in} | exato: entra "
                  f"{m['entra_pi']:.1%} entrada esperada {100 * m['entrada_esperada']:+.3f}% | KL {m['kl']:.3f} | "
                  f"massa canônica {m['massa_canonica']:.2f} | grad {m['grad_norma']:.1f} | {time.time() - t0:.0f}s",
                  flush=True)
            acum = []
    (SAIDA / "metricas-exp04-esperanca.json").write_text(json.dumps({"meta": meta, "registros": registros}, indent=1))
    print(f"-> {SAIDA}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
