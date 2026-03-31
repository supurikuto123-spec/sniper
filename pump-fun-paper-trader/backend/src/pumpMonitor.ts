/**
 * PumpMonitor - Real-time token monitoring for Pump.fun
 *
 * Uses DEX Screener API HTTP polling (Helius Free plan doesn't support WebSocket).
 * NO FAKE DATA - All events from real blockchain via DEX Screener API.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import {
  PUMP_FUN_PROGRAM_ID,
  HELIUS_RPC_URL,
  DEX_SCREENER_API,
  Token,
  TokenEvent,
} from './types';

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
    icon?: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceUsd: string;
  marketCap: string;
  volume: {
    h24: string;
    h6: string;
    h1: string;
    m5: string;
  };
  liquidity: {
    usd: string;
    base: string;
    quote: string;
  };
  fdv?: string;
  pairCreatedAt: number;
}

interface DexScreenerBoosted {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
    icon?: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceUsd: string;
  marketCap: string;
  fdv: string;
  pairCreatedAt: number;
}

export class PumpMonitor extends EventEmitter {
  private connection: Connection;
  private isRunning = false;
  private httpPollingInterval: NodeJS.Timeout | null = null;
  private processedMints = new Set<string>();
  private readonly maxProcessedMints = 500;
  private activeTokens = new Map<string, Token>();
  private lastPollTime = 0;
  private mode: 'dexscreener' | 'helius_logs' = 'dexscreener';

  constructor() {
    super();
    this.connection = new Connection(HELIUS_RPC_URL, 'confirmed');
  }

  /**
   * Start monitoring with HTTP polling (DEX Screener)
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[PumpMonitor] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[PumpMonitor] Starting Pump.fun token monitoring...');
    console.log(`[PumpMonitor] Mode: DEX Screener API HTTP Polling`);
    console.log(`[PumpMonitor] Program ID: ${PUMP_FUN_PROGRAM_ID}`);
    console.log(`[PumpMonitor] Helius RPC: ${HELIUS_RPC_URL.replace(/api-key=.*$/, 'api-key=***')}`);
    console.log('');
    console.log('NOTE: Helius Free plan does not support Enhanced WebSocket.');
    console.log('Using DEX Screener API polling instead (real data, ~5-10s delay).');
    console.log('');

    await this.startDexScreenerPolling();
  }

  /**
   * Start DEX Screener HTTP polling for new tokens
   */
  private async startDexScreenerPolling(): Promise<void> {
    // Immediate first poll
    await this.pollDexScreener();

    // Poll every 8 seconds (rate limit friendly)
    this.httpPollingInterval = setInterval(async () => {
      await this.pollDexScreener();
    }, 8000);

    console.log('[PumpMonitor] DEX Screener polling started (interval: 8s)');
  }

  /**
   * Poll DEX Screener API for latest Pump.fun tokens
   */
  private async pollDexScreener(): Promise<void> {
    try {
      // Method 1: Get latest token profiles (new tokens)
      const profilesResponse = await fetch(`${DEX_SCREENER_API}/token-profiles/latest/v1`, {
        headers: { 'Accept': 'application/json' },
      });

      console.log(`[DEBUG] token-profiles API status: ${profilesResponse.status}`);

      if (profilesResponse.ok) {
        const profiles = await profilesResponse.json() as Array<{
          url: string;
          chainId: string;
          tokenAddress: string;
          icon?: string;
        }>;

        console.log(`[DEBUG] token-profiles returned ${profiles.length} tokens, ${profiles.filter(p => p.chainId === 'solana').length} Solana`);

        // Filter for Solana tokens only
        const solanaTokens = profiles.filter(p => p.chainId === 'solana');

        for (const profile of solanaTokens.slice(0, 5)) {
          if (!this.processedMints.has(profile.tokenAddress)) {
            console.log(`[DEBUG] New Solana token from profiles: ${profile.tokenAddress.slice(0, 16)}...`);
            await this.processNewToken(profile.tokenAddress, profile.icon);
          }
        }
      }

      // Method 2: Also check boosted tokens (trending new tokens)
      const boostedResponse = await fetch(`${DEX_SCREENER_API}/token-boosts/latest/v1`, {
        headers: { 'Accept': 'application/json' },
      });

      console.log(`[DEBUG] token-boosts API status: ${boostedResponse.status}`);

      if (boostedResponse.ok) {
        const boosted = await boostedResponse.json() as DexScreenerBoosted[];

        console.log(`[DEBUG] token-boosts returned ${boosted.length} tokens`);

        // Filter for Solana/Pump.fun tokens from last 10 minutes
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
        const recentTokens = boosted.filter(b =>
          b.chainId === 'solana' &&
          b.pairCreatedAt &&
          b.pairCreatedAt > tenMinutesAgo
        );

        console.log(`[DEBUG] Recent Solana boosted tokens (<10min): ${recentTokens.length}`);

        for (const token of recentTokens.slice(0, 5)) {
          if (!this.processedMints.has(token.baseToken.address)) {
            console.log(`[DEBUG] New boosted token: ${token.baseToken.symbol} (${token.baseToken.address.slice(0, 16)}...)`);
            await this.processNewToken(
              token.baseToken.address,
              token.baseToken.icon
            );
          }
        }
      }

      // Method 3: Search specific Pump.fun pairs
      const searchResponse = await fetch(
        `${DEX_SCREENER_API}/search?q=pump&limit=10`,
        { headers: { 'Accept': 'application/json' } }
      );

      console.log(`[DEBUG] search API status: ${searchResponse.status}`);

      if (searchResponse.ok) {
        const searchData = await searchResponse.json() as { pairs?: DexScreenerPair[] };
        console.log(`[DEBUG] search returned ${searchData.pairs?.length || 0} pairs`);
        if (searchData.pairs) {
          const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

          let newTokensFromSearch = 0;
          for (const pair of searchData.pairs) {
            // Check if this is a Pump.fun token (created recently)
            if (pair.pairCreatedAt && pair.pairCreatedAt > fiveMinutesAgo) {
              const mint = pair.baseToken.address;
              if (!this.processedMints.has(mint)) {
                console.log(`[DEBUG] New token from search: ${pair.baseToken.symbol} (<5min old)`);
                await this.processTokenFromPair(pair);
                newTokensFromSearch++;
              }
            }
          }
          if (newTokensFromSearch === 0) {
            console.log(`[DEBUG] No new tokens from search (<5min old)`);
          }
        }
      }

    } catch (error) {
      console.error('[PumpMonitor] DEX Screener poll error:', error);
    }
  }

  /**
   * Process a new token from DEX Screener
   */
  private async processNewToken(mint: string, iconUrl?: string): Promise<void> {
    try {
      // Get detailed token info from DEX Screener
      const tokenDetails = await this.fetchTokenDetails(mint);
      if (!tokenDetails) {
        return;
      }

      // Add icon if provided
      if (iconUrl) {
        tokenDetails.image = iconUrl;
      }

      // Mark as processed
      this.addProcessedMint(mint);

      // Get token metadata from chain
      let creator = 'unknown';
      try {
        const accountInfo = await this.connection.getAccountInfo(new PublicKey(mint));
        if (accountInfo?.owner) {
          creator = accountInfo.owner.toString();
        }
      } catch {
        // Ignore errors, use default
      }

      // Build token object
      const token: Token = {
        mint,
        name: tokenDetails.name,
        symbol: tokenDetails.symbol,
        creator,
        createdAt: Date.now(),
        priceUsd: tokenDetails.priceUsd,
        marketCap: tokenDetails.marketCap,
        volume24h: tokenDetails.volume24h,
        liquidityUsd: tokenDetails.liquidityUsd,
        image: tokenDetails.image,
        graduated: false,
      };

      // Store in active tokens
      this.activeTokens.set(mint, token);

      // Emit token creation event
      const event: TokenEvent = {
        type: 'create',
        mint,
        data: token,
        timestamp: Date.now(),
      };

      this.emit('token', event);

      console.log(`[PumpMonitor] New token detected: ${token.symbol} (${mint.slice(0, 16)}...)`);
      console.log(`  Price: $${token.priceUsd?.toFixed(10) || 'N/A'}`);
      console.log(`  Market Cap: $${token.marketCap?.toFixed(2) || 'N/A'}`);
      console.log(`  Liquidity: $${token.liquidityUsd?.toFixed(2) || 'N/A'}`);

    } catch (error) {
      console.error(`[PumpMonitor] Error processing token ${mint}:`, error);
    }
  }

  /**
   * Process token from pair data
   */
  private async processTokenFromPair(pair: DexScreenerPair): Promise<void> {
    const mint = pair.baseToken.address;

    if (this.processedMints.has(mint)) {
      return;
    }

    this.addProcessedMint(mint);

    // Get creator from chain
    let creator = 'unknown';
    try {
      const accountInfo = await this.connection.getAccountInfo(new PublicKey(mint));
      if (accountInfo?.owner) {
        creator = accountInfo.owner.toString();
      }
    } catch {
      // Ignore
    }

    const token: Token = {
      mint,
      name: pair.baseToken.name || 'Unknown',
      symbol: pair.baseToken.symbol || 'UNKNOWN',
      creator,
      createdAt: pair.pairCreatedAt || Date.now(),
      priceUsd: parseFloat(pair.priceUsd || '0'),
      marketCap: parseFloat(pair.marketCap || '0'),
      volume24h: parseFloat(pair.volume?.h24 || '0'),
      liquidityUsd: parseFloat(pair.liquidity?.usd || '0'),
      image: pair.baseToken.icon,
      graduated: false,
    };

    this.activeTokens.set(mint, token);

    const event: TokenEvent = {
      type: 'create',
      mint,
      data: token,
      timestamp: Date.now(),
    };

    this.emit('token', event);

    console.log(`[PumpMonitor] New token from pair: ${token.symbol} (${mint.slice(0, 16)}...)`);
    console.log(`  Price: $${token.priceUsd?.toFixed(10) || 'N/A'}`);
    console.log(`  Market Cap: $${token.marketCap?.toFixed(2) || 'N/A'}`);
  }

  /**
   * Add mint to processed set with size limit
   */
  private addProcessedMint(mint: string): void {
    this.processedMints.add(mint);

    if (this.processedMints.size > this.maxProcessedMints) {
      const first = this.processedMints.values().next().value;
      if (first) {
        this.processedMints.delete(first);
      }
    }
  }

  /**
   * Fetch token details from DEX Screener API
   */
  private async fetchTokenDetails(mint: string): Promise<{
    name: string;
    symbol: string;
    priceUsd: number;
    marketCap: number;
    volume24h: number;
    liquidityUsd: number;
    image?: string;
  } | null> {
    try {
      const response = await fetch(`${DEX_SCREENER_API}/tokens/${mint}`, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { pairs?: DexScreenerPair[] };

      if (!data.pairs || data.pairs.length === 0) {
        return null;
      }

      // Get the most liquid pair on Solana
      const solanaPairs = data.pairs.filter(p => p.chainId === 'solana');
      if (solanaPairs.length === 0) {
        return null;
      }

      const pair = solanaPairs.reduce((best, current) => {
        const bestLiquidity = parseFloat(best.liquidity?.usd || '0');
        const currentLiquidity = parseFloat(current.liquidity?.usd || '0');
        return currentLiquidity > bestLiquidity ? current : best;
      }, solanaPairs[0]);

      return {
        name: pair.baseToken.name || 'Unknown',
        symbol: pair.baseToken.symbol || 'UNKNOWN',
        priceUsd: parseFloat(pair.priceUsd || '0'),
        marketCap: parseFloat(pair.marketCap || '0'),
        volume24h: parseFloat(pair.volume?.h24 || '0'),
        liquidityUsd: parseFloat(pair.liquidity?.usd || '0'),
        image: pair.baseToken.icon,
      };

    } catch (error) {
      console.error(`[PumpMonitor] Error fetching token details: ${error}`);
      return null;
    }
  }

  /**
   * Update token prices (called periodically by TradeManager)
   */
  async updateTokenPrices(): Promise<void> {
    for (const [mint, token] of this.activeTokens.entries()) {
      try {
        const updated = await this.fetchTokenDetails(mint);
        if (updated) {
          token.priceUsd = updated.priceUsd;
          token.marketCap = updated.marketCap;
          token.volume24h = updated.volume24h;
          token.liquidityUsd = updated.liquidityUsd;
        }
      } catch (error) {
        console.error(`[PumpMonitor] Error updating price for ${mint}:`, error);
      }
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.httpPollingInterval) {
      clearInterval(this.httpPollingInterval);
      this.httpPollingInterval = null;
    }
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    console.log('[PumpMonitor] Stopping...');
    this.isRunning = false;
    this.cleanup();
    this.removeAllListeners();
  }

  /**
   * Get all active tokens
   */
  getActiveTokens(): Token[] {
    return Array.from(this.activeTokens.values());
  }

  /**
   * Get specific token by mint
   */
  getToken(mint: string): Token | undefined {
    return this.activeTokens.get(mint);
  }

  /**
   * Check if token is being tracked
   */
  isActive(mint: string): boolean {
    return this.activeTokens.has(mint);
  }
}
