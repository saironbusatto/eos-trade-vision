const Database = require('better-sqlite3');
const db = new Database('/app/data/eos.db', { readonly: true });

console.log('='.repeat(60));
console.log('ANÁLISE DE ML - CRYPTO BOT');
console.log('='.repeat(60));

// 1. Análise por Hora UTC
console.log('\n📅 WIN RATE POR HORA UTC:');
const byHour = db.prepare(`
    SELECT 
        CAST(strftime('%H', created_at) AS INTEGER) as hour,
        COUNT(*) as total,
        SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) as wins,
        ROUND(100.0 * SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) / COUNT(*), 1) as wr
    FROM signals 
    WHERE result IN ('WIN', 'LOSS')
    GROUP BY hour
    ORDER BY wr DESC
    LIMIT 10
`).all();
byHour.forEach(r => console.log(`Hora ${r.hour.toString().padStart(2, '0')}h: ${r.wr}% (${r.wins}/${r.total})`));

// 2. Análise por Dia da Semana
console.log('\n📆 WIN RATE POR DIA DA SEMANA:');
const byDay = db.prepare(`
    SELECT 
        CAST(strftime('%w', created_at) AS INTEGER) as dow,
        CASE CAST(strftime('%w', created_at) AS INTEGER)
            WHEN 0 THEN 'Dom' WHEN 1 THEN 'Seg' WHEN 2 THEN 'Ter'
            WHEN 3 THEN 'Qua' WHEN 4 THEN 'Qui' WHEN 5 THEN 'Sex' WHEN 6 THEN 'Sab'
        END as day_name,
        COUNT(*) as total,
        SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) as wins,
        ROUND(100.0 * SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) / COUNT(*), 1) as wr
    FROM signals 
    WHERE result IN ('WIN', 'LOSS')
    GROUP BY dow
    ORDER BY wr DESC
`).all();
byDay.forEach(r => console.log(`${r.day_name}: ${r.wr}% (${r.wins}/${r.total})`));

// 3. Análise por Moeda (Top 10)
console.log('\n🪙 TOP 10 MOEDAS POR WIN RATE (min 5 trades):');
const byCoin = db.prepare(`
    SELECT 
        symbol,
        COUNT(*) as total,
        SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) as wins,
        ROUND(100.0 * SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) / COUNT(*), 1) as wr
    FROM signals 
    WHERE result IN ('WIN', 'LOSS')
    GROUP BY symbol
    HAVING total >= 5
    ORDER BY wr DESC
    LIMIT 10
`).all();
byCoin.forEach(r => console.log(`${r.symbol}: ${r.wr}% (${r.wins}/${r.total})`));

// 4. Piores Moedas
console.log('\n❌ PIORES 10 MOEDAS (min 5 trades):');
const worstCoins = db.prepare(`
    SELECT 
        symbol,
        COUNT(*) as total,
        SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) as wins,
        ROUND(100.0 * SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) / COUNT(*), 1) as wr
    FROM signals 
    WHERE result IN ('WIN', 'LOSS')
    GROUP BY symbol
    HAVING total >= 5
    ORDER BY wr ASC
    LIMIT 10
`).all();
worstCoins.forEach(r => console.log(`${r.symbol}: ${r.wr}% (${r.wins}/${r.total})`));

// 5. Análise por Score
console.log('\n📊 WIN RATE POR FAIXA DE SCORE:');
const byScore = db.prepare(`
    SELECT 
        CASE 
            WHEN score >= 80 THEN '80-100'
            WHEN score >= 70 THEN '70-79'
            WHEN score >= 60 THEN '60-69'
            WHEN score >= 50 THEN '50-59'
            ELSE '< 50'
        END as score_range,
        COUNT(*) as total,
        SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) as wins,
        ROUND(100.0 * SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) / COUNT(*), 1) as wr
    FROM signals 
    WHERE result IN ('WIN', 'LOSS')
    GROUP BY score_range
    ORDER BY score_range DESC
`).all();
byScore.forEach(r => console.log(`Score ${r.score_range}: ${r.wr}% (${r.wins}/${r.total})`));

// 6. Análise por Direção (BUY vs SELL)
console.log('\n🔄 WIN RATE POR DIREÇÃO:');
const byAction = db.prepare(`
    SELECT 
        action,
        COUNT(*) as total,
        SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) as wins,
        ROUND(100.0 * SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) / COUNT(*), 1) as wr
    FROM signals 
    WHERE result IN ('WIN', 'LOSS')
    GROUP BY action
    ORDER BY wr DESC
`).all();
byAction.forEach(r => console.log(`${r.action}: ${r.wr}% (${r.wins}/${r.total})`));

// 7. Features ML (médias para WIN vs LOSS)
console.log('\n🧠 MÉDIA DE FEATURES (WIN vs LOSS):');
const features = db.prepare(`
    SELECT 
        result,
        ROUND(AVG(f_smart_money), 3) as smart_money,
        ROUND(AVG(f_trend), 3) as trend,
        ROUND(AVG(f_momentum), 3) as momentum,
        ROUND(AVG(f_volume), 3) as volume,
        ROUND(AVG(score), 1) as avg_score
    FROM signals 
    WHERE result IN ('WIN', 'LOSS')
    GROUP BY result
`).all();
features.forEach(r => {
    console.log(`${r.result}: SmartMoney=${r.smart_money} Trend=${r.trend} Momentum=${r.momentum} Volume=${r.volume} Score=${r.avg_score}`);
});

// 8. Combinação Hora + Dia (melhores slots)
console.log('\n🎯 MELHORES SLOTS (Dia+Hora) - TOP 5:');
const bestSlots = db.prepare(`
    SELECT 
        CASE CAST(strftime('%w', created_at) AS INTEGER)
            WHEN 0 THEN 'Dom' WHEN 1 THEN 'Seg' WHEN 2 THEN 'Ter'
            WHEN 3 THEN 'Qua' WHEN 4 THEN 'Qui' WHEN 5 THEN 'Sex' WHEN 6 THEN 'Sab'
        END || ' ' || strftime('%H', created_at) || 'h' as slot,
        COUNT(*) as total,
        SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) as wins,
        ROUND(100.0 * SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) / COUNT(*), 1) as wr
    FROM signals 
    WHERE result IN ('WIN', 'LOSS')
    GROUP BY slot
    HAVING total >= 3
    ORDER BY wr DESC
    LIMIT 5
`).all();
bestSlots.forEach(r => console.log(`${r.slot}: ${r.wr}% (${r.wins}/${r.total})`));

console.log('\n' + '='.repeat(60));
console.log('RECOMENDAÇÕES PARA TREINAMENTO:');
console.log('='.repeat(60));
console.log('1. Usar as melhores horas/dias como filtro adicional');
console.log('2. Dar peso maior para moedas com alto win rate histórico');
console.log('3. Aumentar threshold de score para >= 70-80');
console.log('4. Blacklistar moedas com WR < 40%');
console.log('5. Usar features normalizadas para treinar modelo ML');

db.close();
