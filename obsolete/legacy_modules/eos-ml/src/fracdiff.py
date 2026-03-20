"""
Fractional Differentiation - Implementação Manual
Baseado no método de Kaabar para tratamento de séries não estacionárias.
"""

import numpy as np
import pandas as pd


def get_weights(d: float, size: int) -> np.ndarray:
    """
    Calcula os pesos para diferenciação fracionária.
    
    Args:
        d: Ordem de diferenciação (0 < d < 1)
        size: Número de pesos a calcular
    
    Returns:
        Array de pesos
    """
    w = [1.0]
    for k in range(1, size):
        w.append(-w[-1] * (d - k + 1) / k)
    return np.array(w[::-1])


def fracdiff(series: np.ndarray, d: float, thresh: float = 1e-5) -> np.ndarray:
    """
    Aplica diferenciação fracionária em uma série.
    
    Args:
        series: Série temporal (numpy array)
        d: Ordem de diferenciação (0 < d < 1)
        thresh: Threshold para truncar pesos pequenos
    
    Returns:
        Série diferenciada
    """
    if d == 0:
        return series
    
    # Calcular pesos até que fiquem muito pequenos
    weights = []
    w = 1.0
    weights.append(w)
    k = 1
    while True:
        w = -w * (d - k + 1) / k
        if abs(w) < thresh:
            break
        weights.append(w)
        k += 1
        if k > len(series):
            break
    
    weights = np.array(weights[::-1])
    width = len(weights)
    
    # Aplicar diferenciação
    result = np.full(len(series), np.nan)
    for i in range(width - 1, len(series)):
        result[i] = np.dot(weights, series[i - width + 1:i + 1])
    
    return result


def fdiff(series: np.ndarray, d: float) -> np.ndarray:
    """Alias para fracdiff (compatibilidade com fracdiff package)"""
    return fracdiff(series, d)


if __name__ == "__main__":
    # Teste
    np.random.seed(42)
    test_series = np.cumsum(np.random.randn(100))  # Random walk
    
    print("=== Teste FracDiff ===")
    print(f"Original: {test_series[:5]}")
    
    result = fracdiff(test_series, d=0.4)
    print(f"FracDiff(d=0.4): {result[:5]}")
    print(f"NaN count: {np.isnan(result).sum()}")
