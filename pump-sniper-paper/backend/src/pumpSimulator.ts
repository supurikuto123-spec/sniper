// Pump.fun API Simulator (Paper Trading Mode)
// 実際のPump.fun APIを模擬したシミュレーター

import { Token, TokenEvent } from './types';
import { EventEmitter } from 'events';

// ミームコイン風の名前ジェネレーター
const PREFIXES = ['MOON', 'DOGE', 'PEPE', 'SHIB', 'WOJAK', 'CHAD', 'BASED', 'ALPHA', 'SIGMA', 'BETA'];
const SUFFIXES = ['COIN', 'TOKEN', 'MOON', 'ROCKET', 'LAMBO', 'WAGMI', 'FOMO', 'FUD', 'HODL', 'APE'];
const SYMBOLS = ['🚀', '🌙', '🐸', '🐶', '🦁', '🐂', '🐻', '💎', '🙌', '🔥'];

// Solana Base58文字セット
const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// 現実的なSolanaアドレスを生成（base58エンコード、32-44文字）
function generateSolanaAddress(): string {
  // 実際のPump.funトークンアドレスは通常32-44文字
  const length = 32 + Math.floor(Math.random() * 12); // 32-43文字
  let address = '';
  for (let i = 0; i < length; i++) {
    address += BASE58_CHARS[Math.floor(Math.random() * BASE58_CHARS.length)];
  }
  // 実際のPump.funミントアドレスは通常"pump"で終わることが多い
  if (Math.random() > 0.5) {
    address = address.slice(0, -4) + 'pump';
  }
  return address;
}

export class PumpSimulator extends EventEmitter {
  private isRunning: boolean = false;
  private tokenCounter: number = 0;
  private activeTokens: Map<string, Token> = new Map();
  private simulationInterval: NodeJS.Timeout | null = null;
  private tradeInterval: NodeJS.Timeout | null = null;

  // シミュレーション設定
  private config = {
    tokenCreationRate: 5000, // 5秒ごとに新規トークン生成（平均）
    tradeRate: 2000, // 2秒ごとに取引シミュレーション
    graduationProbability: 0.02 // 2%の確率で卒業
  };

  constructor() {
    super();
  }

  // シミュレーション開始
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('🚀 Pump.fun Simulator Started (Paper Trading Mode)');
    console.log('📡 Simulating token creation and trades...');

    // 新規トークン生成ループ
    this.simulationInterval = setInterval(() => {
      this.createRandomToken();
    }, this.config.tokenCreationRate);

    // 取引シミュレーションループ
    this.tradeInterval = setInterval(() => {
      this.simulateRandomTrades();
    }, this.config.tradeRate);

    // 初期トークンをいくつか生成
    for (let i = 0; i < 3; i++) {
      setTimeout(() => this.createRandomToken(), i * 1000);
    }
  }

  // シミュレーション停止
  stop(): void {
    this.isRunning = false;
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    if (this.tradeInterval) {
      clearInterval(this.tradeInterval);
      this.tradeInterval = null;
    }
    console.log('🛑 Simulator stopped');
  }

  // ランダムトークン生成
  private createRandomToken(): void {
    this.tokenCounter++;
    const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
    const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
    const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    
    const name = `${prefix}${suffix} #${this.tokenCounter}`;
    const ticker = `${prefix.substring(0, 3)}${suffix.substring(0, 1)}`;
    
    const token: Token = {
      mint: generateSolanaAddress(),
      name: name,
      symbol: ticker,
      creator: generateSolanaAddress(),
      createdAt: Date.now(),
      metadata: {
        image: `https://placehold.co/400x400/1a1a2e/FFFFFF/png?text=${symbol}`,
        description: `The most ${prefix.toLowerCase()} ${suffix.toLowerCase()} on Solana! ${symbol}`
      }
    };

    this.activeTokens.set(token.mint, token);

    const event: TokenEvent = {
      type: 'create',
      mint: token.mint,
      data: token,
      timestamp: Date.now()
    };

    this.emit('token', event);
    console.log(`🆕 New Token: ${name} ($${ticker})`);
  }

  // ランダム取引シミュレーション
  private simulateRandomTrades(): void {
    const tokens = Array.from(this.activeTokens.values());
    if (tokens.length === 0) return;

    // ランダムに1-3個のトークンを選んで取引をシミュレート
    const numTrades = Math.floor(Math.random() * 3) + 1;
    
    for (let i = 0; i < numTrades; i++) {
      const token = tokens[Math.floor(Math.random() * tokens.length)];
      const solAmount = parseFloat((Math.random() * 2 + 0.01).toFixed(3)); // 0.01-2 SOL
      const isBuy = Math.random() > 0.3; // 70%買い

      const event: TokenEvent = {
        type: 'trade',
        mint: token.mint,
        data: {
          solAmount,
          isBuy,
          tokenName: token.name,
          tokenSymbol: token.symbol
        },
        timestamp: Date.now()
      };

      this.emit('trade', event);

      // 卒業チェック（ランダム）
      if (!isBuy && Math.random() < this.config.graduationProbability) {
        this.simulateGraduation(token);
      }
    }
  }

  // 卒業シミュレーション
  private simulateGraduation(token: Token): void {
    const event: TokenEvent = {
      type: 'complete',
      mint: token.mint,
      data: {
        tokenName: token.name,
        tokenSymbol: token.symbol,
        graduatedAt: Date.now()
      },
      timestamp: Date.now()
    };

    this.emit('graduation', event);
    console.log(`🎓 Token Graduated: ${token.name} ($${token.symbol})`);
  }

  // アクティブトークン取得
  getActiveTokens(): Token[] {
    return Array.from(this.activeTokens.values());
  }

  // 特定トークン取得
  getToken(mint: string): Token | undefined {
    return this.activeTokens.get(mint);
  }

  isActive(): boolean {
    return this.isRunning;
  }
}
