import { useState } from "react";
import { sendSignal, type TradingSignal } from "@/lib/signalApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast"; // Adjust path if needed, often it's hooks/use-toast or components/ui/use-toast

export default function Dashboard() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<TradingSignal>({
        symbol: "BTCUSDT",
        action: "BUY",
        price: 0,
        stopLoss: 0,
        takeProfit: 0,
        timeframe: "15m",
        notes: ""
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: ["price", "stopLoss", "takeProfit"].includes(name) ? parseFloat(value) || 0 : value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const result = await sendSignal(formData);

        setLoading(false);

        if (result.success) {
            toast({
                title: "Sucesso!",
                description: "Sinal enviado para o Telegram.",
                variant: "default", // or success if available
                className: "bg-green-500 text-white"
            });
        } else {
            toast({
                title: "Erro",
                description: result.error,
                variant: "destructive"
            });
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground p-8 pt-24">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-3xl font-bold mb-8 text-orange-500">EOS Signal Dashboard</h1>

                <form onSubmit={handleSubmit} className="space-y-6 bg-card p-6 rounded-xl border border-border/50 shadow-lg">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="symbol">Símbolo (Par)</Label>
                            <Input
                                id="symbol"
                                name="symbol"
                                value={formData.symbol}
                                onChange={handleChange}
                                placeholder="BTCUSDT"
                                className="bg-background/50 border-orange-500/20 focus:border-orange-500 transition-colors uppercase"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="action">Ação</Label>
                            <select
                                id="action"
                                name="action"
                                value={formData.action}
                                onChange={handleChange}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 border-orange-500/20 focus:border-orange-500 transition-colors"
                            >
                                <option value="BUY">COMPRA 🟢</option>
                                <option value="SELL">VENDA 🔴</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="price">Preço Entrada</Label>
                            <Input
                                id="price"
                                name="price"
                                type="number"
                                step="0.00000001"
                                value={formData.price}
                                onChange={handleChange}
                                className="bg-background/50"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="stopLoss">Stop Loss</Label>
                            <Input
                                id="stopLoss"
                                name="stopLoss"
                                type="number"
                                step="0.00000001"
                                value={formData.stopLoss}
                                onChange={handleChange}
                                className="bg-background/50 text-red-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="takeProfit">Take Profit</Label>
                            <Input
                                id="takeProfit"
                                name="takeProfit"
                                type="number"
                                step="0.00000001"
                                value={formData.takeProfit}
                                onChange={handleChange}
                                className="bg-background/50 text-green-500"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="timeframe">Timeframe</Label>
                            <Input
                                id="timeframe"
                                name="timeframe"
                                value={formData.timeframe}
                                onChange={handleChange}
                                placeholder="15m, 1h, 4h"
                                className="bg-background/50"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="notes">Notas (Opcional)</Label>
                            <Input
                                id="notes"
                                name="notes"
                                value={formData.notes || ""}
                                onChange={handleChange}
                                placeholder="Motivo da entrada..."
                                className="bg-background/50"
                            />
                        </div>
                    </div>

                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-6 text-lg mt-4"
                    >
                        {loading ? "Enviando..." : "ENVIAR SINAL 🚀"}
                    </Button>
                </form>

                <div className="mt-8 p-4 bg-muted/20 rounded-lg text-sm text-muted-foreground">
                    <p>ℹ️ <strong>Status do Backend:</strong> Conectado a {`http://54.232.17.9:3000`}</p>
                    <p>🔑 <strong>Segurança:</strong> Usando chave de API interna.</p>
                </div>
            </div>
        </div>
    );
}
