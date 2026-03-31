// REAL Pump.fun Blockchain Monitor - NO FAKE DATA
// Uses Helius WebSocket for real-time on-chain detection

import { Token, TokenEvent } from './types';
import { EventEmitter } from 'events';
import { Connection, PublicKey, LogsCallback } from '@solana/web3.js';
import WebSocket from 'ws';

// Pump.fun program ID
const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMP_FUN_PROGRAM = new PublicKey(PUMP_FUN_PROGRAM_ID);

// Helius RPC with user's API key
const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=f8266582-4bd3-4354-a09d-48ef321b6273';
const HELIUS_WS_URL = 'wss://mainnet.helius-rpc.com/?api-key=f8266582-4bd3-4354-a09d-48ef321b6273';

interface HeliusTransaction {
  signature: string;
  type: string;
  timestamp: number;
  tokenAddress?: string;
  name?: string;
  symbol?: string;
  creator?: string;
}

export class PumpMonitor extends EventEmitter {
  private isRunning: boolean = false;
  private connection: Connection | null = null;
  private wsConnection: WebSocket | null = null;
  private activeTokens: Map<string, Token> = new Map();
  private processedMints: Set<string> = new Set();
  private processedSignatures: Set<string> = new Set();
  private logsSubscriptionId: number | null = null;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts = 10;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastPingTime: number = 0;

  constructor() {
    super();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('🚀 Pump.fun REAL-TIME Blockchain Monitor Started');
    console.log('📡 Monitoring Solana blockchain DIRECTLY');
    console.log('🎯 Detecting token creation events AS THEY HAPPEN');
    console.log('💰 PAPER TRADING - NO REAL MONEY SPENT');
    console.log('❌ NO SIMULATION - ONLY REAL BLOCKCHAIN DATA');

    this.connection = new Connection(HELIUS_RPC_URL, {
      commitment: 'confirmed',
      wsEndpoint: HELIUS_WS_URL
    });

    try {
      const version = await this.connection.getVersion();
      console.log(`✅ Helius RPC Connected: ${version['solana-core']}`);

      // Start WebSocket monitoring for real-time detection
      await this.startWebSocketMonitoring();

      // Also poll Helius API for recent tokens as backup
      await this.loadRecentTokens();

      console.log('✅ Real-time monitoring active - waiting for new tokens...');

    } catch (err) {
      console.error('❌ Failed to connect:', err);
      this.emit('error', err);
      this.scheduleReconnect();
    }
  }

  stop(): void {
    this.isRunning = false;

    // Clean up WebSocket
    if (this.wsConnection) {
      this.wsConnection.terminate();
      this.wsConnection = null;
    }

    // Clean up heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Unsubscribe from logs
    if (this.logsSubscriptionId !== null && this.connection) {
      this.connection.removeOnLogsListener(this.logsSubscriptionId);
      this.logsSubscriptionId = null;
    }

    console.log('🛑 Monitor stopped');
  }

  // WebSocket-based real-time monitoring
  private async startWebSocketMonitoring(): Promise<void> {
    try {
      this.wsConnection = new WebSocket(HELIUS_WS_URL);

      this.wsConnection.on('open', () => {
        console.log('🔌 WebSocket connected for real-time monitoring');
        this.reconnectAttempts = 0;
        this.subscribeToProgramLogs();
        this.startHeartbeat();
      });

      this.wsConnection.on('message', (data: WebSocket.Data) => {
        this.handleWebSocketMessage(data);
      });

      this.wsConnection.on('error', (err) => {
        console.error('WebSocket error:', err.message);
      });

      this.wsConnection.on('close', () => {
        console.log('🔌 WebSocket disconnected');
        if (this.isRunning) {
          this.scheduleReconnect();
        }
      });

    } catch (err) {
      console.error('Failed to start WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  private subscribeToProgramLogs(): void {
    if (!this.wsConnection || this.wsConnection.readyState !== WebSocket.OPEN) return;

    const subscribeMsg = {
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [
        {
          mentions: [PUMP_FUN_PROGRAM_ID]
        },
        {
          commitment: 'confirmed'
        }
      ]
    };

    this.wsConnection.send(JSON.stringify(subscribeMsg));
    console.log('📡 Subscribed to Pump.fun program logs (real-time)');
  }

  private handleWebSocketMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      // Handle subscription response
      if (message.id === 1 && message.result !== undefined) {
        this.logsSubscriptionId = message.result;
        console.log(`✅ Subscription confirmed (ID: ${this.logsSubscriptionId})`);
        return;
      }

      // Handle incoming logs
      if (message.method === 'logsNotification') {
        const result = message.params?.result;
        if (!result) return;

        const signature = result.signature;
        const logs = result.value?.logs || [];

        // Skip already processed
        if (this.processedSignatures.has(signature)) return;
        this.processedSignatures.add(signature);

        // Look for Create instruction in logs
        const hasCreate = logs.some((log: string) =>
          log.includes('Instruction: Create') ||
          log.includes('Program log: Create') ||
          log.includes('create_token')
        );

        if (hasCreate) {
          console.log(`🎯 REAL-TIME: Token creation detected! Sig: ${signature.slice(0, 16)}...`);
          this.processNewTokenFromSignature(signature);
        }
      }
    } catch (err) {
      // Ignore parse errors
    }
  }

  private async processNewTokenFromSignature(signature: string): Promise<void> {
    if (!this.connection) return;

    try {
      // Fetch transaction details
      const tx = await this.connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

      if (!tx || !tx.meta) return;

      // Extract token info from transaction
      const tokenInfo = this.extractTokenInfoFromTx(tx, signature);
      if (!tokenInfo || !tokenInfo.mint) return;

      // Skip if already processed
      if (this.processedMints.has(tokenInfo.mint)) return;
      this.processedMints.add(tokenInfo.mint);

      // Fetch additional token details
      const details = await this.fetchTokenDetails(tokenInfo.mint);

      const token: Token = {
        mint: tokenInfo.mint,
        name: details.name || tokenInfo.name || 'Unknown',
        symbol: details.symbol || tokenInfo.symbol || 'PUMP',
        creator: tokenInfo.creator || 'unknown',
        createdAt: Date.now(),
        metadata: {
          image: details.image || '',
          description: `Detected in real-time from blockchain`,
          priceUsd: details.priceUsd || '0',
          marketCap: details.marketCap || 0,
          volume24h: details.volume24h || 0
        }
      };

      this.activeTokens.set(token.mint, token);

      console.log(`🆕 NEW TOKEN DETECTED (REAL-TIME):`);
      console.log(`   Name: ${token.name} ($${token.symbol})`);
      console.log(`   Mint: ${token.mint}`);
      console.log(`   Creator: ${token.creator}`);
      console.log(`   Signature: ${signature}`);

      this.emitTokenEvent(token);

    } catch (err) {
      console.error('Error processing token:', err);
    }
  }

  private extractTokenInfoFromTx(tx: any, signature: string): { mint: string; name?: string; symbol?: string; creator?: string } | null {
    try {
      const accounts = tx.transaction.message.accountKeys.map((a: any) =>
        typeof a === 'string' ? a : a.pubkey.toString()
      );

      // The token mint is typically at index 2 or 3 for Pump.fun Create
      let mint: string | null = null;

      // Look for the mint in account keys (44 chars = base58 address)
      for (let i = 2; i < Math.min(accounts.length, 6); i++) {
        const account = accounts[i];
        if (account && account.length >= 32 && account.length <= 44) {
          // Additional validation: check if it's a valid base58 address
          if (/^[A-HJ-NP-Za-km-z1-9]+$/.test(account)) {
            mint = account;
            break;
          }
        }
      }

      if (!mint) return null;

      // Creator is typically the fee payer (first account)
      const creator = accounts[0] || 'unknown';

      return { mint, creator };
    } catch {
      return null;
    }
  }

  private startHeartbeat(): void {
    this.lastPingTime = Date.now();

    this.heartbeatInterval = setInterval(() => {
      if (!this.wsConnection || this.wsConnection.readyState !== WebSocket.OPEN) {
        return;
      }

      // Send ping
      try {
        this.wsConnection.send(JSON.stringify({ jsonrpc: '2.0', id: 999, method: 'ping' }));
        this.lastPingTime = Date.now();
      } catch {
        // Connection dead, will trigger reconnect
      }
    }, 30000); // Every 30 seconds
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached. Giving up.');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      if (this.isRunning) {
        this.startWebSocketMonitoring();
      }
    }, delay);
  }

  // Backup: Load recent tokens from Helius API (not DEX Screener filtering)
  private async loadRecentTokens(): Promise<void> {
    console.log('📊 Loading recent tokens from Helius API...');

    try {
      // Query recent signatures for Pump.fun program
      const signatures = await this.connection!.getSignaturesForAddress(
        PUMP_FUN_PROGRAM,
        { limit: 50 }
      );

      for (const sigInfo of signatures) {
        // Skip old signatures (> 5 minutes)
        const age = Date.now() - (sigInfo.blockTime || 0) * 1000;
        if (age > 5 * 60 * 1000) continue;

        if (this.processedSignatures.has(sigInfo.signature)) continue;

        await this.processNewTokenFromSignature(sigInfo.signature);
      }
    } catch (err) {
      console.error('Error loading recent tokens:', err);
    }
  }

  // Fetch token details from DEX Screener (for metadata only, not for detection timing)
  private async fetchTokenDetails(mint: string): Promise<any> {
    try {
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (!response.ok) return {};

      const data: any = await response.json();
      const pair = data.pairs?.[0];

      if (pair) {
        return {
          name: pair.baseToken?.name,
          symbol: pair.baseToken?.symbol,
          priceUsd: pair.priceUsd,
          marketCap: pair.marketCap,
          volume24h: pair.volume?.h24,
          image: pair.info?.imageUrl
        };
      }
    } catch {
      // Ignore errors
    }
    return {};
  }

  private emitTokenEvent(token: Token): void {
    const event: TokenEvent = {
      type: 'create',
      mint: token.mint,
      data: token,
      timestamp: Date.now()
    };

    this.emit('token', event);
  }

  // Public getters
  getActiveTokens(): Token[] {
    return Array.from(this.activeTokens.values());
  }

  getToken(mint: string): Token | undefined {
    return this.activeTokens.get(mint);
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getStats(): { processedSignatures: number; activeTokens: number } {
    return {
      processedSignatures: this.processedSignatures.size,
      activeTokens: this.activeTokens.size
    };
  }
}
