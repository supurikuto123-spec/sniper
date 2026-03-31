/**
 * Pump.fun Paper Trading Bot - Main Server
 * 
 * Real-time blockchain monitoring with Helius WebSocket.
 * NO FAKE DATA - All events from real Solana blockchain.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { TradeManager } from './tradeManager';
import { PumpMonitor } from './pumpMonitor';
import { PaperTradeConfig, HELIUS_RPC_URL } from './types';

import path from 'path';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, '../../frontend');

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(FRONTEND_DIR));

// Serve index.html at root
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// Initialize managers
const tradeManager = new TradeManager();
const pumpMonitor = new PumpMonitor();

// ==================== API Routes ====================

// Get all open positions
app.get('/api/positions', (req: Request, res: Response) => {
  const positions = tradeManager.getOpenPositions();
  res.json(positions);
});

// Get trade history
app.get('/api/history', (req: Request, res: Response) => {
  const history = tradeManager.getPositionHistory();
  res.json(history);
});

// Get performance stats
app.get('/api/stats', (req: Request, res: Response) => {
  const stats = tradeManager.getStats();
  res.json(stats);
});

// Get PnL history
app.get('/api/pnl-history', (req: Request, res: Response) => {
  const history = tradeManager.getPnlHistory();
  res.json(history);
});

// Get total balance
app.get('/api/balance', (req: Request, res: Response) => {
  res.json({
    current: tradeManager.getBalance(),
    initial: tradeManager.getInitialBalance(),
    change: tradeManager.getBalance() - tradeManager.getInitialBalance(),
  });
});

// Get active tokens from monitor
app.get('/api/tokens', (req: Request, res: Response) => {
  const tokens = pumpMonitor.getActiveTokens();
  res.json(tokens);
});

// Get configuration
app.get('/api/config', (req: Request, res: Response) => {
  res.json(tradeManager.getConfig());
});

// Update configuration
app.post('/api/config', (req: Request, res: Response) => {
  const config: Partial<PaperTradeConfig> = req.body;
  tradeManager.updateConfig(config);
  res.json({ success: true, config: tradeManager.getConfig() });
});

// Manual sell position
app.post('/api/sell/:mint', (req: Request, res: Response) => {
  const { mint } = req.params;
  const success = tradeManager.executeSell(mint, 'manual');
  res.json({ success, mint });
});

// Sell all positions
app.post('/api/sell-all', (req: Request, res: Response) => {
  const count = tradeManager.sellAll();
  res.json({ success: true, soldCount: count });
});

// Sell profitable positions
app.post('/api/sell-profitable', (req: Request, res: Response) => {
  const count = tradeManager.sellProfitable();
  res.json({ success: true, soldCount: count });
});

// Sell losing positions
app.post('/api/sell-loss', (req: Request, res: Response) => {
  const count = tradeManager.sellLoss();
  res.json({ success: true, soldCount: count });
});

// Pause trading
app.post('/api/pause', (req: Request, res: Response) => {
  tradeManager.pause();
  res.json({ success: true, paused: true });
});

// Resume trading
app.post('/api/resume', (req: Request, res: Response) => {
  tradeManager.resume();
  res.json({ success: true, paused: false });
});

// Reset all state
app.post('/api/reset', (req: Request, res: Response) => {
  tradeManager.reset();
  res.json({ success: true });
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    monitorRunning: pumpMonitor.listenerCount('token') > 0,
    balance: tradeManager.getBalance(),
    openPositions: tradeManager.getOpenPositions().length,
    timestamp: Date.now(),
  });
});

// ==================== WebSocket Events ====================

io.on('connection', (socket) => {
  console.log(`[Server] Client connected: ${socket.id}`);

  // Send initial data
  socket.emit('initial', {
    balance: {
      current: tradeManager.getBalance(),
      initial: tradeManager.getInitialBalance(),
    },
    positions: tradeManager.getOpenPositions(),
    tokens: pumpMonitor.getActiveTokens(),
    stats: tradeManager.getStats(),
  });

  socket.on('disconnect', () => {
    console.log(`[Server] Client disconnected: ${socket.id}`);
  });
});

// Broadcast to all clients
function broadcast(event: string, data: unknown) {
  io.emit(event, data);
}

// ==================== Event Handlers ====================

// Handle new token from blockchain
pumpMonitor.on('token', async (event) => {
  const token = event.data;
  
  // Broadcast to clients
  broadcast('token', {
    type: 'new',
    token,
    timestamp: event.timestamp,
  });

  // Try to open position
  await tradeManager.onNewToken(token);
});

// Handle position updates
tradeManager.on('position', (event) => {
  broadcast('position', {
    type: event.type,
    position: event.position,
    timestamp: Date.now(),
  });
});

// Handle trades
tradeManager.on('trade', (event) => {
  broadcast('trade', {
    type: event.type,
    reason: event.reason,
    position: event.position,
    proceeds: event.proceeds,
    timestamp: Date.now(),
  });

  // Also broadcast updated stats
  broadcast('stats', tradeManager.getStats());
});

// Handle graduations
pumpMonitor.on('graduation', (event) => {
  broadcast('graduation', {
    mint: event.mint,
    token: event.data,
    timestamp: event.timestamp,
  });
});

// ==================== Periodic Tasks ====================

// Update prices every 10 seconds (real data from DEX Screener)
setInterval(async () => {
  await tradeManager.updatePrices();
  
  // Broadcast updated positions
  broadcast('positions', tradeManager.getOpenPositions());
}, 10000);

// Broadcast stats every 5 seconds
setInterval(() => {
  broadcast('stats', tradeManager.getStats());
}, 5000);

// ==================== Startup ====================

async function start() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     PUMP.FUN PAPER TRADING BOT - REAL BLOCKCHAIN DATA        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Configuration:');
  console.log(`  Mode: SOLANA DIRECT HTTP POLLING (100% Working)`);
  console.log(`  Helius RPC: ${HELIUS_RPC_URL.replace(/api-key=.*$/, 'api-key=***')}`);
  console.log(`  Program ID: 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`);
  console.log(`  Initial Balance: 100 SOL (VIRTUAL)`);
  console.log('');
  console.log('Features:');
  console.log('  ✓ 100% WORKING - No WebSocket required');
  console.log('  ✓ Direct Solana RPC program account monitoring');
  console.log('  ✓ Real price data from DEX Screener API');
  console.log('  ✓ Virtual SOL balance tracking');
  console.log('  ✓ Auto take-profit / stop-loss');
  console.log('');
  console.log('Detection Method:');
  console.log('  • Polls Pump.fun bonding curve accounts every 5s');
  console.log('  • Checks recent transactions every 30s');
  console.log('  • 100% real blockchain data (HTTP only)');
  console.log('');

  try {
    // Start blockchain monitoring
    await pumpMonitor.start();
    
    // Start HTTP server
    httpServer.listen(PORT, () => {
      console.log(`[Server] HTTP server running on port ${PORT}`);
      console.log(`[Server] API endpoint: http://localhost:${PORT}/api`);
      console.log('');
      console.log('Endpoints:');
      console.log('  GET  /api/positions      - Open positions');
      console.log('  GET  /api/history        - Trade history');
      console.log('  GET  /api/stats          - Performance stats');
      console.log('  GET  /api/balance        - Current balance');
      console.log('  GET  /api/tokens         - Active tokens');
      console.log('  GET  /api/config         - Trading configuration');
      console.log('  POST /api/sell/:mint     - Sell position');
      console.log('  POST /api/sell-all       - Sell all positions');
      console.log('  POST /api/pause          - Pause trading');
      console.log('  POST /api/resume         - Resume trading');
      console.log('');
      console.log('[Server] Ready for real-time blockchain monitoring');
    });

  } catch (error) {
    console.error('[Server] Startup error:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  pumpMonitor.stop();
  httpServer.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n[Server] Shutting down...');
  pumpMonitor.stop();
  httpServer.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

// Start the server
start();
