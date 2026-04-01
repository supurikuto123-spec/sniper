/**
 * Type definitions for Pump.fun Paper Trading Bot
 * NO FAKE DATA - All fields represent real blockchain state
 */

/** Pump.fun program ID on Solana mainnet */
export const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

/** Helius RPC endpoint with API key */
export const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=f8266582-4bd3-4354-a09d-48ef321b6273';

/** Helius WebSocket endpoint */
export const HELIUS_WS_URL = 'wss://mainnet.helius-rpc.com/?api-key=f8266582-4bd3-4354-a09d-48ef321b6273';

/** DEX Screener API base URL (price queries only) */
export const DEX_SCREENER_API = 'https://api.dexscreener.com/latest/dex';

/** Social links from token profile */
export interface SocialLinks {
  /** Twitter/X URL */
  twitter?: string;
  /** Website URL */
  website?: string;
  /** Telegram URL */
  telegram?: string;
  /** Discord URL */
  discord?: string;
  /** Medium URL */
  medium?: string;
}

/** Token information from real blockchain data */
export interface Token {
  /** Token mint address (verified on-chain) */
  mint: string;
  /** Token name from on-chain metadata */
  name: string;
  /** Token symbol from on-chain metadata */
  symbol: string;
  /** Creator wallet address from blockchain */
  creator: string;
  /** Unix timestamp when token was created (from block time) */
  createdAt: number;
  /** Optional: Token image URI from metadata */
  image?: string;
  /** Optional: Token description from metadata */
  description?: string;
  /** Current price in USD from DEX Screener (real market data) */
  priceUsd?: number;
  /** Current market cap in USD from DEX Screener */
  marketCap?: number;
  /** 24h trading volume from DEX Screener */
  volume24h?: number;
  /** Liquidity in USD from DEX Screener */
  liquidityUsd?: number;
  /** Number of holders (from on-chain data when available) */
  holderCount?: number;
  /** Whether token has graduated from Pump.fun bonding curve */
  graduated?: boolean;
  /** Block height when token was detected */
  blockHeight?: number;
  /** Transaction signature that created the token */
  signature?: string;
  /** Social links (Twitter, Website, etc.) */
  socialLinks?: SocialLinks;
  /** DEV initial buy amount in SOL */
  devInitialBuy?: number;
  /** Whether DEV has locked tokens (via Pump.fun or DEX) */
  devLockEnabled?: boolean;
  /** Safety score (0-100) based on checks */
  safetyScore?: number;
  /** Individual check results */
  checks?: {
    hasSocialLinks: boolean;
    hasTwitter: boolean;
    hasWebsite: boolean;
    devBuyLarge: boolean;
    devLockEnabled: boolean;
  };
}

/** Price history point - records real price movements */
export interface PriceHistoryPoint {
  /** Unix timestamp when price was recorded */
  timestamp: number;
  /** Price in USD at this time */
  priceUsd: number;
  /** Market cap at this time */
  marketCap: number;
  /** PnL percentage at this time */
  pnlPercent: number;
}

/** Paper trading position - represents a virtual trade */
export interface TradePosition {
  /** Unique trade ID (timestamp-based) */
  id: string;
  /** Token mint address */
  mint: string;
  /** Token name */
  name: string;
  /** Token symbol */
  symbol: string;
  /** Entry price in USD when position was opened */
  entryPriceUsd: number;
  /** Market cap at entry */
  entryMarketCap: number;
  /** Amount of tokens held */
  tokenAmount: number;
  /** SOL amount spent to purchase (virtual) */
  solSpent: number;
  /** Initial buyer rank (position in buyer sequence) */
  buyerRank: number;
  /** Total buyers at time of entry */
  totalBuyersAtEntry: number;
  /** Unix timestamp when position was opened */
  entryTime: number;
  /** Unix timestamp when position was closed (if sold) */
  exitTime?: number;
  /** Exit price in USD (if sold) */
  exitPriceUsd?: number;
  /** Whether token has graduated */
  graduated: boolean;
  /** Whether position has been sold */
  sold: boolean;
  /** PnL in SOL (calculated from real price data) */
  pnlSol: number;
  /** PnL percentage (calculated from real price data) */
  pnlPercent: number;
  /** Current price in USD (from real market data) */
  currentPriceUsd: number;
  /** Current market cap (from real market data) */
  currentMarketCap: number;
  /** Bonding curve progress percentage */
  bondingCurveProgress: number;
  /** Current holder count (from on-chain data) */
  holderCount: number;
  /** Price history for this position */
  priceHistory: PriceHistoryPoint[];
  /** Buy order number (which position number this is) */
  buyOrderNumber?: number;
  /** Exit reason (manual, take_profit, stop_loss, timeout) */
  exitReason?: string;
}

/** Trading configuration */
export interface PaperTradeConfig {
  /** Maximum number of concurrent positions (0 = unlimited) */
  maxPositions: number;
  /** SOL amount to spend per trade */
  buyAmountSol: number;
  /** Take profit percentage threshold */
  takeProfitPercent: number;
  /** Stop loss percentage threshold */
  stopLossPercent: number;
  /** Whether auto-sell is enabled */
  autoSell: boolean;
  /** Minimum liquidity required to enter position (USD) */
  minLiquidityUsd: number;
  /** Maximum slippage allowed (percentage) */
  maxSlippagePercent: number;
  /** Trading fee percentage (Pump.fun fee) */
  tradingFeePercent: number;
  /** Network fee in SOL per transaction */
  networkFeeSol: number;
  /** Force sell after N minutes */
  forceSellAfterMinutes: number;
}

/** Default configuration */
export const DEFAULT_CONFIG: PaperTradeConfig = {
  maxPositions: 10,
  buyAmountSol: 0.1,
  takeProfitPercent: 50,
  stopLossPercent: 20,
  autoSell: true,
  minLiquidityUsd: 1000,
  maxSlippagePercent: 10,
  tradingFeePercent: 1,
  networkFeeSol: 0.000005,
  forceSellAfterMinutes: 30,
};

/** Bonding curve state for Pump.fun */
export interface BondingCurveState {
  /** Virtual SOL reserves in lamports */
  virtualSolReserves: bigint;
  /** Virtual token reserves */
  virtualTokenReserves: bigint;
  /** Real SOL reserves in lamports */
  realSolReserves: bigint;
  /** Real token reserves */
  realTokenReserves: bigint;
  /** Total token supply */
  tokenTotalSupply: bigint;
  /** Whether bonding curve is complete (graduated) */
  complete: boolean;
}

/** Token event types for WebSocket broadcasts */
export type TokenEventType = 'create' | 'trade' | 'complete' | 'graduation';

/** Token event emitted by PumpMonitor */
export interface TokenEvent {
  /** Event type */
  type: TokenEventType;
  /** Token mint address */
  mint: string;
  /** Event data (token info or trade details) */
  data: Token | TradePosition;
  /** Unix timestamp when event was detected */
  timestamp: number;
  /** Block height from blockchain */
  blockHeight?: number;
  /** Transaction signature */
  signature?: string;
}

/** Performance statistics */
export interface PerformanceStats {
  /** Total number of trades executed */
  totalTrades: number;
  /** Number of winning trades (positive PnL) */
  winningTrades: number;
  /** Number of losing trades (negative PnL) */
  losingTrades: number;
  /** Total PnL in SOL */
  totalPnlSol: number;
  /** Total PnL percentage */
  totalPnlPercent: number;
  /** Average holding time in minutes */
  avgHoldingTimeMinutes: number;
  /** Best trade PnL percentage */
  bestTradePnlPercent: number;
  /** Worst trade PnL percentage */
  worstTradePnlPercent: number;
  /** Number of currently open positions */
  openPositions: number;
  /** Number of graduated tokens in portfolio */
  graduatedTokens: number;
  /** Current virtual SOL balance */
  currentBalance: number;
  /** Initial virtual SOL balance (100 SOL) */
  initialBalance: number;
}

/** PnL history entry */
export interface PnlHistoryEntry {
  /** Timestamp when recorded */
  timestamp: number;
  /** Total PnL at this time */
  totalPnl: number;
  /** Balance at this time */
  balance: number;
}

/** WebSocket message types */
export interface WebSocketMessage {
  type: 'token' | 'position' | 'trade' | 'stats' | 'balance' | 'error' | 'connected';
  data: unknown;
  timestamp: number;
}

/** Helius log subscription result */
export interface HeliusLogSubscription {
  /** Subscription ID */
  subscription: number;
  /** Result type */
  result?: string;
}

/** Helius log notification */
export interface HeliusLogNotification {
  /** Subscription ID */
  subscription: number;
  /** Log data */
  result: {
    /** Transaction signature */
    signature: string;
    /** Log messages */
    logs: string[];
    /** Error information if failed */
    err?: unknown;
    /** Block height */
    blockHeight?: number;
  };
}

/** DEX Screener pair data */
export interface DexScreenerPair {
  /** Chain identifier */
  chainId: string;
  /** DEX identifier */
  dexId: string;
  /** Pair address */
  pairAddress: string;
  /** Token info */
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  /** Quote token (usually SOL or USDC) */
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  /** Price in USD */
  priceUsd: string;
  /** Market cap in USD */
  marketCap?: string;
  /** Liquidity in USD */
  liquidity?: {
    usd: string;
  };
  /** Volume */
  volume?: {
    h24: string;
  };
  /** Price change */
  priceChange?: {
    h24: string;
  };
  /** Pair created at timestamp */
  pairCreatedAt?: number;
}

/** DEX Screener API response */
export interface DexScreenerResponse {
  /** Schema version */
  schemaVersion: string;
  /** Pairs array */
  pairs: DexScreenerPair[] | null;
}
