
import { NewsCollector } from './src/services/NewsCollector';
import { sqliteDatabase } from './src/sqliteDatabase';

async function test() {
    console.log('[TEST] Starting NewsCollector test...');

    const collector = new NewsCollector();
    // Start with default interval but we expect immediate fetch
    collector.start();

    console.log('[TEST] Waiting 15s for fetching...');
    await new Promise(resolve => setTimeout(resolve, 15000));

    collector.stop();

    console.log('[TEST] Verifying Database...');
    const news = sqliteDatabase.getRecentNews(5);

    if (news.length > 0) {
        console.log(`✅ Success! Found ${news.length} news items.`);
        news.forEach(n => {
            console.log(`- [${n.source}] ${n.title} (${n.published_at})`);
        });
    } else {
        console.error('❌ No news found in DB!');
    }
}

test();
