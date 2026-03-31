// トークン情報の型定義
export interface Token {
  mint: string;
  name: string;
  symbol: string;
  creator: string;
  createdAt: number;
  metadata?: {
    image?: string;
    description?: string;
    priceUsd?: string;
    marketCap?: number;
    volume24h?: number;
  };
}

// 価格履歴ポイント
export interface PriceHistoryPoint {
  timestamp: number;
  price: number; // SOL単価
  marketCap: number;
  pnlPercent: number;
}

// 取引位置（何番目に買ったか）
export interface TradePosition {
  id: string;
  tokenMint: string;
  tokenName: string;
  tokenSymbol: string;
  entryPrice: number; // SOL単位
  entryMarketCap: number;
  amount: number; // トークン数量
  solAmount: number; // 使用したSOL
  buyRank: number; // 何番目の購入者か（1 = 最初）
  totalBuyersAtEntry: number; // 購入時点での総購入者数
  buyTime: number;
  graduated: boolean; // 卒業したかどうか
  graduatedAt?: number;
  sold: boolean;
  soldAt?: number;
  soldPrice?: number;
  pnl: number; // 損益（SOLベース）
  pnlPercent: number; // 損益率
  currentPrice: number; // 現在価格
  currentMarketCap: number; // 現在の時価総額
  bondingCurveProgress: number; // ボンディングカーブ進捗（0-100%）
  holderCount: number; // ホルダー数
  priceHistory: PriceHistoryPoint[]; // 価格履歴（ミニチャート用）
}

// ペーパートレード設定
export interface PaperTradeConfig {
  maxPositions: number; // 同時保有最大数（0 = 無制限）
  buyAmount: number; // 1回の購入SOL量
  takeProfitPercent: number; // 利確ライン（%）
  stopLossPercent: number; // 損切りライン（%）
  autoSell: boolean; // 自動売却するか
  minLiquidity: number; // 最小流動性
  maxSlippage: number; // 最大許容スリッページ
  // 現実的な手数料・遅延設定
  tradingFeePercent: number; // Pump.fun取引手数料（1.25%）
  networkFeeSol: number; // Solanaネットワーク手数料（ガス代）
  forceSellAfterMinutes: number; // 強制売却時間（分）
  // 遅延シミュレーション（ミリ秒）
  detectionLatencyMs: number; // トークン検出遅延
  confirmationLatencyMs: number; // TX確認遅延
}

// ボンディングカーブ状態
export interface BondingCurveState {
  virtualSolReserves: number;
  virtualTokenReserves: number;
  realSolReserves: number;
  realTokenReserves: number;
  tokenTotalSupply: number;
  complete: boolean;
}

// WebSocketイベント
export interface TokenEvent {
  type: 'create' | 'trade' | 'complete';
  mint: string;
  data: any;
  timestamp: number;
}

// パフォーマンス統計
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
