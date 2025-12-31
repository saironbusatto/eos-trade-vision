"""
EoS IQ ML - Interactive Brokers Connection
Busca dados de Forex SPOT via IBKR API.
"""

import asyncio
import sys

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

from ib_insync import IB, Forex, util
import pandas as pd
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# Pares Forex SPOT
FOREX_PAIRS = [
    ('EUR', 'USD'),
    ('GBP', 'USD'),
    ('USD', 'JPY'),
    ('AUD', 'USD'),
    ('USD', 'CAD'),
    ('USD', 'CHF'),
    ('NZD', 'USD'),
    ('EUR', 'GBP'),
    ('GBP', 'JPY'),
    ('AUD', 'CAD'),
]


async def main_async():
    print("="*60)
    print("   EoS IQ - IBKR Forex Spot Data Fetcher")
    print("="*60)
    
    ib = IB()
    
    # Tentar conectar
    ports = [4001, 7497, 4002, 7496]
    connected = False
    
    for port in ports:
        try:
            print(f"Tentando porta {port}... ", end='', flush=True)
            await ib.connectAsync('127.0.0.1', port, clientId=1)
            print(f"✅ Conectado!")
            connected = True
            break
        except Exception as e:
            print(f"❌")
    
    if not connected:
        print("\n❌ Não foi possível conectar ao IBKR")
        return
    
    print("\n" + "="*60)
    print("   Baixando Forex Spot")
    print("="*60)
    
    all_data = []
    
    for base, quote in FOREX_PAIRS:
        pair_name = f"{base}/{quote}"
        print(f"\n{pair_name}... ", end='', flush=True)
        
        try:
            # Criar contrato Forex
            contract = Forex(base + quote)
            
            # Qualificar
            contracts = await ib.qualifyContractsAsync(contract)
            
            if not contracts:
                print("❌ Contrato inválido")
                continue
            
            # Buscar dados históricos
            bars = await ib.reqHistoricalDataAsync(
                contract,
                endDateTime='',
                durationStr='5 D',
                barSizeSetting='5 mins',
                whatToShow='MIDPOINT',
                useRTH=False,
                formatDate=1
            )
            
            if bars:
                df = util.df(bars)
                df['pair'] = pair_name
                df['datetime'] = pd.to_datetime(df['date'])
                df['hour'] = df['datetime'].dt.hour
                all_data.append(df)
                print(f"✅ {len(df)} candles")
            else:
                print("❌ Sem dados")
                
        except Exception as e:
            print(f"❌ {str(e)[:50]}")
    
    ib.disconnect()
    
    if not all_data:
        print("\n❌ Nenhum dado obtido")
        return
    
    # Consolidar
    df = pd.concat(all_data, ignore_index=True)
    
    # Análise
    print("\n" + "="*60)
    print("   Análise dos Dados IBKR")
    print("="*60)
    
    df['return'] = df.groupby('pair')['close'].pct_change() * 100
    
    print(f"\nTotal: {len(df)} candles de {df['pair'].nunique()} pares")
    
    for pair in df['pair'].unique():
        subset = df[df['pair'] == pair].dropna(subset=['return'])
        call_wr = (subset['return'] > 0).mean() * 100
        print(f"  {pair}: CALL={call_wr:.1f}% | PUT={100-call_wr:.1f}% ({len(subset)} trades)")
    
    # Salvar
    output = DATA_DIR / "ibkr_forex.parquet"
    df.to_parquet(output)
    print(f"\n✅ Salvo: {output}")


if __name__ == "__main__":
    asyncio.run(main_async())
