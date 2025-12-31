// fix-db.js - Diagnostica e corrige o banco de dados
const Database = require('better-sqlite3');
const db = new Database('./data/eos.db');

console.log('=== Diagnóstico do Banco ===');

// Verificar colunas
const columns = db.prepare('PRAGMA table_info(signals)').all();
console.log('Colunas na tabela signals:');
columns.forEach(c => console.log(`  - ${c.name}`));

const hasStrategyVersion = columns.some(c => c.name === 'strategy_version');

if (!hasStrategyVersion) {
    console.log('\n❌ Coluna strategy_version NÃO existe!');
    console.log('Adicionando...');
    try {
        db.exec("ALTER TABLE signals ADD COLUMN strategy_version TEXT DEFAULT 'v2.0'");
        console.log('✅ Coluna adicionada!');
    } catch (e) {
        console.log('Erro:', e.message);
    }
} else {
    console.log('\n✅ Coluna strategy_version existe');
}

// Contar sinais
const total = db.prepare('SELECT COUNT(*) as c FROM signals').get();
console.log(`\nTotal de sinais: ${total.c}`);

// Tentar a query que está falhando
try {
    const stats = db.prepare("SELECT COUNT(*) as c FROM signals WHERE result = 'WIN' AND strategy_version = 'v3.0'").get();
    console.log(`Wins v3.0: ${stats.c}`);
} catch (e) {
    console.log('Erro na query:', e.message);
}

console.log('\n=== Fim do Diagnóstico ===');
