const Database = require('better-sqlite3');
const db = new Database('/app/data/eos-iq.db', { readonly: true });

// Últimos 10 sinais fechados
const signals = db.prepare(`
    SELECT id, pair, direction, entry_price, exit_price, result 
    FROM signals 
    WHERE result IN ('WIN', 'LOSS') 
    ORDER BY id DESC 
    LIMIT 10
`).all();

console.log('=== ÚLTIMOS 10 SINAIS ===');
signals.forEach(s => {
    const diff = s.direction === 'CALL'
        ? ((s.exit_price - s.entry_price) / s.entry_price * 100)
        : ((s.entry_price - s.exit_price) / s.entry_price * 100);
    console.log(`#${s.id} ${s.pair} ${s.direction} Entry:${s.entry_price} Exit:${s.exit_price} Diff:${diff.toFixed(4)}% => ${s.result}`);
});

// Estatísticas por par
const stats = db.prepare(`
    SELECT pair, direction, 
           COUNT(*) as total,
           SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) as wins
    FROM signals 
    WHERE result IN ('WIN', 'LOSS')
    GROUP BY pair, direction
    ORDER BY total DESC
    LIMIT 10
`).all();

console.log('\n=== STATS POR PAR/DIREÇÃO ===');
stats.forEach(s => {
    const wr = (s.wins / s.total * 100).toFixed(1);
    console.log(`${s.pair} ${s.direction}: ${s.wins}/${s.total} (${wr}%)`);
});

db.close();
