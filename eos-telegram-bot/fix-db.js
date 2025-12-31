const Database = require('better-sqlite3');
const db = new Database('./data/eos.db');

const columns = [
    { name: 'macro_confidence', type: 'REAL DEFAULT 0' },
    { name: 'macro_sentiment', type: 'TEXT' },
    { name: 'fear_greed', type: 'INTEGER' },
    { name: 'trade_recommendation', type: 'TEXT' },
    { name: 'sp500_trend', type: 'TEXT' },
    { name: 'fed_stance', type: 'TEXT' },
];

for (const col of columns) {
    try {
        db.exec(`ALTER TABLE ml_training ADD COLUMN ${col.name} ${col.type}`);
        console.log(`✅ Coluna '${col.name}' adicionada!`);
    } catch (e) {
        if (e.message.includes('duplicate column')) {
            console.log(`ℹ️ Coluna '${col.name}' já existe`);
        } else {
            console.log(`❌ Erro em '${col.name}':`, e.message);
        }
    }
}

// Verificar estrutura
const cols = db.prepare("PRAGMA table_info(ml_training)").all();
console.log('\n📋 Colunas da tabela ml_training:');
cols.forEach(c => console.log(`  - ${c.name}: ${c.type || 'N/A'}`));

