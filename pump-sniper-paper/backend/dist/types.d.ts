export interface Token {
    mint: string;
    name: string;
    symbol: string;
    creator: string;
    createdAt: number;
    metadata?: {
        image?: string;
        description?: string;
    };
}
export interface PriceHistoryPoint {
    timestamp: number;
    price: number;
    marketCap: number;
    pnlPercent: number;
}
export interface TradePosition {
    id: string;
    tokenMint: string;
    tokenName: string;
    tokenSymbol: string;
    entryPrice: number;
    entryMarketCap: number;
    amount: number;
    solAmount: number;
    buyRank: number;
    totalBuyersAtEntry: number;
    buyTime: number;
    graduated: boolean;
    graduatedAt?: number;
    sold: boolean;
    soldAt?: number;
    soldPrice?: number;
    pnl: number;
    pnlPercent: number;
    currentPrice: number;
    currentMarketCap: number;
    bondingCurveProgress: number;
    holderCount: number;
    priceHistory: PriceHistoryPoint[];
}
export interface PaperTradeConfig {
    maxPositions: number;
    buyAmount: number;
    takeProfitPercent: number;
    stopLossPercent: number;
    autoSell: boolean;
    minLiquidity: number;
    maxSlippage: number;
    tradingFeePercent: number;
    networkFeeSol: number;
    forceSellAfterMinutes: number;
    detectionLatencyMs: number;
    confirmationLatencyMs: number;
}
export interface BondingCurveState {
    virtualSolReserves: number;
    virtualTokenReserves: number;
    realSolReserves: number;
    realTokenReserves: number;
    tokenTotalSupply: number;
    complete: boolean;
}
export interface TokenEvent {
    type: 'create' | 'trade' | 'complete';
    mint: string;
    data: any;
    timestamp: number;
}
export interface PerformanceStats {
    totalTrades: number;
    winCount: number;
    lossCount: number;
    totalPnl: number;
    totalPnlPercent: number;
    avgHoldingTime: number;
    bestTrade: TradePosition | null;
    worstTrade: TradePosition | null;
    currentPositions: number;
    graduatedTokens: number;
}
//# sourceMappingURL=types.d.ts.map