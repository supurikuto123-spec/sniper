// Pump.fun Bonding Curve Calculation
// 定積公式: x * y = k
// x = 仮想SOLリザーブ, y = 仮想トークンリザーブ

const DEFAULT_VIRTUAL_SOL_RESERVES = 30 * 1e9; // 30 SOL in lamports
const DEFAULT_VIRTUAL_TOKEN_RESERVES = 1_073_000_000_000_000; // 最小単位
const TOKEN_DECIMALS = 6;
const TOTAL_SUPPLY = 1_000_000_000 * Math.pow(10, TOKEN_DECIMALS);
const BONDING_CURVE_SALE_AMOUNT = 793_100_000 * Math.pow(10, TOKEN_DECIMALS);
const GRADUATION_THRESHOLD = 85 * 1e9; // 85 SOL in lamports

// 売却実行の戻り値型
export interface SellResult {
  solAmount: number;
  price: number;
  marketCap: number;
  avgPrice: number;
}

export class BondingCurveCalculator {
  private virtualSolReserves: number;
  private virtualTokenReserves: number;
  private realSolReserves: number = 0;
  private realTokenReserves: number = TOTAL_SUPPLY;
  private totalTokensSold: number = 0;
  private totalBuyers: number = 0;

  constructor() {
    this.virtualSolReserves = DEFAULT_VIRTUAL_SOL_RESERVES;
    this.virtualTokenReserves = DEFAULT_VIRTUAL_TOKEN_RESERVES;
  }

  // 現在の価格を計算（1トークンあたりのSOL価格）
  getCurrentPrice(): number {
    return this.virtualSolReserves / this.virtualTokenReserves;
  }

  // 現在の時価総額を計算（SOLベース）
  getMarketCap(): number {
    const price = this.getCurrentPrice();
    return price * (TOTAL_SUPPLY / Math.pow(10, TOKEN_DECIMALS));
  }

  // ボンディングカーブ進捗（0-100%）
  getProgress(): number {
    return (this.totalTokensSold / BONDING_CURVE_SALE_AMOUNT) * 100;
  }

  // 卒業済みかどうか
  isGraduated(): boolean {
    return this.realSolReserves >= GRADUATION_THRESHOLD ||
           this.totalTokensSold >= BONDING_CURVE_SALE_AMOUNT;
  }

  // 購入シミュレーション: solAmount SOLで何トークン買えるか
  simulateBuy(solAmount: number): {
    tokenAmount: number;
    priceImpact: number;
    avgPrice: number;
    newPrice: number;
  } {
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
  executeBuy(solAmount: number): {
    tokenAmount: number;
    rank: number;
    price: number;
    marketCap: number;
    progress: number;
  } {
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
  simulateSell(tokenAmount: number): {
    solAmount: number;
    priceImpact: number;
    avgPrice: number;
  } {
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
  executeSell(tokenAmount: number): SellResult {
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
  getTotalBuyers(): number {
    return this.totalBuyers;
  }
}

// 価格フォーマット
export function formatPrice(price: number): string {
  if (price < 0.000001) {
    return price.toExponential(6);
  }
  return price.toFixed(9);
}

// SOLフォーマット
export function formatSol(lamports: number): string {
  return (lamports / 1e9).toFixed(4);
}
