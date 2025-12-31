"""
EoS ML - Validation Script
Calcula métricas finais: Sharpe Ratio, Precision, Max Drawdown
"""

import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import precision_score, recall_score

# Paths
DATA_DIR = Path(__file__).parent.parent / "data"
MODEL_DIR = Path(__file__).parent.parent / "models"


def calculate_sharpe_ratio(returns, risk_free_rate=0.0):
    """Calcula Sharpe Ratio"""
    excess_returns = returns - risk_free_rate
    if excess_returns.std() == 0:
        return 0
    return np.sqrt(252) * excess_returns.mean() / excess_returns.std()


def calculate_max_drawdown(equity_curve):
    """Calcula Maximum Drawdown"""
    peak = equity_curve.expanding(min_periods=1).max()
    drawdown = (equity_curve - peak) / peak
    return drawdown.min() * -100  # Em percentual positivo


def validate_model():
    """Executa validação completa do modelo"""
    print("="*60)
    print("   EoS ML - Validação de Métricas")
    print("="*60)
    
    # Carregar dados originais
    df = pd.read_parquet(DATA_DIR / "signals.parquet")
    print(f"\nTotal sinais: {len(df)}")
    print(f"WIN original: {df['is_win'].sum()} | LOSS: {(~df['is_win'].astype(bool)).sum()}")
    
    # Usar is_win como target e score como "probabilidade"
    y = df['is_win'].values
    scores = df['score'].values
    profits = df['profit_pct'].fillna(0).values
    
    # Testar diferentes thresholds de SCORE
    print("\n" + "="*60)
    print("   Métricas por Score Threshold")
    print("="*60)
    
    results = []
    thresholds = [40, 50, 60, 70, 80]
    
    for thresh in thresholds:
        y_pred = (scores >= thresh).astype(int)
        trades = y_pred.sum()
        
        if trades > 0:
            # Métricas de classificação
            wins = ((y == 1) & (y_pred == 1)).sum()
            losses = ((y == 0) & (y_pred == 1)).sum()
            precision = wins / trades if trades > 0 else 0
            
            # Retornos reais
            trade_returns = profits[y_pred == 1] / 100
            
            # Sharpe Ratio
            if len(trade_returns) > 1 and trade_returns.std() > 0:
                sharpe = np.sqrt(252) * trade_returns.mean() / trade_returns.std()
            else:
                sharpe = 0
            
            # Max Drawdown
            if len(trade_returns) > 0:
                equity = (1 + pd.Series(trade_returns)).cumprod()
                peak = equity.expanding(min_periods=1).max()
                drawdown = (equity - peak) / peak
                max_dd = abs(drawdown.min()) * 100
            else:
                max_dd = 0
            
            total_return = trade_returns.sum() * 100
            
            results.append({
                'threshold': thresh,
                'trades': trades,
                'wins': wins,
                'losses': losses,
                'precision': precision * 100,
                'sharpe': sharpe,
                'max_dd': max_dd,
                'return': total_return,
            })
            
            print(f"\nThreshold {thresh:.0%}:")
            print(f"  Trades: {trades} ({wins} W / {losses} L)")
            print(f"  Precision: {precision*100:.1f}%")
            print(f"  Sharpe Ratio: {sharpe:.2f}")
            print(f"  Max Drawdown: {max_dd:.1f}%")
            print(f"  Total Return: {total_return:.1f}%")
    
    # Resumo
    print("\n" + "="*60)
    print("   RESUMO - Targets vs Resultados")
    print("="*60)
    
    best = max(results, key=lambda x: x['sharpe'])
    
    print(f"\nMelhor threshold: {best['threshold']:.0%}")
    print(f"\n{'Métrica':<20} {'Target':<15} {'Resultado':<15} {'Status'}")
    print("-" * 65)
    
    # Sharpe
    sharpe_ok = best['sharpe'] > 2.0
    print(f"{'Sharpe Ratio':<20} {'>2.0':<15} {best['sharpe']:.2f}{'':10} {'✅' if sharpe_ok else '❌'}")
    
    # Precision
    prec_ok = best['precision'] > 70
    print(f"{'Precision WIN':<20} {'>70%':<15} {best['precision']:.1f}%{'':9} {'✅' if prec_ok else '❌'}")
    
    # Drawdown
    dd_ok = best['max_dd'] < 15
    print(f"{'Max Drawdown':<20} {'<15%':<15} {best['max_dd']:.1f}%{'':9} {'✅' if dd_ok else '❌'}")
    
    # Salvar resultados
    results_df = pd.DataFrame(results)
    results_df.to_csv(DATA_DIR / "validation_results.csv", index=False)
    print(f"\nResultados salvos em: {DATA_DIR / 'validation_results.csv'}")
    
    return results_df


if __name__ == "__main__":
    validate_model()
