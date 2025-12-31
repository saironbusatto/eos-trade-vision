/**
 * Script de migração para adicionar coluna is_golden ao banco do EoS IQ
 * Executar no EC2: node fix-iq-golden.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'data/eos-iq.db');

console.log('='.repeat(60));
console.log('   EoS IQ - Migração is_golden');
console.log('='.repeat(60));

try {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Verificar se coluna já existe
    const columns = db.prepare("PRAGMA table_info(signals)").all();
    const hasGolden = columns.some(c => c.name === 'is_golden');

    if (hasGolden) {
        console.log('✅ Coluna is_golden já existe!');
    } else {
        console.log('Adicionando coluna is_golden...');
        db.exec('ALTER TABLE signals ADD COLUMN is_golden INTEGER DEFAULT 0');
        console.log('✅ Coluna is_golden adicionada!');
    }

    // Estatísticas
    const total = db.prepare('SELECT COUNT(*) as c FROM signals').get();
    const golden = db.prepare('SELECT COUNT(*) as c FROM signals WHERE is_golden = 1').get();

    console.log(`\nEstatísticas:`);
    console.log(`  Total de sinais: ${total.c}`);
    console.log(`  Sinais golden: ${golden.c}`);

    db.close();
    console.log('\n✅ Migração concluída!');

} catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
}
