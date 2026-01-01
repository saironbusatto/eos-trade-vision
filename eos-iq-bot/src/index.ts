import dotenv from 'dotenv';
dotenv.config();

import { telegram } from './telegram';
import { sqliteDatabase } from './sqliteDatabase';
import { forexData } from './forexData';
import { ofaAnalyzer, OFAIndicators } from './ofa/analyzer';
import { getRandomQuote } from './quotes';
import { isGoldenSetup, formatGoldenMessage } from './goldenSetups';


// Configuration
const config = {
    adminId: parseInt(process.env.TELEGRAM_ADMIN_ID || '0'),
    pairs: [
        'EUR/USD', 'GBP/USD', 'USD/JPY', 'GBP/JPY', 'EUR/JPY',
        'AUD/USD', 'USD/CAD', 'GBP/CAD', 'AUD/CAD', 'EUR/GBP',
    ],
    ofa: {
        minScore: 65,
        deltaThreshold: 500,
        absorptionVolumeMin: 1000,
    },
};

// Estado
let isRunning = false;
let lastSignalTime: Map<string, number> = new Map();

// Verifica se mercado Forex está aberto
function isForexOpen(): boolean {
    const now = new Date();
    const utcDay = now.getUTCDay();
    const utcHour = now.getUTCHours();

    // Forex abre domingo 21:00 UTC (Sydney) e fecha sexta 21:00 UTC (NY)
    if (utcDay === 6) return false; // Sábado
    if (utcDay === 0 && utcHour < 21) return false; // Domingo antes de Sydney

    return true;
}

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

            // Log de debug para ver scores
            console.log(`[OFA] ${pair}: score=${indicators.score} dir=${indicators.direction}`);

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
    const quote = await forexData.getPrice(pair);
    if (!quote) return;

    const direction = indicators.direction as 'CALL' | 'PUT';

    // Verifica se é horário de ALTA CONFLUÊNCIA (>70% WR) ANTES de salvar
    const goldenSetup = isGoldenSetup(pair, direction);

    // Sempre salva no banco (para estatísticas) - com flag is_golden
    const signalId = sqliteDatabase.insertSignal({
        pair,
        direction,
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
        is_golden: goldenSetup !== null,
    });

    console.log(`[Engine] Sinal #${signalId} salvo: ${pair} ${direction} score=${indicators.score}`);

    if (goldenSetup) {
        // GOLDEN SETUP - Envia para Telegram!
        const goldenId = sqliteDatabase.getNextGoldenId();
        const message = formatGoldenMessage(pair, direction, quote.price, indicators.score, goldenSetup, goldenId);
        const sent = await telegram.sendGoldenMessage(message);

        if (sent) {
            console.log(`[Engine] 🎯 GOLDEN #${goldenId} enviado: ${pair} ${direction} (${goldenSetup.winRate}% WR)`);
        }
    } else {
        // Sinal normal - apenas log, não envia para Telegram
        console.log(`[Engine] Sinal #${signalId} apenas gravado (não é horário golden)`);
    }
}

async function validatePendingSignals() {
    const pending = sqliteDatabase.getPendingSignals();

    for (const signal of pending) {
        try {
            const quote = await forexData.getPrice(signal.pair);
            if (!quote) continue;

            let result: 'WIN' | 'LOSS';
            if (signal.direction === 'CALL') {
                result = quote.price > signal.entry_price ? 'WIN' : 'LOSS';
            } else {
                result = quote.price < signal.entry_price ? 'WIN' : 'LOSS';
            }

            sqliteDatabase.closeSignal(signal.id, quote.price, result);
            console.log(`[Engine] Sinal #${signal.id} fechado: ${result}`);

            // Envia resultado ao Telegram se for sinal GOLDEN
            if (signal.is_golden) {
                const goldenStats = sqliteDatabase.getGoldenStats();
                const goldenId = goldenStats.total; // ID do sinal golden
                const emoji = result === 'WIN' ? '✅' : '❌';
                const message = `🎯 *GOLDEN #${goldenId}* ${signal.pair}

${emoji} *${result}*

📊 Golden Stats: ${goldenStats.wins}W / ${goldenStats.losses}L (${goldenStats.win_rate.toFixed(1)}%)`;
                await telegram.sendGoldenMessage(message);
            }

        } catch (error) {
            console.error(`[Engine] Erro validar #${signal.id}:`, error);
        }
    }
}

// Auto-start quando mercado abrir
function scheduleMarketOpen() {
    setInterval(async () => {
        if (isForexOpen() && !isRunning) {
            console.log('[Engine] 🌍 Mercado Forex abriu! Iniciando análise automática...');
            isRunning = true;
            await telegram.sendMessage('🌍 *Mercado Forex abriu!*\n\nIniciando análise automática...');
            runAnalysisLoop();
        } else if (!isForexOpen() && isRunning) {
            console.log('[Engine] 🌙 Mercado Forex fechou. Parando análise.');
            isRunning = false;
            await telegram.sendMessage('🌙 *Mercado Forex fechou.*\n\nAnálise pausada até reabertura.');
        }
    }, 60000); // Verifica a cada minuto
}

// Main
async function main() {
    console.log('🔮 EOS IQ Bot + OFA iniciando...');

    // Test Telegram connection
    const telegramStatus = await telegram.testConnection();
    if (telegramStatus.ok) {
        console.log(`✅ Telegram conectado! Bot: @${telegramStatus.botName}`);
    } else {
        console.error('❌ Telegram falhou:', telegramStatus.error);
        process.exit(1);
    }

    // Test TwelveData connection
    const connected = await forexData.testConnection();
    if (!connected) {
        console.warn('[Engine] Falha Twelve Data - continuando apenas com sinais manuais');
    }

    // Agenda verificação de mercado
    scheduleMarketOpen();
    console.log('📅 Agendador de mercado ativo - análise iniciará automaticamente quando Forex abrir');

    // Se mercado já estiver aberto, iniciar imediatamente
    if (isForexOpen()) {
        console.log('[Engine] Mercado já está aberto! Iniciando análise...');
        isRunning = true;
        await telegram.sendMessage('🔮 *EOS IQ Bot iniciado!*\n\nAnálise automática ativa.');
        runAnalysisLoop();
    } else {
        console.log('[Engine] Mercado fechado. Aguardando abertura...');
        await telegram.sendMessage('🔮 *EOS IQ Bot iniciado!*\n\nMercado fechado. Aguardando abertura...');
    }
}

main().catch(console.error);
