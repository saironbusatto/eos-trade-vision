import React from 'react';

interface ScoreboardProps {
    data: {
        summary: { total: number; wins: number; losses: number; winRate: number };
        forex: { total: number; wins: number; losses: number; winRate: number };
        crypto: { total: number; wins: number; losses: number; winRate: number };
    };
}

export const Scoreboard: React.FC<ScoreboardProps> = ({ data }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {/* Placar Geral */}
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-10">
                    <svg className="w-16 h-16 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                    </svg>
                </div>
                <h3 className="text-slate-400 text-sm font-medium mb-1">Win Rate Geral</h3>
                <div className="text-3xl font-bold text-white mb-2">
                    {data.summary.winRate.toFixed(1)}%
                </div>
                <div className="text-xs text-slate-500 flex justify-between">
                    <span className="text-emerald-500">{data.summary.wins} Wins</span>
                    <span className="text-rose-500">{data.summary.losses} Losses</span>
                </div>
            </div>

            {/* Forex Score */}
            <div className="bg-slate-800 p-4 rounded-xl border border-emerald-900/30 shadow-xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="text-emerald-400 text-sm font-medium mb-1">Forex (IQ Bot)</h3>
                <div className="text-2xl font-bold text-white mb-1">
                    {data.forex.winRate.toFixed(1)}%
                </div>
                <div className="text-xs text-emerald-600/80">
                    {data.forex.total} sinais totais
                </div>
            </div>

            {/* Crypto Score */}
            <div className="bg-slate-800 p-4 rounded-xl border border-amber-900/30 shadow-xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="text-amber-400 text-sm font-medium mb-1">Crypto (Telegram)</h3>
                <div className="text-2xl font-bold text-white mb-1">
                    {data.crypto.winRate.toFixed(1)}%
                </div>
                <div className="text-xs text-amber-600/80">
                    {data.crypto.total} sinais totais
                </div>
            </div>

            {/* Best Performer */}
            <div className="bg-gradient-to-br from-blue-900 to-slate-900 p-4 rounded-xl border border-blue-700/50 shadow-xl flex flex-col justify-center items-center">
                <h3 className="text-blue-300 text-xs font-bold uppercase tracking-wider mb-2">Líder Atual</h3>
                {data.forex.winRate > data.crypto.winRate ? (
                    <div className="text-center">
                        <span className="text-3xl">💱</span>
                        <div className="text-white font-bold mt-1">Forex Bot</div>
                        <div className="text-emerald-400 text-xs">+{Math.abs(data.forex.winRate - data.crypto.winRate).toFixed(1)}% vs Crypto</div>
                    </div>
                ) : (
                    <div className="text-center">
                        <span className="text-3xl">₿</span>
                        <div className="text-white font-bold mt-1">Crypto Bot</div>
                        <div className="text-amber-400 text-xs">+{Math.abs(data.crypto.winRate - data.forex.winRate).toFixed(1)}% vs Forex</div>
                    </div>
                )}
            </div>
        </div>
    );
};
