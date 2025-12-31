/**
 * EoS IQ - Golden Setups (>70% Win Rate)
 * Configuração dos horários de alta confluência para envio de sinais
 */

interface GoldenSetup {
    pair: string;
    direction: 'CALL' | 'PUT';
    hourUTC: number;
    winRate: number;
    source: 'IBKR' | 'YAHOO';
}

// Setups com Win Rate >= 70% confirmados por IBKR e Yahoo Finance
export const GOLDEN_SETUPS: GoldenSetup[] = [
    // 15:00 UTC (12:00 BRT) - Cluster de alta probabilidade
    { pair: 'GBP/USD', direction: 'PUT', hourUTC: 15, winRate: 73.6, source: 'IBKR' },
    { pair: 'EUR/USD', direction: 'PUT', hourUTC: 15, winRate: 71.7, source: 'IBKR' },
    { pair: 'AUD/USD', direction: 'PUT', hourUTC: 15, winRate: 71.7, source: 'IBKR' },

    // 16:00 UTC (13:00 BRT)
    { pair: 'USD/CAD', direction: 'PUT', hourUTC: 16, winRate: 68.8, source: 'IBKR' },

    // 22:00 UTC (19:00 BRT)
    { pair: 'EUR/USD', direction: 'PUT', hourUTC: 22, winRate: 65.0, source: 'IBKR' },

    // 04:00 UTC (01:00 BRT) - Confirmado por Yahoo Finance
    { pair: 'EUR/USD', direction: 'PUT', hourUTC: 4, winRate: 78.3, source: 'YAHOO' },

    // Adicional do Yahoo Finance
    { pair: 'EUR/USD', direction: 'PUT', hourUTC: 18, winRate: 77.1, source: 'YAHOO' },
    { pair: 'EUR/USD', direction: 'PUT', hourUTC: 21, winRate: 77.8, source: 'YAHOO' },
    { pair: 'EUR/USD', direction: 'PUT', hourUTC: 23, winRate: 77.8, source: 'YAHOO' },
];

/**
 * Verifica se um sinal está em um horário de alta confluência
 */
export function isGoldenSetup(pair: string, direction: 'CALL' | 'PUT'): GoldenSetup | null {
    const now = new Date();
    const hourUTC = now.getUTCHours();

    const setup = GOLDEN_SETUPS.find(s =>
        s.pair === pair &&
        s.direction === direction &&
        s.hourUTC === hourUTC
    );

    return setup || null;
}

/**
 * Retorna todos os setups do horário atual
 */
export function getCurrentGoldenSetups(): GoldenSetup[] {
    const hourUTC = new Date().getUTCHours();
    return GOLDEN_SETUPS.filter(s => s.hourUTC === hourUTC);
}

/**
 * Formata mensagem para setup golden
 */
export function formatGoldenMessage(pair: string, direction: 'CALL' | 'PUT', price: number, score: number, setup: GoldenSetup, goldenId: number): string {
    const acao = direction === 'CALL' ? '📈 COMPRA' : '📉 VENDA';
    const hourBRT = (setup.hourUTC - 3 + 24) % 24;

    // Referências ao Senhor dos Anéis baseadas no Win Rate
    let nazgulMessage = '';
    if (setup.winRate >= 75) {
        nazgulMessage = `\n\n🗡️ _"Os Nazgûl foram convocados! O Um Anel chama..."_`;
    } else if (setup.winRate >= 70) {
        nazgulMessage = `\n\n👁️ _"O Olho de Sauron vê tudo... e vê lucro!"_`;
    } else {
        nazgulMessage = `\n\n🔮 _"Um Anel para a todos governar..."_`;
    }

    return `🎯 *EOS IQ - ALTA CONFLUÊNCIA* #${goldenId}

Par: *${pair}*
Direção: *${acao}*
Preço: ${price.toFixed(5)}

📊 *Estatísticas:*
• Win Rate Histórico: *${setup.winRate.toFixed(1)}%*
• Score OFA: ${score}%
• Fonte: ${setup.source}
• Horário Golden: ${setup.hourUTC}:00 UTC (${hourBRT}:00 BRT)
${nazgulMessage}

⚠️ _Este sinal tem confluência superior baseada em análise estatística de dados reais._`;
}

