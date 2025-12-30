import dotenv from 'dotenv';
dotenv.config();

export const config = {
    // Telegram
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
    adminId: parseInt(process.env.TELEGRAM_ADMIN_ID || '0'),
    channelId: process.env.TELEGRAM_CHANNEL_ID || '',

    // Twelve Data
    twelveDataApiKey: process.env.TWELVE_DATA_API_KEY || '',

    // Database
    databasePath: process.env.DATABASE_PATH || './data/eos-iq.db',

    // Perplexity (for macro analysis)
    perplexityApiKey: process.env.PERPLEXITY_API_KEY || '',

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
        minScore: 65,
        deltaThreshold: 500,
        absorptionVolumeMin: 1000,
    },
};
