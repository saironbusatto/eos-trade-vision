import { Telegraf } from 'telegraf';
import { config } from './config';
import { sqliteDatabase } from './sqliteDatabase';
import { twelveData } from './twelveData';
import { ofaAnalyzer, OFAIndicators } from './ofa/analyzer';
import { getRandomQuote } from './quotes';

// Bot instance
const bot = new Telegraf(config.telegramToken);

// Estado
let isRunning = false;
let lastSignalTime: Map<string, number> = new Map();

interface Stats {
    sinaisEnviados: number;
    wins: number;
    losses: number;
}

const stats: Stats = { sinaisEnviados: 0, wins: 0, losses: 0 };

// Verificar admin
const isAdmin = (userId: number) => userId === config.adminId;

// /start
bot.command('start', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    await ctx.reply(`🔮 *EOS IQ Bot* - Sinais Binárias + OFA

*Sinais Manuais:*
/sinal EUR/USD CALL 5m - Enviar sinal
/win - Marcar como WIN
/loss - Marcar como LOSS

*Análise OFA:*
/analyze EUR/USD - Analisar par
/run - Iniciar análise automática
/stop - Parar análise

*Relatórios:*
/stats - Estatísticas
/export - Exportar CSV para ML

_Powered by Eye of Sauron_`, { parse_mode: 'Markdown' });
});

// /sinal PAR TIPO DURACAO (manual)
bot.command('sinal', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const texto = ctx.message.text.replace('/sinal', '').trim();
    const partes = texto.split(' ');

    if (partes.length < 2) {
        await ctx.reply('❌ Formato: /sinal EUR/USD CALL 5m');
        return;
    }

    const par = partes[0].toUpperCase();
    const tipo = partes[1].toUpperCase();
    const duracao = partes[2] || '5m';

    if (!['CALL', 'PUT'].includes(tipo)) {
        await ctx.reply('❌ Tipo deve ser CALL ou PUT');
        return;
    }

    const emoji = tipo === 'CALL' ? '🟢' : '🔴';
    const acao = tipo === 'CALL' ? 'COMPRA' : 'VENDA';

    const mensagem = `${emoji} *SINAL BINÁRIAS* ${emoji}

📊 *Par:* ${par}
📈 *Direção:* ${acao} (${tipo})
⏱️ *Expiração:* ${duracao}

_"Ash nazg durbatulûk"_
— EOS IQ Bot`;

    try {
        await bot.telegram.sendMessage(config.channelId, mensagem, { parse_mode: 'Markdown' });
        stats.sinaisEnviados++;
        await ctx.reply(`✅ Sinal enviado!`);
    } catch (error) {
        await ctx.reply('❌ Erro ao enviar');
    }
});

// /win /loss
bot.command('win', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    stats.wins++;
    await ctx.reply(`✅ WIN! Total: ${stats.wins}/${stats.sinaisEnviados}`);
});

bot.command('loss', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    stats.losses++;
    await ctx.reply(`❌ LOSS! Total: ${stats.losses}/${stats.sinaisEnviados}`);
});

// /analyze PAR
bot.command('analyze', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const pair = ctx.message.text.replace('/analyze', '').trim().toUpperCase() || 'EUR/USD';

    await ctx.reply(`🔍 Analisando ${pair}...`);

    const indicators = await ofaAnalyzer.analyze(pair);
    const formatted = ofaAnalyzer.formatAnalysis(pair, indicators);

    await ctx.reply(formatted, { parse_mode: 'Markdown' });
});

// /run - Análise automática
bot.command('run', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    if (isRunning) {
        await ctx.reply('⚠️ Análise já está rodando!');
        return;
    }

    isRunning = true;
    await ctx.reply('🚀 Análise automática iniciada!');

    runAnalysisLoop();
});

// /stop
bot.command('stop', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    isRunning = false;
    await ctx.reply('🛑 Análise parada!');
});

// /stats
bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const dbStats = sqliteDatabase.getStats();
    const winRate = stats.sinaisEnviados > 0
        ? ((stats.wins / stats.sinaisEnviados) * 100).toFixed(1) : '0';

    await ctx.reply(`📊 *Estatísticas*

*Sinais Manuais:*
• Enviados: ${stats.sinaisEnviados}
• ✅ Wins: ${stats.wins}
• ❌ Losses: ${stats.losses}
• Win Rate: ${winRate}%

*Sinais OFA (hoje):*
• Total: ${dbStats.total}
• ✅ Wins: ${dbStats.wins}
• ❌ Losses: ${dbStats.losses}
• ⏳ Pendentes: ${dbStats.pending}`, { parse_mode: 'Markdown' });
});

// /export
bot.command('export', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const csv = sqliteDatabase.exportMLData();
    if (!csv) {
        await ctx.reply('❌ Sem dados para exportar');
        return;
    }

    await ctx.replyWithDocument({
        source: Buffer.from(csv),
        filename: `eos_signals_${new Date().toISOString().split('T')[0]}.csv`
    });
});

// Loop de análise automática
async function runAnalysisLoop() {
    console.log('[Engine] Iniciando loop de análise...');

    while (isRunning) {
        await analyzeAllPairs();
        await validatePendingSignals();
        await new Promise(r => setTimeout(r, 60000)); // 1 minuto
    }
}

async function analyzeAllPairs() {
    console.log('[Engine] Analisando pares...');

    for (const pair of config.pairs) {
        if (!isRunning) break;

        try {
            const lastSignal = lastSignalTime.get(pair) || 0;
            if (Date.now() - lastSignal < 10 * 60 * 1000) continue; // 10 min cooldown

            const indicators = await ofaAnalyzer.analyze(pair);

            if (indicators.score >= config.ofa.minScore && indicators.direction !== 'NEUTRAL') {
                await generateSignal(pair, indicators);
                lastSignalTime.set(pair, Date.now());
            }

            await new Promise(r => setTimeout(r, 1500)); // Rate limit

        } catch (error) {
            console.error(`[Engine] Erro ${pair}:`, error);
        }
    }
}

async function generateSignal(pair: string, indicators: OFAIndicators) {
    const quote = await twelveData.getPrice(pair);
    if (!quote) return;

    const signalId = sqliteDatabase.insertSignal({
        pair,
        direction: indicators.direction as 'CALL' | 'PUT',
        entry_price: quote.price,
        score: indicators.score,
        expiration_min: 5,
        delta: indicators.delta,
        delta_cumulative: indicators.deltaCumulative,
        absorption_detected: indicators.absorptionDetected,
        divergence_detected: indicators.deltaDivergence,
        stacked_imbalances: indicators.stackedImbalances,
        vpoc_migration: indicators.vpocMigration,
        reversal_sequence: indicators.reversalSequence,
    });

    const acao = indicators.direction === 'CALL' ? 'COMPRA' : 'VENDA';

    const message = `*Sinal Palantir!*

Par: ${pair}
Direção: ${acao}
Preço: ${quote.price.toFixed(5)}
Probabilidade: ${indicators.score}%

_${getRandomQuote()}_

#${signalId}`;

    try {
        await bot.telegram.sendMessage(config.channelId, message, { parse_mode: 'Markdown' });
        console.log(`[Engine] Sinal #${signalId} enviado: ${pair} ${indicators.direction}`);
    } catch (error) {
        console.error('[Engine] Erro ao enviar:', error);
    }
}

async function validatePendingSignals() {
    const pending = sqliteDatabase.getPendingSignals();

    for (const signal of pending) {
        try {
            const quote = await twelveData.getPrice(signal.pair);
            if (!quote) continue;

            let result: 'WIN' | 'LOSS';
            if (signal.direction === 'CALL') {
                result = quote.price > signal.entry_price ? 'WIN' : 'LOSS';
            } else {
                result = quote.price < signal.entry_price ? 'WIN' : 'LOSS';
            }

            sqliteDatabase.closeSignal(signal.id, quote.price, result);

            await bot.telegram.sendMessage(config.channelId,
                `*#${signal.id}* ${signal.pair} - ${result}`,
                { parse_mode: 'Markdown' }
            );

        } catch (error) {
            console.error(`[Engine] Erro validar #${signal.id}:`, error);
        }
    }
}

// Error handler
bot.catch((err) => {
    console.error('[Bot] Error:', err);
});

// Verifica se mercado Forex está aberto
function isForexOpen(): boolean {
    const now = new Date();
    const utcDay = now.getUTCDay();
    const utcHour = now.getUTCHours();

    // Forex abre domingo 21:00 UTC (Sydney) e fecha sexta 21:00 UTC (NY)
    // Fechado: sábado inteiro e domingo até 21:00 UTC
    if (utcDay === 6) return false; // Sábado
    if (utcDay === 0 && utcHour < 21) return false; // Domingo antes de Sydney abrir

    return true;
}

// Auto-start quando mercado abrir
function scheduleMarketOpen() {
    setInterval(async () => {
        if (isForexOpen() && !isRunning) {
            console.log('[Engine] 🌍 Mercado Forex abriu! Iniciando análise automática...');
            isRunning = true;

            try {
                await bot.telegram.sendMessage(config.channelId,
                    '🌍 *Mercado Forex abriu!*\n\nIniciando análise automática...',
                    { parse_mode: 'Markdown' }
                );
            } catch (e) { }

            runAnalysisLoop();
        } else if (!isForexOpen() && isRunning) {
            console.log('[Engine] 🌙 Mercado Forex fechou. Parando análise.');
            isRunning = false;

            try {
                await bot.telegram.sendMessage(config.channelId,
                    '🌙 *Mercado Forex fechou.*\n\nAnálise pausada até reabertura.',
                    { parse_mode: 'Markdown' }
                );
            } catch (e) { }
        }
    }, 60000); // Verifica a cada minuto
}

// Main
async function main() {
    console.log('🔮 EOS IQ Bot + OFA iniciando...');

    const connected = await twelveData.testConnection();
    if (!connected) {
        console.error('[Engine] Falha Twelve Data - continuando apenas com sinais manuais');
    }

    await bot.launch();
    console.log('✅ Bot iniciado!');

    // Agenda verificação de mercado
    scheduleMarketOpen();
    console.log('📅 Agendador de mercado ativo - análise iniciará automaticamente quando Forex abrir');

    // Se mercado já estiver aberto, iniciar imediatamente
    if (isForexOpen()) {
        console.log('[Engine] Mercado já está aberto! Iniciando análise...');
        isRunning = true;
        runAnalysisLoop();
    }

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch(console.error);

