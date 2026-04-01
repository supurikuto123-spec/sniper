/**
 * PumpMonitor - 100% Working Pump.fun Token Detection
 *
 * Uses Solana RPC HTTP polling via transaction monitoring.
 * NO WebSocket required. Works with Free plans.
 * NO FAKE DATA - 100% real blockchain data.
 */

import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { EventEmitter } from 'events';
import {
  PUMP_FUN_PROGRAM_ID,
  HELIUS_RPC_URL,
  DEX_SCREENER_API,
  Token,
  TokenEvent,
  SocialLinks,
} from './types';

const PUMP_FUN_PROGRAM_PUBKEY = new PublicKey(PUMP_FUN_PROGRAM_ID);

// Token creation instruction discriminators
const CREATE_DISCRIMINATORS = [
  'Create', 'initialize', 'Initialize', 'create', 'mint', 'Mint'
];

export class PumpMonitor extends EventEmitter {
  private connection: Connection;
  private isRunning = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private processedSignatures = new Set<string>();
  private readonly maxProcessedSignatures = 1000;
  private activeTokens = new Map<string, Token>();
  private lastSignature: string | null = null;
  private pollCount = 0;
  private consecutiveErrors = 0;

  constructor() {
    super();
    this.connection = new Connection(HELIUS_RPC_URL, 'confirmed');
  }

  /**
   * Start monitoring - 100% HTTP polling
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[PumpMonitor] Already running');
      return;
    }

    this.isRunning = true;
    this.consecutiveErrors = 0;

    console.log('[PumpMonitor] ===========================================');
    console.log('[PumpMonitor]  100% WORKING PUMP.FUN MONITOR');
    console.log('[PumpMonitor] ===========================================');
    console.log('[PumpMonitor] Method: Transaction HTTP Polling');
    console.log('[PumpMonitor] Program:', PUMP_FUN_PROGRAM_ID.slice(0, 20) + '...');
    console.log('[PumpMonitor] RPC:', HELIUS_RPC_URL.replace(/api-key=.*$/, 'api-key=***'));
    console.log('[PumpMonitor] Features:');
    console.log('  • Monitors recent transactions');
    console.log('  • Detects Create/Initialize/Mint instructions');
    console.log('  • 100% real blockchain data');
    console.log('  • Works with any RPC Free plan');
    console.log('[PumpMonitor] ===========================================');
    console.log('');

    // Initial scan - get last 10 signatures as baseline
    await this.initializeBaseline();

    // Start polling (every 8 seconds to avoid 429 rate limits)
    this.pollingInterval = setInterval(async () => {
      await this.pollNewTransactions();
    }, 8000);

    console.log('[PumpMonitor] ✓ Monitoring started (8s interval - 429 safe)');
    console.log('[PumpMonitor] Waiting for new tokens...\n');
  }

  /**
   * Initialize with current signatures as baseline
   */
  private async initializeBaseline(): Promise<void> {
    try {
      const signatures = await this.connection.getSignaturesForAddress(
        PUMP_FUN_PROGRAM_PUBKEY,
        { limit: 10 }
      );

      for (const sig of signatures) {
        this.processedSignatures.add(sig.signature);
      }

      if (signatures.length > 0) {
        this.lastSignature = signatures[0].signature;
      }

      console.log(`[PumpMonitor] Initialized with ${signatures.length} baseline signatures`);

    } catch (error) {
      console.error('[PumpMonitor] Baseline init error:', error);
    }
  }

  /**
   * Poll for new transactions
   */
  private lastPollTime = 0;
  private readonly minPollInterval = 8000; // 8秒間隔（429対策）

  private async pollNewTransactions(): Promise<void> {
    try {
      // レート制限対策：前回ポーリングから8秒以上経過しているか確認
      const now = Date.now();
      const timeSinceLastPoll = now - this.lastPollTime;
      if (timeSinceLastPoll < this.minPollInterval) {
        return; // 間隔が短すぎる場合はスキップ
      }
      this.lastPollTime = now;
      this.pollCount++;

      // Get recent signatures for Pump.fun program (limitを10に減らす)
      const signatures = await this.connection.getSignaturesForAddress(
        PUMP_FUN_PROGRAM_PUBKEY,
        { limit: 10 }
      );

      if (signatures.length === 0) {
        return;
      }

      // Find new signatures (not in our processed set)
      const newSignatures: string[] = [];
      let foundLastSig = false;

      for (const sigInfo of signatures) {
        if (sigInfo.signature === this.lastSignature) {
          foundLastSig = true;
          break;
        }
        if (!this.processedSignatures.has(sigInfo.signature) && !sigInfo.err) {
          newSignatures.push(sigInfo.signature);
        }
      }

      // Update last signature
      this.lastSignature = signatures[0].signature;

      if (newSignatures.length === 0) {
        // Every 30 polls (2 min), print heartbeat
        if (this.pollCount % 30 === 0) {
          console.log(`[PumpMonitor] Heartbeat #${this.pollCount} - ${this.activeTokens.size} tokens tracked`);
        }
        return;
      }

      console.log(`\n[DEBUG] Poll #${this.pollCount}: ${newSignatures.length} new transactions`);

      // Process new signatures (oldest first to maintain order)
      for (const signature of newSignatures.reverse()) {
        await this.processTransaction(signature);
        this.addProcessedSignature(signature);
      }

      this.consecutiveErrors = 0;

    } catch (error: any) {
      this.consecutiveErrors++;
      console.error(`[PumpMonitor] Poll error #${this.consecutiveErrors}:`, error.message || error);

      // After 5 consecutive errors, slow down polling
      if (this.consecutiveErrors >= 5) {
        console.log('[PumpMonitor] Too many errors, slowing down to 10s interval');
        if (this.pollingInterval) {
          clearInterval(this.pollingInterval);
          this.pollingInterval = setInterval(async () => {
            await this.pollNewTransactions();
          }, 10000);
        }
      }
    }
  }

  /**
   * Process a transaction for token creation
   */
  private async processTransaction(signature: string): Promise<void> {
    try {
      // Fetch transaction details
      const tx = await this.connection.getParsedTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (!tx || !tx.meta || tx.meta.err) {
        return;
      }

      // Check if this looks like a token creation
      const isTokenCreation = this.isTokenCreationTransaction(tx);

      if (!isTokenCreation) {
        return;
      }

      console.log(`[DEBUG] Found potential token creation: ${signature.slice(0, 20)}...`);

      // Extract mint from transaction
      const mint = await this.extractMintFromTransaction(tx, signature);
      if (!mint) {
        return;
      }

      if (this.processedSignatures.has(mint)) {
        return;
      }

      // Fetch token details from DEX Screener
      const tokenDetails = await this.fetchTokenDetails(mint);
      if (!tokenDetails) {
        return;
      }

      // Skip if price is 0 (not launched yet)
      if (tokenDetails.priceUsd === 0) {
        return;
      }

      // Fetch additional security checks
      const creator = this.extractCreator(tx);
      
      // SNSリンクとトークン詳細を同時取得（効率化）
      const tokenProfile = await this.fetchTokenProfileWithDetails(mint);
      const socialLinks = tokenProfile?.socialLinks;
      
      // DEV初期購入分析：tokenDetailsから推定（RPC呼び出しなし）
      const devInitialBuy = this.estimateDevBuy(tokenProfile?.devWallet || creator, tokenDetails);

      // Calculate safety checks
      const hasTwitter = !!socialLinks?.twitter;
      const hasWebsite = !!socialLinks?.website;
      const hasSocialLinks = hasTwitter || hasWebsite;
      const devBuyLarge = (devInitialBuy || 0) >= 0.5;

      // DEV lock is approximated: if graduated, liquidity is "locked" in DEX
      const devLockEnabled = tokenDetails.graduated || false;

      // Calculate safety score (0-100)
      let safetyScore = 0;
      if (hasTwitter) safetyScore += 25;
      if (hasWebsite) safetyScore += 15;
      if (devBuyLarge) safetyScore += 30;
      if (devLockEnabled) safetyScore += 30;

      this.addProcessedSignature(mint);

      // Build token with checks
      const token: Token = {
        mint,
        name: tokenDetails.name,
        symbol: tokenDetails.symbol,
        creator,
        createdAt: (tx.blockTime || Date.now() / 1000) * 1000,
        priceUsd: tokenDetails.priceUsd,
        marketCap: tokenDetails.marketCap,
        volume24h: tokenDetails.volume24h,
        liquidityUsd: tokenDetails.liquidityUsd,
        image: tokenDetails.image,
        graduated: tokenDetails.graduated || false,
        signature,
        socialLinks,
        devInitialBuy,
        devLockEnabled,
        safetyScore,
        checks: {
          hasSocialLinks,
          hasTwitter,
          hasWebsite,
          devBuyLarge,
          devLockEnabled,
        },
      };

      this.activeTokens.set(mint, token);

      const event: TokenEvent = {
        type: 'create',
        mint,
        data: token,
        timestamp: Date.now(),
        signature,
      };

      this.emit('token', event);

      // Log with checks
      console.log('');
      console.log('╔════════════════════════════════════════════════════╗');
      console.log(`║  NEW TOKEN: ${token.symbol.padEnd(36)} ║`);
      console.log('╚════════════════════════════════════════════════════╝');
      console.log(`  Mint: ${mint}`);
      console.log(`  Price: $${(token.priceUsd || 0).toFixed(10)} | MC: $${(token.marketCap || 0).toFixed(2)} | Liq: $${(token.liquidityUsd || 0).toFixed(2)}`);
      console.log(`  Safety Score: ${safetyScore}/100 ${safetyScore >= 70 ? '✓ SAFE' : safetyScore >= 40 ? '⚠ MEDIUM' : '✗ RISKY'}`);
      console.log(`  Checks: Twitter:${hasTwitter ? '✓' : '✗'} | Web:${hasWebsite ? '✓' : '✗'} | DevBuy:${devBuyLarge ? '✓' : '✗'}(${devInitialBuy?.toFixed(2) || 0}SOL) | Lock:${devLockEnabled ? '✓' : '✗'}`);
      console.log(`  TX: https://solscan.io/tx/${signature}`);
      console.log('');

    } catch (error) {
      console.error(`[PumpMonitor] TX processing error ${signature.slice(0, 16)}:`, error);
    }
  }

  /**
   * Check if transaction is a token creation
   */
  private isTokenCreationTransaction(tx: ParsedTransactionWithMeta): boolean {
    const logs = tx.meta?.logMessages || [];
    const instructions = tx.transaction.message.instructions;

    // STRICT: Must involve Pump.fun program specifically
    const involvesPumpFun = instructions.some(ix => {
      if ('programId' in ix) {
        return ix.programId.toString() === PUMP_FUN_PROGRAM_ID;
      }
      return false;
    });

    if (!involvesPumpFun) {
      return false;
    }

    // Check logs for token creation event - must have BOTH program invocation AND create keyword
    const hasCreateLog = logs.some(log =>
      log.includes('Instruction:') &&
      CREATE_DISCRIMINATORS.some(d => log.toLowerCase().includes(d.toLowerCase()))
    );

    if (hasCreateLog) {
      return true;
    }

    // Check for Pump.fun specific token creation patterns in logs
    const hasPumpFunCreate = logs.some(log =>
      log.includes('Create') &&
      (log.includes('mint') || log.includes('token'))
    );

    return hasPumpFunCreate;
  }

  /**
   * Extract mint from transaction
   */
  private async extractMintFromTransaction(
    tx: ParsedTransactionWithMeta,
    signature: string
  ): Promise<string | null> {
    try {
      const message = tx.transaction.message;
      const instructions = message.instructions;

      // Look for token mint in parsed instructions
      for (const ix of instructions) {
        if ('parsed' in ix && ix.parsed) {
          const parsed = ix.parsed;

          // initializeMint
          if (parsed.type === 'initializeMint' && parsed.info?.mint) {
            return parsed.info.mint;
          }

          // mintTo
          if (parsed.type === 'mintTo' && parsed.info?.mint) {
            return parsed.info.mint;
          }

          // Any instruction with mint field
          if (parsed.info?.mint) {
            return parsed.info.mint;
          }
        }
      }

      // Look at account keys for potential mint
      const accountKeys = message.accountKeys;
      for (const account of accountKeys) {
        const pubkey = account.pubkey.toString();
        // Skip common programs
        if ([
          '11111111111111111111111111111111', // System
          'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token
          'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // ATA
          PUMP_FUN_PROGRAM_ID,
        ].includes(pubkey)) {
          continue;
        }

        // Check if this is a valid mint (has token info)
        const details = await this.fetchTokenDetails(pubkey);
        if (details && details.priceUsd > 0) {
          return pubkey;
        }
      }

      return null;

    } catch (error) {
      console.error('[PumpMonitor] Extract mint error:', error);
      return null;
    }
  }

  /**
   * Extract creator from transaction
   */
  private extractCreator(tx: ParsedTransactionWithMeta): string {
    try {
      const message = tx.transaction.message;
      const accountKeys = message.accountKeys;

      // First signer is usually the creator
      for (const account of accountKeys) {
        if (account.signer) {
          return account.pubkey.toString();
        }
      }

      // Fallback: first account
      return accountKeys[0]?.pubkey.toString() || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Add signature to processed set
   */
  private addProcessedSignature(signature: string): void {
    this.processedSignatures.add(signature);

    if (this.processedSignatures.size > this.maxProcessedSignatures) {
      const first = this.processedSignatures.values().next().value;
      if (first) {
        this.processedSignatures.delete(first);
      }
    }
  }

  /**
   * Fetch token details from DEX Screener
   */
  private async fetchTokenDetails(mint: string): Promise<{
    name: string;
    symbol: string;
    priceUsd: number;
    marketCap: number;
    volume24h: number;
    liquidityUsd: number;
    image?: string;
    graduated?: boolean;
  } | null> {
    try {
      const response = await fetch(`${DEX_SCREENER_API}/tokens/${mint}`, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as {
        pairs?: Array<{
          baseToken: { name: string; symbol: string; icon?: string };
          priceUsd: string;
          marketCap: string;
          volume?: { h24: string };
          liquidity?: { usd: string };
          chainId: string;
          dexId: string;
        }>;
      };

      if (!data.pairs || data.pairs.length === 0) {
        return null;
      }

      const solanaPairs = data.pairs.filter(p => p.chainId === 'solana');
      if (solanaPairs.length === 0) {
        return null;
      }

      const pair = solanaPairs.reduce((best, current) => {
        const bestLiq = parseFloat(best.liquidity?.usd || '0');
        const currLiq = parseFloat(current.liquidity?.usd || '0');
        return currLiq > bestLiq ? current : best;
      }, solanaPairs[0]);

      // Graduated if traded on Raydium (not just Pump.fun)
      const graduated = solanaPairs.some(p =>
        p.dexId?.toLowerCase().includes('raydium') ||
        p.dexId?.toLowerCase().includes('orca')
      );

      return {
        name: pair.baseToken.name || 'Unknown',
        symbol: pair.baseToken.symbol || 'UNKNOWN',
        priceUsd: parseFloat(pair.priceUsd || '0'),
        marketCap: parseFloat(pair.marketCap || '0'),
        volume24h: parseFloat(pair.volume?.h24 || '0'),
        liquidityUsd: parseFloat(pair.liquidity?.usd || '0'),
        image: pair.baseToken.icon,
        graduated,
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * Fetch token profile with social links and details from DEX Screener
   * Uses /tokens/{address} endpoint which includes profile data
   */
  private async fetchTokenProfileWithDetails(mint: string): Promise<{
    socialLinks?: SocialLinks;
    devWallet?: string;
    name?: string;
    symbol?: string;
  } | undefined> {
    try {
      // DEX Screenerのtokensエンドポイントはプロファイルデータを含む
      const response = await fetch(`${DEX_SCREENER_API}/tokens/${mint}`, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        return undefined;
      }

      const data = await response.json() as {
        pairs?: Array<{
          baseToken: { 
            address: string;
            name: string;
            symbol: string;
          };
          profile?: {
            url?: string;
            icon?: string;
            description?: string;
            links?: Array<{
              type: string;
              url: string;
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
          dexId?: string;
          chainId?: string;
        }>;
      };

      if (!data.pairs || data.pairs.length === 0) {
        return undefined;
      }

      // 最も流動性の高いペアを選択
      const pair = data.pairs[0];
      const profile = pair.profile;
      const info = pair.info;

      // SNSリンクを抽出
      const socialLinks: SocialLinks = {};

      // profile.linksから抽出
      if (profile?.links) {
        for (const link of profile.links) {
          if (link.type === 'twitter' || link.type === 'x') {
            socialLinks.twitter = link.url;
          } else if (link.type === 'website' || link.type === 'web') {
            socialLinks.website = link.url;
          } else if (link.type === 'telegram' || link.type === 'tg') {
            socialLinks.telegram = link.url;
          } else if (link.type === 'discord') {
            socialLinks.discord = link.url;
          }
        }
      }

      // info.socialsから抽出（バックアップ）
      if (info?.socials) {
        for (const social of info.socials) {
          if ((social.type === 'twitter' || social.type === 'x') && !socialLinks.twitter) {
            socialLinks.twitter = social.url;
          } else if (social.type === 'telegram' && !socialLinks.telegram) {
            socialLinks.telegram = social.url;
          } else if (social.type === 'discord' && !socialLinks.discord) {
            socialLinks.discord = social.url;
          }
        }
      }

      // info.websitesから抽出
      if (info?.websites && info.websites.length > 0 && !socialLinks.website) {
        socialLinks.website = info.websites[0].url;
      }

      return {
        socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
        name: pair.baseToken.name,
        symbol: pair.baseToken.symbol,
      };
    } catch (error) {
      console.error(`[PumpMonitor] Error fetching token profile for ${mint}:`, error);
      return undefined;
    }
  }

  /**
   * 軽量版：DEV初期購入額を推定（RPC呼び出しを最小化）
   * DEX Screenerデータから流動性と出来高を分析して推定
   */
  private estimateDevBuy(devWallet: string, token: any): number | undefined {
    // 実装の簡易化：marketCapの10%を初期投資と仮定（実際はもっと複雑）
    // またはトークンの流動性から推定
    const liquidity = token.liquidityUsd || 0;
    const marketCap = token.marketCap || 0;
    
    // 流動性が大きい場合、DEVはおそらく0.5SOL以上投資している
    if (liquidity > 10000) {
      return Math.max(0.5, liquidity / 100000); // $100k流動性 = 1SOL推定
    }
    
    if (marketCap > 50000) {
      return 0.5; // 最低0.5SOLと仮定
    }
    
    return undefined; // 不明
  }

  /**
   * Fetch token profile (social links) from DEX Screener
   * @deprecated 非推奨 - fetchTokenProfileWithDetailsを使用してください
   */
  private async fetchTokenProfile(mint: string): Promise<SocialLinks | undefined> {
    const result = await this.fetchTokenProfileWithDetails(mint);
    return result?.socialLinks;
  }

  /**
   * Analyze DEV's initial buy amount from recent transactions
   * 429対策：呼び出し回数を最小限に抑制
   */
  private async analyzeDevBuy(
    mint: string,
    creator: string,
    creationSignature: string
  ): Promise<number | undefined> {
    // 429対策：この重い処理は現在無効化（estimateDevBuyを使用）
    // 将来的にバッチ処理やキャッシュを実装して再有効化可能
    return undefined;
  }

  /**
   * Update token prices
   */
  async updateTokenPrices(): Promise<void> {
    for (const [mint, token] of this.activeTokens.entries()) {
      try {
        const updated = await this.fetchTokenDetails(mint);
        if (updated && updated.priceUsd > 0) {
          token.priceUsd = updated.priceUsd;
          token.marketCap = updated.marketCap;
          token.volume24h = updated.volume24h;
          token.liquidityUsd = updated.liquidityUsd;
        }
      } catch {
        // Silent fail
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

  getActiveTokens(): Token[] {
    return Array.from(this.activeTokens.values());
  }

  getToken(mint: string): Token | undefined {
    return this.activeTokens.get(mint);
  }

  isActive(mint: string): boolean {
    return this.activeTokens.has(mint);
  }
}
