// migrate-v3.js - Adiciona coluna strategy_version
const Database = require('better-sqlite3');
const db = new Database('./data/eos.db');

try {
    db.exec("ALTER TABLE signals ADD COLUMN strategy_version TEXT DEFAULT 'v2.0'");
    console.log('✅ Coluna strategy_version adicionada com sucesso!');
} catch (e) {
    if (e.message.includes('duplicate column')) {
        console.log('⚠️ Coluna já existe, tudo OK');
    } else {
        console.error('❌ Erro:', e.message);
    }
}

// Verificar
const count = db.prepare("SELECT COUNT(*) as c FROM signals WHERE strategy_version = 'v2.0'").get();
console.log(`📊 ${count.c} sinais marcados como v2.0`);
