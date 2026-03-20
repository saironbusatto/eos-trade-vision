/**
 * Shared utility functions for EOS trading bots
 */

// Format price with dynamic decimals based on value
export function formatPrice(price: number): string {
    if (price >= 100) return `$${price.toFixed(2)}`;
    if (price >= 1) return `$${price.toFixed(4)}`;
    if (price >= 0.01) return `$${price.toFixed(6)}`;
    return `$${price.toFixed(8)}`;
}

// Format percentage
export function formatPercent(value: number, decimals: number = 2): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(decimals)}%`;
}

// Calculate profit percentage
export function calculateProfit(entryPrice: number, exitPrice: number, isLong: boolean): number {
    if (isLong) {
        return ((exitPrice - entryPrice) / entryPrice) * 100;
    } else {
        return ((entryPrice - exitPrice) / entryPrice) * 100;
    }
}

// Check if within trading hours for S&P 500 (9:30 AM - 4:00 PM ET)
export function isSP500Open(): boolean {
    const now = new Date();
    const hour = now.getUTCHours();
    const day = now.getUTCDay();

    if (day === 0 || day === 6) return false;
    return hour >= 14 && hour < 21;
}

// Check if Forex market is open (Sunday 22:00 - Friday 22:00 UTC)
export function isForexOpen(): boolean {
    const now = new Date();
    const day = now.getUTCDay();
    const hour = now.getUTCHours();

    if (day === 0 && hour < 22) return false;
    if (day === 6) return false;
    if (day === 5 && hour >= 22) return false;
    return true;
}

// Get current UTC hour and day
export function getTimeFeatures(): { hour_utc: number; day_of_week: number } {
    const now = new Date();
    return {
        hour_utc: now.getUTCHours(),
        day_of_week: now.getUTCDay()
    };
}

// Sleep utility
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
