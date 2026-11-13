"""Task 1 do ncm-live-trading.md: baixa o histórico público da Binance (data.binance.vision) e confere a integridade.

Guarda os zips originais (já são CSV comprimido) em ~/.local/share/eos-ncm/raw, cada um verificado pelo SHA-256 que
a Binance publica ao lado. Depois confere se os klines de 1m de futuros cobrem todos os minutos do período.

    python3 -I ncm/dados_binance.py                       # BTCUSDT, 2026-02..2026-10, tudo
    python3 -I ncm/dados_binance.py --sem-aggtrades       # só klines + funding (rápido)
    python3 -I ncm/dados_binance.py --simbolo ETHUSDT
    python3 -I ncm/dados_binance.py --simbolo ETHUSDT --intervalo 1h --sem-aggtrades
    python3 -I ncm/dados_binance.py --selftest
"""
import argparse
import csv
import datetime as dt
import hashlib
import io
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

BASE_URL = "https://data.binance.vision/data"
RAW = Path.home() / ".local/share/eos-ncm/raw"
MINUTO_MS = 60_000
TIMEOUT_S = 60
BLOCO = 1 << 20

# (pasta remota, nome do arquivo); {s}=símbolo, {m}=AAAA-MM
CONJUNTOS = {
    "futuros_klines_1m": ("futures/um/monthly/klines/{s}/1m", "{s}-1m-{m}.zip"),
    "futuros_funding": ("futures/um/monthly/fundingRate/{s}", "{s}-fundingRate-{m}.zip"),
    "spot_klines_1m": ("spot/monthly/klines/{s}/1m", "{s}-1m-{m}.zip"),
    "futuros_aggtrades": ("futures/um/monthly/aggTrades/{s}", "{s}-aggTrades-{m}.zip"),
}


def meses(de: str, ate: str) -> list[str]:
    a, m = map(int, de.split("-"))
    fim = tuple(map(int, ate.split("-")))
    saida = []
    while (a, m) <= fim:
        saida.append(f"{a:04d}-{m:02d}")
        a, m = (a + 1, 1) if m == 12 else (a, m + 1)
    return saida


def sha256(caminho: Path) -> str:
    h = hashlib.sha256()
    with caminho.open("rb") as f:
        while bloco := f.read(BLOCO):
            h.update(bloco)
    return h.hexdigest()


def baixa(url: str, destino: Path) -> None:
    with urllib.request.urlopen(url, timeout=TIMEOUT_S) as r, destino.open("wb") as f:
        while bloco := r.read(BLOCO):
            f.write(bloco)


def baixa_verificado(pasta: str, nome: str, destino: Path) -> str:
    """Baixa um zip e o .CHECKSUM; só renomeia para o nome final se o SHA-256 bater. Devolve o status."""
    ok = destino.with_suffix(".zip.ok")
    if destino.exists() and ok.exists():
        return "já tinha"
    url = f"{BASE_URL}/{pasta}/{nome}"
    try:
        with urllib.request.urlopen(url + ".CHECKSUM", timeout=TIMEOUT_S) as r:
            esperado = r.read().decode().split()[0]
    except urllib.error.HTTPError as e:
        return f"FALTA ({e.code})"
    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_suffix(".zip.parcial")
    baixa(url, parcial)
    obtido = sha256(parcial)
    if obtido != esperado:
        parcial.unlink()
        raise RuntimeError(f"checksum não bate em {nome}: {obtido} != {esperado}")
    parcial.rename(destino)
    ok.write_text(esperado + "\n")
    return "baixado"


def aberturas_kline(zip_path: Path) -> list[int]:
    """open_time (ms) de cada linha; pula o cabeçalho que alguns arquivos têm."""
    with zipfile.ZipFile(zip_path) as z:
        with z.open(z.namelist()[0]) as f:
            linhas = csv.reader(io.TextIOWrapper(f, encoding="utf-8"))
            return [int(c[0]) for c in linhas if c and c[0].isdigit()]


def buracos(aberturas: list[int], inicio_ms: int, fim_ms: int) -> list[tuple[int, int]]:
    """Intervalos [de, até) de minutos ausentes entre inicio_ms e fim_ms (exclusivo)."""
    saida, esperado = [], inicio_ms
    for t in sorted(set(aberturas)):
        if t < inicio_ms or t >= fim_ms:
            continue
        if t > esperado:
            saida.append((esperado, t))
        esperado = t + MINUTO_MS
    if esperado < fim_ms:
        saida.append((esperado, fim_ms))
    return saida


def limites_mes(mes: str) -> tuple[int, int]:
    a, m = map(int, mes.split("-"))
    ini = dt.datetime(a, m, 1, tzinfo=dt.timezone.utc)
    fim = dt.datetime(a + (m == 12), 1 if m == 12 else m + 1, 1, tzinfo=dt.timezone.utc)
    return int(ini.timestamp() * 1000), int(fim.timestamp() * 1000)


def hora(ms: int) -> str:
    return dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc).strftime("%Y-%m-%d %H:%M")


def confere_klines(simbolo: str, lista_meses: list[str]) -> int:
    total = 0
    for mes in lista_meses:
        z = RAW / "futuros_klines_1m" / simbolo / f"{simbolo}-1m-{mes}.zip"
        if not z.exists():
            print(f"  {mes}: arquivo ausente")
            total += 1
            continue
        ini, fim = limites_mes(mes)
        ab = aberturas_kline(z)
        b = buracos(ab, ini, fim)
        print(f"  {mes}: {len(set(ab))}/{(fim - ini) // MINUTO_MS} minutos, {len(b)} buraco(s)")
        for de, ate in b:
            print(f"    falta {hora(de)} → {hora(ate)} ({(ate - de) // MINUTO_MS} min)")
        total += len(b)
    return total


def selftest() -> None:
    assert buracos([0, 60_000, 120_000], 0, 180_000) == []
    assert buracos([0, 120_000], 0, 180_000) == [(60_000, 120_000)]
    assert buracos([60_000], 0, 180_000) == [(0, 60_000), (120_000, 180_000)]
    assert buracos([], 0, 120_000) == [(0, 120_000)]
    assert meses("2026-11", "2027-02") == ["2026-11", "2026-12", "2027-01", "2027-02"]
    ini, fim = limites_mes("2026-02")
    assert fim - ini == 28 * 24 * 60 * MINUTO_MS
    print("selftest ok")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--simbolo", default="BTCUSDT")
    p.add_argument("--de", default="2026-02")
    p.add_argument("--ate", default="2026-10")
    p.add_argument("--sem-aggtrades", action="store_true")
    p.add_argument("--intervalo", default="1m", help="klines: 1m (padrão) ou 1h; outro intervalo vai para <conjunto>_<intervalo>")
    p.add_argument("--selftest", action="store_true")
    a = p.parse_args()
    if a.selftest:
        selftest()
        return 0
    lista = meses(a.de, a.ate)
    for conjunto, (pasta, nome) in CONJUNTOS.items():
        if a.sem_aggtrades and conjunto == "futuros_aggtrades":
            continue
        if "klines" in conjunto:
            conjunto, pasta, nome = (x.replace("1m", a.intervalo) for x in (conjunto, pasta, nome))
        for mes in lista:
            n = nome.format(s=a.simbolo, m=mes)
            status = baixa_verificado(pasta.format(s=a.simbolo), n, RAW / conjunto / a.simbolo / n)
            print(f"{conjunto:18} {mes}: {status}", flush=True)
    if a.intervalo != "1m":       # a conferência de buracos é por minuto; em 1h quem confere é o carregador
        return 0
    print("klines 1m de futuros:")
    return 1 if confere_klines(a.simbolo, lista) else 0


if __name__ == "__main__":
    sys.exit(main())
