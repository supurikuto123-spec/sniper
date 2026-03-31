import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { TradeManager } from './tradeManager';
import { PumpMonitor } from './pumpMonitor';
import { Token, TokenEvent, TradePosition, PaperTradeConfig } from './types';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// ミドルウェア
app.use(cors());
app.use(express.json());

// インスタンス作成
const tradeManager = new TradeManager();
const monitor = new PumpMonitor(); // 本物のPump.fun監視

// ===== HTTP APIエンドポイント =====

// 現在のポジション一覧
app.get('/api/positions', (req, res) => {
  const positions = tradeManager.getAllPositions();
  res.json({
    success: true,
    count: positions.length,
    data: positions
  });
});

// 取引履歴
app.get('/api/history', (req, res) => {
  const history = tradeManager.getTradeHistory();
  res.json({
    success: true,
    count: history.length,
    data: history
  });
});

// パフォーマンス統計（総残高含む）
app.get('/api/stats', (req, res) => {
  const stats = tradeManager.getStats();
  const balance = tradeManager.getBalance();
  const totalBalance = tradeManager.getTotalBalance();
  res.json({
    success: true,
    data: {
      ...stats,
      balance,
      totalBalance,
      initialBalance: 100
    }
  });
});

// 損益履歴取得
app.get('/api/pnl-history', (req, res) => {
  const history = tradeManager.getPnlHistory();
  res.json({
    success: true,
    count: history.length,
    data: history
  });
});

// 総残高取得（現金 + 評価額）
app.get('/api/total-balance', (req, res) => {
  const totalBalance = tradeManager.getTotalBalance();
  res.json({
    success: true,
    data: totalBalance
  });
});

// アクティブトークン（本物のPump.funデータ）
app.get('/api/tokens', (req, res) => {
  const tokens = monitor.getActiveTokens();
  res.json({
    success: true,
    count: tokens.length,
    data: tokens
  });
});

// 設定取得
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    data: tradeManager.getConfig()
  });
});

// 設定更新
app.post('/api/config', (req, res) => {
  const config: Partial<PaperTradeConfig> = req.body;
  tradeManager.updateConfig(config);
  res.json({
    success: true,
    message: 'Config updated',
    data: tradeManager.getConfig()
  });
});

// 手動売却（非同期対応）
app.post('/api/sell/:mint', async (req, res) => {
  const { mint } = req.params;
  const position = await tradeManager.executeSell(mint, 'manual');
  
  if (position) {
    res.json({
      success: true,
      message: `Sold ${position.tokenSymbol} (PnL: ${position.pnlPercent.toFixed(2)}%)`,
      data: position
    });
    
    // WebSocketで通知
    io.emit('position_closed', position);
    io.emit('stats_update', {
      ...tradeManager.getStats(),
      balance: tradeManager.getBalance()
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Failed to sell position'
    });
  }
});

// リセット
app.post('/api/reset', (req, res) => {
  tradeManager.reset();
  res.json({
    success: true,
    message: 'Paper trading reset'
  });
});

// ===== 一時停止機能 =====

// 一時停止状態の取得
app.get('/api/pause', (req, res) => {
  res.json({
    success: true,
    data: {
      paused: tradeManager.isTradingPaused()
    }
  });
});

// 一時停止/再開の切り替え
app.post('/api/pause', (req, res) => {
  const { paused } = req.body;
  if (paused === true) {
    tradeManager.pause();
  } else if (paused === false) {
    tradeManager.resume();
  } else {
    // トグル
    if (tradeManager.isTradingPaused()) {
      tradeManager.resume();
    } else {
      tradeManager.pause();
    }
  }
  const isPaused = tradeManager.isTradingPaused();
  io.emit('status_update', { paused: isPaused });
  res.json({
    success: true,
    message: isPaused ? 'Trading paused' : 'Trading resumed',
    data: { paused: isPaused }
  });
});

// ===== 一括売却機能 =====

// 全ポジションを一括売却
app.post('/api/sell-all', async (req, res) => {
  const soldPositions = await tradeManager.sellAll('manual');
  const totalPnl = soldPositions.reduce((sum, p) => sum + p.pnl, 0);
  
  if (soldPositions.length > 0) {
    io.emit('mass_sold', { 
      count: soldPositions.length, 
      totalPnl,
      reason: 'manual_all'
    });
    io.emit('positions_update', tradeManager.getAllPositions());
    io.emit('stats_update', {
      ...tradeManager.getStats(),
      balance: tradeManager.getBalance(),
      totalBalance: tradeManager.getTotalBalance()
    });
  }
  
  res.json({
    success: true,
    message: `Sold ${soldPositions.length} positions (PnL: ${totalPnl.toFixed(4)} SOL)`,
    data: {
      soldCount: soldPositions.length,
      totalPnl,
      positions: soldPositions
    }
  });
});

// 利益が出ているポジションのみ売却
app.post('/api/sell-profitable', async (req, res) => {
  const soldPositions = await tradeManager.sellProfitable();
  const totalPnl = soldPositions.reduce((sum, p) => sum + p.pnl, 0);
  
  if (soldPositions.length > 0) {
    io.emit('mass_sold', { 
      count: soldPositions.length, 
      totalPnl,
      reason: 'profitable'
    });
    io.emit('positions_update', tradeManager.getAllPositions());
    io.emit('stats_update', {
      ...tradeManager.getStats(),
      balance: tradeManager.getBalance(),
      totalBalance: tradeManager.getTotalBalance()
    });
  }
  
  res.json({
    success: true,
    message: `Sold ${soldPositions.length} profitable positions (PnL: +${totalPnl.toFixed(4)} SOL)`,
    data: {
      soldCount: soldPositions.length,
      totalPnl,
      positions: soldPositions
    }
  });
});

// 損失が出ているポジションのみ売却
app.post('/api/sell-loss', async (req, res) => {
  const soldPositions = await tradeManager.sellLoss();
  const totalPnl = soldPositions.reduce((sum, p) => sum + p.pnl, 0);
  
  if (soldPositions.length > 0) {
    io.emit('mass_sold', { 
      count: soldPositions.length, 
      totalPnl,
      reason: 'loss'
    });
    io.emit('positions_update', tradeManager.getAllPositions());
    io.emit('stats_update', {
      ...tradeManager.getStats(),
      balance: tradeManager.getBalance(),
      totalBalance: tradeManager.getTotalBalance()
    });
  }
  
  res.json({
    success: true,
    message: `Sold ${soldPositions.length} losing positions (Loss: ${totalPnl.toFixed(4)} SOL)`,
    data: {
      soldCount: soldPositions.length,
      totalPnl,
      positions: soldPositions
    }
  });
});

// ===== WebSocketイベント =====

io.on('connection', (socket) => {
  console.log(`🔗 Client connected: ${socket.id}`);
  
  // 初期データ送信
  const totalBalance = tradeManager.getTotalBalance();
  socket.emit('init', {
    positions: tradeManager.getAllPositions(),
    stats: {
      ...tradeManager.getStats(),
      totalBalance
    },
    balance: tradeManager.getBalance(),
    totalBalance,
    config: tradeManager.getConfig(),
    monitorStatus: monitor.isActive(),
    paused: tradeManager.isTradingPaused()
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// ===== Pump.funリアルタイム監視連携 =====

// 新規トークン検出時（本物のPump.funデータ - 非同期対応）
monitor.on('token', async (event: TokenEvent) => {
  const token = event.data as Token;
  
  // ペーパートレードで購入（遅延シミュレーション込み）
  const position = await tradeManager.onNewToken(token);
  
  if (position) {
    const feeInfo = `(Fee: ${(position.solAmount * 0.0125).toFixed(4)} SOL)`;
    console.log(`💰 [PAPER] Bought ${token.name} ($${token.symbol}) at rank #${position.buyRank} ${feeInfo}`);
    
    // 全クライアントに通知
    io.emit('new_position', position);
    io.emit('token_created', {
      token,
      position,
      message: `🎯 SNIPED: ${token.name} (REAL PUMP.FUN DATA)`
    });
  } else {
    io.emit('token_created', {
      token,
      position: null,
      message: `⚠️ Skipped ${token.name} (insufficient balance or duplicate)`
    });
  }
  
  // ポジション一覧も更新
  io.emit('positions_update', tradeManager.getAllPositions());
  io.emit('stats_update', {
    ...tradeManager.getStats(),
    balance: tradeManager.getBalance(),
    totalBalance: tradeManager.getTotalBalance()
  });
});

// Real blockchain trade events (from actual Pump.fun transactions)
monitor.on('trade', async (event: TokenEvent) => {
  const { solAmount, isBuy, tokenName, tokenSymbol } = event.data;

  // Update position price (with auto-sell checks)
  const position = await tradeManager.updatePrice(event.mint, solAmount, isBuy);

  if (position) {
    // Check if sold
    if (position.sold) {
      const reason = position.pnlPercent >= 55 ? 'take_profit' :
                     position.pnlPercent <= -30 ? 'stop_loss' : 'force_sell';
      const emoji = reason === 'take_profit' ? '💰' : reason === 'stop_loss' ? '🛑' : '⏰';
      const label = reason === 'take_profit' ? 'TP' : reason === 'stop_loss' ? 'SL' : 'FORCE';
      console.log(`${emoji} [PAPER] AUTO-SOLD ${tokenSymbol} [${label}] ${position.pnlPercent.toFixed(2)}%`);

      io.emit('position_closed', position);
    }
  }

  // Stats update
  io.emit('stats_update', {
    ...tradeManager.getStats(),
    balance: tradeManager.getBalance(),
    totalBalance: tradeManager.getTotalBalance()
  });
});

// 卒業時（Raydium上場検出）
monitor.on('graduation', (event: TokenEvent) => {
  const { tokenName, tokenSymbol } = event.data;
  
  // ポジションの卒業フラグ更新
  const position = tradeManager.getPosition(event.mint);
  if (position) {
    position.graduated = true;
    position.graduatedAt = Date.now();
    
    console.log(`🎓 [PAPER] ${tokenName} ($${tokenSymbol}) GRADUATED!`);
    io.emit('token_graduated', {
      mint: event.mint,
      tokenName,
      tokenSymbol,
      position,
      message: `🎓 GRADUATED: ${tokenName}! Check your position!`
    });
  }
});

// ===== Periodic Updates =====

// Position price update via real market data from DEX Screener (10 second interval)
setInterval(async () => {
  const positions = tradeManager.getAllPositions().filter(p => !p.sold);

  for (const position of positions) {
    try {
      // Fetch real price from DEX Screener API
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${position.tokenMint}`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (!response.ok) continue;

      const data: any = await response.json();
      const pair = data.pairs?.[0];

      if (pair && pair.priceUsd) {
        const currentPriceUsd = parseFloat(pair.priceUsd);
        const marketCap = pair.marketCap || 0;

        // Calculate PnL based on real price changes
        const entryPriceUsd = position.entryPrice;
        const priceChangePercent = ((currentPriceUsd - entryPriceUsd) / entryPriceUsd) * 100;

        position.pnlPercent = priceChangePercent;
        position.pnl = position.solAmount * (priceChangePercent / 100);
        position.currentPrice = currentPriceUsd;
        position.currentMarketCap = marketCap;

        // Check for auto-sell conditions
        if (tradeManager.getConfig().autoSell) {
          if (position.pnlPercent >= tradeManager.getConfig().takeProfitPercent) {
            await tradeManager.executeSell(position.tokenMint, 'take_profit');
            console.log(`💰 [PAPER] TAKE PROFIT: ${position.tokenSymbol} +${position.pnlPercent.toFixed(2)}%`);
            io.emit('position_closed', position);
          } else if (position.pnlPercent <= -tradeManager.getConfig().stopLossPercent) {
            await tradeManager.executeSell(position.tokenMint, 'stop_loss');
            console.log(`🛑 [PAPER] STOP LOSS: ${position.tokenSymbol} ${position.pnlPercent.toFixed(2)}%`);
            io.emit('position_closed', position);
          }
        }
      }
    } catch (err) {
      // Ignore fetch errors
    }
  }

  const activePositions = tradeManager.getAllPositions();
  if (activePositions.length > 0) {
    io.emit('positions_update', activePositions);
  }
}, 10000);

// 統計定期ブロードキャスト（5秒ごと）
setInterval(() => {
  io.emit('stats_update', {
    ...tradeManager.getStats(),
    balance: tradeManager.getBalance(),
    totalBalance: tradeManager.getTotalBalance()
  });
}, 5000);

// ===== サーバー起動 =====

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║     🚀 PUMP.FUN PAPER TRADING SNIPER BOT 🚀            ║
║                                                        ║
║  Backend Server: http://localhost:${PORT}              ║
║  WebSocket: ws://localhost:${PORT}                     ║
║                                                        ║
║  📊 Dashboard: http://localhost:3000                 ║
║  💰 Initial Balance: 100 SOL (PAPER - NO REAL MONEY) ║
║  🔗 RPC: Helius Mainnet (WebSocket Real-Time)          ║
║  🎯 Monitoring: REAL-TIME Blockchain Events              ║
║  ⚡ Detection: Live Token Creation (No Delay)            ║
║  ❌ NO SIMULATION - ONLY REAL BLOCKCHAIN DATA          ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
  `);

  // Start real-time Pump.fun monitoring
  monitor.start();
});

// グレースフルシャットダウン
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  monitor.stop();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
