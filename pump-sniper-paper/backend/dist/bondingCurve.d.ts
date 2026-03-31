export interface SellResult {
    solAmount: number;
    price: number;
    marketCap: number;
    avgPrice: number;
}
export declare class BondingCurveCalculator {
    private virtualSolReserves;
    private virtualTokenReserves;
    private realSolReserves;
    private realTokenReserves;
    private totalTokensSold;
    private totalBuyers;
    constructor();
    getCurrentPrice(): number;
    getMarketCap(): number;
    getProgress(): number;
    isGraduated(): boolean;
    simulateBuy(solAmount: number): {
        tokenAmount: number;
        priceImpact: number;
        avgPrice: number;
        newPrice: number;
    };
    executeBuy(solAmount: number): {
        tokenAmount: number;
        rank: number;
        price: number;
        marketCap: number;
        progress: number;
    };
    simulateSell(tokenAmount: number): {
        solAmount: number;
        priceImpact: number;
        avgPrice: number;
    };
    executeSell(tokenAmount: number): SellResult;
    getState(): {
        virtualSolReserves: number;
        virtualTokenReserves: number;
        realSolReserves: number;
        realTokenReserves: number;
        totalTokensSold: number;
        totalBuyers: number;
        currentPrice: number;
        marketCap: number;
        progress: number;
        graduated: boolean;
    };
    getTotalBuyers(): number;
}
export declare function formatPrice(price: number): string;
export declare function formatSol(lamports: number): string;
//# sourceMappingURL=bondingCurve.d.ts.map