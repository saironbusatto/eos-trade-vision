// Script para verificar e limpar sinais pendentes antigos
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'data/eos-iq.db');
const db = new Database(DB_PATH);

// Verificar sinais pendentes
const pending = db.prepare("SELECT COUNT(*) as c FROM signals WHERE result = 'PENDING'").get();
const pendingNoGolden = db.prepare("SELECT COUNT(*) as c FROM signals WHERE result = 'PENDING' AND (is_golden IS NULL OR is_golden = 0)").get();

console.log('='.repeat(50));
console.log('  Sinais Pendentes');
console.log('='.repeat(50));
console.log('Total pendentes:', pending.c);
console.log('Pendentes SEM golden:', pendingNoGolden.c);

// Marcar sinais antigos sem golden como LOSS para parar de enviar
if (pendingNoGolden.c > 0) {
    console.log('\nMarcando sinais antigos como EXPIRED...');
    const result = db.prepare("UPDATE signals SET result = 'LOSS' WHERE result = 'PENDING' AND (is_golden IS NULL OR is_golden = 0)").run();
    console.log('Atualizados:', result.changes, 'sinais');
}

console.log('\n✅ Concluído!');
db.close();
