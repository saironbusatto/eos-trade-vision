"""Porte fiel do OFA do bot (eos-telegram-bot/src/ofa/*.ts e trendingScanner.analyzeOFA), com os mesmos defeitos.

Serve para a task 6 reproduzir as teorias antigas e como uma das entradas do NCM. Os defeitos conhecidos estão
documentados em ofa_corrigido.py; aqui NÃO se corrige nada, nem a ordem das comparações.
Diferença inevitável: o bot lia aggTrades do spot; aqui o fluxo é o de futuros (onde a operação acontece).
"""
from dataclasses import dataclass

import numpy as np

IMBALANCE_RATIO, MIN_STACKED = 3.0, 3
VOLUME_MULTIPLIER, MAX_PRICE_MOVE = 2.0, 0.002
NUM_BINS, VALUE_AREA_PERCENT = 50, 0.682


@dataclass(frozen=True)
class Vela:
    """FootprintCandle do footprint.ts. Níveis em ordem decrescente de preço, como o TS deixa."""

    timestamp: int
    abertura: float
    fechamento: float
    precos: np.ndarray  # decrescente
    venda: np.ndarray  # bidVolume (agressão de venda), USD
    compra: np.ndarray  # askVolume (agressão de compra), USD

    @property
    def total(self) -> float:
        return float(self.compra.sum() + self.venda.sum())

    @property
    def delta(self) -> float:
        return float(self.compra.sum() - self.venda.sum())


def smart_money(fluxo: np.ndarray, n_whale: int, n_trades: int) -> dict:
    """calculateSmartMoneyDelta a partir do fluxo somado da janela [4 classes, 2 lados]."""
    if n_trades == 0:
        return {"bias": 0, "total_delta": 0.0, "smart_delta": 0.0, "divergencia": 0, "whales": 0}
    valido = fluxo[1:]  # IGNORE fica de fora
    compra, venda = valido[:, 0], valido[:, 1]
    total_delta = float(compra.sum() - venda.sum())
    pesos = np.array([1.0, 3.0, 10.0])
    smart_delta = float((compra * pesos).sum() - (venda * pesos).sum())
    smart_compra, smart_venda = float(compra[1:].sum()), float(venda[1:].sum())
    liquido = smart_compra - smart_venda
    bias = 1 if liquido > smart_compra * 0.1 else -1 if liquido < -smart_venda * 0.1 else 0
    return {"bias": bias, "total_delta": total_delta, "smart_delta": smart_delta,
            "divergencia": int((total_delta > 0) != (smart_delta > 0)), "whales": int(n_whale)}


def detect_imbalances(precos: np.ndarray, venda: np.ndarray, compra: np.ndarray) -> list[tuple[float, float, str]]:
    """detectImbalances: (preço, razão, direção). 'previous' é o nível de CIMA (lista decrescente)."""
    out = []
    for i in range(1, len(precos)):
        if venda[i - 1] > 0 and compra[i] > 0:
            r = compra[i] / venda[i - 1]
            if r >= IMBALANCE_RATIO:
                out.append((float(precos[i]), float(r), "BUY"))
        if compra[i - 1] > 0 and venda[i] > 0:
            r = venda[i] / compra[i - 1]
            if r >= IMBALANCE_RATIO:
                out.append((float(precos[i]), float(r), "SELL"))
    return out


def _cria_stack(pilha: list[tuple[float, float, str]]) -> dict:
    n, media = len(pilha), sum(p[1] for p in pilha) / len(pilha)
    forca = "EXTREME" if n >= 5 and media >= 5 else "STRONG" if n >= 4 or media >= 4 else "MODERATE"
    return {"count": n, "direction": pilha[0][2], "strength": forca}


def detect_stacked(imbalances: list[tuple[float, float, str]]) -> list[dict]:
    """detectStackedImbalances: ordena todos por preço e junta vizinhos a < 0,5% (mesmo de velas diferentes)."""
    if len(imbalances) < MIN_STACKED:
        return []
    stacks, pilha, direcao = [], [], None
    for imb in sorted(imbalances, key=lambda x: -x[0]):  # sort estável, como o Array.sort do V8
        if not pilha:
            pilha, direcao = [imb], imb[2]
        elif imb[2] == direcao and abs(imb[0] - pilha[-1][0]) / ((imb[0] + pilha[-1][0]) / 2) < 0.005:
            pilha.append(imb)
        else:
            if len(pilha) >= MIN_STACKED:
                stacks.append(_cria_stack(pilha))
            pilha, direcao = [imb], imb[2]
    if len(pilha) >= MIN_STACKED:
        stacks.append(_cria_stack(pilha))
    return stacks


def analyze_imbalances(velas: list[Vela], detector=detect_imbalances) -> dict:
    """analyzeImbalances sobre o footprint de 60 min. `detector` permite a versão vetorizada (mesma saída)."""
    if not velas:
        return {"dominante": 0, "stack_forte": 0, "score": 0, "n_compra": 0, "n_venda": 0}
    todos = [i for v in velas for i in detector(v.precos, v.venda, v.compra)]
    stacks = detect_stacked(todos)
    n_c = sum(1 for i in todos if i[2] == "BUY")
    n_v = len(todos) - n_c
    dominante = 1 if n_c > n_v * 1.5 else -1 if n_v > n_c * 1.5 else 0
    forte = any(s["count"] >= 4 or s["strength"] in ("STRONG", "EXTREME") for s in stacks)
    score = min(len(todos) * 3, 30)
    score += sum(20 if s["strength"] == "EXTREME" else 15 if s["strength"] == "STRONG" else 10 for s in stacks)
    score = min(score, 80) + (20 if dominante else 0)
    return {"dominante": dominante, "stack_forte": int(forte), "score": min(score, 100), "n_compra": n_c,
            "n_venda": n_v}


def analyze_absorption(velas: list[Vela]) -> dict:
    """analyzeAbsorption sobre o footprint de 120 min (precisa de >= 5 velas)."""
    if len(velas) < 5:
        return {"dominante": 0, "score": 0, "n": 0}
    media = sum(v.total for v in velas) / len(velas)
    achados = []
    for v in velas[1:]:
        razao = v.total / media
        if razao < VOLUME_MULTIPLIER:
            continue
        movimento = abs(v.fechamento - v.abertura) / v.abertura
        if movimento > MAX_PRICE_MOVE:
            continue
        tipo = 1 if v.delta > 0 else -1 if v.delta < 0 else 0
        conf = 15 if razao >= 3 and movimento < 0.001 else 10 if razao >= 2.5 else 5
        achados.append((tipo, conf))
    acc = sum(1 for t, _ in achados if t == 1)
    dist = sum(1 for t, _ in achados if t == -1)
    dominante = 1 if acc > dist * 1.5 else -1 if dist > acc * 1.5 else 0
    score = min(len(achados) * 10, 40) + sum(c for _, c in achados)
    score = min(score, 80) + (20 if dominante else 0)
    return {"dominante": dominante, "score": min(score, 100), "n": len(achados)}


def volume_profile(maxima: np.ndarray, minima: np.ndarray, volume_usd: np.ndarray, preco_atual: float) -> dict:
    """calculateVolumeProfile sobre klines de 15m (createBins, VPOC, value area 68,2%)."""
    lo, hi = float(minima.min()), float(maxima.max())
    passo = (hi - lo) / NUM_BINS
    centros = lo + (np.arange(NUM_BINS) + 0.5) * passo
    vol = np.zeros(NUM_BINS)
    for k_hi, k_lo, q in zip(maxima, minima, volume_usd):
        dentro = (centros >= k_lo) & (centros <= k_hi)
        vol[dentro] += q / max(int(dentro.sum()), 1)
    vpoc = float(centros[int(np.argmax(vol))]) if vol.max() > 0 else 0.0
    ordem = sorted(range(NUM_BINS), key=lambda i: abs(centros[i] - vpoc))
    alvo, acc, incluidos = vol.sum() * VALUE_AREA_PERCENT, 0.0, []
    for i in ordem:
        incluidos.append(float(centros[i]))
        acc += vol[i]
        if acc >= alvo:
            break
    vah, val = max(incluidos), min(incluidos)
    contexto = 1 if preco_atual > vah else -1 if preco_atual < val else 0
    return {"contexto": contexto, "vpoc": vpoc, "vah": vah, "val": val}


def indicadores(fechamento: np.ndarray, volume: np.ndarray) -> dict:
    """calculateVolumeRatio/Trend/Momentum/Volatility do trendingScanner sobre 20 klines de 15m."""
    volume_ratio = volume[-1] / (volume[:-1].sum() / (len(volume) - 1))
    tendencia = (fechamento[-1] - fechamento[0]) / fechamento[0]
    anterior = fechamento[-10:-5].mean()
    momento = (fechamento[-5:].mean() - anterior) / anterior
    r = np.abs(np.diff(fechamento) / fechamento[:-1])
    volat = float(np.clip(r.mean(), 0.0025, 0.02)) if len(r) else 0.005
    return {"volume_ratio": float(volume_ratio), "tendencia": float(tendencia), "momento": float(momento),
            "volatilidade": volat}


def direcao(sm: dict, vp: dict, imb: dict, absor: dict, ind: dict) -> dict:
    """Pontos LONG/SHORT e score do analyzeOFA; direção 0 quando o bot devolvia null."""
    lp = 25 * (sm["bias"] == 1) + 20 * (vp["contexto"] == 1) + 30 * (imb["dominante"] == 1)
    sp = 25 * (sm["bias"] == -1) + 20 * (vp["contexto"] == -1) + 30 * (imb["dominante"] == -1)
    if imb["stack_forte"]:
        lp += 15 * (imb["dominante"] == 1)
        sp += 15 * (imb["dominante"] == -1)
    lp += 10 * (absor["dominante"] == 1) + 10 * (ind["tendencia"] > 0) + 5 * (ind["momento"] > 0)
    sp += 10 * (absor["dominante"] == -1) + 10 * (ind["tendencia"] < 0) + 5 * (ind["momento"] < 0)
    if lp > sp and lp >= 40:
        d, score = 1, min(lp, 100)
    elif sp > lp and sp >= 40:
        d, score = -1, min(sp, 100)
    else:
        d, score = 0, 0
    return {"long_pts": lp, "short_pts": sp, "direcao": d, "score": score}


def features_f(sm: dict, vp: dict, imb: dict, absor: dict, ind: dict) -> dict:
    """f_* gravados em ml_training (mesmas fórmulas e cortes)."""
    return {
        "f_smart_money": float(sm["bias"]),
        "f_price_context": {1: 1.0, -1: 0.0}.get(vp["contexto"], 0.5),
        "f_imbalance": min(imb["score"] / 100, 1.0),
        "f_absorption": min(absor["score"] / 100, 1.0),
        "f_trend": min(max((ind["tendencia"] + 1) / 2, 0.0), 1.0),
        "f_momentum": min(max((ind["momento"] + 1) / 2, 0.0), 1.0),
        "f_volume": min(ind["volume_ratio"] / 5, 1.0),
    }
