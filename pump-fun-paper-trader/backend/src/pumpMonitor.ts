/**
 * PumpMonitor - Real-time blockchain monitoring for Pump.fun
 * 
 * Uses Helius WebSocket to subscribe to program logs.
 * NO FAKE DATA - All events come from real Solana blockchain.
 */

import WebSocket from 'ws';
import { Connection, PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import {
  PUMP_FUN_PROGRAM_ID,
  HELIUS_RPC_URL,
  HELIUS_WS_URL,
  DEX_SCREENER_API,
  Token,
  TokenEvent,
  HeliusLogNotification,
} from './types';

export class PumpMonitor extends EventEmitter {
  private ws: WebSocket | null = null;
  private connection: Connection;
  private subscriptionId: number | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private isRunning = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private processedSignatures = new Set<string>();
  private readonly maxProcessedSignatures = 1000;
  private activeTokens = new Map<string, Token>();

  constructor() {
    super();
    // HTTP connection for fetching transaction details
    this.connection = new Connection(HELIUS_RPC_URL, 'confirmed');
  }

  /**
   * Start monitoring Pump.fun program logs via Helius WebSocket
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[PumpMonitor] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[PumpMonitor] Starting real-time blockchain monitoring...');
    console.log(`[PumpMonitor] Program ID: ${PUMP_FUN_PROGRAM_ID}`);
    console.log(`[PumpMonitor] Helius RPC: ${HELIUS_RPC_URL.replace(/api-key=.*$/, 'api-key=***')}`);

    await this.connectWebSocket();
  }

  /**
   * Connect to Helius WebSocket with auto-reconnect
   */
  private async connectWebSocket(): Promise<void> {
    try {
      console.log('[PumpMonitor] Connecting to Helius WebSocket...');

      this.ws = new WebSocket(HELIUS_WS_URL);

      this.ws.on('open', () => {
        console.log('[PumpMonitor] WebSocket connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.subscribeToLogs();
        this.startHeartbeat();
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleWebSocketMessage(data);
      });

      this.ws.on('error', (error) => {
        console.error('[PumpMonitor] WebSocket error:', error.message);
      });

      this.ws.on('close', () => {
        console.log('[PumpMonitor] WebSocket closed');
        this.cleanup();
        if (this.isRunning) {
          this.scheduleReconnect();
        }
      });

    } catch (error) {
      console.error('[PumpMonitor] Failed to connect:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Subscribe to Pump.fun program logs
   */
  private subscribeToLogs(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[PumpMonitor] WebSocket not ready for subscription');
      return;
    }

    const subscribeMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [
        {
          mentions: [PUMP_FUN_PROGRAM_ID],
        } as any,
        {
          commitment: 'confirmed',
        },
      ],
    };

    this.ws.send(JSON.stringify(subscribeMessage));
    console.log('[PumpMonitor] Subscribed to Pump.fun program logs');
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleWebSocketMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      // Handle subscription confirmation
      if (message.id === 1 && message.result !== undefined) {
        this.subscriptionId = message.result;
        console.log(`[PumpMonitor] Subscription confirmed, ID: ${this.subscriptionId}`);
        return;
      }

      // Handle log notifications
      if (message.method === 'logsNotification' && message.params) {
        const notification = message.params as HeliusLogNotification;
        this.processLogNotification(notification);
      }
    } catch (error) {
      console.error('[PumpMonitor] Error parsing message:', error);
    }
  }

  /**
   * Process log notification from Helius
   */
  private async processLogNotification(notification: HeliusLogNotification): Promise<void> {
    const { signature, logs, err, blockHeight } = notification.result;

    // Skip failed transactions
    if (err) {
      return;
    }

    // Skip already processed signatures
    if (this.processedSignatures.has(signature)) {
      return;
    }

    // Add to processed set
    this.processedSignatures.add(signature);
    
    // Limit set size
    if (this.processedSignatures.size > this.maxProcessedSignatures) {
      const first = this.processedSignatures.values().next().value;
      if (first) {
        this.processedSignatures.delete(first);
      }
    }

    // Check for Create instruction in logs
    const hasCreate = logs.some(log => 
      log.includes('Instruction: Create') || 
      log.includes('CreateEvent') ||
      log.includes('create_token')
    );

    if (hasCreate) {
      console.log(`[PumpMonitor] Detected token creation in signature: ${signature}`);
      await this.processTokenCreation(signature, blockHeight);
    }

    // Check for graduation
    const hasGraduation = logs.some(log =>
      log.includes('Instruction: Graduate') ||
      log.includes('GraduateEvent') ||
      log.includes('bonding_curve_complete')
    );

    if (hasGraduation) {
      console.log(`[PumpMonitor] Detected token graduation in signature: ${signature}`);
      await this.processGraduation(signature);
    }
  }

  /**
   * Process token creation transaction
   */
  private async processTokenCreation(signature: string, blockHeight?: number): Promise<void> {
    try {
      // Fetch transaction details from Helius RPC
      const tx = await this.connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        console.warn(`[PumpMonitor] Transaction not found: ${signature}`);
        return;
      }

      if (!tx.meta || tx.meta.err) {
        console.warn(`[PumpMonitor] Transaction failed or has error: ${signature}`);
        return;
      }

      // Extract mint address from transaction accounts
      const mint = this.extractMintFromTransaction(tx.transaction);
      if (!mint) {
        console.warn(`[PumpMonitor] Could not extract mint from transaction: ${signature}`);
        return;
      }

      // Skip if already tracked
      if (this.activeTokens.has(mint)) {
        return;
      }

      // Fetch token details from DEX Screener (real market data)
      const tokenDetails = await this.fetchTokenDetails(mint);
      if (!tokenDetails) {
        console.warn(`[PumpMonitor] Could not fetch token details for: ${mint}`);
        return;
      }

      // Get block time
      const blockTime = tx.blockTime || Math.floor(Date.now() / 1000);

      // Get creator from transaction
      const message = tx.transaction.message as any;
      const creator = message.getAccountKeys?.().staticAccountKeys?.[0]?.toString() || 
                      message.accountKeys?.[0]?.toString() || 
                      'unknown';

      // Build token object
      const token: Token = {
        mint,
        name: tokenDetails.name,
        symbol: tokenDetails.symbol,
        creator,
        createdAt: blockTime * 1000,
        priceUsd: tokenDetails.priceUsd,
        marketCap: tokenDetails.marketCap,
        volume24h: tokenDetails.volume24h,
        liquidityUsd: tokenDetails.liquidityUsd,
        image: tokenDetails.image,
        graduated: false,
        blockHeight,
        signature,
      };

      // Store in active tokens
      this.activeTokens.set(mint, token);

      // Emit token creation event
      const event: TokenEvent = {
        type: 'create',
        mint,
        data: token,
        timestamp: Date.now(),
        blockHeight,
        signature,
      };

      this.emit('token', event);

      console.log(`[PumpMonitor] New token detected: ${token.symbol} (${mint})`);
      console.log(`  Price: $${token.priceUsd?.toFixed(6) || 'N/A'}`);
      console.log(`  Market Cap: $${token.marketCap?.toFixed(2) || 'N/A'}`);

    } catch (error) {
      console.error(`[PumpMonitor] Error processing token creation: ${error}`);
    }
  }

  /**
   * Extract mint address from transaction
   */
  private extractMintFromTransaction(transaction: any): string | null {
    try {
      // Get account keys - handle both legacy and versioned messages
      let accountKeys: PublicKey[] = [];
      
      if (transaction.message.getAccountKeys) {
        // Versioned message
        accountKeys = transaction.message.getAccountKeys().staticAccountKeys || [];
      } else if (transaction.message.accountKeys) {
        // Legacy message
        accountKeys = transaction.message.accountKeys;
      }
      
      // Look for likely mint address (third account in Pump.fun Create instruction)
      // Pump.fun Create typically has accounts: [creator, bonding_curve, mint, ...]
      if (accountKeys.length >= 3) {
        const potentialMint = accountKeys[2].toString();
        // Validate it looks like a Solana mint address (32 bytes base58 encoded = 43-44 chars)
        if (potentialMint.length >= 32 && potentialMint.length <= 44) {
          return potentialMint;
        }
      }

      // Fallback: look through all accounts for a mint-like address
      for (const key of accountKeys) {
        const addr = key.toString();
        if (addr.length >= 32 && addr.length <= 44 && addr !== PUMP_FUN_PROGRAM_ID) {
          return addr;
        }
      }

      return null;
    } catch (error) {
      console.error('[PumpMonitor] Error extracting mint:', error);
      return null;
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
        console.warn(`[PumpMonitor] DEX Screener API error: ${response.status}`);
        return null;
      }

      const data = await response.json() as { pairs?: Array<{
        baseToken: { name: string; symbol: string; icon?: string };
        priceUsd: string;
        marketCap: string;
        volume?: { h24: string };
        liquidity?: { usd: string };
      }> };

      if (!data.pairs || data.pairs.length === 0) {
        console.warn(`[PumpMonitor] No pairs found for mint: ${mint}`);
        return null;
      }

      // Get the most liquid pair
      const pair = data.pairs.reduce((best, current) => {
        const bestLiquidity = parseFloat(best.liquidity?.usd || '0');
        const currentLiquidity = parseFloat(current.liquidity?.usd || '0');
        return currentLiquidity > bestLiquidity ? current : best;
      }, data.pairs[0]);

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
   * Process token graduation
   */
  private async processGraduation(signature: string): Promise<void> {
    try {
      const tx = await this.connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) return;

      const mint = this.extractMintFromTransaction(tx.transaction);
      if (!mint) return;

      const token = this.activeTokens.get(mint);
      if (token) {
        token.graduated = true;
        
        const event: TokenEvent = {
          type: 'graduation',
          mint,
          data: token,
          timestamp: Date.now(),
          blockHeight: tx.slot,
          signature,
        };

        this.emit('graduation', event);
        console.log(`[PumpMonitor] Token graduated: ${token.symbol}`);
      }
    } catch (error) {
      console.error(`[PumpMonitor] Error processing graduation: ${error}`);
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send ping to keep connection alive
        this.ws.send(JSON.stringify({ jsonrpc: '2.0', id: 999, method: 'ping' }));
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[PumpMonitor] Max reconnection attempts reached');
      this.isRunning = false;
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

    console.log(`[PumpMonitor] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
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
