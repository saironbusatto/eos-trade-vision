const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DBS = [
    { name: 'CRYPTO BOT', path: './eos-telegram-bot/data/eos.db' },
    { name: 'IQ BOT (Legacy)', path: './eos-iq-bot/data/eos-iq.db' }
];

async function inspect(dbInfo) {
    return new Promise((resolve) => {
        console.log(`\n🔍 Inspecionando: ${dbInfo.name} (${dbInfo.path})...`);
        const db = new sqlite3.Database(dbInfo.path, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                console.error(`❌ Erro ao abrir: ${err.message}`);
                resolve();
                return;
            }
        });

        db.serialize(() => {
            // Listar tabelas
            db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
                if (err) {
                    console.error("❌ Erro ao listar tabelas:", err);
                } else {
                    const tableNames = tables.map(t => t.name);
                    console.log(`   📂 Tabelas encontradas: ${tableNames.join(', ')}`);

                    // Se tiver 'signals', contar
                    if (tableNames.includes('signals')) {
                        db.get("SELECT count(*) as count FROM signals", (err, row) => {
                            console.log(`   📊 Total de Sinais: ${row ? row.count : 'Erro'}`);
                            console.log(`   ✅ Status: OK`);
                            db.close();
                            resolve();
                        });
                    } else {
                        console.log(`   ⚠️ Tabela 'signals' não encontrada.`);
                        db.close();
                        resolve();
                    }
                }
            });
        });
    });
}

async function run() {
    for (const db of DBS) {
        await inspect(db);
    }
}

run();
