"""Monitor em papel do carry de regime (opção 2 do funding-ncm-carry.md). Não opera: só registra a decisão.

Toda segunda 00 UTC: funding médio dos últimos 30 dias do universo (anualizado) x 2/3 - T-bill.
Liga acima de +2 pontos, desliga abaixo de 0 (mesma regra do `rotacao.py --opcao2`). Registra o que a G1 (3 maiores
fundings acima do T-bill) e a G2 (BTC + ETH) fariam. O resultado em dinheiro é calculado depois pelo backtest sobre
os arquivos da Binance; este registro prova qual foi a decisão em tempo real.

Só usa funding a partir de 2026-11-01: jul–out 2026 é o teste congelado e não pode ser lido. Por isso o primeiro
sinal sai na primeira segunda cuja janela de 30 dias começa em novembro (2026-12-07).
Se o computador ficou desligado, as segundas perdidas são registradas em ordem (a coluna registrado_em mostra o atraso).

    python3 -I ncm/monitor_carry.py            # registra as segundas ainda não registradas
    python3 -I ncm/monitor_carry.py --selftest
"""
import csv
import datetime as dt
import json
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
REGISTRO = Path.home() / ".local/share/eos-ncm/monitor/carry-regime.csv"
COLUNAS = ["segunda", "registrado_em", "estado", "sinal", "funding_universo", "tbill", "validos", "g1", "g2", "obs"]
DADOS_DESDE = dt.datetime(2026, 11, 1, tzinfo=dt.timezone.utc)      # antes disso é o teste congelado
PRIMEIRA = dt.datetime(2026, 11, 9, tzinfo=dt.timezone.utc)         # primeira segunda do registro
JANELA = dt.timedelta(days=30)
SEMANA = dt.timedelta(days=7)
MIN_EVENTOS = 60
FRACAO = 2 / 3                 # parte do capital que recebe funding a 2x
LIGA, DESLIGA = 0.02, 0.0
HORA_MS = 3_600_000
TIMEOUT_S = 30
FUNDING = "https://fapi.binance.com/fapi/v1/fundingRate?symbol={s}&startTime={a}&endTime={b}&limit=1000"
SPOT = "https://api.binance.com/api/v3/ticker/price"
FRED = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTB3&cosd={de}&coed={ate}"


def baixa(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=TIMEOUT_S) as r:
        return r.read()


def ultima_segunda(agora: dt.datetime) -> dt.datetime:
    d = agora.astimezone(dt.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return d - dt.timedelta(days=d.weekday())


def nota_anual(eventos: list[dict], seg_ms: int) -> float | None:
    """Funding anualizado das 720 horas antes da segunda; None com menos de 60 eventos (como no backtest)."""
    h = seg_ms // HORA_MS
    dentro = [float(e["fundingRate"]) for e in eventos if h - 720 <= round(int(e["fundingTime"]) / HORA_MS) <= h - 1]
    return sum(dentro) / 30 * 365 if len(dentro) >= MIN_EVENTOS else None


def decide(notas: dict[str, float], tbill: float, ligado: bool) -> tuple[bool, float, float, list[str]]:
    """(novo estado, sinal, funding médio do universo, 3 maiores acima do T-bill)."""
    media = sum(notas.values()) / len(notas)
    sinal = media * FRACAO - tbill
    novo = sinal > LIGA if not ligado else sinal >= DESLIGA
    top = [s for s in sorted(notas, key=notas.get, reverse=True) if notas[s] > tbill][:3]
    return novo, sinal, media, top


def tbill_antes(seg: dt.datetime) -> float:
    """Último T-bill de 3 meses publicado antes da segunda (FRED DTB3), em taxa anual."""
    de, ate = (seg - dt.timedelta(days=20)).date(), (seg - dt.timedelta(days=1)).date()
    linhas = list(csv.reader(baixa(FRED.format(de=de, ate=ate)).decode().splitlines()))[1:]
    valores = [float(v) for _, v in linhas if v not in ("", ".")]
    if not valores:
        raise RuntimeError("FRED não devolveu nenhum valor do T-bill")
    return valores[-1] / 100


def le_registro() -> list[dict]:
    if not REGISTRO.exists():
        return []
    with REGISTRO.open(newline="") as f:
        return list(csv.DictReader(f))


def grava(linha: dict) -> None:
    REGISTRO.parent.mkdir(parents=True, exist_ok=True)
    novo = not REGISTRO.exists()
    with REGISTRO.open("a", newline="") as f:
        w = csv.DictWriter(f, COLUNAS)
        if novo:
            w.writeheader()
        w.writerow(linha)


def avisa(texto: str) -> None:
    print(texto)
    if shutil.which("notify-send"):
        subprocess.run(["notify-send", "EOS carry monitor", texto], check=False)


def registra(seg: dt.datetime, registro: list[dict], simbolos: list[str]) -> dict:
    base = {"segunda": seg.date().isoformat(),
            "registrado_em": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}
    if seg - JANELA < DADOS_DESDE:
        print(f"{seg.date()}: aquecendo; o primeiro sinal sai quando a janela de 30 dias começar em novembro")
        return {**base, "estado": "AQUECENDO", "obs": "a janela de 30 dias ainda entra no teste congelado"}
    seg_ms = int(seg.timestamp() * 1000)
    no_spot = {p["symbol"] for p in json.loads(baixa(SPOT))}
    notas, fora = {}, []
    for s in simbolos:
        try:
            ev = json.loads(baixa(FUNDING.format(s=s, a=seg_ms - 721 * HORA_MS, b=seg_ms)))
        except urllib.error.HTTPError:          # símbolo deslistado dos futuros
            ev = []
        n = nota_anual(ev, seg_ms) if s in no_spot else None
        if n is None:
            fora.append(s)
        else:
            notas[s] = n
    if not notas:
        raise RuntimeError("nenhum símbolo com funding válido")
    tbill = tbill_antes(seg)
    anteriores = [r for r in registro if r["estado"] in ("LIGADO", "DESLIGADO")]
    ligado = bool(anteriores) and anteriores[-1]["estado"] == "LIGADO"
    novo, sinal, media, top = decide(notas, tbill, ligado)
    reordena = not ligado or seg.day <= 7                   # ao ligar e na 1ª segunda do mês; senão mantém
    g1 = top if reordena else anteriores[-1]["g1"].split()
    texto = (f"{seg.date()}: {'LIGADO' if novo else 'DESLIGADO'} (sinal {sinal:+.1%}; funding do universo {media:.1%} "
             f"a.a., T-bill {tbill:.1%}). G1: {' '.join(g1) if novo else 'caixa'}")
    if novo != ligado:
        avisa("MUDOU DE ESTADO. " + texto)
    else:
        print(texto)
    return {**base, "estado": "LIGADO" if novo else "DESLIGADO", "sinal": f"{sinal:.4f}",
            "funding_universo": f"{media:.4f}", "tbill": f"{tbill:.4f}", "validos": len(notas),
            "g1": " ".join(g1) if novo else "", "g2": "BTCUSDT ETHUSDT" if novo else "",
            "obs": ("sem dado: " + " ".join(fora)) if fora else ""}


def main() -> int:
    simbolos = [e["simbolo"] for e in json.loads((AQUI / "universo-carry.json").read_text())["simbolos"]]
    registro = le_registro()
    feitas = {r["segunda"] for r in registro}
    seg, fim = PRIMEIRA, ultima_segunda(dt.datetime.now(dt.timezone.utc))
    while seg <= fim:
        if seg.date().isoformat() not in feitas:
            linha = registra(seg, registro, simbolos)
            grava(linha)
            registro.append(linha)
        seg += SEMANA
    print(f"registro: {REGISTRO} ({len(registro)} segundas)")
    return 0


def selftest() -> None:
    seg = dt.datetime(2026, 12, 7, tzinfo=dt.timezone.utc)
    assert ultima_segunda(dt.datetime(2026, 12, 9, 15, tzinfo=dt.timezone.utc)) == seg
    assert ultima_segunda(seg) == seg and seg - JANELA >= DADOS_DESDE
    assert (seg - SEMANA) - JANELA < DADOS_DESDE and PRIMEIRA.weekday() == 0
    ms = int(seg.timestamp() * 1000)
    ev = [{"fundingTime": ms - k * 8 * HORA_MS + 7, "fundingRate": "0.0001"} for k in range(0, 100)]
    n = nota_anual(ev, ms)                      # o evento da própria segunda (k=0) e os de mais de 720 h ficam fora
    assert abs(n - 90 * 0.0001 / 30 * 365) < 1e-12
    assert nota_anual(ev[:50], ms) is None
    notas = {"A": 0.30, "B": 0.10, "C": 0.02, "D": 0.20}
    novo, sinal, media, top = decide(notas, 0.04, False)
    assert novo and abs(media - 0.155) < 1e-12 and abs(sinal - (0.155 * 2 / 3 - 0.04)) < 1e-12 and top == ["A", "D", "B"]
    assert decide({"A": 0.08}, 0.04, False)[0] is False       # +1,3 ponto: não liga
    assert decide({"A": 0.08}, 0.04, True)[0] is True         # mas, já ligado, continua
    assert decide({"A": 0.05}, 0.04, True)[0] is False        # abaixo dos juros: desliga
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(main())
