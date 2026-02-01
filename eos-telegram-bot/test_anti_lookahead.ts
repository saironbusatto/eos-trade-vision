// @ts-nocheck
import { sqliteDatabase } from './src/sqliteDatabase';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH || './data/eos.db';
const db = new Database(path.resolve(DB_PATH));

async function testLookaheadBias() {
    console.log("🛡️ Running Anti-Lookahead Regression Test (Robust)...");

    // Clean old test signals to allow re-runs
    db.prepare("DELETE FROM news_items WHERE source = 'TestFuture'").run();
    db.prepare("DELETE FROM news_signals WHERE model_used = 'test_future'").run();

    const uniqueHash = `test_${Date.now()}`;

    // 1. Inserir Notícia
    const newsId = sqliteDatabase.insertNewsItem({
        guid: `future_news_${uniqueHash}`,
        content_hash: `hash_future_${uniqueHash}`,
        source: 'TestFuture',
        title: 'FUTURE PUMP DETECTED',
        link: 'http://future.com',
        published_at: new Date().toISOString()
    });

    if (!newsId) throw new Error("Failed to insert test news");

    console.log(`[Test] Created News ID: ${newsId}`);

    // 2. Inserir Sinais de Teste

    // Scenario A: DO FUTURO (+1 hora)
    // Inserimos normalmente e depois forçamos o update do timestamp
    sqliteDatabase.insertNewsSignal({
        news_item_id: newsId,
        crypto_relevant: true,
        sentiment_score: 1.0,
        impact_rating: 5,
        reasoning: "Future Signal",
        model_used: "test_future",
        prompt_version: "v_future",
        input_hash: uniqueHash + "_fut"
    });

    // HACK: Update available_at to Future (+60 mins)
    db.prepare(`UPDATE news_signals SET available_at = datetime('now', '+60 minutes') WHERE model_used = 'test_future' AND prompt_version = 'v_future'`).run();
    console.log("[Test] Scenario A: Signal injected 60 mins in the FUTURE.");

    // Scenario B: DO PASSADO RECENTE (Normal 'now', effectively 0 mins old) -> Deve aparecer
    sqliteDatabase.insertNewsSignal({
        news_item_id: newsId,
        crypto_relevant: true,
        sentiment_score: 1.0,
        impact_rating: 5,
        reasoning: "Valid Signal",
        model_used: "test_future",
        prompt_version: "v_recent",
        input_hash: uniqueHash + "_rec"
    });
    // Default is 'now', so it's valid.

    // Scenario C: DO PASSADO DISTANTE (-120 min) -> Deve ser ignorado (Window 60)
    sqliteDatabase.insertNewsSignal({
        news_item_id: newsId,
        crypto_relevant: true,
        sentiment_score: 1.0,
        impact_rating: 5,
        reasoning: "Old Signal",
        model_used: "test_future",
        prompt_version: "v_old",
        input_hash: uniqueHash + "_old"
    });

    // HACK: Update available_at to Past (-120 mins)
    db.prepare(`UPDATE news_signals SET available_at = datetime('now', '-120 minutes') WHERE model_used = 'test_future' AND prompt_version = 'v_old'`).run();
    console.log("[Test] Scenario C: Signal injected 120 mins in the PAST.");

    // 3. Executar Busca
    console.log("\n🔍 Querying Recent Signals (Window: 60 min)...");
    const signals = sqliteDatabase.getRecentSentimentSignals(60, 4);

    console.log(`[Test] Returned ${signals.length} signals.`);

    // 4. Validar
    const hasFuture = signals.find(s => s.reasoning === "Future Signal");
    const hasRecent = signals.find(s => s.reasoning === "Valid Signal");
    const hasOld = signals.find(s => s.reasoning === "Old Signal");

    let pass = true;

    if (hasFuture) {
        console.error("❌ FAIL: Future Signal LEAKED into results!");
        pass = false;
    } else {
        console.log("✅ PASS: Future Signal correctly blocked.");
    }

    if (!hasRecent) {
        console.error("❌ FAIL: Valid Recent Signal was NOT found!");
        pass = false;
    } else {
        console.log("✅ PASS: Recent Signal found.");
    }

    if (hasOld) {
        console.error("❌ FAIL: Old Signal LEAKED (Window broken)!");
        pass = false;
    } else {
        console.log("✅ PASS: Old Signal correctly blocked.");
    }

    if (pass) {
        console.log("\n🎉 ALL ANTI-LOOKAHEAD CHECKS PASSED!");
        process.exit(0);
    } else {
        console.error("\n💀 ANTI-LOOKAHEAD FAILED.");
        process.exit(1);
    }
}

testLookaheadBias();
