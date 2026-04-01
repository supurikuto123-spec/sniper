/**
 * TradeManager - Paper trading position management
 * 
 * Manages virtual SOL balance and paper trading positions.
 * STRICT BUY CONDITIONS: Only buys when DevBuy ≥0.5 SOL + DevLock + SNS Links
 * NO FAKE DATA - All price data comes from real DEX Screener API.
 */

import { EventEmitter } from 'events';
import {
  PaperTradeConfig,
  DEFAULT_CONFIG,
  TradePosition,
  Token,
  PriceHistoryPoint,
  PerformanceStats,
  PnlHistoryEntry,
  DEX_SCREENER_API,
} from './types';

export class TradeManager extends EventEmitter {
  private config: PaperTradeConfig;
  private positions = new Map<string, TradePosition>();
  private positionHistory: TradePosition[] = [];
  private balance: number; // Virtual SOL balance
  private readonly initialBalance: number;
  private isPaused = false;
  private pnlHistory: PnlHistoryEntry[] = [];
  private nextPositionId = 1;

  constructor(config: Partial<PaperTradeConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initialBalance = 100; // Start with 100 virtual SOL
    this.balance = this.initialBalance;
  }

  /**
   * Handle new token detection from blockchain
   * STRICT: Only buys if ALL conditions met:
   * 1. Dev buy ≥ 0.5 SOL
   * 2. Dev lock enabled (graduated)
   * 3. Has SNS links (Twitter or Website)
   */
  async onNewToken(token: Token): Promise<void> {
    if (this.isPaused) {
      return;
    }

    // STRICT SAFETY CHECKS - All must pass
    const checks = token.checks || {};
    
    // Check 1: Dev buy ≥ 0.5 SOL
    const hasDevBuy = checks.devBuyLarge === true;
    if (!hasDevBuy) {
      console.log(`[TradeManager] SKIP ${token.symbol}: DevBuy < 0.5 SOL (${token.devInitialBuy?.toFixed(2) || 0} SOL)`);
      return;
    }

    // Check 2: Dev lock enabled (graduated)
    const hasDevLock = checks.devLockEnabled === true;
    if (!hasDevLock) {
      console.log(`[TradeManager] SKIP ${token.symbol}: DevLock not enabled (not graduated)`);
      return;
    }

    // Check 3: Has SNS links (Twitter or Website)
    const hasSnsLinks = checks.hasTwitter === true || checks.hasWebsite === true;
    if (!hasSnsLinks) {
      console.log(`[TradeManager] SKIP ${token.symbol}: No SNS links (Twitter: ${checks.hasTwitter}, Website: ${checks.hasWebsite})`);
      return;
    }

    console.log(`[TradeManager] ✓ ALL CHECKS PASSED for ${token.symbol}:`);
    console.log(`  - DevBuy: ${token.devInitialBuy?.toFixed(2)} SOL ≥ 0.5 ✓`);
    console.log(`  - DevLock: ${checks.devLockEnabled} ✓`);
    console.log(`  - SNS: Twitter=${checks.hasTwitter}, Web=${checks.hasWebsite} ✓`);

    // Check if we can open more positions
    if (this.config.maxPositions > 0 && this.positions.size >= this.config.maxPositions) {
      console.log(`[TradeManager] Max positions reached (${this.config.maxPositions}), skipping ${token.symbol}`);
      return;
    }

    // Check minimum liquidity requirement
    if (token.liquidityUsd && token.liquidityUsd < this.config.minLiquidityUsd) {
      console.log(`[TradeManager] Insufficient liquidity ($${token.liquidityUsd}) for ${token.symbol}`);
      return;
    }

    // Check if we have enough balance
    const totalCost = this.config.buyAmountSol + this.config.networkFeeSol;
    if (this.balance < totalCost) {
      console.log(`[TradeManager] Insufficient balance (${this.balance.toFixed(4)} SOL) for ${token.symbol}`);
      return;
    }

    // Execute paper buy
    await this.executeBuy(token);
  }

  /**
   * Execute a paper buy
   */
  private async executeBuy(token: Token): Promise<void> {
    try {
      const timestamp = Date.now();
      const entryPrice = token.priceUsd || 0;
      const entryMarketCap = token.marketCap || 0;
      
      // Calculate token amount received
      const tradingFee = this.config.buyAmountSol * (this.config.tradingFeePercent / 100);
      const effectiveSol = this.config.buyAmountSol - tradingFee;
      const tokenAmount = entryPrice > 0 ? effectiveSol / entryPrice : 0;

      // Buy order number (which position number this is)
      const buyOrderNumber = this.nextPositionId;

      // Create position
      const position: TradePosition = {
        id: `trade-${timestamp}-${buyOrderNumber}`,
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        entryPriceUsd: entryPrice,
        entryMarketCap: entryMarketCap,
        tokenAmount,
        solSpent: this.config.buyAmountSol,
        buyerRank: this.positions.size + 1,
        totalBuyersAtEntry: token.holderCount || 1,
        entryTime: timestamp,
        graduated: token.graduated || false,
        sold: false,
        pnlSol: 0,
        pnlPercent: 0,
        currentPriceUsd: entryPrice,
        currentMarketCap: entryMarketCap,
        bondingCurveProgress: 0,
        holderCount: token.holderCount || 0,
        priceHistory: [{
          timestamp,
          priceUsd: entryPrice,
          marketCap: entryMarketCap,
          pnlPercent: 0,
        }],
        buyOrderNumber, // Track which number position this is
      };

      // Deduct from balance
      this.balance -= this.config.buyAmountSol + this.config.networkFeeSol;

      // Store position
      this.positions.set(token.mint, position);

      // Record PnL history
      this.recordPnlHistory();

      // Emit event
      this.emit('position', { type: 'open', position });

      console.log(`[TradeManager] 🚀 OPENED position #${buyOrderNumber}: ${position.symbol}`);
      console.log(`  Entry: $${entryPrice.toFixed(10)} | Market Cap: $${entryMarketCap.toFixed(0)}`);
      console.log(`  Spent: ${position.solSpent.toFixed(4)} SOL | Balance: ${this.balance.toFixed(4)} SOL`);

    } catch (error) {
      console.error(`[TradeManager] Error executing buy: ${error}`);
    }
  }

  /**
   * Update all positions with real price data from DEX Screener
   */
  async updatePrices(): Promise<void> {
    if (this.positions.size === 0) {
      return;
    }

    for (const [mint, position] of this.positions) {
      if (position.sold) continue;

      try {
        // Fetch real price from DEX Screener
        const priceData = await this.fetchPriceFromDexScreener(mint);
        
        if (priceData) {
          this.updatePositionPrice(position, priceData);
        }
      } catch (error) {
        console.error(`[TradeManager] Error updating price for ${position.symbol}: ${error}`);
      }
    }
  }

  /**
   * Fetch real price data from DEX Screener API
   */
  private async fetchPriceFromDexScreener(mint: string): Promise<{
    priceUsd: number;
    marketCap: number;
    volume24h: number;
    liquidityUsd: number;
  } | null> {
    try {
      const response = await fetch(`${DEX_SCREENER_API}/tokens/${mint}`, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { pairs?: Array<{
        priceUsd: string;
        marketCap: string;
        volume?: { h24: string };
        liquidity?: { usd: string };
      }> };

      if (!data.pairs || data.pairs.length === 0) {
        return null;
      }

      // Get most liquid pair
      const pair = data.pairs.reduce((best, current) => {
        const bestLiquidity = parseFloat(best.liquidity?.usd || '0');
        const currentLiquidity = parseFloat(current.liquidity?.usd || '0');
        return currentLiquidity > bestLiquidity ? current : best;
      }, data.pairs[0]);

      return {
        priceUsd: parseFloat(pair.priceUsd || '0'),
        marketCap: parseFloat(pair.marketCap || '0'),
        volume24h: parseFloat(pair.volume?.h24 || '0'),
        liquidityUsd: parseFloat(pair.liquidity?.usd || '0'),
      };

    } catch (error) {
      console.error(`[TradeManager] Error fetching price: ${error}`);
      return null;
    }
  }

  /**
   * Update position with new price data
   */
  private updatePositionPrice(
    position: TradePosition,
    priceData: { priceUsd: number; marketCap: number; volume24h?: number; liquidityUsd?: number }
  ): void {
    const timestamp = Date.now();
    
    position.currentPriceUsd = priceData.priceUsd;
    position.currentMarketCap = priceData.marketCap;

    // Calculate PnL
    const priceChange = position.currentPriceUsd - position.entryPriceUsd;
    position.pnlSol = priceChange * position.tokenAmount;
    position.pnlPercent = position.entryPriceUsd > 0 
      ? (priceChange / position.entryPriceUsd) * 100 
      : 0;

    // Add to price history (limit to 100 points)
    position.priceHistory.push({
      timestamp,
      priceUsd: position.currentPriceUsd,
      marketCap: position.currentMarketCap,
      pnlPercent: position.pnlPercent,
    });

    if (position.priceHistory.length > 100) {
      position.priceHistory.shift();
    }

    // Check auto-sell conditions
    if (this.config.autoSell) {
      this.checkAutoSell(position);
    }
  }

  /**
   * Check if position should be auto-sold based on configured thresholds
   */
  private checkAutoSell(position: TradePosition): void {
    const now = Date.now();
    const holdingTimeMinutes = (now - position.entryTime) / (1000 * 60);

    // Take profit
    if (position.pnlPercent >= this.config.takeProfitPercent) {
      console.log(`[TradeManager] TAKE PROFIT triggered for ${position.symbol}: ${position.pnlPercent.toFixed(2)}%`);
      this.executeSell(position.mint, 'take_profit');
      return;
    }

    // Stop loss
    if (position.pnlPercent <= -this.config.stopLossPercent) {
      console.log(`[TradeManager] STOP LOSS triggered for ${position.symbol}: ${position.pnlPercent.toFixed(2)}%`);
      this.executeSell(position.mint, 'stop_loss');
      return;
    }

    // Force sell after timeout
    if (holdingTimeMinutes >= this.config.forceSellAfterMinutes) {
      console.log(`[TradeManager] FORCE SELL triggered for ${position.symbol}: held for ${holdingTimeMinutes.toFixed(1)}min`);
      this.executeSell(position.mint, 'timeout');
      return;
    }
  }

  /**
   * Execute a paper sell
   */
  executeSell(mint: string, reason: 'manual' | 'take_profit' | 'stop_loss' | 'timeout' = 'manual'): boolean {
    const position = this.positions.get(mint);
    if (!position || position.sold) {
      return false;
    }

    try {
      const timestamp = Date.now();
      
      // Calculate proceeds
      const grossProceeds = position.currentPriceUsd * position.tokenAmount;
      const tradingFee = grossProceeds * (this.config.tradingFeePercent / 100);
      const netProceeds = grossProceeds - tradingFee - this.config.networkFeeSol;

      // Update position
      position.sold = true;
      position.exitTime = timestamp;
      position.exitPriceUsd = position.currentPriceUsd;
      position.exitReason = reason;
      position.pnlSol = netProceeds - position.solSpent;
      position.pnlPercent = position.solSpent > 0 
        ? (position.pnlSol / position.solSpent) * 100 
        : 0;

      // Add proceeds to balance
      this.balance += netProceeds;

      // Move to history
      this.positions.delete(mint);
      this.positionHistory.push(position);

      // Record PnL history
      this.recordPnlHistory();

      // Emit event
      this.emit('trade', {
        type: 'sell',
        reason,
        position,
        proceeds: netProceeds,
      });

      console.log(`[TradeManager] CLOSED position #${position.buyOrderNumber}: ${position.symbol} (${reason})`);
      console.log(`  Exit: $${position.exitPriceUsd?.toFixed(6) || 'N/A'}`);
      console.log(`  PnL: ${position.pnlSol.toFixed(4)} SOL (${position.pnlPercent.toFixed(2)}%)`);
      console.log(`  Balance: ${this.balance.toFixed(4)} SOL`);

      return true;

    } catch (error) {
      console.error(`[TradeManager] Error executing sell: ${error}`);
      return false;
    }
  }

  /**
   * Sell all positions
   */
  sellAll(): number {
    let soldCount = 0;
    for (const [mint] of this.positions) {
      if (this.executeSell(mint, 'manual')) {
        soldCount++;
      }
    }
    return soldCount;
  }

  /**
   * Sell profitable positions
   */
  sellProfitable(): number {
    let soldCount = 0;
    for (const [mint, position] of this.positions) {
      if (position.pnlPercent > 0) {
        if (this.executeSell(mint, 'manual')) {
          soldCount++;
        }
      }
    }
    return soldCount;
  }

  /**
   * Sell losing positions
   */
  sellLoss(): number {
    let soldCount = 0;
    for (const [mint, position] of this.positions) {
      if (position.pnlPercent < 0) {
        if (this.executeSell(mint, 'manual')) {
          soldCount++;
        }
      }
    }
    return soldCount;
  }

  /**
   * Record PnL history point
   */
  private recordPnlHistory(): void {
    const timestamp = Date.now();
    const totalPnl = this.calculateTotalPnl();

    this.pnlHistory.push({
      timestamp,
      totalPnl,
      balance: this.balance,
    });

    // Limit history to 1000 points
    if (this.pnlHistory.length > 1000) {
      this.pnlHistory.shift();
    }
  }

  /**
   * Calculate total PnL including unrealized from open positions
   */
  private calculateTotalPnl(): number {
    let totalPnl = 0;

    // Unrealized PnL from open positions
    for (const position of this.positions.values()) {
      totalPnl += position.pnlSol;
    }

    // Realized PnL from closed positions
    for (const position of this.positionHistory) {
      totalPnl += position.pnlSol;
    }

    return totalPnl;
  }

  /**
   * Get current balance (virtual SOL)
   */
  getBalance(): number {
    return this.balance;
  }

  /**
   * Get initial balance
   */
  getInitialBalance(): number {
    return this.initialBalance;
  }

  /**
   * Get all open positions
   */
  getOpenPositions(): TradePosition[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get position by mint
   */
  getPosition(mint: string): TradePosition | undefined {
    return this.positions.get(mint);
  }

  /**
   * Get position history (closed positions)
   */
  getPositionHistory(): TradePosition[] {
    return [...this.positionHistory];
  }

  /**
   * Get PnL history
   */
  getPnlHistory(): PnlHistoryEntry[] {
    return [...this.pnlHistory];
  }

  /**
   * Get performance statistics
   */
  getStats(): PerformanceStats {
    const allTrades = [...this.positionHistory, ...this.positions.values()];
    const winningTrades = allTrades.filter(t => t.pnlPercent > 0);
    const losingTrades = allTrades.filter(t => t.pnlPercent < 0);

    const totalPnlSol = this.calculateTotalPnl();
    const totalPnlPercent = this.initialBalance > 0 
      ? (totalPnlSol / this.initialBalance) * 100 
      : 0;

    const holdingTimes = this.positionHistory.map(t => 
      (t.exitTime! - t.entryTime) / (1000 * 60)
    );
    const avgHoldingTime = holdingTimes.length > 0
      ? holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length
      : 0;

    const bestTrade = allTrades.length > 0
      ? allTrades.reduce((best, current) => current.pnlPercent > best.pnlPercent ? current : best)
      : undefined;

    const worstTrade = allTrades.length > 0
      ? allTrades.reduce((worst, current) => current.pnlPercent < worst.pnlPercent ? current : worst)
      : undefined;

    const graduatedTokens = allTrades.filter(t => t.graduated).length;

    return {
      totalTrades: allTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      totalPnlSol,
      totalPnlPercent,
      avgHoldingTimeMinutes: avgHoldingTime,
      bestTradePnlPercent: bestTrade?.pnlPercent || 0,
      worstTradePnlPercent: worstTrade?.pnlPercent || 0,
      openPositions: this.positions.size,
      graduatedTokens,
      currentBalance: this.balance,
      initialBalance: this.initialBalance,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PaperTradeConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[TradeManager] Configuration updated:', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): PaperTradeConfig {
    return { ...this.config };
  }

  /**
   * Pause trading
   */
  pause(): void {
    this.isPaused = true;
    console.log('[TradeManager] Trading paused');
  }

  /**
   * Resume trading
   */
  resume(): void {
    this.isPaused = false;
    console.log('[TradeManager] Trading resumed');
  }

  /**
   * Check if trading is paused
   */
  isTradingPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Reset all state (for testing)
   */
  reset(): void {
    this.positions.clear();
    this.positionHistory = [];
    this.pnlHistory = [];
    this.balance = this.initialBalance;
    this.nextPositionId = 1;
    console.log('[TradeManager] All state reset');
  }
}
