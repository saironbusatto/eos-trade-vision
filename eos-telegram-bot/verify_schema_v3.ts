
import { sqliteDatabase } from './src/sqliteDatabase';
import Database from 'better-sqlite3';

const db = new Database('./data/eos.db');

const tables = [
    'news_items',
    'news_signals',
    'paper_accounts',
    'paper_positions',
    'paper_trades'
];

console.log('Verificando tabelas do Paper Trading...');

tables.forEach(table => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (result) {
        console.log(`✅ Tabela '${table}' criada com sucesso.`);
        // Listar colunas para verificar constraints (basico)
        const columns = db.pragma(`table_info(${table})`) as any[];
        const colNames = columns.map(c => c.name).join(', ');
        console.log(`   Colunas: ${colNames}`);
    } else {
        console.error(`❌ Tabela '${table}' NAO encontrada!`);
    }
});
