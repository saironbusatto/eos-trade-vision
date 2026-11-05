"""OFA corrigido: as mesmas ideias do legado sem os defeitos achados na auditoria de 04/11.

1. Só velas de 15m FECHADAS (o legado usa a vela aberta e um corte de janela no meio da vela mais antiga).
2. Diagonal do footprint padrão: compra agressora no nível i contra venda agressora no nível de BAIXO (i-1);
   venda agressora no nível i contra compra agressora no nível de CIMA (i+1).
3. Stacks só entre níveis vizinhos da MESMA vela.
4. Níveis agrupados por um passo proporcional à volatilidade de 1m (o legado usa US$ 0,01 = 1 tick no BTC).
5. Volume profile e indicadores sobre velas de futuros fechadas, com valores contínuos além dos rótulos.
"""
import numpy as np

RAZAO, MIN_STACK = 3.0, 3


def agrupa_niveis(centavos: np.ndarray, compra: np.ndarray, venda: np.ndarray,
                  passo: float) -> tuple[np.ndarray, np.ndarray]:
    """Níveis de preço em ordem CRESCENTE, contíguos (níveis sem trade entram com zero)."""
    idx = np.floor(centavos / 100.0 / passo).astype(np.int64)
    k = idx - idx.min()
    n = int(k.max()) + 1
    return np.bincount(k, compra, n), np.bincount(k, venda, n)


def _maior_sequencia(b: np.ndarray) -> int:
    if not b.any():
        return 0
    d = np.diff(np.r_[0, b.astype(np.int8), 0])
    return int((np.flatnonzero(d == -1) - np.flatnonzero(d == 1)).max())


def imbalances_vela(compra: np.ndarray, venda: np.ndarray) -> dict:
    """Contagens e maior stack de compra/venda numa vela (níveis crescentes e contíguos)."""
    compra_imb = np.zeros(len(compra), bool)
    venda_imb = np.zeros(len(compra), bool)
    if len(compra) >= 2:
        abaixo = venda[:-1]
        compra_imb[1:] = (abaixo > 0) & (compra[1:] >= RAZAO * abaixo)
        acima = compra[1:]
        venda_imb[:-1] = (acima > 0) & (venda[:-1] >= RAZAO * acima)
    return {"compra": int(compra_imb.sum()), "venda": int(venda_imb.sum()),
            "stack_compra": _maior_sequencia(compra_imb), "stack_venda": _maior_sequencia(venda_imb)}


CHAVES_IMB = ("compra", "venda", "saldo", "stacks_compra", "stacks_venda", "max_stack_compra", "max_stack_venda",
              "ultima_saldo")


def imbalances(velas: list[tuple[np.ndarray, np.ndarray]]) -> dict:
    """Soma das velas fechadas da janela; 'ultima' é a vela mais recente."""
    por_vela = [imbalances_vela(c, v) for c, v in velas]
    if not por_vela:
        return dict.fromkeys(CHAVES_IMB, 0.0)
    c = sum(p["compra"] for p in por_vela)
    v = sum(p["venda"] for p in por_vela)
    u = por_vela[-1]
    return {
        "compra": float(c), "venda": float(v), "saldo": (c - v) / max(c + v, 1),
        "stacks_compra": float(sum(p["stack_compra"] >= MIN_STACK for p in por_vela)),
        "stacks_venda": float(sum(p["stack_venda"] >= MIN_STACK for p in por_vela)),
        "max_stack_compra": float(max(p["stack_compra"] for p in por_vela)),
        "max_stack_venda": float(max(p["stack_venda"] for p in por_vela)),
        "ultima_saldo": (u["compra"] - u["venda"]) / max(u["compra"] + u["venda"], 1),
    }


def absorcao(abertura: np.ndarray, fechamento: np.ndarray, total: np.ndarray, delta: np.ndarray) -> dict:
    """Velas fechadas com volume >= 2x a média da janela e corpo <= 0,2%; sinal pelo delta."""
    razao = total / total.mean()
    corpo = np.abs(fechamento - abertura) / abertura
    achou = (razao >= 2.0) & (corpo <= 0.002)
    return {"acumulacao": float((achou & (delta > 0)).sum()), "distribuicao": float((achou & (delta < 0)).sum()),
            "max_razao": float(razao[achou].max()) if achou.any() else 0.0,
            "ultima_razao": float(razao[-1]), "ultima_corpo": float(corpo[-1])}


def volume_profile(maxima: np.ndarray, minima: np.ndarray, volume_usd: np.ndarray, preco: float,
                   n_bins: int = 50, area: float = 0.682) -> dict:
    """Mesmo algoritmo de bins do legado, sobre velas fechadas; devolve distâncias contínuas (em retorno)."""
    lo, hi = float(minima.min()), float(maxima.max())
    passo = (hi - lo) / n_bins or 1e-9
    centros = lo + (np.arange(n_bins) + 0.5) * passo
    vol = np.zeros(n_bins)
    for k_hi, k_lo, q in zip(maxima, minima, volume_usd):
        dentro = (centros >= k_lo) & (centros <= k_hi)
        vol[dentro] += q / max(int(dentro.sum()), 1)
    vpoc = float(centros[int(np.argmax(vol))])
    ordem = np.argsort(np.abs(centros - vpoc), kind="stable")
    k = int(np.searchsorted(np.cumsum(vol[ordem]), vol.sum() * area)) + 1
    va = centros[ordem[:k]]
    vah, val = float(va.max()), float(va.min())
    return {"contexto": float(1 if preco > vah else -1 if preco < val else 0),
            "dist_vpoc": preco / vpoc - 1, "dist_vah": preco / vah - 1, "dist_val": preco / val - 1}


def indicadores(fechamento: np.ndarray, volume: np.ndarray) -> dict:
    """Sobre 20 velas de 15m fechadas: retornos em log, volatilidade sem teto, volume relativo."""
    lr = np.diff(np.log(fechamento))
    return {
        "tendencia": float(np.log(fechamento[-1] / fechamento[0])),
        "momento": float(np.log(fechamento[-5:].mean() / fechamento[-10:-5].mean())),
        "volatilidade": float(lr.std()),
        "volume_relativo": float(volume[-1] / volume[:-1].mean()),
    }
