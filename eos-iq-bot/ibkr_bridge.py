"""
EoS IBKR Bridge - API para dados em tempo real do Interactive Brokers
Versão 4: Usando util.startLoop() para gerenciar event loop
"""
import math
from flask import Flask, jsonify
from ib_insync import IB, Forex, util
import threading
import logging
import time

# Necessário para ib_insync funcionar em contexto threaded
util.startLoop()

# Configuração de Logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("IBKR_Bridge")

app = Flask(__name__)

# Estado Global
ib = IB()
connected = False

def try_connect():
    """Tenta conectar ao Gateway"""
    global connected
    try:
        if not ib.isConnected():
            logger.info("Tentando conectar ao IB Gateway...")
            ib.connect('127.0.0.1', 4001, clientId=1, timeout=20)
            # Habilita dados delayed (gratuitos) se não tiver market data subscription
            ib.reqMarketDataType(3)  # 1=Live, 2=Frozen, 3=Delayed, 4=DelayedFrozen
            connected = True
            logger.info("Conectado ao IB Gateway! Modo: Delayed Market Data")
        else:
            connected = True
    except Exception as e:
        logger.error(f"Falha ao conectar: {e}")
        connected = False
        try:
            ib.disconnect()
        except:
            pass

def connection_monitor():
    """Thread de monitoramento de conexão"""
    while True:
        try_connect()
        time.sleep(15)

# Tenta conexão inicial
try_connect()

# Inicia thread de monitoramento
monitor_thread = threading.Thread(target=connection_monitor, daemon=True)
monitor_thread.start()

@app.route('/status')
def get_status():
    return jsonify({
        "connected": ib.isConnected(),
        "host": "127.0.0.1",
        "port": 4001,
        "clientId": 1
    })

@app.route('/market/price/<pair>')
def get_price(pair):
    if not ib.isConnected():
        return jsonify({"error": "IB Gateway desconectado"}), 503
    
    try:
        # Formato: EURUSD ou EUR/USD
        clean_pair = pair.replace("/", "").upper()
        if len(clean_pair) != 6:
            return jsonify({"error": "Par inválido"}), 400
        
        contract = Forex(pair=clean_pair)
        
        # Qualifica contrato
        ib.qualifyContracts(contract)
        
        # Usa dados históricos (último candle de 5 min) como proxy para preço atual
        # Isso funciona sem Market Data Subscription
        bars = ib.reqHistoricalData(
            contract,
            endDateTime='',
            durationStr='300 S',  # 5 minutos
            barSizeSetting='1 min',
            whatToShow='MIDPOINT',
            useRTH=False,
            timeout=10
        )
        
        if not bars:
            return jsonify({"error": "Sem dados disponíveis"}), 404
        
        last_bar = bars[-1]
        
        return jsonify({
            "symbol": pair,
            "bid": 0,  # Não disponível via histórico
            "ask": 0,  # Não disponível via histórico
            "last": last_bar.close,  # Preço de fechamento do último candle
            "open": last_bar.open,
            "high": last_bar.high,
            "low": last_bar.low,
            "time": last_bar.date.isoformat() if last_bar.date else None,
            "source": "historical"
        })
        
    except Exception as e:
        logger.error(f"Erro ao obter preço para {pair}: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/market/history/<pair>')
def get_history(pair):
    if not ib.isConnected():
        return jsonify({"error": "IB Gateway desconectado"}), 503
    
    try:
        clean_pair = pair.replace("/", "").upper()
        contract = Forex(pair=clean_pair)
        
        ib.qualifyContracts(contract)
        
        bars = ib.reqHistoricalData(
            contract,
            endDateTime='',
            durationStr='1 D',
            barSizeSetting='1 hour',
            whatToShow='MIDPOINT',
            useRTH=True
        )
        
        if not bars:
            return jsonify({"symbol": pair, "bars": []})
        
        return jsonify({
            "symbol": pair,
            "bars": [
                {
                    "date": bar.date.isoformat(),
                    "open": bar.open,
                    "high": bar.high,
                    "low": bar.low,
                    "close": bar.close,
                    "volume": bar.volume
                } for bar in bars
            ]
        })
        
    except Exception as e:
        logger.error(f"Erro ao obter histórico para {pair}: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/health')
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    logger.info("Iniciando EoS IBKR Bridge na porta 5000...")
    app.run(host="0.0.0.0", port=5000, threaded=True)
