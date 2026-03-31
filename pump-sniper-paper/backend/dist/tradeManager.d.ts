import { Token, TradePosition, PaperTradeConfig, PerformanceStats } from './types';
export declare class TradeManager {
    private positions;
    private bondingCurves;
    private config;
    private tradeHistory;
    private currentBalance;
    private isPaused;
    private pnlHistory;
    constructor(config?: Partial<PaperTradeConfig>);
    onNewToken(token: Token): Promise<TradePosition | null>;
    pause(): void;
    resume(): void;
    isTradingPaused(): boolean;
    getTotalBalance(): {
        cash: number;
        positions: number;
        total: number;
    };
    sellAll(reason?: 'manual' | 'force'): Promise<TradePosition[]>;
    sellProfitable(): Promise<TradePosition[]>;
    sellLoss(): Promise<TradePosition[]>;
    private simulateLatency;
    private executeBuy;
    updatePrice(tokenMint: string, solAmount: number, isBuy: boolean): Promise<TradePosition | null>;
    private calculatePnL;
    private checkAutoSell;
    checkAllForceSell(): Promise<TradePosition[]>;
    executeSell(tokenMint: string, reason?: 'manual' | 'take_profit' | 'stop_loss' | 'force_sell'): Promise<TradePosition | null>;
    private recordPnlHistory;
    getPnlHistory(): {
        timestamp: number;
        totalPnl: number;
        balance: number;
        totalValue: number;
    }[];
    clearPnlHistory(): void;
    getAllPositions(): TradePosition[];
    getPosition(tokenMint: string): TradePosition | undefined;
    getTradeHistory(): TradePosition[];
    getStats(): PerformanceStats;
    getBalance(): number;
    updateConfig(config: Partial<PaperTradeConfig>): void;
    getConfig(): PaperTradeConfig;
    reset(): void;
}
//# sourceMappingURL=tradeManager.d.ts.map