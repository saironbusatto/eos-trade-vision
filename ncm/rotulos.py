"""Gabarito honesto (task 3 do ncm-live-trading.md): simula planos candle a candle em klines 1m de futuros.

Convenção de tempo: a decisão do minuto m sai em t=(m+1)*60s; `ab/mx/mn[0]` é o candle m+1, o primeiro que
pode ser negociado. Resultados em fração do nocional (0,001 = 0,1%), líquidos de taxa, slippage e funding.

- `ordem`: uma entrada com stop/alvo/prazo (as regras antigas do bot, task 6). Maker só preenche se o preço
  ATRAVESSAR o limite; stop e alvo no mesmo candle = stop (pior caso); gap além do stop sai na abertura.
- `posicoes`: uma posição por minuto (-1/0/1), o formato dos 45 tokens do NCM (task 7); cada troca é taker
  na abertura do candle.
- `melhor_plano`: em retrospecto, a sequência de posições de maior PnL líquido (programação dinâmica).
"""
from dataclasses import dataclass

import numpy as np

MINUTO_MS = 60_000
HORIZONTE = 45


@dataclass(frozen=True)
class Custos:
    """Taxas da Binance USDT-M VIP0 sem BNB. `slippage` cobre também a latência entre t e a ordem chegar."""

    taker: float = 0.0005
    maker: float = 0.0002
    # ponytail: latência como slippage fixo; trocar pelo preço do aggTrade em t+latência se pesar no resultado
    slippage: float = 0.0001


def funding_entre(funding: dict[int, float] | None, ini_ms: int, fim_ms: int) -> float:
    """Soma das taxas de funding cobradas em (ini_ms, fim_ms]; quem está comprado paga taxa positiva."""
    if not funding:
        return 0.0
    return float(sum(r for t, r in funding.items() if ini_ms < t <= fim_ms))


def ordem(ab: np.ndarray, mx: np.ndarray, mn: np.ndarray, t0_ms: int, lado: int, stop: float, alvo: float,
          prazo: int, custos: Custos = Custos(), limite: float | None = None, espera: int = 5,
          sem_preenchimento: str = "perde", funding: dict[int, float] | None = None) -> dict:
    """Uma operação. `stop`/`alvo`: distâncias relativas à entrada (0,005 = 0,5%); `t0_ms`: abertura do candle 0.

    `limite`: preço da ordem maker de entrada (None = taker na abertura do candle 0). Sem atravessar em `espera`
    candles: `sem_preenchimento='perde'` (sem trade) ou `'taker'` (entra a mercado no candle seguinte).
    `prazo`: minutos após a entrada até sair a mercado.
    """
    assert lado in (1, -1) and sem_preenchimento in ("perde", "taker")
    i, taxa_entrada, entrada = 0, custos.taker, ab[0] * (1 + lado * custos.slippage)
    if limite is not None:
        cruzou = (mn[:espera] < limite) if lado == 1 else (mx[:espera] > limite)
        if cruzou.any():
            i, taxa_entrada, entrada = int(np.argmax(cruzou)), custos.maker, float(limite)
        elif sem_preenchimento == "perde":
            return {"preenchida": False, "pnl_liquido": 0.0, "motivo": "sem_preenchimento"}
        else:
            i = espera
            entrada = ab[i] * (1 + lado * custos.slippage)
    p_stop, p_alvo = entrada * (1 - lado * stop), entrada * (1 + lado * alvo)
    fim = min(i + prazo, len(ab) - 1)
    saida, motivo, taxa_saida, j, fim_ms = None, "prazo", custos.taker, fim, t0_ms + fim * MINUTO_MS
    for k in range(i, fim):
        bateu_stop = mn[k] <= p_stop if lado == 1 else mx[k] >= p_stop
        # alvo é limite: precisa atravessar; no candle do preenchimento maker não conta (ordem dos ticks desconhecida)
        bateu_alvo = (mx[k] > p_alvo if lado == 1 else mn[k] < p_alvo) and not (limite is not None and k == i)
        if bateu_stop:  # pior caso quando os dois batem no mesmo candle
            pior = min(ab[k], p_stop) if lado == 1 else max(ab[k], p_stop)
            saida, motivo, j = pior * (1 - lado * custos.slippage), "stop", k
        elif bateu_alvo:
            saida, motivo, taxa_saida, j = p_alvo, "alvo", custos.maker, k
        else:
            continue
        fim_ms = t0_ms + (k + 1) * MINUTO_MS
        break
    if saida is None:
        saida = ab[fim] * (1 - lado * custos.slippage)
    bruto = lado * (saida / entrada - 1)
    fund = lado * funding_entre(funding, t0_ms + i * MINUTO_MS, fim_ms)
    return {"preenchida": True, "lado": lado, "entrada": float(entrada), "saida": float(saida), "motivo": motivo,
            "minuto_entrada": i, "minuto_saida": j, "pnl_bruto": float(bruto),
            "pnl_liquido": float(bruto - taxa_entrada - taxa_saida - fund)}


def posicoes(ab: np.ndarray, pos, custos: Custos = Custos(), t0_ms: int = 0,
             funding: dict[int, float] | None = None) -> float:
    """PnL líquido de manter pos[k] durante o candle k (troca na abertura dele); zera na abertura do candle n."""
    pos = np.r_[0, np.asarray(pos, int), 0]
    total, entrada, inicio = 0.0, 0.0, 0
    for k in range(1, len(pos)):
        if pos[k] == pos[k - 1]:
            continue
        if pos[k - 1] != 0:  # fecha na abertura do candle k-1
            saida = ab[k - 1] * (1 - pos[k - 1] * custos.slippage)
            total += pos[k - 1] * (saida / entrada - 1) - custos.taker
            total -= pos[k - 1] * funding_entre(funding, t0_ms + inicio * MINUTO_MS, t0_ms + (k - 1) * MINUTO_MS)
        if pos[k] != 0:  # abre
            entrada, inicio = ab[k - 1] * (1 + pos[k] * custos.slippage), k - 1
            total -= custos.taker
    return total


def melhor_plano(ab: np.ndarray, custos: Custos = Custos()) -> tuple[np.ndarray, float]:
    """len(ab)-1 posições de maior PnL líquido em log (Viterbi em {-1,0,1}); virar de lado = duas pernas.

    Sem funding (no máximo uma cobrança em 45 min, ~0,01%): o PnL exato do plano vem de `posicoes`.
    """
    estados = np.array([-1, 0, 1])
    perna = custos.taker - np.log1p(-custos.slippage)
    troca = np.abs(estados[:, None] - estados[None, :]) * perna  # [de, para]
    r = np.diff(np.log(ab))
    n = len(r)
    valor = -troca[1] + estados * r[0]  # parte zerado
    de = np.zeros((n, 3), int)
    for k in range(1, n):
        cand = valor[:, None] - troca
        de[k] = np.argmax(cand, axis=0)
        valor = cand[de[k], np.arange(3)] + estados * r[k]
    valor = valor - troca[:, 1]  # zera no fim
    s = int(np.argmax(valor))
    melhor = float(valor[s])
    seq = np.empty(n, int)
    for k in range(n - 1, -1, -1):
        seq[k] = estados[s]
        s = de[k][s]
    return seq, melhor


def _testes() -> None:
    c = Custos(taker=0.0005, maker=0.0002, slippage=0.0)
    ab = np.array([100.0, 100.0, 100.0, 100.0])
    # candle 1 toca stop e alvo: sai no stop
    mx = np.array([100.2, 101.5, 100.1, 100.1])
    mn = np.array([99.9, 98.5, 99.9, 99.9])
    r = ordem(ab, mx, mn, 0, 1, stop=0.01, alvo=0.01, prazo=3, custos=c)
    assert r["motivo"] == "stop" and abs(r["pnl_liquido"] - (-0.01 - 0.001)) < 1e-12, r
    # à mão: short taker a 100, alvo 1% atravessado no candle 2 -> +1% - 0,05% (taker) - 0,02% (maker)
    mx2 = np.array([100.1, 100.2, 99.8, 99.5])
    mn2 = np.array([99.9, 99.5, 98.9, 99.0])
    r = ordem(ab, mx2, mn2, 0, -1, stop=0.01, alvo=0.01, prazo=3, custos=c)
    assert r["motivo"] == "alvo" and abs(r["pnl_liquido"] - (0.01 - 0.0007)) < 1e-12, r
    # maker que só encosta no limite não preenche; o que atravessa preenche; 'taker' entra depois da espera
    so_encosta = np.array([100.0, 99.95, 99.95, 99.95])
    assert not ordem(ab, mx, so_encosta, 0, 1, 0.01, 0.01, 2, c, limite=99.95, espera=3)["preenchida"]
    r = ordem(ab, mx, so_encosta, 0, 1, 0.5, 0.5, 2, c, limite=99.95, espera=2, sem_preenchimento="taker")
    assert r["preenchida"] and r["minuto_entrada"] == 2, r
    r = ordem(ab, mx2, mn2, 0, 1, 0.05, 0.05, 2, c, limite=99.6, espera=3)
    assert r["preenchida"] and r["minuto_entrada"] == 1 and r["entrada"] == 99.6, r
    # gap além do stop sai na abertura
    r = ordem(np.array([100.0, 97.0, 97.0]), np.array([100.1, 97.1, 97.1]), np.array([99.9, 96.9, 96.9]),
              0, 1, stop=0.01, alvo=0.05, prazo=2, custos=c)
    assert r["saida"] == 97.0, r
    # funding: comprado paga 0,01% de um evento dentro da operação; o de depois da saída não conta
    r = ordem(ab, mx, mn, 0, 1, stop=0.5, alvo=0.5, prazo=3, custos=c, funding={90_000: 0.0001, 200_000: 1.0})
    assert abs(r["pnl_liquido"] - (-0.001 - 0.0001)) < 1e-12, r
    # posicoes: comprado nos candles 0..2, sai na abertura do 3
    assert abs(posicoes(np.array([100, 101, 103, 102.0]), [1, 1, 1], c) - (0.02 - 0.001)) < 1e-12
    # melhor plano: sobe e cai -> long depois short; ruído menor que a taxa -> não opera
    seq, v = melhor_plano(np.array([100, 101, 102, 103, 102, 101, 100.0]), c)
    assert list(seq) == [1, 1, 1, -1, -1, -1], seq
    assert abs(v - (2 * np.log(1.03) - 4 * 0.0005)) < 1e-12, v
    seq, v = melhor_plano(np.array([100, 100.01, 100, 100.01, 100.0]), c)
    assert not seq.any() and v == 0.0
    # o PnL exato do plano ótimo fica perto do valor em log da DP
    rng = np.random.default_rng(3)
    for _ in range(200):
        a = 100 * np.exp(np.cumsum(rng.normal(0, 0.002, HORIZONTE + 1)))
        seq, v = melhor_plano(a, Custos())
        assert abs(posicoes(a, seq) - v) < 2e-3 * max(1, abs(v) * 100), (posicoes(a, seq), v)
    print("rotulos ok")


if __name__ == "__main__":
    _testes()
