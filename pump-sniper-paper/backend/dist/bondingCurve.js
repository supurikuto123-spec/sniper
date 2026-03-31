"use strict";
// Pump.fun Bonding Curve Calculation
// 定積公式: x * y = k
// x = 仮想SOLリザーブ, y = 仮想トークンリザーブ
Object.defineProperty(exports, "__esModule", { value: true });
exports.BondingCurveCalculator = void 0;
exports.formatPrice = formatPrice;
exports.formatSol = formatSol;
const DEFAULT_VIRTUAL_SOL_RESERVES = 30 * 1e9; // 30 SOL in lamports
const DEFAULT_VIRTUAL_TOKEN_RESERVES = 1073000000000000; // 最小単位
const TOKEN_DECIMALS = 6;
const TOTAL_SUPPLY = 1000000000 * Math.pow(10, TOKEN_DECIMALS);
const BONDING_CURVE_SALE_AMOUNT = 793100000 * Math.pow(10, TOKEN_DECIMALS);
const GRADUATION_THRESHOLD = 85 * 1e9; // 85 SOL in lamports
class BondingCurveCalculator {
    constructor() {
        this.realSolReserves = 0;
        this.realTokenReserves = TOTAL_SUPPLY;
        this.totalTokensSold = 0;
        this.totalBuyers = 0;
        this.virtualSolReserves = DEFAULT_VIRTUAL_SOL_RESERVES;
        this.virtualTokenReserves = DEFAULT_VIRTUAL_TOKEN_RESERVES;
    }
    // 現在の価格を計算（1トークンあたりのSOL価格）
    getCurrentPrice() {
        return this.virtualSolReserves / this.virtualTokenReserves;
    }
    // 現在の時価総額を計算（SOLベース）
    getMarketCap() {
        const price = this.getCurrentPrice();
        return price * (TOTAL_SUPPLY / Math.pow(10, TOKEN_DECIMALS));
    }
    // ボンディングカーブ進捗（0-100%）
    getProgress() {
        return (this.totalTokensSold / BONDING_CURVE_SALE_AMOUNT) * 100;
    }
    // 卒業済みかどうか
    isGraduated() {
        return this.realSolReserves >= GRADUATION_THRESHOLD ||
            this.totalTokensSold >= BONDING_CURVE_SALE_AMOUNT;
    }
    // 購入シミュレーション: solAmount SOLで何トークン買えるか
    simulateBuy(solAmount) {
        const lamports = solAmount * 1e9;
        // 定積公式: x * y = k
        const k = this.virtualSolReserves * this.virtualTokenReserves;
        const newVirtualSolReserves = this.virtualSolReserves + lamports;
        const newVirtualTokenReserves = k / newVirtualSolReserves;
        const tokenAmount = this.virtualTokenReserves - newVirtualTokenReserves;
        const avgPrice = lamports / tokenAmount;
        const currentPrice = this.getCurrentPrice();
        const newPrice = newVirtualSolReserves / newVirtualTokenReserves;
        const priceImpact = ((newPrice - currentPrice) / currentPrice) * 100;
        return {
            tokenAmount,
            priceImpact,
            avgPrice,
            newPrice
        };
    }
    // 実際に購入を実行（状態更新）
    executeBuy(solAmount) {
        const result = this.simulateBuy(solAmount);
        const lamports = solAmount * 1e9;
        // 状態更新
        this.virtualSolReserves += lamports;
        this.virtualTokenReserves -= result.tokenAmount;
        this.realSolReserves += lamports;
        this.realTokenReserves -= result.tokenAmount;
        this.totalTokensSold += result.tokenAmount;
        this.totalBuyers++;
        return {
            tokenAmount: result.tokenAmount,
            rank: this.totalBuyers,
            price: this.getCurrentPrice(),
            marketCap: this.getMarketCap(),
            progress: this.getProgress()
        };
    }
    // 売却シミュレーション
    simulateSell(tokenAmount) {
        // 定積公式で逆計算
        const k = this.virtualSolReserves * this.virtualTokenReserves;
        const newVirtualTokenReserves = this.virtualTokenReserves + tokenAmount;
        const newVirtualSolReserves = k / newVirtualTokenReserves;
        const lamports = this.virtualSolReserves - newVirtualSolReserves;
        const solAmount = lamports / 1e9;
        const avgPrice = lamports / tokenAmount;
        const currentPrice = this.getCurrentPrice();
        const newPrice = newVirtualSolReserves / newVirtualTokenReserves;
        const priceImpact = ((currentPrice - newPrice) / currentPrice) * 100;
        return {
            solAmount,
            priceImpact,
            avgPrice
        };
    }
    // 売却実行
    executeSell(tokenAmount) {
        const result = this.simulateSell(tokenAmount);
        const lamports = result.solAmount * 1e9;
        this.virtualSolReserves -= lamports;
        this.virtualTokenReserves += tokenAmount;
        this.realSolReserves -= lamports;
        this.realTokenReserves += tokenAmount;
        this.totalTokensSold -= tokenAmount;
        return {
            solAmount: result.solAmount,
            price: this.getCurrentPrice(),
            marketCap: this.getMarketCap(),
            avgPrice: result.avgPrice
        };
    }
    // 状態取得
    getState() {
        return {
            virtualSolReserves: this.virtualSolReserves,
            virtualTokenReserves: this.virtualTokenReserves,
            realSolReserves: this.realSolReserves,
            realTokenReserves: this.realTokenReserves,
            totalTokensSold: this.totalTokensSold,
            totalBuyers: this.totalBuyers,
            currentPrice: this.getCurrentPrice(),
            marketCap: this.getMarketCap(),
            progress: this.getProgress(),
            graduated: this.isGraduated()
        };
    }
    // 初期購入者数を取得
    getTotalBuyers() {
        return this.totalBuyers;
    }
}
exports.BondingCurveCalculator = BondingCurveCalculator;
// 価格フォーマット
function formatPrice(price) {
    if (price < 0.000001) {
        return price.toExponential(6);
    }
    return price.toFixed(9);
}
// SOLフォーマット
function formatSol(lamports) {
    return (lamports / 1e9).toFixed(4);
}
//# sourceMappingURL=bondingCurve.js.map