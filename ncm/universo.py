"""Tarefa 1 do funding-ncm-carry.md: universo do carry escolhido por regra, sem olhar funding.

Regra: perpétuos *USDT que têm kline de futuros E de spot em 2020-12 no arquivo da Binance (inclui deslistados),
ordenados pelo volume em USDT dos futuros em 2020-12; ficam os 30 maiores.

    python3 -I ncm/universo.py
"""
import csv
import io
import json
import re
import sys
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from dados_binance import RAW, TIMEOUT_S, baixa_verificado  # noqa: E402

LISTA = "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?delimiter=/&prefix="
MES = "2020-12"
N = 30
SAIDA = AQUI / "universo-carry.json"
PASTAS = {"futuros": "futures/um/monthly/klines/{s}/1d", "spot": "spot/monthly/klines/{s}/1d"}


def simbolos_futuros() -> list[str]:
    """Todos os símbolos que já tiveram kline mensal de futuros USD-M (a listagem vem em páginas de 1000)."""
    prefixo, marcador, saida = "data/futures/um/monthly/klines/", "", []
    while True:
        with urllib.request.urlopen(f"{LISTA}{prefixo}&marker={marcador}", timeout=TIMEOUT_S) as r:
            xml = r.read().decode()
        saida += re.findall(rf"<Prefix>{prefixo}([^/<]+)/</Prefix>", xml)
        prox = re.search(r"<NextMarker>([^<]+)</NextMarker>", xml)
        if "<IsTruncated>true" not in xml or not prox:
            return sorted(set(saida))
        marcador = prox.group(1)


def volume(simbolo: str) -> float | None:
    """Volume em USDT dos futuros no mês, ou None se faltar futuros ou spot nesse mês."""
    caminhos = {}
    for mercado, pasta in PASTAS.items():
        nome = f"{simbolo}-1d-{MES}.zip"
        destino = RAW / f"universo_{mercado}_1d" / nome
        if baixa_verificado(pasta.format(s=simbolo), nome, destino).startswith("FALTA"):
            return None
        caminhos[mercado] = destino
    with zipfile.ZipFile(caminhos["futuros"]) as z, z.open(z.namelist()[0]) as f:
        return sum(float(c[7]) for c in csv.reader(io.TextIOWrapper(f)) if c and c[0].isdigit())


def main() -> int:
    # só nomes ASCII: os símbolos em chinês (2025) quebram a URL e não existiam em 2020-12
    todos = [s for s in simbolos_futuros() if re.fullmatch(r"[A-Z0-9]+USDT", s)]
    print(f"{len(todos)} símbolos *USDT no arquivo de futuros", flush=True)
    with ThreadPoolExecutor(8) as ex:
        vols = dict(zip(todos, ex.map(volume, todos)))
    validos = sorted(((v, s) for s, v in vols.items() if v is not None), reverse=True)
    print(f"{len(validos)} com futuros e spot em {MES}")
    escolhidos = [{"simbolo": s, f"volume_usdt_{MES.replace('-', '_')}": v} for v, s in validos[:N]]
    SAIDA.write_text(json.dumps({
        "regra": f"*USDT com kline de futuros e de spot em {MES}; {N} maiores por volume USDT dos futuros em {MES}",
        "candidatos": len(validos), "simbolos": escolhidos, "fora": [s for _, s in validos[N:]],
    }, indent=1))
    for i, e in enumerate(escolhidos, 1):
        print(f"{i:2} {e['simbolo']:12} {list(e.values())[1] / 1e9:8.2f} bi")
    print("fora:", ", ".join(s for _, s in validos[N:]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
