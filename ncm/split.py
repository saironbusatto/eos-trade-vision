"""Split sem vazamento (task 5 do ncm-live-trading.md).

Cada amostra é o minuto de decisão t (= `t_ms` das fotos) e o gabarito olha [t, t + 45 min]. Uma amostra só entra
numa parte se a janela inteira do gabarito cabe nela: isso é o embargo de 45 min em toda fronteira.

- treino: fev–mai; validação: jun (escolha de hiperparâmetro e limiar);
- 01–06/jul fica de fora: as teorias antigas foram descobertas olhando esses dias;
- teste: 07/jul–out, em 3 partes seguidas (a task 8 exige resultado nas 3). Congelado: `abre_teste` só abre
  uma vez por símbolo e deixa registrado quando.

    ~/.local/share/wow-voz/venv/bin/python -I ncm/split.py   # confere as fronteiras e conta as amostras
"""
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from replay import SAIDA  # noqa: E402

EMBARGO_MS = 45 * 60_000
TREINO, VALIDACAO, TESTE = 1, 2, 3
N_PARTES_TESTE = 3


def _ms(data: str) -> int:
    return int(datetime.fromisoformat(data).replace(tzinfo=timezone.utc).timestamp() * 1000)


# [ini, fim) em UTC
PARTES = {
    TREINO: (_ms("2026-02-01"), _ms("2026-06-01")),
    VALIDACAO: (_ms("2026-06-01"), _ms("2026-07-01")),
    TESTE: (_ms("2026-07-07"), _ms("2026-11-01")),
}
DIR_TRAVA = SAIDA.parent / "teste-aberto"


def parte(t_ms: np.ndarray) -> np.ndarray:
    """0 = fora (embargo, 01–06/jul ou fora do período); senão TREINO/VALIDACAO/TESTE."""
    out = np.zeros(len(t_ms), np.int8)
    for codigo, (ini, fim) in PARTES.items():
        out[(t_ms >= ini) & (t_ms + EMBARGO_MS <= fim)] = codigo
    return out


def parte_teste(t_ms: np.ndarray) -> np.ndarray:
    """1..3 = terço do teste por tempo (0 fora do teste); cada terço também respeita o embargo."""
    ini, fim = PARTES[TESTE]
    cortes = np.linspace(ini, fim, N_PARTES_TESTE + 1).astype(np.int64)
    out = np.zeros(len(t_ms), np.int8)
    for k in range(N_PARTES_TESTE):
        out[(t_ms >= cortes[k]) & (t_ms + EMBARGO_MS <= cortes[k + 1])] = k + 1
    return out


def carrega(simbolo: str = "BTCUSDT") -> dict[str, np.ndarray]:
    """Todas as fotos válidas do símbolo, em ordem de tempo, com a parte de cada uma."""
    arquivos = sorted(SAIDA.glob(f"{simbolo}-2026-*.npz"))
    assert arquivos, f"sem fotos em {SAIDA}"
    blocos = [np.load(a) for a in arquivos]
    nomes = blocos[0]["nomes"]
    assert all((b["nomes"] == nomes).all() for b in blocos), "features diferentes entre meses"
    ok = [b["valido"] for b in blocos]
    t = np.concatenate([b["t_ms"][v] for b, v in zip(blocos, ok)])
    assert (np.diff(t) > 0).all(), "tempos repetidos ou fora de ordem entre meses"
    return {"t_ms": t, "X": np.concatenate([b["X"][v] for b, v in zip(blocos, ok)]),
            "preco": np.concatenate([b["preco"][v] for b, v in zip(blocos, ok)]), "nomes": nomes, "parte": parte(t)}


def _filtra(d: dict[str, np.ndarray], m: np.ndarray) -> dict[str, np.ndarray]:
    return {k: (v if k == "nomes" else v[m]) for k, v in d.items()}


def sem_teste(d: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Treino + validação: o que as tasks 6 e 7 usam para qualquer escolha."""
    return _filtra(d, (d["parte"] == TREINO) | (d["parte"] == VALIDACAO))


def abre_teste(d: dict[str, np.ndarray], simbolo: str = "BTCUSDT", motivo: str = "") -> dict[str, np.ndarray]:
    """Devolve o teste UMA vez por símbolo (task 8). Para abrir de novo, apague a trava de propósito."""
    DIR_TRAVA.mkdir(parents=True, exist_ok=True)
    trava = DIR_TRAVA / f"{simbolo}.txt"
    if trava.exists():
        raise RuntimeError(f"teste de {simbolo} já foi aberto: {trava.read_text().strip()}")
    trava.write_text(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {motivo}\n")
    out = _filtra(d, d["parte"] == TESTE)
    out["terco"] = parte_teste(out["t_ms"])
    return out


def confere(t: np.ndarray, p: np.ndarray) -> None:
    """O gabarito de toda amostra cabe na própria parte e as partes não se misturam no tempo."""
    for codigo, (ini, fim) in PARTES.items():
        tc = t[p == codigo]
        assert not len(tc) or (tc.min() >= ini and tc.max() + EMBARGO_MS <= fim), codigo
    assert (np.diff(p[p > 0]) >= 0).all(), "partes fora de ordem no tempo"
    for a, b in ((TREINO, VALIDACAO), (VALIDACAO, TESTE)):
        if (p == a).any() and (p == b).any():
            assert t[p == a].max() + EMBARGO_MS <= t[p == b].min(), f"embargo violado entre {a} e {b}"


def _testes() -> None:
    minuto = 60_000
    t = np.arange(_ms("2026-05-31T23:00"), _ms("2026-06-01T01:00"), minuto) + minuto
    p = parte(t)
    fim_treino = _ms("2026-06-01")
    assert (p[t + EMBARGO_MS <= fim_treino] == TREINO).all()
    assert (p[(t + EMBARGO_MS > fim_treino) & (t < fim_treino)] == 0).all()  # 45 min de embargo
    assert (p[t >= fim_treino] == VALIDACAO).all()
    assert parte(np.array([_ms("2026-07-03")]))[0] == 0  # 01–06/jul fora
    terco = parte_teste(np.arange(*PARTES[TESTE], minuto))
    assert set(np.unique(terco)) == {0, 1, 2, 3} and abs(int((terco == 1).sum()) - int((terco == 3).sum())) < 50
    confere(t, p)
    print("split ok")


if __name__ == "__main__":
    _testes()
    d = carrega()
    confere(d["t_ms"], d["parte"])
    for codigo, nome in ((TREINO, "treino"), (VALIDACAO, "validação"), (TESTE, "teste"), (0, "fora")):
        print(f"{nome:10s} {int((d['parte'] == codigo).sum()):7d} minutos")
    t3 = parte_teste(d["t_ms"])
    print("terços do teste:", [int((t3 == k).sum()) for k in range(1, N_PARTES_TESTE + 1)])
