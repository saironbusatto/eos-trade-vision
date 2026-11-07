"""Diagnóstico controlado do GRPO (task 7): a rodada 1 com UMA mudança, o KL até o modelo do aquecimento.

Parte do aquecimento da rodada 1 (mesmo tokenizador, gerador, lote 32x8, LR, semente) e roda N passos medindo, a
cada 50: taxa de entrada, grupos todos "fora", recompensa, KL, entropia por nível, |vantagem|, norma do gradiente.
Só usa o treino (fev–mai): junho não é avaliado (não conta versão) e o teste segue fechado. Nada da rodada 1 é
sobrescrito; a saída vai para ~/.local/share/eos-ncm/diag-kl/.

    ~/.local/share/wow-voz/venv/bin/python -I ncm/diagnostico_grpo.py [--beta 0.1] [--passos 1000]
"""
import argparse
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
import rotulos as rt  # noqa: E402
import treino as tn  # noqa: E402

R1 = tn.rp.SAIDA.parent / "modelo"
SAIDA = tn.rp.SAIDA.parent / "diag-kl"
CADA = 50
SEMENTE = 0


def carrega_r1(cfg: OmegaConf, vq: tn.VQVAE) -> tn.NextConceptTransformer:
    net = tn.cria_gerador(cfg, vq)
    ck = torch.load(R1 / "gerador.pt", map_location="cpu", weights_only=False)
    assert ck["passo"] == 0, "o gerador da rodada 1 devia ser o do aquecimento (passo 0)"
    net.load_state_dict(ck["model"])
    return net


def passo(net, ref, vq, opt, tr: dict, X: torch.Tensor, beta: float) -> dict:
    """O passo_grpo da rodada 1 + beta * KL(política || aquecimento), estimador k3 por token."""
    j = np.random.randint(0, len(X), tn.GRUPOS)
    fo = X[j].to(tn.DISP).repeat_interleave(tn.K, 0)
    idx, planos = tn.sorteia(net, vq, fo, 1.0)
    lado, dur = rt.primeira_operacao(planos)
    rec = rt.recompensa_lote(np.repeat(tr["ab"][j], tn.K, 0), lado, dur).reshape(tn.GRUPOS, tn.K)
    adv_np = (rec - rec.mean(1, keepdims=True)) * tn.ESCALA
    adv = torch.tensor(adv_np.reshape(-1), device=tn.DISP, dtype=torch.float)
    with torch.no_grad(), torch.autocast("cuda", dtype=torch.bfloat16):
        lp_ref = ref(tn.entrada(ref, vq, fo, idx)).float().log_softmax(-1).gather(-1, idx.unsqueeze(-1)).squeeze(-1)
    net.train()
    with torch.autocast("cuda", dtype=torch.bfloat16):
        logits = net(tn.entrada(net, vq, fo, idx))
    logp = logits.float().log_softmax(-1)
    lp = logp.gather(-1, idx.unsqueeze(-1)).squeeze(-1)
    r = lp_ref - lp
    kl = (torch.exp(r) - r - 1).sum(1)
    perda = -(adv * lp.sum(1)).mean() + beta * kl.mean()
    opt.zero_grad(set_to_none=True)
    perda.backward()
    norma = float(torch.nn.utils.clip_grad_norm_(net.parameters(), 1.0))
    opt.step()
    ent = -(logp.exp() * logp).sum(-1).detach()
    cortes = np.cumsum([0] + tn.NIVEIS)
    entra = (lado != 0).reshape(tn.GRUPOS, tn.K)
    r_in = rec[entra]
    return {"entra": float(entra.mean()), "grupos_todos_fora": float((~entra.any(1)).mean()),
            "rec_media": float(rec.mean()), "rec_entradas": float(r_in.mean()) if len(r_in) else None,
            "entradas_positivas": float((r_in > 0).mean()) if len(r_in) else None,
            "compra": float((lado[lado != 0] == 1).mean()) if (lado != 0).any() else None,
            "kl": float(kl.mean()), "adv_abs": float(np.abs(adv_np).mean()), "grad_norma": norma,
            **{f"entropia_n{n}": float(ent[:, a:b].mean()) for a, b, n in zip(cortes[:-1], cortes[1:], tn.NIVEIS)}}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--beta", type=float, default=0.1)
    ap.add_argument("--passos", type=int, default=1000)
    ap.add_argument("--partida", default="modelo", help="pasta em ~/.local/share/eos-ncm com o aquecimento")
    a = ap.parse_args()
    global R1
    R1 = tn.rp.SAIDA.parent / a.partida
    torch.manual_seed(SEMENTE)
    np.random.seed(SEMENTE)
    SAIDA.mkdir(parents=True, exist_ok=True)
    cfg = OmegaConf.load(R1 / "config.yaml")
    vq = tn.VQVAE(**cfg.tokenizer.vqvae).to(tn.DISP).eval()
    vq.load_state_dict(torch.load(R1 / "tokenizador.pt", map_location="cpu", weights_only=True)["model"])
    for p in vq.parameters():
        p.requires_grad_(False)
    net, ref = carrega_r1(cfg, vq), carrega_r1(cfg, vq).eval()
    for p in ref.parameters():
        p.requires_grad_(False)
    d = tn.dados()
    tr, X = d["treino"], torch.from_numpy(d["treino"]["X"])
    opt = torch.optim.AdamW(net.parameters(), lr=tn.LR_GRPO, weight_decay=0.0)
    commit = subprocess.run(["git", "-C", str(AQUI), "rev-parse", "--short", "HEAD"], capture_output=True,
                            text=True).stdout.strip()
    meta = {"beta": a.beta, "passos": a.passos, "lote": [tn.GRUPOS, tn.K], "lr": tn.LR_GRPO, "semente": SEMENTE,
            "commit": commit, "partida": str(R1 / "gerador.pt"), "dados": "treino fev–mai (sem junho, sem teste)"}
    print(json.dumps(meta, ensure_ascii=False), flush=True)
    registros, acum, t0 = [], [], time.time()
    for k in range(a.passos):
        tn._ajusta_lr(opt, tn.lr_suave(k, tn.PASSOS_GRPO, tn.LR_GRPO))  # mesma curva de LR da rodada 1
        acum.append(passo(net, ref, vq, opt, tr, X, a.beta))
        if (k + 1) % CADA == 0 or k == 0:
            media = {c: (float(np.mean([x[c] for x in acum if x[c] is not None]))
                         if any(x[c] is not None for x in acum) else None) for c in acum[0]}
            registros.append({"passo": k + 1, **media})
            r_in = "–" if media["rec_entradas"] is None else f"{100 * media['rec_entradas']:+.3f}%"
            print(f"passo {k + 1:5} | entra {media['entra']:.1%} | todos fora {media['grupos_todos_fora']:.0%} | "
                  f"rec {100 * media['rec_media']:+.4f}% | entradas {r_in} | KL "
                  f"{media['kl']:.2f} | ent n1 {media['entropia_n1']:.2f} n45 {media['entropia_n45']:.2f} | "
                  f"|adv| {media['adv_abs']:.2f} | grad {media['grad_norma']:.1f} | {time.time() - t0:.0f}s",
                  flush=True)
            acum = []
    nome = f"metricas-beta{a.beta}.json" if a.partida == "modelo" else f"metricas-{a.partida}-beta{a.beta}.json"
    (SAIDA / nome).write_text(json.dumps({"meta": meta, "registros": registros}, indent=1))
    print(f"-> {SAIDA}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
