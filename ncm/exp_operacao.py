"""Experimento 3 (task 7): o plano representa só a operação que o bot executa.

Intervenção única em relação ao experimento 2 (KL): o plano de 45 posições deixa de ser o `melhor_plano` (várias
operações, posicionado em 85% dos minutos) e vira [lado]*dur + [0]*(45-dur), só 91 planos possíveis. Alvo do
aquecimento = a melhor entrada única em retrospecto (lado x duração 1..45, taxa e slippage), "fora" se nenhuma
for positiva. Hipótese: a decisão de entrar passa para os códigos grossos, onde o NCM decide primeiro.
Recompensa, KL, lote, LR, semente e arquitetura iguais; o GRPO roda depois com `diagnostico_grpo.py --partida modelo-op`.

    ~/.local/share/wow-voz/venv/bin/python -I ncm/exp_operacao.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import torch
from omegaconf import OmegaConf

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import rotulos as rt  # noqa: E402
import treino as tn  # noqa: E402

SAIDA = tn.rp.SAIDA.parent / "modelo-op"
ACOES = [(lado, dur) for lado in (1, -1) for dur in range(1, tn.H + 1)]


def planos(lado: np.ndarray, dur: np.ndarray) -> torch.Tensor:
    """Tokens do plano executado: lado nos `dur` primeiros minutos, 0 depois (token = posição + 1)."""
    k = np.arange(tn.H)
    return torch.from_numpy(np.where(k[None, :] < dur[:, None], lado[:, None], 0).astype(np.int64) + 1)


def melhor_entrada(ab: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Melhor entrada única em retrospecto por minuto; (0, 0) quando nenhuma paga a taxa."""
    n = len(ab)
    R = np.stack([rt.recompensa_lote(ab, np.full(n, lado), np.full(n, dur)) for lado, dur in ACOES], 1)
    a, melhor = R.argmax(1), R.max(1)
    acoes = np.array(ACOES)
    lado = np.where(melhor > 0, acoes[a, 0], 0)
    return lado, np.where(melhor > 0, acoes[a, 1], 0), melhor


def main() -> int:
    torch.manual_seed(0)
    np.random.seed(0)
    SAIDA.mkdir(parents=True, exist_ok=True)
    d = tn.dados()
    tr, v = d["treino"], d["val"]
    l_tr, d_tr, m_tr = melhor_entrada(tr["ab"])
    l_v, d_v, _ = melhor_entrada(v["ab"])
    resumo = {"entra": float((l_tr != 0).mean()), "compra": float((l_tr == 1).sum() / max(1, (l_tr != 0).sum())),
              "dur_mediana": float(np.median(d_tr[l_tr != 0])), "melhor_media": float(m_tr[l_tr != 0].mean())}
    print("alvo do aquecimento (treino):", json.dumps(resumo), flush=True)

    todos = planos(np.r_[0, [a[0] for a in ACOES]], np.r_[0, [a[1] for a in ACOES]])  # os 91 planos possíveis
    cfg = tn.config(tr["X"].shape[1])
    OmegaConf.save(cfg, SAIDA / "config.yaml")
    vq = tn.treina_tokenizador(cfg, todos.repeat(200, 1), planos(l_v, d_v))
    with torch.no_grad():
        exatos = (vq.decode(vq.encode(todos.to(tn.DISP))).argmax(-1).cpu() == todos).all(1).float().mean().item()
    acerto = tn.acerto_tok(vq, planos(l_v, d_v))
    print(f"tokenizador: {exatos:.1%} dos 91 planos exatos; acerto por posição nos alvos de junho {acerto:.4f}",
          flush=True)
    torch.save({"model": vq.state_dict(), "acerto_val": acerto, "planos_exatos": exatos}, SAIDA / "tokenizador.pt")

    net = tn.cria_gerador(cfg, vq)
    tn.aquece(net, vq, torch.from_numpy(tr["X"]), planos(l_tr, d_tr))
    torch.save({"model": net.state_dict(), "passo": 0, "media": d["media"], "desvio": d["desvio"],
                "nomes": d["nomes"]}, SAIDA / "gerador.pt")
    (SAIDA / "alvos.json").write_text(json.dumps({**resumo, "tokenizador_exatos": exatos,
                                                  "tokenizador_acerto_val": acerto}, indent=1))
    print(f"-> {SAIDA}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
