import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BotTabs } from "@/components/analytics/BotTabs";
import { Scoreboard } from "@/components/analytics/Scoreboard";
import { StrategyComparator } from "@/components/analytics/StrategyComparator";
import { Activity, RefreshCw, Loader2, Filter, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderBookWidget } from "@/components/OrderBookWidget";

// Configuração da API
const gatewayApiUrl = import.meta.env.VITE_GATEWAY_API_URL || 'https://eos.s-iron.tech';

export default function Analytics() {
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'general' | 'forex' | 'crypto'>('general');
    const [analyticsData, setAnalyticsData] = useState<any>(null);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

    // Filtros
    const [selectedStrategy, setSelectedStrategy] = useState<string>('all');
    const [selectedTimeframe, setSelectedTimeframe] = useState<string>('all');
    const [availableStrategies, setAvailableStrategies] = useState<string[]>([]);
    const [availableTimeframes, setAvailableTimeframes] = useState<number[]>([]);

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            // Monta query params
            const params = new URLSearchParams();
            params.append('bot', activeTab === 'general' ? 'all' : activeTab);
            if (selectedStrategy !== 'all') params.append('strategy', selectedStrategy);
            if (selectedTimeframe !== 'all') params.append('timeframe', selectedTimeframe);

            const res = await fetch(`${gatewayApiUrl}/api/gateway/analytics?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setAnalyticsData(data);
                setLastUpdate(new Date());

                // Atualiza filtros disponíveis
                if (data.filters) {
                    setAvailableStrategies(data.filters.strategies || []);
                    setAvailableTimeframes(data.filters.timeframes || []);
                }
            }
        } catch (error) {
            console.error("Falha ao buscar analytics:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnalytics();
        const interval = setInterval(fetchAnalytics, 30000);
        return () => clearInterval(interval);
    }, [activeTab, selectedStrategy, selectedTimeframe]);

    const filterSignals = () => {
        if (!analyticsData?.signals) return [];
        return analyticsData.signals;
    };

    const edgeCells: any[] = analyticsData?.edgeStats?.cells || [];
    const bestEdges = [...edgeCells]
        .sort((a, b) => (b.expectancy_ci95_low || 0) - (a.expectancy_ci95_low || 0))
        .slice(0, 8);
    const worstEdges = [...edgeCells]
        .sort((a, b) => (a.expectancy_ci95_low || 0) - (b.expectancy_ci95_low || 0))
        .slice(0, 8);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30">
            <Header />

            <main className="container mx-auto px-4 py-8 space-y-8">
                {/* Cabeçalho e Controles */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                            Performance Analytics
                        </h1>
                        <p className="text-slate-400 mt-1 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-400" />
                            Monitoramento em tempo real dos bots de alta frequência
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 hidden md:inline">
                            Atualizado: {lastUpdate.toLocaleTimeString()}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchAnalytics}
                            disabled={loading}
                            className="bg-slate-900 border-slate-700 hover:bg-slate-800"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        </Button>
                    </div>
                </div>

                {/* Abas de Navegação */}
                <BotTabs activeTab={activeTab} onTabChange={setActiveTab} />

                {/* Filtros */}
                <div className="flex flex-wrap gap-4 items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-400">Filtros:</span>
                    </div>

                    {/* Estratégia */}
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-500">Estratégia:</label>
                        <select
                            value={selectedStrategy}
                            onChange={(e) => setSelectedStrategy(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">Todas</option>
                            {availableStrategies.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    {/* Timeframe */}
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-slate-500" />
                        <label className="text-sm text-slate-500">Timeframe:</label>
                        <select
                            value={selectedTimeframe}
                            onChange={(e) => setSelectedTimeframe(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">Todos</option>
                            {availableTimeframes.map(tf => (
                                <option key={tf} value={tf}>{tf} min</option>
                            ))}
                        </select>
                    </div>

                    {/* Reset */}
                    {(selectedStrategy !== 'all' || selectedTimeframe !== 'all') && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSelectedStrategy('all');
                                setSelectedTimeframe('all');
                            }}
                            className="text-slate-400 hover:text-white"
                        >
                            Limpar filtros
                        </Button>
                    )}
                </div>

                {loading && !analyticsData ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                    </div>
                ) : analyticsData ? (
                    <>
                        {/* Placar Geral */}
                        <Scoreboard data={analyticsData} />

                        {/* Stats por Estratégia */}
                        {analyticsData.strategyStats && Object.keys(analyticsData.strategyStats).length > 0 && (
                            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                    <span className="text-amber-400">📊</span> Performance por Estratégia
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {Object.entries(analyticsData.strategyStats).map(([name, stats]: [string, any]) => (
                                        <div key={name} className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-bold text-white">{name}</span>
                                                <span className={`text-lg font-bold ${stats.winRate >= 55 ? 'text-emerald-400' : stats.winRate >= 45 ? 'text-amber-400' : 'text-red-400'}`}>
                                                    {stats.winRate.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm text-slate-400">
                                                <span>✅ {stats.wins} wins</span>
                                                <span>❌ {stats.losses} losses</span>
                                                <span>Total: {stats.total}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {edgeCells.length > 0 && (
                            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <span className="text-cyan-400">🧮</span> Edge Matrix (Hora UTC x Direção)
                                </h3>
                                <p className="text-xs text-slate-400">
                                    Gate matemático com IC95. Min trades: {analyticsData.edgeStats?.min_trades ?? 80}
                                </p>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <div className="bg-slate-900/50 rounded-lg border border-slate-700/50 p-4">
                                        <h4 className="text-sm font-semibold text-emerald-300 mb-3">Top Edges (IC95 Expectancy)</h4>
                                        <div className="space-y-2">
                                            {bestEdges.map((cell, i) => (
                                                <div key={`best-${i}`} className="text-xs text-slate-300 flex justify-between gap-3">
                                                    <span className="font-mono">{String(cell.hour_utc).padStart(2, '0')}h {cell.action}</span>
                                                    <span>N={cell.trades}</span>
                                                    <span>WR {Number(cell.win_rate).toFixed(1)}%</span>
                                                    <span className="text-emerald-300">IC95 low E {Number(cell.expectancy_ci95_low).toFixed(3)}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="bg-slate-900/50 rounded-lg border border-slate-700/50 p-4">
                                        <h4 className="text-sm font-semibold text-rose-300 mb-3">Weak Edges (Evitar)</h4>
                                        <div className="space-y-2">
                                            {worstEdges.map((cell, i) => (
                                                <div key={`worst-${i}`} className="text-xs text-slate-300 flex justify-between gap-3">
                                                    <span className="font-mono">{String(cell.hour_utc).padStart(2, '0')}h {cell.action}</span>
                                                    <span>N={cell.trades}</span>
                                                    <span>WR {Number(cell.win_rate).toFixed(1)}%</span>
                                                    <span className="text-rose-300">IC95 low E {Number(cell.expectancy_ci95_low).toFixed(3)}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Comparador de Estratégias */}
                        <StrategyComparator signals={filterSignals()} />

                        {/* Order Book */}
                        <div className="mt-8">
                            <OrderBookWidget />
                        </div>
                    </>
                ) : (
                    <div className="text-center py-20 text-slate-500">
                        Falha ao carregar dados. Verifique a conexão com o Gateway.
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
}
