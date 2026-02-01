import Parser from 'rss-parser';
import crypto from 'crypto';
import { sqliteDatabase } from '../sqliteDatabase';

const FEEDS = [
    { url: 'https://cointelegraph.com/rss', source: 'CoinTelegraph' },
    { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' }
];

export class NewsCollector {
    private parser: Parser;
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;

    constructor() {
        this.parser = new Parser();
    }

    public start(intervalMs: number = 300000) { // Default 5 min
        if (this.isRunning) return;
        this.isRunning = true;
        console.log(`[NewsCollector] Started. Polling every ${intervalMs / 1000}s`);

        this.fetchJob(); // Run immediately
        this.intervalId = setInterval(() => this.fetchJob(), intervalMs);
    }

    public stop() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.isRunning = false;
        console.log('[NewsCollector] Stopped');
    }

    private async fetchJob() {
        for (const feed of FEEDS) {
            try {
                // console.log(`[NewsCollector] Fetching ${feed.source}...`);
                const result = await this.parser.parseURL(feed.url);

                let savedCount = 0;
                for (const item of result.items) {
                    if (!item.title || !item.link) continue;

                    const guid = item.guid || item.link;
                    // Create content hash regarding title + snippet to identify dupes even if link changes slightly
                    // Using MD5 for simple deduplication hash
                    const contentValues = (item.title + (item.contentSnippet || '')).toLowerCase().trim();
                    const contentHash = crypto.createHash('md5').update(contentValues).digest('hex');

                    const publishedAt = item.isoDate || new Date().toISOString();

                    const rowId = sqliteDatabase.insertNewsItem({
                        guid,
                        content_hash: contentHash,
                        source: feed.source,
                        title: item.title,
                        link: item.link,
                        published_at: publishedAt
                    });

                    if (rowId) savedCount++;
                }

                if (savedCount > 0) {
                    console.log(`[NewsCollector] ${feed.source}: ${savedCount} new items saved.`);
                }

            } catch (err: any) {
                console.error(`[NewsCollector] Error fetching ${feed.source}:`, err.message);
            }
        }
    }
}
