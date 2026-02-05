import React, { useState, useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';

interface Signal {
    id: number;
    type: 'forex' | 'crypto';
    strategy: string;
    result: 'WIN' | 'LOSS';
    timestamp: string;
}

interface StrategyComparatorProps {
    signals: Signal[];
}

export const StrategyComparator: React.FC<StrategyComparatorProps> = ({ signals }) => {
    // Extrair estratégias únicas
    const strategies = useMemo(() => {
        const list = Array.from(new Set(signals.map(s => s.strategy))).sort();
        return list;
    }, [signals]);

    const [selectedStrategies, setSelectedStrategies] = useState<string[]>(
        strategies.length > 0 ? [strategies[0]] : []
    );

    const toggleStrategy = (strat: string) => {
        setSelectedStrategies(prev =>
            prev.includes(strat) ? prev.filter(s => s !== strat) : [...prev, strat]
        );
    };

    // Processar dados para o gráfico (Cumulative Wins over Time)
    const chartData = useMemo(() => {
        // Agrupar sinais por data/hora simplificada para o eixo X
        const sorted = [...signals].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        // Tipagem explícita para evitar noImplicitAny
        let cumulative: Record<string, number> = {};
        strategies.forEach(s => cumulative[s] = 0);

        return sorted.map(signal => {
            if (signal.result === 'WIN') cumulative[signal.strategy] += 1;
            // else if (signal.result === 'LOSS') cumulative[signal.strategy] -= 1; 

            return {
                timestamp: new Date(signal.timestamp).toLocaleTimeString(),
                ...cumulative
            };
        });
    }, [signals, strategies, selectedStrategies]);

    // Calcular stats por estratégia
    const stats = useMemo(() => {
        return strategies.map(strat => {
            const stratSignals = signals.filter(s => s.strategy === strat);
            const wins = stratSignals.filter(s => s.result === 'WIN').length;
            const total = stratSignals.length;
            const winRate = total > 0 ? (wins / total) * 100 : 0;
            return { name: strat, wins, total, winRate };
        });
    }, [signals, strategies]);

    return (
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-purple-400">📊</span> Comparador de Estratégias
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Controles (Esquerda) */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="text-sm text-slate-400 mb-2">Selecione para comparar:</div>
                    {stats.map(strat => (
                        <div
                            key={strat.name}
                            onClick={() => toggleStrategy(strat.name)}
                            className={`
                        cursor-pointer p-3 rounded-lg border transition-all flex justify-between items-center
                        ${selectedStrategies.includes(strat.name)
                                    ? 'bg-slate-700 border-blue-500 shadow-md'
                                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'}
                    `}
                        >
                            <div>
                                <div className="font-bold text-white">{strat.name}</div>
                                <div className="text-xs text-slate-400">{strat.total} sinais</div>
                            </div>
                            <div className={`text-sm font-bold ${strat.winRate > 55 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {strat.winRate.toFixed(1)}%
                            </div>
                        </div>
                    ))}
                </div>

                {/* Gráfico (Direita) */}
                <div className="lg:col-span-3 min-h-[300px] bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="timestamp" hide />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
                                itemStyle={{ color: '#fff' }}
                            />
                            <Legend />
                            {selectedStrategies.map((strat, index) => (
                                <Line
                                    key={strat}
                                    type="monotone"
                                    dataKey={strat}
                                    stroke={`hsl(${index * 60 + 200}, 70%, 60%)`}
                                    strokeWidth={2}
                                    dot={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
