
import { sqliteDatabase } from '../sqliteDatabase';
import { getRandomQuote } from '../quotes';

// Taxas simuladas (Binance Futures taker fee aprox)
const FEE_RATE = 0.0005; // 0.05%
// Slippage padrão simulado
const SLIPPAGE_RATE = 0.0002; // 0.02%

interface TradeFeedback {
    message: string;
    tradeDetails: {
        symbol: string;
        direction: string;
        pnlNet: number;
        pnlPercent: number;
    };
}

export class PaperTradingService {
    private async getCurrentPrice(symbol: string): Promise<number | null> {
        try {
            const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
            const response = await fetch(url);
            const data = await response.json() as { price?: string };
            const price = Number(data.price);
            return Number.isFinite(price) ? price : null;
        } catch {
            return null;
        }
    }

    // Inicia ou Reseta conta do usuário
    public startAccount(userId: string, username: string, initialBalance: number): string {
        // Validação básica
        if (initialBalance < 10) return "⚠️ Valor mínimo inicial é $10.";
        if (initialBalance > 1000000) return "⚠️ Valor máximo inicial é $1,000,000.";

        sqliteDatabase.createAccount(userId, username, initialBalance);
        return `
🏁 *Conta Virtual Iniciada!*

👤 Usuário: ${username}
💰 Saldo Inicial: $${initialBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

_Use /carteira para ver seu progresso._
`.trim();
    }

    // Obtém resumo da carteira
    public getPortfolioStats(userId: string): string {
        const account = sqliteDatabase.getAccount(userId);
        if (!account) return "⚠️ Você não tem uma conta ativa. Use `/iniciar [valor]` para começar.";

        const positions = sqliteDatabase.getOpenPositions(account.id);
        const stats = sqliteDatabase.getTradeStats(account.id);

        // PnL Aberto (estimado base last price seria ideal, mas aqui mostramos 0 se n tiver live feed)
        // Em um sistema real, precisariamos do currentPrice de cada symbol aqui.
        // Como simplificação, listamos apenas as POSIÇÕES ABERTAS sem PnL floating realtime (ou implementamos depois).

        const openPositionsText = positions.length > 0
            ? positions.map(p => `• ${p.symbol} (${p.side}): ${p.size} un @ $${p.entry_price}`).join('\n')
            : "Nenhuma posição aberta.";

        const profitFactor = stats.losses > 0 ? Math.abs(stats.total_pnl / stats.losses) : (stats.total_pnl > 0 ? "Infinite" : 0);

        return `
📊 *Minha Carteira Virtual*

💰 Saldo: $${account.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
📈 Equity: $${account.equity.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

🔢 Estatísticas:
• Trades: ${stats.wins + stats.losses} (Wins: ${stats.wins} | Losses: ${stats.losses})
• Win Rate: ${stats.win_rate.toFixed(1)}%
• PnL Total: $${stats.total_pnl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

🔓 Posições Abertas:
${openPositionsText}
`.trim();
    }

    // Abre uma posição (chamado pelo TrendingScanner/Signal Engine)
    // Para Paper Trading "Passivo", o bot abre sozinho baseados nos sinais.
    // O usuário apenas vê o resultado.
    // Se quisermos que o usuário abra MANUALMENTE, precisaria de comandos de compra/venda.
    // O requisito atual implica que o bot opera e o usuário vê o resultado ("ele vai sempre ao final... dando feedback").
    // Vou assumir que o Bot abre automático para TODOS os usuários ativos (Copy Trading Virtual).

    // Método para ser chamado quando o bot gera um sinal
    public async onSignalGenerated(symbol: string, action: 'BUY' | 'SELL', price: number, stopLoss: number, takeProfit: number) {
        // Por simplicidade MVP: Vamos abrir trade para TODAS as contas ativas.
        // Em prod, isso seria filtrado ou otimizado.
        // Como não temos acesso fácil a lista de TODOS users aqui sem query, vamos assumir que o sistema processa um por um ou é focado no dono.
        // MAS o requisito é "varios podem usar".
        // IMPLEMENTAÇÃO: Vamos buscar todas contas ativas e abrir posição.

        // *NOTA*: Isso pode ser pesado se tiver mil usuários. Para MVP é ok.
        // Melhor: Ter um Loop em outro lugar. 
        // Para este serviço, vou expor um método `executeTradeForUser`
    }

    public executeEntry(userId: string, signal: {
        symbol: string, action: 'BUY' | 'SELL', price: number, stopLoss: number, takeProfit: number, leverage?: number
    }): boolean {
        const account = sqliteDatabase.getAccount(userId);
        if (!account) return false;

        const existingPositions = sqliteDatabase.getOpenPositions(account.id);
        if (existingPositions.some((p: any) => p.symbol === signal.symbol)) {
            return false;
        }

        const leverage = signal.leverage || 3; // Default 3x (Safe Base)

        // Margin Check
        // Quanto de margem (saldo da conta) estamos colocando?
        // Vamos arriscar 10% do SALDO em margem.
        // Nocional = (Saldo * 0.1) * Leverage.
        const marginAmount = account.balance * 0.1;
        if (marginAmount <= 0) return false;
        const notionalValue = marginAmount * leverage;
        const size = notionalValue / signal.price;
        if (!Number.isFinite(size) || size <= 0) return false;

        sqliteDatabase.openPosition({
            account_id: account.id,
            symbol: signal.symbol,
            side: signal.action === 'BUY' ? 'LONG' : 'SHORT',
            entry_price: signal.price,
            size: size,
            leverage: leverage,
            stop_loss: signal.stopLoss,
            take_profit: signal.takeProfit
        });
        return true;
    }

    public executeExit(userId: string, symbol: string, exitPrice: number, reason: string): TradeFeedback | null {
        const account = sqliteDatabase.getAccount(userId);
        if (!account) return null;

        const positions = sqliteDatabase.getOpenPositions(account.id);
        const position = positions.find(p => p.symbol === symbol);
        if (!position) return null;

        const leverage = position.leverage || 1;

        // PnL Calculation
        // Diferença de preço * Tamanho da posição (Coin amount)
        const priceDiff = position.side === 'LONG'
            ? exitPrice - position.entry_price
            : position.entry_price - exitPrice;

        let pnlGross = priceDiff * position.size; // Isso JÁ é o valor alavancado porque o 'position.size' foi inflado pelo leverage na entrada

        // Simulação de Liquidação
        // Margin = (EntryPrice * Size) / Leverage
        const initialMargin = (position.entry_price * position.size) / leverage;

        // Se a perda bruta engolir a margem inicial (aprox, sem contar maintenance margin pra simplificar)
        if (pnlGross <= -initialMargin) {
            pnlGross = -initialMargin; // Perda máxima é a margem (Isolated Margin Logic)
            reason = "LIQUIDATION 💀";
        }

        // Fees & Slippage (Incidem sobre Nocional: ExitPrice * Size)
        const notionalExit = exitPrice * position.size;
        const slippageCost = notionalExit * SLIPPAGE_RATE;
        const feeCost = notionalExit * FEE_RATE; // Taker fee on full size

        const pnlNet = pnlGross - slippageCost - feeCost;

        // ROI Calculation (Baseado na MARGEM investida)
        const pnlPercent = (pnlNet / initialMargin) * 100;

        // Close DB
        sqliteDatabase.insertTrade({
            position_id: position.id,
            account_id: account.id,
            symbol: symbol,
            side: position.side,
            entry_price: position.entry_price,
            exit_price: exitPrice,
            size: position.size,
            pnl_gross: pnlGross,
            slippage_cost: slippageCost + feeCost,
            pnl_net: pnlNet,
            pnl_percent: pnlPercent,
            close_reason: reason,
            execution_model: 'realistic_leverage',
            opened_at: position.opened_at
        });

        // Remove position
        sqliteDatabase.closePosition(position.id);

        // Update Account
        const newBalance = account.balance + pnlNet;
        const newEquity = newBalance; // Simplificação MVP

        // Safety: Prevent negative balance (no debt)
        const finalBalance = newBalance < 0 ? 0 : newBalance;

        sqliteDatabase.updateAccountBalance(userId, finalBalance, newEquity);

        // Format Message
        const emojiResult = pnlNet > 0 ? "WIN 🟢" : (reason.includes("LIQUIDATION") ? "REKT 💀" : "LOSS 🔴");
        const emojiSide = position.side === 'LONG' ? "🚀" : "📉";
        const leverageTag = leverage > 1 ? `| ${leverage}x` : "";

        const message = `
🔔 *Trade Encerrado: ${symbol}* ${leverageTag}
Direção: ${position.side} ${emojiSide} | Resultado: ${emojiResult}
 
📊 *Detalhes do Trade:*
💰 PnL Bruto: $${pnlGross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
💸 Fees/Slippage: -$${(slippageCost + feeCost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
💵 *PnL Líquido: ${pnlNet > 0 ? '+' : ''}$${pnlNet.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*
🔥 ROI: ${pnlPercent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%

🏦 *Carteira Total:*
💰 Saldo: $${finalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
📈 Evolução: ${((finalBalance - account.initial_balance) / account.initial_balance * 100).toFixed(2)}%

_${getRandomQuote()}_
`.trim();

        return {
            message,
            tradeDetails: {
                symbol,
                direction: position.side,
                pnlNet,
                pnlPercent
            }
        };
    }

    public async monitorAndClosePositions(userId: string): Promise<TradeFeedback[]> {
        const account = sqliteDatabase.getAccount(userId);
        if (!account) return [];

        const positions = sqliteDatabase.getOpenPositions(account.id);
        if (positions.length === 0) return [];

        const closed: TradeFeedback[] = [];

        for (const position of positions) {
            const currentPrice = await this.getCurrentPrice(position.symbol);
            if (!currentPrice) continue;

            const stopLoss = Number(position.stop_loss);
            const takeProfit = Number(position.take_profit);
            if (!Number.isFinite(stopLoss) || !Number.isFinite(takeProfit)) continue;

            let shouldClose = false;
            let reason = "AUTO_CLOSE";

            if (position.side === 'LONG') {
                if (currentPrice <= stopLoss) {
                    shouldClose = true;
                    reason = 'STOP_LOSS';
                } else if (currentPrice >= takeProfit) {
                    shouldClose = true;
                    reason = 'TAKE_PROFIT';
                }
            } else {
                if (currentPrice >= stopLoss) {
                    shouldClose = true;
                    reason = 'STOP_LOSS';
                } else if (currentPrice <= takeProfit) {
                    shouldClose = true;
                    reason = 'TAKE_PROFIT';
                }
            }

            if (!shouldClose) continue;

            const feedback = this.executeExit(userId, position.symbol, currentPrice, reason);
            if (feedback) closed.push(feedback);
        }

        return closed;
    }
}
