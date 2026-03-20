import React from 'react';

interface BotTabsProps {
    activeTab: 'general' | 'forex' | 'crypto';
    onTabChange: (tab: 'general' | 'forex' | 'crypto') => void;
}

export const BotTabs: React.FC<BotTabsProps> = ({ activeTab, onTabChange }) => {
    return (
        <div className="flex space-x-2 bg-slate-800/50 p-1 rounded-lg w-fit mb-6">
            <button
                onClick={() => onTabChange('general')}
                className={`px-4 py-2 rounded-md transition-all ${activeTab === 'general'
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
            >
                🏠 Visão Geral
            </button>
            <button
                onClick={() => onTabChange('forex')}
                className={`px-4 py-2 rounded-md transition-all ${activeTab === 'forex'
                        ? 'bg-emerald-600 text-white shadow-lg'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
            >
                💱 Forex Bot
            </button>
            <button
                onClick={() => onTabChange('crypto')}
                className={`px-4 py-2 rounded-md transition-all ${activeTab === 'crypto'
                        ? 'bg-amber-600 text-white shadow-lg'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
            >
                ₿ Crypto Bot
            </button>
        </div>
    );
};
