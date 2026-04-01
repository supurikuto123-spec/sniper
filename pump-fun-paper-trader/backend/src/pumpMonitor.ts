/**
 * PumpMonitor - Pump.fun New Token Detection
 * 
 * Uses DEX Screener API to detect new token launches.
 * Pairs with recent activity on Pump.fun.
 */

import { EventEmitter } from 'events';
import {
  DEX_SCREENER_API,
  Token,
  TokenEvent,
  SocialLinks,
} from './types';

// Known tokens to exclude
const EXCLUDED_MINTS = new Set([
  'So11111111111111111111111111111111111111112', // Wrapped SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
]);

const EXCLUDED_SYMBOLS = ['SOL', 'USDC', 'USDT', 'BONK', 'WIF', 'JUP', 'RAY', 'ORCA', 'ETH', 'BTC'];

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceUsd?: string;
  marketCap?: string;
  volume?: {
    h24?: string;
  };
  liquidity?: {
    usd?: string;
  };
  profile?: {
    url?: string;
    description?: string;
    links?: Array<{
      type: string;
      url: string;
      label?: string;
    }>;
  };
  info?: {
    socials?: Array<{
      type: string;
      url: string;
    }>;
    websites?: Array<{
      url: string;
    }>;
  };
}

export class PumpMonitor extends EventEmitter {
  private isRunning = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private processedMints = new Set<string>();
  private readonly maxProcessedMints = 5000;
  private pollCount = 0;
  private lastPollTime = 0;
  private readonly minPollInterval = 5000; // 5秒間隔

  constructor() {
    super();
  }

  /**
   * Start monitoring for new Pump.fun tokens
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[PumpMonitor] Already running');
      return;
    }

    this.isRunning = true;

    console.log('[PumpMonitor] ===========================================');
    console.log('[PumpMonitor]  🚀 PUMP.FUN NEW TOKEN DETECTOR');
    console.log('[PumpMonitor] ===========================================');
    console.log('[PumpMonitor] Method: DEX Screener Latest Pairs API');
    console.log('[PumpMonitor] Strategy: Monitor new pairs on Solana');
    console.log('[PumpMonitor] ===========================================');
    console.log('');

    // Initial scan - get current tokens as baseline
    await this.initializeBaseline();

    // Start polling (every 5 seconds)
    this.pollingInterval = setInterval(async () => {
      await this.pollNewTokens();
    }, this.minPollInterval);

    console.log('[PumpMonitor] ✓ Monitoring started (5s interval)');
    console.log('[PumpMonitor] Waiting for new tokens...\n');
  }

  /**
   * Initialize with current tokens as baseline
   */
  private async initializeBaseline(): Promise<void> {
    try {
      console.log('[PumpMonitor] Initializing baseline...');
      const tokens = await this.fetchRecentTokens();
      
      for (const token of tokens) {
        this.processedMints.add(token.mint);
      }
      
      console.log(`[PumpMonitor] Baseline: ${tokens.length} tokens already tracked`);
    } catch (error) {
      console.error('[PumpMonitor] Baseline init error:', error);
    }
  }

  /**
   * Poll for new tokens
   */
  private async pollNewTokens(): Promise<void> {
    try {
      // Rate limit check
      const now = Date.now();
      const timeSinceLastPoll = now - this.lastPollTime;
      if (timeSinceLastPoll < this.minPollInterval) {
        return;
      }
      this.lastPollTime = now;
      this.pollCount++;

      // Fetch recent Solana pairs
      const tokens = await this.fetchRecentTokens();
      
      // Filter for new tokens only
      const newTokens: Token[] = [];
      
      for (const token of tokens) {
        // Skip if already processed
        if (this.processedMints.has(token.mint)) {
          continue;
        }
        
        // Skip excluded mints
        if (EXCLUDED_MINTS.has(token.mint)) {
          this.addProcessedMint(token.mint);
          continue;
        }
        
        // Skip excluded symbols
        const symbolUpper = token.symbol?.toUpperCase() || '';
        if (EXCLUDED_SYMBOLS.includes(symbolUpper)) {
          this.addProcessedMint(token.mint);
          console.log(`[PumpMonitor] SKIP known symbol: ${token.symbol}`);
          continue;
        }
        
        // Skip if price is 0
        if (!token.priceUsd || token.priceUsd === 0) {
          this.addProcessedMint(token.mint);
          continue;
        }
        
        newTokens.push(token);
        this.addProcessedMint(token.mint);
      }

      if (newTokens.length === 0) {
        // Heartbeat every 30 polls (2.5 min)
        if (this.pollCount % 30 === 0) {
          console.log(`[PumpMonitor] Heartbeat #${this.pollCount} - ${this.processedMints.size} tokens tracked`);
        }
        return;
      }

      console.log(`\n[DEBUG] Poll #${this.pollCount}: Found ${newTokens.length} new tokens`);

      // Process new tokens
      for (const token of newTokens) {
        await this.processNewToken(token);
      }

    } catch (error) {
      console.error('[PumpMonitor] Poll error:', error);
    }
  }

  /**
   * Fetch recent Solana pairs from DEX Screener
   */
  private async fetchRecentTokens(): Promise<Token[]> {
    try {
      // Get recent pairs for Solana chain
      const response = await fetch(`${DEX_SCREENER_API}/search?q=solana`, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        console.error(`[PumpMonitor] API error: ${response.status}`);
        return [];
      }

      const data = await response.json() as { pairs?: DexScreenerPair[] };
      
      if (!data.pairs || !Array.isArray(data.pairs)) {
        return [];
      }

      // Filter for Solana pairs only and sort by creation time (if available)
      // or by volume/liquidity as proxy for newness
      const solanaPairs = data.pairs.filter(p => 
        p.chainId === 'solana' && 
        p.dexId?.toLowerCase().includes('pump') // Focus on Pump.fun pairs
      );

      const tokens: Token[] = [];

      for (const pair of solanaPairs) {
        try {
          const token = this.convertPairToToken(pair);
          if (token) {
            tokens.push(token);
          }
        } catch (error) {
          // Skip invalid pairs
        }
      }

      return tokens;

    } catch (error) {
      console.error('[PumpMonitor] Fetch error:', error);
      return [];
    }
  }

  /**
   * Convert DEX Screener pair to Token object
   */
  private convertPairToToken(pair: DexScreenerPair): Token | null {
    try {
      const mint = pair.baseToken?.address;
      if (!mint) return null;

      // Extract social links
      const socialLinks = this.extractSocialLinks(pair);

      // Determine if graduated (not on Pump.fun anymore)
      const graduated = !pair.dexId?.toLowerCase().includes('pump');

      const priceUsd = parseFloat(pair.priceUsd || '0');
      const marketCap = parseFloat(pair.marketCap || '0');
      const volume24h = parseFloat(pair.volume?.h24 || '0');
      const liquidityUsd = parseFloat(pair.liquidity?.usd || '0');

      const hasTwitter = !!socialLinks?.twitter;
      const hasWebsite = !!socialLinks?.website;
      const hasSocialLinks = hasTwitter || hasWebsite;

      // Calculate safety score
      let safetyScore = 0;
      if (hasTwitter) safetyScore += 40;
      if (hasWebsite) safetyScore += 30;
      if (hasSocialLinks) safetyScore += 30;

      return {
        mint,
        name: pair.baseToken.name || 'Unknown',
        symbol: pair.baseToken.symbol || 'UNKNOWN',
        creator: '', // Not available from DEX Screener
        createdAt: Date.now(), // Use current time as proxy
        priceUsd,
        marketCap,
        volume24h,
        liquidityUsd,
        graduated,
        pairAddress: pair.pairAddress,
        socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
        devInitialBuy: 0,
        devLockEnabled: false,
        safetyScore,
        checks: {
          hasSocialLinks,
          hasTwitter,
          hasWebsite,
          devBuyLarge: false,
          devLockEnabled: false,
        },
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract social links from pair data
   */
  private extractSocialLinks(pair: DexScreenerPair): SocialLinks {
    const socialLinks: SocialLinks = {};

    // From profile.links
    if (pair.profile?.links && Array.isArray(pair.profile.links)) {
      for (const link of pair.profile.links) {
        const type = link.type?.toLowerCase();
        const url = link.url;

        if (type === 'twitter' || type === 'x') {
          socialLinks.twitter = url;
        } else if (type === 'website' || type === 'web') {
          socialLinks.website = url;
        } else if (type === 'telegram' || type === 'tg') {
          socialLinks.telegram = url;
        } else if (type === 'discord') {
          socialLinks.discord = url;
        }
      }
    }

    // From info.socials
    if (pair.info?.socials && Array.isArray(pair.info.socials)) {
      for (const social of pair.info.socials) {
        const type = social.type?.toLowerCase();
        const url = social.url;

        if ((type === 'twitter' || type === 'x') && !socialLinks.twitter) {
          socialLinks.twitter = url;
        } else if (type === 'telegram' && !socialLinks.telegram) {
          socialLinks.telegram = url;
        } else if (type === 'discord' && !socialLinks.discord) {
          socialLinks.discord = url;
        }
      }
    }

    // From info.websites
    if (pair.info?.websites && Array.isArray(pair.info.websites) && !socialLinks.website) {
      if (pair.info.websites.length > 0) {
        socialLinks.website = pair.info.websites[0].url;
      }
    }

    return socialLinks;
  }

  /**
   * Process a newly detected token
   */
  private async processNewToken(token: Token): Promise<void> {
    try {
      // Check SNS links
      const hasTwitter = !!token.socialLinks?.twitter;
      const hasWebsite = !!token.socialLinks?.website;

      console.log('');
      console.log('╔════════════════════════════════════════════════════╗');
      console.log(`║  🚀 NEW PUMP.FUN TOKEN: ${token.symbol.padEnd(28)} ║`);
      console.log('╚════════════════════════════════════════════════════╝');
      console.log(`  Mint: ${token.mint}`);
      console.log(`  Price: $${(token.priceUsd || 0).toFixed(10)} | MC: $${(token.marketCap || 0).toFixed(2)} | Liq: $${(token.liquidityUsd || 0).toFixed(2)}`);
      console.log(`  SNS Links: Twitter:${hasTwitter ? '✓' : '✗'} | Website:${hasWebsite ? '✓' : '✗'} | Score: ${token.safetyScore}/100`);
      console.log(`  Status: NEW LAUNCH DETECTED ✓`);
      console.log('');

      // Emit event
      const event: TokenEvent = {
        type: 'create',
        mint: token.mint,
        data: token,
        timestamp: Date.now(),
      };

      this.emit('token', event);

    } catch (error) {
      console.error(`[PumpMonitor] Error processing token ${token.mint}:`, error);
    }
  }

  /**
   * Add mint to processed set
   */
  private addProcessedMint(mint: string): void {
    this.processedMints.add(mint);

    // Prevent memory bloat
    if (this.processedMints.size > this.maxProcessedMints) {
      const first = this.processedMints.values().next().value;
      if (first) {
        this.processedMints.delete(first);
      }
    }
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    console.log('[PumpMonitor] Stopping...');
    this.isRunning = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.removeAllListeners();
  }

  isActive(mint: string): boolean {
    return this.processedMints.has(mint);
  }

  /**
   * Get list of currently tracked tokens
   */
  getActiveTokens(): Token[] {
    // Since we only store mint addresses in processedMints,
    // we return an empty array. New tokens are emitted via events.
    return [];
  }
}
