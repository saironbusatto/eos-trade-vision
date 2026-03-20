import dotenv from 'dotenv';
dotenv.config();

export const config = {
    // Twelve Data
    twelveDataApiKey: process.env.TWELVE_DATA_API_KEY || '',

    // Telegram
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
    adminId: parseInt(process.env.TELEGRAM_ADMIN_ID || '0'),
    channelId: process.env.TELEGRAM_CHANNEL_ID || '',

    // Database
    databasePath: process.env.DATABASE_PATH || './data/signals.db',

    // Trading Pairs (10 principais)
    pairs: [
        'EUR/USD',
        'GBP/USD',
        'USD/JPY',
        'GBP/JPY',
        'EUR/JPY',
        'AUD/USD',
        'USD/CAD',
        'GBP/CAD',
        'AUD/CAD',
        'EUR/GBP',
    ],

    // OFA Settings
    ofa: {
        minScore: 60,
        imbalanceThreshold: 3.0,      // 300% para considerar imbalance
        absorptionVolumeMin: 1000,     // Volume mínimo para absorção
        deltaThreshold: 500,           // Delta mínimo para sinal
    },

    // Signal Settings
    signal: {
        expirationMinutes: 5,
        cooldownMinutes: 10,           // Evitar sinais seguidos no mesmo par
    },
};
