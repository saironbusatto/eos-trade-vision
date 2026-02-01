
import dotenv from 'dotenv';
dotenv.config();

import { SentimentAnalyzer } from './src/services/SentimentAnalyzer';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH || './data/eos.db';
const db = new Database(path.resolve(DB_PATH));

async function test() {
    console.log('[TEST] Starting SentimentAnalyzer test...');

    // Check if we have unprocessed items
    const pending = db.prepare(`
        SELECT COUNT(*) as count FROM news_items n
        LEFT JOIN news_signals s ON n.id = s.news_item_id
        WHERE s.id IS NULL
    `).get() as { count: number };

    console.log(`[TEST] Pending items to analyze: ${pending.count}`);

    if (pending.count === 0) {
        console.warn('[TEST] No pending items! Make sure NewsCollector ran first.');
    }

    const analyzer = new SentimentAnalyzer();
    analyzer.start(5000); // Check every 5s

    console.log('[TEST] Waiting 20s for analysis...');
    await new Promise(resolve => setTimeout(resolve, 20000));

    analyzer.stop();

    console.log('[TEST] Verifying Database...');
    const signals = db.prepare('SELECT * FROM news_signals ORDER BY id DESC LIMIT 5').all() as any[];

    if (signals.length > 0) {
        console.log(`✅ Success! Found ${signals.length} signals.`);
        signals.forEach(s => {
            console.log(`- Item #${s.news_item_id}: Score=${s.sentiment_score}, Impact=${s.impact_rating}, Relevant=${s.crypto_relevant}`);
            console.log(`  Reasoning: ${s.reasoning}`);
        });
    } else {
        console.error('❌ No signals found!');
    }
}

test();
