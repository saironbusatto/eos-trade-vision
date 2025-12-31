// fix-iq-db.js - Migração para IQ Bot
const Database = require('better-sqlite3');
const db = new Database('./data/eos-iq.db');

console.log('=== Migração IQ Bot v3.0 ===');

try {
    db.exec("ALTER TABLE signals ADD COLUMN strategy_version TEXT DEFAULT 'v2.0'");
    console.log('✅ Coluna strategy_version adicionada!');
} catch (e) {
    if (e.message.includes('duplicate column')) {
        console.log('⚠️ Coluna já existe');
    } else {
        console.log('Erro:', e.message);
    }
}

const count = db.prepare('SELECT COUNT(*) as c FROM signals').get();
console.log(`📊 Total sinais: ${count.c}`);
