const Database = require('better-sqlite3');
const db = new Database('/app/data/eos.db', { readonly: true });

// Lista de stablecoins que devem ser excluídas
const stablecoins = ['USDTUSDT', 'USDCUSDT', 'USDSUSDT', 'USDEUSDT', 'DAIUSDT',
    'TUSDUSDT', 'FDUSDUSDT', 'EURCUSDT', 'USDPUSDT', 'PYUSDUSDT',
    'BUSDUSDT', 'GUSDUSDT'];

// Todos os sinais
const all = db.prepare(`
    SELECT result, COUNT(*) as cnt 
    FROM signals 
    WHERE result IN ('WIN', 'LOSS')
    GROUP BY result
`).all();

console.log('=== TODAS AS MOEDAS ===');
all.forEach(r => console.log(`${r.result}: ${r.cnt}`));

// Sinais sem stablecoins
const filtered = db.prepare(`
    SELECT result, COUNT(*) as cnt 
    FROM signals 
    WHERE result IN ('WIN', 'LOSS')
    AND symbol NOT IN ('USDTUSDT', 'USDCUSDT', 'USDSUSDT', 'USDEUSDT', 'DAIUSDT', 
                       'TUSDUSDT', 'FDUSDUSDT', 'EURCUSDT', 'USDPUSDT', 'PYUSDUSDT',
                       'BUSDUSDT', 'GUSDUSDT')
    GROUP BY result
`).all();

console.log('\n=== SEM STABLECOINS ===');
filtered.forEach(r => console.log(`${r.result}: ${r.cnt}`));

// Contar stablecoins removidas
const stableStats = db.prepare(`
    SELECT symbol, result, COUNT(*) as cnt 
    FROM signals 
    WHERE result IN ('WIN', 'LOSS')
    AND symbol IN ('USDTUSDT', 'USDCUSDT', 'USDSUSDT', 'USDEUSDT', 'DAIUSDT', 
                   'TUSDUSDT', 'FDUSDUSDT', 'EURCUSDT', 'USDPUSDT', 'PYUSDUSDT',
                   'BUSDUSDT', 'GUSDUSDT')
    GROUP BY symbol, result
`).all();

if (stableStats.length > 0) {
    console.log('\n=== STABLECOINS ENCONTRADAS ===');
    stableStats.forEach(r => console.log(`${r.symbol} ${r.result}: ${r.cnt}`));
} else {
    console.log('\n=== NENHUMA STABLECOIN ENCONTRADA NOS DADOS ===');
}

db.close();
