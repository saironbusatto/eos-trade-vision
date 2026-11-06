"""Treina o NCM pelo dinheiro (task 7 do ncm-live-trading.md). Só usa treino (fev–mai) e validação (jun).

(a) tokenizador VQ-VAE dos planos de 45 min (-1/0/1 por minuto) em níveis [1,3,9,45];
(b) aquecimento curto imitando `rotulos.melhor_plano`, só para o gerador aprender o formato de um plano;
(c) GRPO: K planos sorteados por minuto; recompensa = log do capital da operação que o bot executaria
    (`rotulos.primeira_operacao` + `recompensa_lote`); vantagem = recompensa - média do grupo.
Checkpoint e limiar de confiança escolhidos pelo resultado de junho simulado como no ao vivo (`avalia`).

    ~/.local/share/wow-voz/venv/bin/python -I ncm/treino.py [--rapido]
"""
import json
import math
import os
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import torch
import torch.nn.functional as F
from torch import nn

AQUI = Path(__file__).resolve().parent
NCM_ROOT = Path(os.environ.get("NCM_ROOT", Path.home() / "PROJETOS/WoWcombabte/NCM"))  # repositório do NCM
for _p in (AQUI, NCM_ROOT, Path.home() / ".local/share/ncm/libs"):
    sys.path.insert(0, str(_p))
from models.next_concept import NextConceptTransformer  # noqa: E402
from models.vqvae import VQVAE  # noqa: E402
from omegaconf import OmegaConf  # noqa: E402

import replay as rp  # noqa: E402
import rotulos as rt  # noqa: E402
import split as sp  # noqa: E402
import teorias as te  # noqa: E402

RAPIDO = "--rapido" in sys.argv
MODELO = rp.SAIDA.parent / ("modelo-rapido" if RAPIDO else "modelo")
H, NIVEIS, CODIGOS = rt.HORIZONTE, [1, 3, 9, 45], 64
PASSOS_TOK, PASSOS_AQ, PASSOS_GRPO = (100, 100, 60) if RAPIDO else (6000, 3000, 8000)
LOTE_TOK, LOTE_AQ, GRUPOS, K = 1024, 128, 32, 8
LR, LR_GRPO, ALFA_NIVEL, TROCA_CODIGO = 3e-4, 3e-5, 0.5, 0.1
ESCALA = 1000.0  # recompensa em 0,1% para o gradiente não sumir
AVALIA_CADA, N_AMOSTRAS, N_VAL = (30, 8, 3000) if RAPIDO else (500, 8, None)
LIMIARES = [0.5, 0.6, 0.7, 0.8, 0.9]
CORTE_Z = 5.0
TOKENS_FOTO = 16  # ponytail: 205 números comprimidos em 16 tokens (1 token por número era ~10x mais lento)
DISP = "cuda"


# ---------- dados ----------

def dados() -> dict:
    """Fotos normalizadas (média/desvio do treino) + janela de 46 aberturas de futuros por minuto."""
    d = sp.sem_teste(sp.carrega())
    meses = rp.meses("2026-02", "2026-07")
    kl = rp.carrega_klines("futuros_klines_1m", "BTCUSDT", meses)
    m0 = int(kl.index.min())
    kl = kl.reindex(range(m0, int(kl.index.max()) + 1))
    ab = kl["abertura"].to_numpy(float).copy()
    ab[np.arange(m0, m0 + len(ab)) >= sp.PARTES[sp.TESTE][0] // rt.MINUTO_MS] = np.nan  # nada do teste
    i = d["t_ms"] // rt.MINUTO_MS - m0
    assert i.min() >= 0 and i.max() + H < len(ab)
    jan = ab[i[:, None] + np.arange(H + 1)]
    ok = ~np.isnan(jan).any(1)
    _, _, fs = rp.carrega_contexto("BTCUSDT", meses)
    tr = ok & (d["parte"] == sp.TREINO)
    media = d["X"][tr].mean(0)
    desvio = d["X"][tr].std(0)
    desvio[desvio == 0] = 1.0
    X = np.clip((d["X"] - media) / desvio, -CORTE_Z, CORTE_Z).astype(np.float32)
    out = {"media": media, "desvio": desvio, "nomes": d["nomes"],
           "funding": {int(t): float(r) for t, r in fs.items()}}
    for nome, m in (("treino", tr), ("val", ok & (d["parte"] == sp.VALIDACAO))):
        out[nome] = {"X": X[m], "ab": jan[m], "t_ms": d["t_ms"][m]}
    print(f"treino {tr.sum()} | val {out['val']['X'].shape[0]} | sem janela {(~ok).sum()}", flush=True)
    return out


# ---------- modelo ----------

class Foto(nn.Module):
    """Foto de n números -> TOKENS_FOTO tokens (projeção linear + posição de cada token)."""

    def __init__(self, n: int, dim: int):
        super().__init__()
        self.proj = nn.Linear(n, TOKENS_FOTO * dim)
        self.pos = nn.Parameter(torch.randn(TOKENS_FOTO, dim) * 0.02)
        self.dim = dim

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.proj(x).view(len(x), TOKENS_FOTO, self.dim) + self.pos


class _VqComFoto:
    """O NCM lê o prefixo por `vqvae.encoder.wte`; aqui o prefixo é a foto contínua, não tokens do plano."""

    def __init__(self, vq: VQVAE, foto: Foto):
        self._vq = vq
        self.encoder = SimpleNamespace(wte=foto, blocks=[])

    def __getattr__(self, k: str):
        return getattr(self._vq, k)


def config(n_feat: int) -> OmegaConf:
    cfg = OmegaConf.load(NCM_ROOT / "config/eval/sudoku-hard.yaml")
    m = cfg.model
    m.vocab_size, m.prefix_len = [CODIGOS] * len(NIVEIS), TOKENS_FOTO
    m.n_embd, m.n_head, m.n_layer, m.dropout = 256, 4, 6, 0.0
    v = cfg.tokenizer.vqvae
    v.in_vocab_size, v.context_length = 3, H
    v.vqvae_vocab_size = [CODIGOS] * len(NIVEIS)
    v.vector_quantizer_config.levels.manual_levels = NIVEIS
    cfg.n_feat = n_feat
    return cfg


def cria_gerador(cfg: OmegaConf, vq: VQVAE) -> NextConceptTransformer:
    net = NextConceptTransformer(vqvae_local=vq, config=cfg.model).to(DISP)
    net.foto = Foto(cfg.n_feat, vq.embed_dim).to(DISP)
    net.vqvae_local = (_VqComFoto(vq, net.foto),)
    return net


def lr_suave(passo: int, total: int, base: float) -> float:
    return base * min(1.0, (passo + 1) / 300) * (0.5 + 0.5 * math.cos(math.pi * passo / total))


def _ajusta_lr(opt: torch.optim.Optimizer, lr: float) -> None:
    for g in opt.param_groups:
        g["lr"] = lr


def _passo(opt: torch.optim.Optimizer, params, perda: torch.Tensor) -> None:
    opt.zero_grad(set_to_none=True)
    perda.backward()
    torch.nn.utils.clip_grad_norm_(params, 1.0)
    opt.step()


# ---------- (a) tokenizador ----------

def treina_tokenizador(cfg: OmegaConf, planos: torch.Tensor, prova: torch.Tensor) -> VQVAE:
    vq = VQVAE(**cfg.tokenizer.vqvae).to(DISP)
    params = [p for p in vq.parameters() if p.requires_grad]
    opt = torch.optim.AdamW(params, lr=LR, weight_decay=0.01)
    t0 = time.time()
    for passo in range(PASSOS_TOK):
        vq.train()
        _ajusta_lr(opt, lr_suave(passo, PASSOS_TOK, LR))
        x = planos[torch.randint(0, len(planos), (LOTE_TOK,))].to(DISP)
        logits, vq_loss, *_ = vq(x)
        _passo(opt, params, F.cross_entropy(logits.reshape(-1, 3), x.reshape(-1)) + vq_loss)
        if passo % 500 == 0 or passo == PASSOS_TOK - 1:
            print(f"tok {passo:6} acerto {acerto_tok(vq, prova):.4f} {time.time() - t0:.0f}s", flush=True)
    vq.eval()
    for p in vq.parameters():
        p.requires_grad_(False)
    return vq


@torch.no_grad()
def acerto_tok(vq: VQVAE, prova: torch.Tensor) -> float:
    vq.eval()
    x = prova[:4096].to(DISP)
    return (vq.decode(vq.encode(x)).argmax(-1) == x).float().mean().item()


# ---------- (b) aquecimento ----------

def entrada(net: NextConceptTransformer, vq: VQVAE, fo: torch.Tensor, idx: torch.Tensor) -> torch.Tensor:
    with torch.no_grad():
        alvo = vq.vq.idx_to_ncm_input(idx)
    return torch.cat([net.foto(fo), net.build_l0_query_input(len(fo)), alvo], dim=1)


def pesos_nivel() -> torch.Tensor:
    n = torch.tensor(NIVEIS, dtype=torch.float)
    por_nivel = n ** -ALFA_NIVEL / (n ** (1 - ALFA_NIVEL)).sum()
    return torch.repeat_interleave(por_nivel, n.long()).to(DISP)


def aquece(net: NextConceptTransformer, vq: VQVAE, X: torch.Tensor, planos: torch.Tensor) -> None:
    opt = torch.optim.AdamW(net.parameters(), lr=LR, weight_decay=0.01)
    pesos, t0 = pesos_nivel(), time.time()
    net.train()
    for passo in range(PASSOS_AQ):
        _ajusta_lr(opt, lr_suave(passo, PASSOS_AQ, LR))
        j = torch.randint(0, len(X), (LOTE_AQ,))
        fo, pl = X[j].to(DISP), planos[j].to(DISP)
        with torch.no_grad():
            idx = vq.encode(pl)
            troca = torch.rand(idx.shape, device=DISP) < TROCA_CODIGO
            ruido = torch.where(troca, torch.randint_like(idx, CODIGOS), idx)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            logits = net(entrada(net, vq, fo, ruido))
        perda = (F.cross_entropy(logits.float().reshape(-1, logits.shape[-1]), idx.reshape(-1), reduction="none")
                 .view(idx.shape) * pesos).sum(1).mean()
        _passo(opt, net.parameters(), perda)
        if passo % 500 == 0 or passo == PASSOS_AQ - 1:
            print(f"aq  {passo:6} perda {perda.item():.4f} {time.time() - t0:.0f}s", flush=True)


# ---------- (c) GRPO ----------

@torch.no_grad()
def sorteia(net: NextConceptTransformer, vq: VQVAE, fo: torch.Tensor, temp: float) -> tuple[torch.Tensor, np.ndarray]:
    net.eval()
    idx = net.generate(None, fo, temperature=temp, top_k=0, top_p=1.0, cfg_scale=0.0)
    return idx, (vq.decode(idx).argmax(-1) - 1).cpu().numpy()


def passo_grpo(net, vq, opt, tr: dict, X: torch.Tensor) -> tuple[float, float]:
    j = np.random.randint(0, len(X), GRUPOS)
    fo = X[j].to(DISP).repeat_interleave(K, 0)
    idx, planos = sorteia(net, vq, fo, 1.0)
    lado, dur = rt.primeira_operacao(planos)
    rec = rt.recompensa_lote(np.repeat(tr["ab"][j], K, 0), lado, dur).reshape(GRUPOS, K)
    adv = torch.tensor(((rec - rec.mean(1, keepdims=True)) * ESCALA).reshape(-1), device=DISP, dtype=torch.float)
    net.train()
    with torch.autocast("cuda", dtype=torch.bfloat16):
        logits = net(entrada(net, vq, fo, idx))
    lp = logits.float().log_softmax(-1).gather(-1, idx.unsqueeze(-1)).squeeze(-1).sum(1)
    _passo(opt, net.parameters(), -(adv * lp).mean())
    return float(rec.mean()), float((lado != 0).mean())


# ---------- validação em junho, como no ao vivo ----------

def decisoes(net, vq, X: torch.Tensor) -> dict[str, tuple[np.ndarray, np.ndarray, np.ndarray]]:
    """Por minuto, (lado, duração, confiança) nos dois modos; confiança = fração das amostras no mesmo lado."""
    det, amo = [], []
    for i in range(0, len(X), 256):
        fo = X[i:i + 256].to(DISP)
        det.append(rt.primeira_operacao(sorteia(net, vq, fo, 0.0)[1]))
        lado, dur = rt.primeira_operacao(sorteia(net, vq, fo.repeat_interleave(N_AMOSTRAS, 0), 1.0)[1])
        amo.append((lado.reshape(-1, N_AMOSTRAS), dur.reshape(-1, N_AMOSTRAS)))
    ld, dd = (np.concatenate(x) for x in zip(*det))
    la, da = (np.concatenate(x) for x in zip(*amo))
    votos = np.stack([(la == s).sum(1) for s in (-1, 0, 1)], 1)
    lc = votos.argmax(1) - 1
    dur_c = np.array([int(np.median(d[l == s])) if s else 0 for d, l, s in zip(da, la, lc)])
    return {"deterministico": (ld, dd, (la == ld[:, None]).mean(1)),
            "consenso": (lc, dur_c, votos.max(1) / N_AMOSTRAS)}


def opera(v: dict, lado: np.ndarray, dur: np.ndarray, conf: np.ndarray, limiar: float,
          funding: dict[int, float]) -> dict:
    """Uma posição por vez: só decide de novo quando a anterior saiu."""
    trades, livre = [], 0
    for j in np.flatnonzero((lado != 0) & (dur > 0) & (conf >= limiar)):
        t = int(v["t_ms"][j])
        if t < livre:
            continue
        pnl = rt.posicoes(v["ab"][j], [int(lado[j])] * int(dur[j]), t0_ms=t, funding=funding)
        trades.append({"lado": int(lado[j]), "pnl": pnl})
        livre = t + int(dur[j]) * rt.MINUTO_MS
    return te.metricas(trades)


def avalia(net, vq, v: dict, X: torch.Tensor, funding: dict[int, float]) -> list[dict]:
    out = []
    for modo, (lado, dur, conf) in decisoes(net, vq, X).items():
        for limiar in LIMIARES:
            out.append({"modo": modo, "limiar": limiar, **opera(v, lado, dur, conf, limiar, funding)})
    return out


def _resumo(linhas: list[dict]) -> str:
    b = max(linhas, key=lambda r: r.get("composto", 0.0))
    if not b["n"]:
        return "nenhum trade em junho"
    return (f"melhor {b['modo']} limiar {b['limiar']}: {b['n']} trades ({b['long']}L/{b['short']}S) "
            f"PF {b['pf']:.2f} composto {100 * b['composto']:+.2f}% dd {100 * b['dd']:.1f}%")


# ---------- principal ----------

def main() -> int:
    torch.manual_seed(0)
    np.random.seed(0)
    MODELO.mkdir(parents=True, exist_ok=True)
    d = dados()
    tr, v = d["treino"], d["val"]
    if N_VAL:
        v = {k: x[:N_VAL] for k, x in v.items()}
    t0 = time.time()
    pl_tr = torch.from_numpy(rt.melhor_plano_lote(tr["ab"]).astype(np.int64) + 1)
    pl_v = torch.from_numpy(rt.melhor_plano_lote(v["ab"]).astype(np.int64) + 1)
    print(f"melhor plano: {time.time() - t0:.0f}s; minutos em posição {(pl_tr != 1).float().mean():.1%}", flush=True)
    X, Xv = torch.from_numpy(tr["X"]), torch.from_numpy(v["X"])
    cfg = config(X.shape[1])
    OmegaConf.save(cfg, MODELO / "config.yaml")

    vq = treina_tokenizador(cfg, pl_tr, pl_v)
    acerto = acerto_tok(vq, pl_v)
    torch.save({"model": vq.state_dict(), "acerto_val": acerto}, MODELO / "tokenizador.pt")
    net = cria_gerador(cfg, vq)
    aquece(net, vq, X, pl_tr)

    historico, melhor = [], -np.inf
    opt = torch.optim.AdamW(net.parameters(), lr=LR_GRPO, weight_decay=0.0)
    t0 = time.time()
    for passo in range(PASSOS_GRPO + 1):
        if passo % AVALIA_CADA == 0 or passo == PASSOS_GRPO:
            linhas = avalia(net, vq, v, Xv, d["funding"])
            historico.append({"passo": passo, "linhas": linhas})
            nota = max(r.get("composto", 0.0) for r in linhas)
            print(f"jun passo {passo}: {_resumo(linhas)} ({time.time() - t0:.0f}s)", flush=True)
            if nota > melhor:
                melhor = nota
                torch.save({"model": net.state_dict(), "passo": passo, "media": d["media"], "desvio": d["desvio"],
                            "nomes": d["nomes"]}, MODELO / "gerador.pt")
        if passo == PASSOS_GRPO:
            break
        _ajusta_lr(opt, lr_suave(passo, PASSOS_GRPO, LR_GRPO))
        rec, operou = passo_grpo(net, vq, opt, tr, X)
        if passo % 100 == 0:
            print(f"grpo {passo:5} recompensa média {100 * rec:+.4f}% opera {operou:.0%} "
                  f"{time.time() - t0:.0f}s", flush=True)

    versoes = sum(len(h["linhas"]) for h in historico)
    (MODELO / "junho.json").write_text(json.dumps(
        {"tokenizador_acerto_val": acerto, "versoes_testadas": versoes, "historico": historico}, indent=1,
        default=float))
    print(f"tokenizador {acerto:.4f} | versões testadas em junho: {versoes} | "
          f"vídeo no pico {torch.cuda.max_memory_allocated() / 1e6:.0f} MB", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
