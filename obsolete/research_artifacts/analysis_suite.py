import sqlite3
import pandas as pd
import numpy as np
import os

DB_PATH = 'eos-telegram-bot/data/eos.db'
REPORT_PATH = 'analysis_report.txt'

def generate_report():
    print(f"📊 Gerando Relatório Estatístico: {REPORT_PATH}")
    
    conn = sqlite3.connect(DB_PATH)
    
    # 1. Carregar Dados Limpos
    query = """
    SELECT 
        id, symbol, action, entry_price, result, created_at,
        mfe, mae, vwap, asset_type
    FROM signals 
    WHERE asset_type = 'CRYPTO'
    """
    df = pd.read_sql_query(query, conn)
    
    # Conversões
    df['created_at'] = pd.to_datetime(df['created_at'])
    df['hour'] = df['created_at'].dt.hour
    df['mfe'] = pd.to_numeric(df['mfe'], errors='coerce')
    df['mae'] = pd.to_numeric(df['mae'], errors='coerce')
    
    with open(REPORT_PATH, 'w', encoding='utf-8') as f:
        f.write("RELATÓRIO ESTATÍSTICO DE TRADING (CRYPTO)\n")
        f.write("=========================================\n\n")
        
        # GERAL
        f.write(f"1. VISÃO GERAL\n")
        f.write(f"   Total de Trades: {len(df)}\n")
        f.write(f"   Período: {df['created_at'].min()} a {df['created_at'].max()}\n")
        win_rate = (df['result'] == 'WIN').mean()
        f.write(f"   Win Rate Global: {win_rate:.2%}\n\n")
        
        # POR HORÁRIO
        f.write(f"2. EFICIÊNCIA POR HORÁRIO (UTC)\n")
        hourly = df.groupby('hour')['result'].apply(lambda x: (x=='WIN').mean())
        best_hour = hourly.idxmax()
        worst_hour = hourly.idxmin()
        f.write(f"   Melhor Horário: {best_hour}h ({hourly.max():.2%})\n")
        f.write(f"   Pior Horário:   {worst_hour}h ({hourly.min():.2%})\n")
        f.write("   Detalhe Hora a Hora:\n")
        for h, rate in hourly.items():
            f.write(f"   {h:02d}h: {rate:.1%} ({len(df[df['hour']==h])} trades)\n")
        f.write("\n")
        
        # RISCO (MFE/MAE)
        valid_metrics = df.dropna(subset=['mfe', 'mae'])
        f.write(f"3. ANÁLISE DE RISCO (Baseado em {len(valid_metrics)} trades com métricas)\n")
        
        avg_mfe = valid_metrics['mfe'].mean()
        avg_mae = valid_metrics['mae'].mean()
        
        f.write(f"   MFE Médio (Potencial de Lucro): {avg_mfe:.2f}%\n")
        f.write(f"   MAE Médio (Drawdown Médio):     {avg_mae:.2f}%\n")
        
        # Simulação de Stop
        f.write("\n   Simulação de Stop Loss (Se tivéssemos stopado em X%):\n")
        for stop in [0.3, 0.5, 0.8, 1.0, 1.5, 2.0]:
            # Se MAE > stop, trade seria LOSS
            # O Win Rate teórico seria: trades onde MAE < stop E resultado original foi WIN
            # (Simplificação: assumindo que o TP original seria atingido se não stopasse)
            
            survived = valid_metrics[valid_metrics['mae'] < stop]
            # Desses que sobreviveram, quantos foram WIN original?
            # (Nota: isso é otimista, pois alguns LOSS originais poderiam ter stopado antes. 
            # Mas serve como teto de eficiência).
            
            # Melhor abordagem:
            # Se MAE > stop -> LOSS
            # Se MAE < stop -> Mantém resultado original
            
            simulated_results = valid_metrics.copy()
            simulated_results['sim_result'] = np.where(simulated_results['mae'] > stop, 'LOSS', simulated_results['result'])
            sim_win_rate = (simulated_results['sim_result'] == 'WIN').mean()
            
            f.write(f"   Stop {stop}% -> Win Rate: {sim_win_rate:.2%}\n")

    conn.close()
    print(f"✅ Relatório salvo em: {os.path.abspath(REPORT_PATH)}")

if __name__ == "__main__":
    generate_report()
