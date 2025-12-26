import { useState, useEffect, useCallback } from "react";
import { subscribeToOrderBook, formatPrice, type OrderBook, type OrderBookEntry } from "@/lib/binanceApi";
import { useLanguage } from "@/i18n";

interface OrderBookProps {
    defaultSymbol?: string;
}

const POPULAR_PAIRS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"];

export function OrderBookWidget({ defaultSymbol = "BTCUSDT" }: OrderBookProps) {
    const { language } = useLanguage();
    const [symbol, setSymbol] = useState(defaultSymbol);
    const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const handleOrderBookUpdate = useCallback((data: OrderBook) => {
        setOrderBook(data);
        setIsConnected(true);
    }, []);

    useEffect(() => {
        setIsConnected(false);
        setOrderBook(null);

        const unsubscribe = subscribeToOrderBook(symbol, handleOrderBookUpdate, "10");

        return () => {
            unsubscribe();
        };
    }, [symbol, handleOrderBookUpdate]);

    const maxQuantity = orderBook
        ? Math.max(
            ...orderBook.bids.map((b) => parseFloat(b.quantity)),
            ...orderBook.asks.map((a) => parseFloat(a.quantity))
        )
        : 1;

    const getBarWidth = (quantity: string) => {
        return (parseFloat(quantity) / maxQuantity) * 100;
    };

    const texts = {
        title: language === "pt-BR" ? "Order Book" : "Order Book",
        price: language === "pt-BR" ? "Preço" : "Price",
        quantity: language === "pt-BR" ? "Quantidade" : "Quantity",
        total: language === "pt-BR" ? "Total" : "Total",
        bids: language === "pt-BR" ? "Compra" : "Bids",
        asks: language === "pt-BR" ? "Venda" : "Asks",
        connecting: language === "pt-BR" ? "Conectando..." : "Connecting...",
        live: language === "pt-BR" ? "Ao vivo" : "Live",
    };

    return (
        <section className="relative py-20 overflow-hidden">
            {/* Background */}
            <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/10 to-background" />

            <div className="container relative z-10 mx-auto px-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-4">
                        <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                            {texts.title}
                        </h2>
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono ${isConnected
                                ? "bg-green-500/10 text-green-400 border border-green-500/30"
                                : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30"
                            }`}>
                            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400 animate-pulse" : "bg-yellow-400"}`} />
                            {isConnected ? texts.live : texts.connecting}
                        </div>
                    </div>

                    {/* Symbol Selector */}
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                        {POPULAR_PAIRS.map((pair) => (
                            <button
                                key={pair}
                                onClick={() => setSymbol(pair)}
                                className={`px-3 py-1.5 rounded-lg font-mono text-sm transition-all duration-200 ${symbol === pair
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground border border-border/50"
                                    }`}
                            >
                                {pair.replace("USDT", "")}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Order Book Grid */}
                <div className="grid md:grid-cols-2 gap-6">
                    {/* Bids (Buy Orders) */}
                    <div className="bg-card/30 border border-border/50 rounded-2xl p-4 backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-3 h-3 rounded-full bg-green-500" />
                            <h3 className="font-semibold text-green-400">{texts.bids}</h3>
                        </div>

                        {/* Header */}
                        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground font-mono mb-2 px-2">
                            <span>{texts.price}</span>
                            <span className="text-right">{texts.quantity}</span>
                            <span className="text-right">{texts.total}</span>
                        </div>

                        {/* Rows */}
                        <div className="space-y-1">
                            {orderBook?.bids.slice(0, 10).map((bid, index) => (
                                <OrderBookRow
                                    key={`bid-${index}`}
                                    entry={bid}
                                    type="bid"
                                    barWidth={getBarWidth(bid.quantity)}
                                />
                            )) || Array(10).fill(null).map((_, i) => (
                                <div key={i} className="h-7 bg-card/20 rounded animate-pulse" />
                            ))}
                        </div>
                    </div>

                    {/* Asks (Sell Orders) */}
                    <div className="bg-card/30 border border-border/50 rounded-2xl p-4 backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-3 h-3 rounded-full bg-red-500" />
                            <h3 className="font-semibold text-red-400">{texts.asks}</h3>
                        </div>

                        {/* Header */}
                        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground font-mono mb-2 px-2">
                            <span>{texts.price}</span>
                            <span className="text-right">{texts.quantity}</span>
                            <span className="text-right">{texts.total}</span>
                        </div>

                        {/* Rows */}
                        <div className="space-y-1">
                            {orderBook?.asks.slice(0, 10).map((ask, index) => (
                                <OrderBookRow
                                    key={`ask-${index}`}
                                    entry={ask}
                                    type="ask"
                                    barWidth={getBarWidth(ask.quantity)}
                                />
                            )) || Array(10).fill(null).map((_, i) => (
                                <div key={i} className="h-7 bg-card/20 rounded animate-pulse" />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Spread Info */}
                {orderBook && orderBook.bids.length > 0 && orderBook.asks.length > 0 && (
                    <div className="mt-6 text-center">
                        <div className="inline-flex items-center gap-4 px-6 py-3 bg-card/30 border border-border/50 rounded-full">
                            <span className="text-muted-foreground text-sm">Spread:</span>
                            <span className="font-mono text-foreground">
                                ${formatPrice(
                                    (parseFloat(orderBook.asks[0].price) - parseFloat(orderBook.bids[0].price)).toString()
                                )}
                            </span>
                            <span className="text-muted-foreground text-sm">
                                ({(
                                    ((parseFloat(orderBook.asks[0].price) - parseFloat(orderBook.bids[0].price)) /
                                        parseFloat(orderBook.asks[0].price)) *
                                    100
                                ).toFixed(3)}%)
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}

function OrderBookRow({
    entry,
    type,
    barWidth,
}: {
    entry: OrderBookEntry;
    type: "bid" | "ask";
    barWidth: number;
}) {
    const total = parseFloat(entry.price) * parseFloat(entry.quantity);
    const isBid = type === "bid";

    return (
        <div className="relative h-7 flex items-center">
            {/* Background Bar */}
            <div
                className={`absolute inset-y-0 ${isBid ? "right-0" : "left-0"} rounded ${isBid ? "bg-green-500/10" : "bg-red-500/10"
                    }`}
                style={{ width: `${barWidth}%` }}
            />

            {/* Content */}
            <div className="relative grid grid-cols-3 gap-2 w-full px-2 text-sm font-mono">
                <span className={isBid ? "text-green-400" : "text-red-400"}>
                    ${formatPrice(entry.price)}
                </span>
                <span className="text-right text-foreground/80">
                    {parseFloat(entry.quantity).toFixed(4)}
                </span>
                <span className="text-right text-muted-foreground">
                    ${formatPrice(total.toString())}
                </span>
            </div>
        </div>
    );
}
