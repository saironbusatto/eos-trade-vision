import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '@/components/auth/AuthGuard';
import {
    TrendingUp, TrendingDown, Target, Clock,
    LogOut, RefreshCw, Trophy, AlertTriangle
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

// Mock data (será substituído por API real)
const mockStats = {
    golden: { wins: 5, losses: 2, total: 7, winRate: 71.4 },
    all: { wins: 45, losses: 32, total: 77, winRate: 58.4 },
    pendentes: 3,
    melhorPar: 'EUR/USD',
    melhorHorario: '15:00 UTC'
};

export default function Analytics() {
    const navigate = useNavigate();
    const [stats, setStats] = useState(mockStats);
    const [loading, setLoading] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(new Date());

    const refresh = () => {
        setLoading(true);
        // TODO: Fetch real data from API
        setTimeout(() => {
            setLastUpdate(new Date());
            setLoading(false);
        }, 1000);
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            {/* Header */}
            <header className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">🎯</span>
                        <div>
                            <h1 className="text-xl font-bold text-white">EoS Analytics</h1>
                            <p className="text-slate-400 text-sm">Trading Intelligence Dashboard</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={refresh}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-all disabled:opacity-50"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            {loading ? 'Atualizando...' : 'Atualizar'}
                        </button>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-all"
                        >
                            <LogOut className="h-4 w-4" />
                            Sair
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-8">
                {/* Golden Stats Section */}
                <section className="mb-8">
                    <h2 className="text-lg font-semibold text-amber-400 mb-4 flex items-center gap-2">
                        <Trophy className="h-5 w-5" />
                        Sinais Golden (Alta Confluência)
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <KPICard
                            title="Win Rate Golden"
                            value={`${stats.golden.winRate.toFixed(1)}%`}
                            subtitle={`${stats.golden.wins}W / ${stats.golden.losses}L`}
                            icon={<Target className="h-6 w-6" />}
                            color="amber"
                        />
                        <KPICard
                            title="Total Golden"
                            value={stats.golden.total}
                            subtitle="sinais enviados"
                            icon={<TrendingUp className="h-6 w-6" />}
                            color="amber"
                        />
                        <KPICard
                            title="Melhor Par"
                            value={stats.melhorPar}
                            subtitle="maior WR%"
                            icon={<Trophy className="h-6 w-6" />}
                            color="green"
                        />
                        <KPICard
                            title="Melhor Horário"
                            value={stats.melhorHorario}
                            subtitle="(12:00 BRT)"
                            icon={<Clock className="h-6 w-6" />}
                            color="blue"
                        />
                    </div>
                </section>

                {/* All Stats Section */}
                <section className="mb-8">
                    <h2 className="text-lg font-semibold text-slate-300 mb-4 flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Estatísticas Gerais
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <KPICard
                            title="Win Rate Geral"
                            value={`${stats.all.winRate.toFixed(1)}%`}
                            subtitle={`${stats.all.wins}W / ${stats.all.losses}L`}
                            icon={<Target className="h-6 w-6" />}
                            color="blue"
                        />
                        <KPICard
                            title="Total Sinais"
                            value={stats.all.total}
                            subtitle="analisados"
                            icon={<TrendingUp className="h-6 w-6" />}
                            color="blue"
                        />
                        <KPICard
                            title="Wins"
                            value={stats.all.wins}
                            subtitle="acertos"
                            icon={<TrendingUp className="h-6 w-6" />}
                            color="green"
                        />
                        <KPICard
                            title="Losses"
                            value={stats.all.losses}
                            subtitle="erros"
                            icon={<TrendingDown className="h-6 w-6" />}
                            color="red"
                        />
                    </div>
                </section>

                {/* Pending & Alerts */}
                <section className="mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Clock className="h-5 w-5 text-amber-400" />
                                Pendentes
                            </h3>
                            <p className="text-4xl font-bold text-amber-400">{stats.pendentes}</p>
                            <p className="text-slate-400 text-sm mt-2">sinais aguardando validação</p>
                        </div>
                        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-green-400" />
                                Status
                            </h3>
                            <p className="text-lg text-green-400">✅ Bots operando normalmente</p>
                            <p className="text-slate-400 text-sm mt-2">
                                Última atualização: {lastUpdate.toLocaleTimeString('pt-BR')}
                            </p>
                        </div>
                    </div>
                </section>

                {/* Placeholder for Heatmap */}
                <section className="mb-8">
                    <h2 className="text-lg font-semibold text-slate-300 mb-4">
                        📊 Heatmap por Horário (Em breve)
                    </h2>
                    <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8 text-center">
                        <p className="text-slate-500">
                            Heatmap estilo CryptoBubbles com performance por par e horário
                        </p>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-slate-700/50 py-4 text-center text-slate-500 text-sm">
                EoS Trading Bot © 2025 | Dados atualizados em tempo real
            </footer>
        </div>
    );
}
