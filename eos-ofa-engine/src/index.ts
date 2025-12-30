import { Telegraf } from 'telegraf';
import { config } from './config';
import { database } from './database';
import { twelveData } from './twelveData';
import { ofaAnalyzer, OFAIndicators } from './ofa/analyzer';

// Bot instance
const bot = new Telegraf(config.telegramToken);

// Estado
let isRunning = false;
let lastSignalTime: Map<string, number> = new Map();

/**
 * Analisa todos os pares e gera sinais
 */
async function analyzeAllPairs() {
    console.log('[Engine] Analisando pares...');

    for (const pair of config.pairs) {
        try {
            // Verificar cooldown
            const lastSignal = lastSignalTime.get(pair) || 0;
            if (Date.now() - lastSignal < config.signal.cooldownMinutes * 60 * 1000) {
                continue;
            }

            // Analisar
            const indicators = await ofaAnalyzer.analyze(pair);

            // Verificar se atende aos critérios
            if (indicators.score >= config.ofa.minScore && indicators.direction !== 'NEUTRAL') {
                await generateSignal(pair, indicators);
                lastSignalTime.set(pair, Date.now());
            }

            // Rate limit - 1 request por segundo
            await new Promise(r => setTimeout(r, 1000));

        } catch (error) {
            console.error(`[Engine] Erro ao analisar ${pair}:`, error);
        }
    }
}

/**
 * Gera e envia um sinal
 */
async function generateSignal(pair: string, indicators: OFAIndicators) {
    // Obter preço atual
    const quote = await twelveData.getPrice(pair);
    if (!quote) return;

    // Criar sinal
    const signal = {
        pair,
        direction: indicators.direction as 'CALL' | 'PUT',
        entry_time: new Date().toISOString(),
        entry_price: quote.price,
        delta_1m: indicators.delta,
        delta_5m: indicators.deltaCumulative,
        volume_1m: indicators.volume,
        absorption_detected: indicators.absorptionDetected,
        divergence_detected: indicators.deltaDivergence,
        trend_direction: indicators.vpocMigration,
    };

    // Salvar no banco
    const signalId = database.insertSignal(signal);

    // Formatar mensagem
    const emoji = indicators.direction === 'CALL' ? '🟢' : '🔴';
    const acao = indicators.direction === 'CALL' ? 'COMPRA' : 'VENDA';

    const message = `${emoji} *SINAL EOS OFA* ${emoji}

📊 *Par:* ${pair}
📈 *Direção:* ${acao}
💰 *Preço:* ${quote.price.toFixed(5)}
⏱️ *Expiração:* 5 minutos
🎯 *Score:* ${indicators.score}/100

*Indicadores:*
• Absorção: ${indicators.absorptionDetected ? '✅' : '❌'}
• Divergência: ${indicators.deltaDivergence ? '✅' : '❌'}
• Reversão: ${indicators.reversalSequence}/3

#${signalId} | _Eye of Sauron_`;

    // Enviar para o canal
    try {
        await bot.telegram.sendMessage(config.channelId, message, { parse_mode: 'Markdown' });
        console.log(`[Engine] Sinal #${signalId} enviado: ${pair} ${indicators.direction}`);
    } catch (error) {
        console.error('[Engine] Erro ao enviar mensagem:', error);
    }
}

/**
 * Valida sinais pendentes
 */
async function validatePendingSignals() {
    const pending = database.getPendingSignals();

    for (const signal of pending) {
        try {
            const quote = await twelveData.getPrice(signal.pair);
            if (!quote) continue;

            const entryPrice = signal.entry_price;
            const exitPrice = quote.price;

            // Determinar resultado
            let result: 'WIN' | 'LOSS';
            if (signal.direction === 'CALL') {
                result = exitPrice > entryPrice ? 'WIN' : 'LOSS';
            } else {
                result = exitPrice < entryPrice ? 'WIN' : 'LOSS';
            }

            // Atualizar banco
            database.updateResult(signal.id, exitPrice, result);

            // Notificar
            const emoji = result === 'WIN' ? '✅' : '❌';
            const message = `${emoji} *Resultado #${signal.id}*

${signal.pair} ${signal.direction}
Entrada: ${entryPrice.toFixed(5)}
Saída: ${exitPrice.toFixed(5)}
Resultado: *${result}*`;

            await bot.telegram.sendMessage(config.channelId, message, { parse_mode: 'Markdown' });

        } catch (error) {
            console.error(`[Engine] Erro ao validar sinal #${signal.id}:`, error);
        }
    }
}

/**
 * Envia relatório diário
 */
async function sendDailyReport() {
    const stats = database.getDailyStats();

    if (!stats || stats.total === 0) {
        return;
    }

    const winRate = stats.wins && stats.total > stats.pending
        ? ((stats.wins / (stats.total - stats.pending)) * 100).toFixed(1)
        : '0';

    const message = `📊 *Relatório Diário EOS OFA*

📈 *Resumo:*
• Total: ${stats.total} sinais
• ✅ Wins: ${stats.wins}
• ❌ Losses: ${stats.losses}
• ⏳ Pendentes: ${stats.pending}
• 🎯 Win Rate: ${winRate}%

_Eye of Sauron Analytics_`;

    await bot.telegram.sendMessage(config.channelId, message, { parse_mode: 'Markdown' });
}

// Comandos do bot
bot.command('start', async (ctx) => {
    if (ctx.from.id !== config.adminId) return;

    await ctx.reply(`🔮 *EOS OFA Engine*

Comandos:
/run - Iniciar análise contínua
/stop - Parar análise
/analyze EUR/USD - Analisar par específico
/stats - Estatísticas do dia
/export - Exportar dados para ML

_Powered by Eye of Sauron_`, { parse_mode: 'Markdown' });
});

bot.command('run', async (ctx) => {
    if (ctx.from.id !== config.adminId) return;

    isRunning = true;
    await ctx.reply('🚀 Análise iniciada!');

    // Loop de análise
    while (isRunning) {
        await analyzeAllPairs();
        await validatePendingSignals();
        await new Promise(r => setTimeout(r, 60000)); // 1 minuto
    }
});

bot.command('stop', async (ctx) => {
    if (ctx.from.id !== config.adminId) return;

    isRunning = false;
    await ctx.reply('🛑 Análise parada!');
});

bot.command('analyze', async (ctx) => {
    if (ctx.from.id !== config.adminId) return;

    const pair = ctx.message.text.replace('/analyze', '').trim().toUpperCase();
    if (!pair) {
        await ctx.reply('❌ Formato: /analyze EUR/USD');
        return;
    }

    await ctx.reply(`🔍 Analisando ${pair}...`);

    const indicators = await ofaAnalyzer.analyze(pair);
    const formatted = ofaAnalyzer.formatAnalysis(pair, indicators);

    await ctx.reply(formatted, { parse_mode: 'Markdown' });
});

bot.command('stats', async (ctx) => {
    if (ctx.from.id !== config.adminId) return;

    const stats = database.getDailyStats();
    const byPair = database.getStatsByPair();

    let message = `📊 *Estatísticas*\n\n`;
    message += `Total: ${stats?.total || 0}\n`;
    message += `Wins: ${stats?.wins || 0}\n`;
    message += `Losses: ${stats?.losses || 0}\n\n`;

    message += `*Por Par:*\n`;
    for (const p of byPair) {
        message += `${p.pair}: ${p.wins}/${p.total} (${p.win_rate || 0}%)\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('export', async (ctx) => {
    if (ctx.from.id !== config.adminId) return;

    const csv = database.exportForML();
    if (!csv) {
        await ctx.reply('❌ Sem dados para exportar');
        return;
    }

    await ctx.replyWithDocument({
        source: Buffer.from(csv),
        filename: `eos_signals_${new Date().toISOString().split('T')[0]}.csv`
    });
});

// Error handler
bot.catch((err) => {
    console.error('[Bot] Error:', err);
});

// Main
async function main() {
    console.log('🔮 EOS OFA Engine iniciando...');

    // Testar conexão com Twelve Data
    const connected = await twelveData.testConnection();
    if (!connected) {
        console.error('[Engine] Falha ao conectar com Twelve Data');
        process.exit(1);
    }

    // Iniciar bot
    await bot.launch();
    console.log('✅ EOS OFA Engine iniciado!');

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch(console.error);
