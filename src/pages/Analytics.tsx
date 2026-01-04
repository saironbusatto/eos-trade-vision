import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '@/components/auth/AuthGuard';
import {
    TrendingUp, TrendingDown, Target, Clock,
    LogOut, RefreshCw, Trophy, AlertTriangle,
    Server, ExternalLink, Power
} from 'lucide-react';

// KPI Card Component
interface KPICardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactNode;
    color: 'green' | 'red' | 'amber' | 'blue';
}

function KPICard({ title, value, subtitle, icon, color }: KPICardProps) {
    const colorClasses = {
        green: 'from-green-500/20 to-green-600/20 border-green-500/30',
        red: 'from-red-500/20 to-red-600/20 border-red-500/30',
        amber: 'from-amber-500/20 to-amber-600/20 border-amber-500/30',
        blue: 'from-blue-500/20 to-blue-600/20 border-blue-500/30',
    };
    const iconColors = {
        green: 'text-green-400',
        red: 'text-red-400',
        amber: 'text-amber-400',
        blue: 'text-blue-400',
    };

    return (
        <div className={`bg-gradient-to-br ${colorClasses[color]} backdrop-blur-xl rounded-2xl border p-6 shadow-lg`}>
            <div className="flex items-center justify-between mb-4">
                <span className="text-slate-400 text-sm font-medium">{title}</span>
                <div className={iconColors[color]}>{icon}</div>
            </div>
            <div className="text-3xl font-bold text-white mb-1">{value}</div>
            {subtitle && <div className="text-slate-400 text-sm">{subtitle}</div>}
        </div>
    );
}

const initialStats = {
    golden: { wins: 0, losses: 0, total: 0, winRate: 0 },
    all: { wins: 0, losses: 0, total: 0, winRate: 0 },
    pendentes: 0,
    melhorPar: '-',
    melhorHorario: '-'
};

export default function Analytics() {
    const navigate = useNavigate();
    const [stats, setStats] = useState(initialStats);
    const [loading, setLoading] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(new Date());
    const [showGatewayPanel, setShowGatewayPanel] = useState(false);

    // API Gateway URL (relative via Nginx proxy)
    const gatewayApiUrl = '';

    // Gateway State
    const [gatewayStatus, setGatewayStatus] = useState<{
        running: boolean;
        containerId?: string;
        uptime?: string;
        lastLog?: string;
        ports?: string;
    } | null>(null);
    const [gatewayLogs, setGatewayLogs] = useState<string[]>([]);
    const [gatewayLoading, setGatewayLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'logs' | 'vnc'>('logs');

    // Bot System Status
    const [systemStatus, setSystemStatus] = useState<{
        forex: 'online' | 'stopped' | 'errored',
        crypto: 'online' | 'stopped' | 'errored',
        gateway: 'online' | 'stopped' | 'errored'
    }>({ forex: 'stopped', crypto: 'stopped', gateway: 'stopped' });

    // Fetch Bot Stats from SQLite via Gateway API
    const fetchStats = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${gatewayApiUrl}/api/gateway/stats`);
            if (res.ok) {
                const data = await res.json();
                setStats(data);
                setLastUpdate(new Date());
            }
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        } finally {
            setLoading(false);
        }
    };

    // Fetch System Status (PM2)
    const fetchSystemStatus = async () => {
        try {
            const res = await fetch(`${gatewayApiUrl}/api/gateway/system`);
            if (res.ok) {
                const data = await res.json();
                setSystemStatus(data);
            }
        } catch (error) {
            console.error('Failed to fetch system status:', error);
        }
    };

    const fetchGatewayStatus = async () => {
        try {
            const res = await fetch(`${gatewayApiUrl}/api/gateway/status`);
            const data = await res.json();
            setGatewayStatus(data);
        } catch (e) {
            setGatewayStatus({ running: false });
        }
    };

    const fetchGatewayLogs = async () => {
        try {
            const res = await fetch(`${gatewayApiUrl}/api/gateway/logs`);
            const data = await res.json();
            setGatewayLogs(data.logs || []);
        } catch (e) {
            setGatewayLogs([]);
        }
    };

    const restartGateway = async () => {
        setGatewayLoading(true);
        try {
            await fetch(`${gatewayApiUrl}/api/gateway/restart`, { method: 'POST' });
            await new Promise(r => setTimeout(r, 3000));
            await fetchGatewayStatus();
            if (viewMode === 'logs') await fetchGatewayLogs();
        } finally {
            setGatewayLoading(false);
        }
    };

    const stopGateway = async () => {
        setGatewayLoading(true);
        try {
            await fetch(`${gatewayApiUrl}/api/gateway/stop`, { method: 'POST' });
            await new Promise(r => setTimeout(r, 2000));
            await fetchGatewayStatus();
        } finally {
            setGatewayLoading(false);
        }
    };

    const startGateway = async () => {
        setGatewayLoading(true);
        try {
            await fetch(`${gatewayApiUrl}/api/gateway/start`, { method: 'POST' });
            await new Promise(r => setTimeout(r, 5000)); // Espera container subir
            await fetchGatewayStatus();
        } finally {
            setGatewayLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        fetchSystemStatus();
        fetchGatewayStatus();

        // Auto-refresh stats every 30s
        const interval = setInterval(() => {
            fetchStats();
            fetchSystemStatus();
        }, 30000);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (showGatewayPanel && viewMode === 'logs') {
            fetchGatewayStatus();
            fetchGatewayLogs();
            const interval = setInterval(() => {
                fetchGatewayStatus();
                fetchGatewayLogs();
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [showGatewayPanel, viewMode]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
            {/* Header */}
            <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
                <div className="container mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <Target className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                            EoS Trade Vision
                        </span>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* System Status Indicators */}
                        <div className="flex items-center gap-4 text-xs font-medium bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700">
                            <div className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${systemStatus.forex === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></span>
                                <span className={systemStatus.forex === 'online' ? 'text-green-400' : 'text-slate-400'}>Forex Bot</span>
                            </div>
                            <div className="w-px h-3 bg-slate-700"></div>
                            <div className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${systemStatus.crypto === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-slate-500'}`}></span>
                                <span className={systemStatus.crypto === 'online' ? 'text-green-400' : 'text-slate-400'}>Crypto Bot</span>
                            </div>
                            <div className="w-px h-3 bg-slate-700"></div>
                            <div className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${systemStatus.gateway === 'online' ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]' : 'bg-red-500'}`}></span>
                                <span className={systemStatus.gateway === 'online' ? 'text-indigo-400' : 'text-slate-400'}>API Gateway</span>
                            </div>
                        </div>

                        <div className="h-4 w-px bg-slate-800"></div>

                        <button
                            onClick={() => { fetchStats(); fetchSystemStatus(); }}
                            className={`p-2 hover:bg-slate-800 rounded-lg transition-all ${loading ? 'animate-spin text-indigo-400' : 'text-slate-400 hover:text-white'}`}
                            title="Atualizar dados"
                        >
                            <RefreshCw className="h-5 w-5" />
                        </button>

                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-red-500/10 hover:border-red-500/20 border border-transparent rounded-lg transition-all"
                        >
                            <LogOut className="h-4 w-4" />
                            <span>Sair</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-6 py-8">
                {/* Status Bar */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-2">Painel de Performance</h1>
                        <p className="text-slate-400 flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4" />
                            Última atualização: {lastUpdate.toLocaleTimeString()}
                        </p>
                    </div>

                    <button
                        onClick={() => setShowGatewayPanel(!showGatewayPanel)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${showGatewayPanel
                            ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                    >
                        <Server className="h-4 w-4" />
                        {showGatewayPanel ? 'Ocultar Gateway Control' : 'IB Gateway Control'}
                    </button>
                </div>

                {/* Gateway Control Panel */}
                {showGatewayPanel && (
                    <div className="mb-10 bg-slate-900/80 backdrop-blur-xl border border-indigo-500/20 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between bg-slate-900/50">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <div className={`h-2.5 w-2.5 rounded-full ${gatewayStatus?.running ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
                                IB Gateway Status
                            </h3>
                            <div className="flex items-center gap-2 bg-slate-950/50 p-1 rounded-lg">
                                <button
                                    onClick={() => setViewMode('logs')}
                                    className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${viewMode === 'logs' ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    Logs
                                </button>
                                <button
                                    onClick={() => setViewMode('vnc')}
                                    className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${viewMode === 'vnc' ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    VNC Real
                                </button>
                            </div>
                        </div>

                        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Controller */}
                            <div className="space-y-6">
                                <div className="bg-slate-950/50 rounded-xl p-5 border border-slate-800">
                                    <div className="flex justify-between items-center mb-4">
                                        <span className="text-slate-400 text-sm">Status Atual</span>
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${gatewayStatus?.running ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                            {gatewayStatus?.running ? 'RUNNING' : 'STOPPED'}
                                        </span>
                                    </div>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Container ID:</span>
                                            <span className="font-mono text-slate-300">{gatewayStatus?.containerId || '-'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Uptime:</span>
                                            <span className="text-slate-300">{gatewayStatus?.uptime || '-'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Ports:</span>
                                            <span className="text-slate-300">{gatewayStatus?.ports ? '4001, 5900' : '-'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <button
                                        onClick={startGateway}
                                        disabled={gatewayLoading || gatewayStatus?.running}
                                        className="py-2.5 px-4 rounded-lg bg-green-500/10 text-green-400 font-medium hover:bg-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed border border-green-500/20 transition-colors flex flex-col items-center justify-center gap-1"
                                    >
                                        <Power className="h-4 w-4" />
                                        Iniciar
                                    </button>
                                    <button
                                        onClick={stopGateway}
                                        disabled={gatewayLoading || !gatewayStatus?.running}
                                        className="py-2.5 px-4 rounded-lg bg-red-500/10 text-red-400 font-medium hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed border border-red-500/20 transition-colors flex flex-col items-center justify-center gap-1"
                                    >
                                        <Activity className="h-4 w-4" />
                                        Parar
                                    </button>
                                    <button
                                        onClick={restartGateway}
                                        disabled={gatewayLoading}
                                        className="py-2.5 px-4 rounded-lg bg-amber-500/10 text-amber-400 font-medium hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed border border-amber-500/20 transition-colors flex flex-col items-center justify-center gap-1"
                                    >
                                        <RefreshCw className={`h-4 w-4 ${gatewayLoading ? 'animate-spin' : ''}`} />
                                        Reiniciar
                                    </button>
                                </div>
                            </div>

                            {/* Viewer (Logs or VNC) */}
                            <div className="lg:col-span-2 bg-black rounded-xl border border-slate-800 overflow-hidden relative min-h-[300px]">
                                {viewMode === 'logs' ? (
                                    <div className="p-4 font-mono text-xs text-slate-300 h-full overflow-y-auto max-h-[400px]">
                                        {gatewayLogs.length > 0 ? (
                                            gatewayLogs.map((log, i) => (
                                                <div key={i} className="mb-1 border-b border-slate-900/50 pb-1">
                                                    <span className="text-slate-600 select-none mr-3">[{new Date().toLocaleTimeString()}]</span>
                                                    {log}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="h-full flex items-center justify-center text-slate-600">
                                                Aguardando logs...
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <iframe
                                        src="/vnc/vnc.html?autoconnect=true&reconnect=true&path=vnc"
                                        className="w-full h-full border-none min-h-[400px]"
                                        title="VNC Viewer"
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* KPI Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <KPICard
                        title="Golden Setups (Win Rate)"
                        value={`${stats.golden.winRate}%`}
                        subtitle={`${stats.golden.wins}W - ${stats.golden.losses}L (${stats.golden.total} Total)`}
                        icon={<Trophy className="h-6 w-6" />}
                        color="amber"
                    />
                    <KPICard
                        title="Win Rate Geral"
                        value={`${stats.all.winRate}%`}
                        subtitle={`${stats.all.wins}W - ${stats.all.losses}L (All Strategies)`}
                        icon={<TrendingUp className="h-6 w-6" />}
                        color={stats.all.winRate > 60 ? 'green' : stats.all.winRate > 40 ? 'blue' : 'red'}
                    />
                    <KPICard
                        title="Melhor Par"
                        value={stats.melhorPar}
                        subtitle="Maior taxa de acerto"
                        icon={<Target className="h-6 w-6" />}
                        color="blue"
                    />
                    <KPICard
                        title="Sinais Pendentes"
                        value={stats.pendentes}
                        subtitle="Aguardando validação"
                        icon={<AlertTriangle className="h-6 w-6" />}
                        color="green"
                    />
                </div>

                {/* Main Charts Area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Recent Signals List */}
                    <div className="lg:col-span-2 bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-semibold text-white">Últimos Sinais</h2>
                            <button className="text-sm text-indigo-400 hover:text-indigo-300">Ver todos</button>
                        </div>

                        <div className="space-y-4">
                            {/* Placeholder for list - dynamic data would map here */}
                            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                                        <TrendingUp className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <div className="font-bold text-white">EUR/USD</div>
                                        <div className="text-xs text-slate-400">CALL • 15:30 UTC</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-green-400">+85%</div>
                                    <div className="text-xs text-slate-500">WIN</div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
                                        <TrendingDown className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <div className="font-bold text-white">GBP/JPY</div>
                                        <div className="text-xs text-slate-400">PUT • 14:45 UTC</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-slate-400">0%</div>
                                    <div className="text-xs text-slate-500">LOSS</div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                                        <Clock className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <div className="font-bold text-white">XAU/USD</div>
                                        <div className="text-xs text-slate-400">CALL • Agora</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-amber-400">---</div>
                                    <div className="text-xs text-slate-500">PENDING</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Side Stats */}
                    <div className="space-y-6">
                        <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800 p-6">
                            <h3 className="text-sm font-medium text-slate-400 mb-4">Melhor Horário</h3>
                            <div className="flex items-end gap-2 mb-2">
                                <span className="text-4xl font-bold text-white">{stats.melhorHorario}</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-2">
                                <div className="bg-indigo-500 h-2 rounded-full" style={{ width: '75%' }}></div>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Trophy className="h-32 w-32 rotate-12" />
                            </div>
                            <h3 className="text-white/80 font-medium mb-2">Setup em Destaque</h3>
                            <div className="text-3xl font-bold text-white mb-4">Golden Cross</div>
                            <p className="text-white/70 text-sm mb-6">
                                Taxa de acerto superior a 70% nas últimas 24h.
                                Forte confluência de volume detectada.
                            </p>
                            <button className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium backdrop-blur-sm transition-colors border border-white/10">
                                Ver Detalhes
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
function Activity(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
    )
}

