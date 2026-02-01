// src/engine/tests/skeleton.spec.ts
// Data Engine Unit Tests

import { MarketDataBuffer } from '../MarketDataBuffer';
import { BinanceAggTrade } from '../types';

// Helper to create mock trade
const mockTrade = (id: number, time: number): BinanceAggTrade => ({
    e: 'aggTrade',
    E: time,
    s: 'SOLUSDT',
    a: id,
    p: '100.00',
    q: '1.5',
    f: id,
    l: id,
    T: time,
    m: true
});

describe('MarketDataBuffer Integrity', () => {
    let buffer: MarketDataBuffer;

    beforeEach(() => {
        buffer = new MarketDataBuffer('SOLUSDT');
    });

    test('should maintain strict order after insertMany', () => {
        buffer.insertMany([
            mockTrade(100, Date.now() - 1000),
            mockTrade(99, Date.now() - 2000)
        ]);
        const stats = buffer.getStats();
        expect(stats.firstId).toBe(99);
        expect(stats.lastId).toBe(100);
    });

    test('should reject HARD GAP in realtime', () => {
        buffer.insertMany([mockTrade(100, Date.now() - 1000)]);

        // Gap of 1: expecting 101, received 102
        const success = buffer.insertRealtime(mockTrade(102, Date.now()));
        expect(success).toBe(false);
    });

    test('should accept out-of-order (late arrival)', () => {
        buffer.insertMany([mockTrade(100, Date.now() - 2000)]);
        buffer.insertRealtime(mockTrade(101, Date.now() - 1000));
        buffer.insertRealtime(mockTrade(100, Date.now() - 2000)); // Dup

        expect(buffer.getStats().count).toBe(2);
    });

    test('should deduplicate trades with same id', () => {
        buffer.insertMany([
            mockTrade(100, Date.now()),
            mockTrade(100, Date.now()),
            mockTrade(101, Date.now())
        ]);
        expect(buffer.getStats().count).toBe(2);
    });
});

describe('DataEngine Orchestration', () => {
    test.todo('WarmUp Stitching Consistency');
    test.todo('Gap Fill triggers on discontinuity');
    test.todo('State transitions correctly');
});
