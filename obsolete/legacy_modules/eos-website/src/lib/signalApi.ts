export interface TradingSignal {
    symbol: string;
    action: "BUY" | "SELL";
    price: number;
    stopLoss?: number;
    takeProfit?: number;
    timeframe?: string;
    notes?: string;
}

const API_URL = "http://54.232.17.9:3000/api";
// In a real app, this should be in an environment variable or user input
const API_SECRET = "eos_secret_key_2024";

export async function sendSignal(signal: TradingSignal): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
        const response = await fetch(`${API_URL}/signal`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_SECRET}`
            },
            body: JSON.stringify(signal)
        });

        const data = await response.json();

        if (!response.ok) {
            return { success: false, error: data.error || "Failed to send signal" };
        }

        return { success: true, message: data.message };
    } catch (error) {
        console.error("Signal API Error:", error);
        return { success: false, error: "Network error or server unreachable" };
    }
}
