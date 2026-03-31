"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradeManager = void 0;
const uuid_1 = require("uuid");
const bondingCurve_1 = require("./bondingCurve");
// デフォルト設定（現実的なパラメータ）
const DEFAULT_CONFIG = {
    maxPositions: 0, // 0 = 無制限
    buyAmount: 0.1, // 0.1 SOL
    takeProfitPercent: 55, // +55%で利確
    stopLossPercent: 30, // -30%で損切り
    autoSell: true, // 自動売却有効
    minLiquidity: 0,
    maxSlippage: 30,
    // 手数料設定（Pump.fun公式）
    tradingFeePercent: 1.25, // 1.25%取引手数料
    networkFeeSol: 0.00002, // 約$0.003のガス代
    forceSellAfterMinutes: 60, // 1時間で強制売却
    // 遅延設定（Rust実装の保守的目安）
    detectionLatencyMs: 150, // 検出遅延150ms
    confirmationLatencyMs: 2000 // 確認遅延2秒
};
class TradeManager {
    constructor(config = {}) {
        this.positions = new Map();
        this.bondingCurves = new Map();
        this.tradeHistory = [];
        this.currentBalance = 100; // 初期資金100 SOL（ペーパー）
        this.isPaused = false; // 一時停止フラグ
        this.pnlHistory = []; // 損益履歴
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    // 新規トークン検出時の処理（非同期）
    async onNewToken(token) {
        // 一時停止チェック
        if (this.isPaused) {
            return null;
        }
        // 最大ポジション数チェック（0 = 無制限）
        if (this.config.maxPositions > 0 && this.positions.size >= this.config.maxPositions) {
            return null;
        }
        // 既存ポジションチェック
        if (this.positions.has(token.mint)) {
            return null;
        }
        // ボンディングカーブ初期化
        const curve = new bondingCurve_1.BondingCurveCalculator();
        this.bondingCurves.set(token.mint, curve);
        // 購入実行（遅延込み）
        return this.executeBuy(token);
    }
    // ===== 一時停止機能 =====
    pause() {
        this.isPaused = true;
    }
    resume() {
        this.isPaused = false;
    }
    isTradingPaused() {
        return this.isPaused;
    }
    // ===== 残高計算（評価額含む） =====
    // 総残高（現金 + 保有ポジションの評価額）
    getTotalBalance() {
        const cash = this.currentBalance;
        let positionsValue = 0;
        for (const [mint, position] of this.positions) {
            if (!position.sold) {
                const curve = this.bondingCurves.get(mint);
                if (curve) {
                    const sellResult = curve.simulateSell(position.amount);
                    const tradingFee = sellResult.solAmount * (this.config.tradingFeePercent / 100);
                    const netValue = sellResult.solAmount - tradingFee - this.config.networkFeeSol;
                    positionsValue += Math.max(0, netValue);
                }
            }
        }
        return {
            cash,
            positions: positionsValue,
            total: cash + positionsValue
        };
    }
    // ===== 一括売却機能 =====
    // 全ポジションを一括売却
    async sellAll(reason = 'manual') {
        const soldPositions = [];
        const mints = Array.from(this.positions.keys());
        for (const mint of mints) {
            const sold = await this.executeSell(mint, reason === 'force' ? 'force_sell' : 'manual');
            if (sold) {
                soldPositions.push(sold);
            }
        }
        return soldPositions;
    }
    // 利益が出ているポジションのみ売却
    async sellProfitable() {
        const soldPositions = [];
        const mints = Array.from(this.positions.keys());
        for (const mint of mints) {
            const position = this.positions.get(mint);
            if (position && !position.sold && position.pnlPercent > 0) {
                const sold = await this.executeSell(mint, 'take_profit');
                if (sold) {
                    soldPositions.push(sold);
                }
            }
        }
        return soldPositions;
    }
    // 損失が出ているポジションのみ売却
    async sellLoss() {
        const soldPositions = [];
        const mints = Array.from(this.positions.keys());
        for (const mint of mints) {
            const position = this.positions.get(mint);
            if (position && !position.sold && position.pnlPercent < 0) {
                const sold = await this.executeSell(mint, 'stop_loss');
                if (sold) {
                    soldPositions.push(sold);
                }
            }
        }
        return soldPositions;
    }
    // 遅延シミュレーション（ミリ秒）
    async simulateLatency(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    // 購入実行（手数料・遅延込み）
    async executeBuy(token) {
        const curve = this.bondingCurves.get(token.mint);
        if (!curve)
            return null;
        // 検出遅延をシミュレート
        await this.simulateLatency(this.config.detectionLatencyMs);
        // 総コスト（購入額 + ネットワーク手数料）
        const totalCost = this.config.buyAmount + this.config.networkFeeSol;
        // 残高チェック
        if (this.currentBalance < totalCost) {
            return null;
        }
        // 取引手数料を差し引いた実質購入額
        const effectiveBuyAmount = this.config.buyAmount * (1 - this.config.tradingFeePercent / 100);
        const buyResult = curve.executeBuy(effectiveBuyAmount);
        // 確認遅延をシミュレート
        await this.simulateLatency(this.config.confirmationLatencyMs);
        // 残高から総コストを差し引く
        this.currentBalance -= totalCost;
        const position = {
            id: (0, uuid_1.v4)(),
            tokenMint: token.mint,
            tokenName: token.name,
            tokenSymbol: token.symbol,
            entryPrice: buyResult.price,
            entryMarketCap: buyResult.marketCap,
            amount: buyResult.tokenAmount,
            solAmount: this.config.buyAmount, // 手数料前の額を記録
            buyRank: buyResult.rank,
            totalBuyersAtEntry: buyResult.rank,
            buyTime: Date.now(),
            graduated: false,
            sold: false,
            pnl: -this.config.networkFeeSol, // 初期PnLはガス代のみマイナス
            pnlPercent: -(this.config.networkFeeSol / this.config.buyAmount) * 100,
            currentPrice: buyResult.price,
            currentMarketCap: buyResult.marketCap,
            bondingCurveProgress: buyResult.progress,
            holderCount: buyResult.rank + Math.floor(Math.random() * 50), // 購入者数 + ランダム追加
            priceHistory: [{
                    timestamp: Date.now(),
                    price: buyResult.price,
                    marketCap: buyResult.marketCap,
                    pnlPercent: -(this.config.networkFeeSol / this.config.buyAmount) * 100
                }]
        };
        this.positions.set(token.mint, position);
        return position;
    }
    // 価格更新（リアルタイム・非同期対応）
    async updatePrice(tokenMint, solAmount, isBuy) {
        const position = this.positions.get(tokenMint);
        const curve = this.bondingCurves.get(tokenMint);
        if (!position || !curve || position.sold)
            return null;
        // ボンディングカーブ更新
        if (isBuy) {
            curve.executeBuy(solAmount);
        }
        else {
            // 売却の場合は適当な量を売却
            const sellAmount = position.amount * 0.1; // 10%売却と仮定
            curve.executeSell(sellAmount);
        }
        // 状態更新
        const state = curve.getState();
        position.currentPrice = state.currentPrice;
        position.currentMarketCap = state.marketCap;
        position.bondingCurveProgress = state.progress;
        position.graduated = state.graduated;
        position.totalBuyersAtEntry = state.totalBuyers;
        // ホルダー数を更新（購入者数 + ランダム変動）
        if (isBuy) {
            position.holderCount = state.totalBuyers + Math.floor(Math.random() * 100) + 50;
        }
        if (state.graduated && !position.graduated) {
            position.graduated = true;
            position.graduatedAt = Date.now();
        }
        // 損益計算（手数料考慮済みの推定値）
        this.calculatePnL(position);
        // 価格履歴を追加（最大20ポイント）
        if (position.priceHistory.length >= 20) {
            position.priceHistory.shift();
        }
        position.priceHistory.push({
            timestamp: Date.now(),
            price: position.currentPrice,
            marketCap: position.currentMarketCap,
            pnlPercent: position.pnlPercent
        });
        // 自動売却チェック（強制売却・利確・損切り）
        if (this.config.autoSell) {
            await this.checkAutoSell(position);
        }
        return position;
    }
    // 損益計算（手数料・ガス代考慮）
    calculatePnL(position) {
        // 現在価値（SOL換算）
        const curve = this.bondingCurves.get(position.tokenMint);
        if (!curve)
            return;
        const sellResult = curve.simulateSell(position.amount);
        // 売却時の手数料を差し引いた純価値
        const tradingFee = sellResult.solAmount * (this.config.tradingFeePercent / 100);
        const netCurrentValue = sellResult.solAmount - tradingFee - this.config.networkFeeSol;
        // 純損益 = 売却価値 - 購入額
        position.pnl = netCurrentValue - position.solAmount;
        position.pnlPercent = (position.pnl / position.solAmount) * 100;
        position.currentPrice = sellResult.avgPrice;
    }
    // 自動売却チェック（利確・損切り・強制売却）
    async checkAutoSell(position) {
        // 利確チェック
        if (position.pnlPercent >= this.config.takeProfitPercent) {
            return this.executeSell(position.tokenMint, 'take_profit');
        }
        // 損切りチェック
        if (position.pnlPercent <= -this.config.stopLossPercent) {
            return this.executeSell(position.tokenMint, 'stop_loss');
        }
        // 強制売却チェック（1時間経過）
        const holdingTimeMinutes = (Date.now() - position.buyTime) / 1000 / 60;
        if (holdingTimeMinutes >= this.config.forceSellAfterMinutes) {
            return this.executeSell(position.tokenMint, 'force_sell');
        }
        return null;
    }
    // 全ポジションの強制売却チェック（一括処理用）
    async checkAllForceSell() {
        const forceSoldPositions = [];
        const now = Date.now();
        for (const [mint, position] of this.positions) {
            if (position.sold)
                continue;
            const holdingTimeMinutes = (now - position.buyTime) / 1000 / 60;
            if (holdingTimeMinutes >= this.config.forceSellAfterMinutes) {
                const soldPosition = await this.executeSell(mint, 'force_sell');
                if (soldPosition) {
                    forceSoldPositions.push(soldPosition);
                }
            }
        }
        return forceSoldPositions;
    }
    // 売却実行（手数料・遅延込み）
    async executeSell(tokenMint, reason = 'manual') {
        const position = this.positions.get(tokenMint);
        const curve = this.bondingCurves.get(tokenMint);
        if (!position || !curve || position.sold)
            return null;
        // 売却遅延をシミュレート（購入より短め）
        await this.simulateLatency(this.config.confirmationLatencyMs * 0.8);
        const sellResult = curve.executeSell(position.amount);
        // 売却手数料を差し引く（1.25% + ガス代）
        const tradingFee = sellResult.solAmount * (this.config.tradingFeePercent / 100);
        const netSolAmount = sellResult.solAmount - tradingFee - this.config.networkFeeSol;
        position.sold = true;
        position.soldAt = Date.now();
        position.soldPrice = sellResult.avgPrice;
        // 純損益 = 売却額 - 手数料 - 購入額
        position.pnl = netSolAmount - position.solAmount;
        position.pnlPercent = (position.pnl / position.solAmount) * 100;
        position.currentPrice = sellResult.avgPrice;
        position.currentMarketCap = sellResult.marketCap;
        // 残高更新（純売却額を加算）
        this.currentBalance += netSolAmount;
        // 損益履歴を記録
        this.recordPnlHistory();
        // 履歴に追加
        this.tradeHistory.push({ ...position });
        // アクティブポジションから削除
        this.positions.delete(tokenMint);
        this.bondingCurves.delete(tokenMint);
        return position;
    }
    // ===== 損益履歴機能 =====
    // 損益を記録
    recordPnlHistory() {
        const stats = this.getStats();
        const balance = this.getTotalBalance();
        this.pnlHistory.push({
            timestamp: Date.now(),
            totalPnl: stats.totalPnl,
            balance: balance.cash,
            totalValue: balance.total
        });
        // 最大1000件に制限
        if (this.pnlHistory.length > 1000) {
            this.pnlHistory.shift();
        }
    }
    // 損益履歴を取得
    getPnlHistory() {
        // 新しいデータが必要な場合は記録
        if (this.pnlHistory.length === 0 || Date.now() - this.pnlHistory[this.pnlHistory.length - 1].timestamp > 5000) {
            this.recordPnlHistory();
        }
        return this.pnlHistory;
    }
    // 損益履歴をクリア
    clearPnlHistory() {
        this.pnlHistory = [];
    }
    // 全ポジション取得
    getAllPositions() {
        return Array.from(this.positions.values());
    }
    // 特定ポジション取得
    getPosition(tokenMint) {
        const position = this.positions.get(tokenMint);
        if (position) {
            // 最新価格で更新
            this.calculatePnL(position);
        }
        return position;
    }
    // 取引履歴取得
    getTradeHistory() {
        return this.tradeHistory;
    }
    // パフォーマンス統計
    getStats() {
        const positions = this.getAllPositions();
        const history = this.tradeHistory;
        const allTrades = [...history, ...positions];
        const winCount = history.filter(t => t.pnl > 0).length;
        const lossCount = history.filter(t => t.pnl < 0).length;
        const totalPnl = history.reduce((sum, t) => sum + t.pnl, 0) +
            positions.reduce((sum, t) => sum + t.pnl, 0);
        const invested = history.reduce((sum, t) => sum + t.solAmount, 0) +
            positions.reduce((sum, t) => sum + t.solAmount, 0);
        const totalPnlPercent = invested > 0 ? (totalPnl / invested) * 100 : 0;
        // 平均保有時間
        const holdingTimes = history
            .filter(t => t.soldAt && t.buyTime)
            .map(t => (t.soldAt - t.buyTime) / 1000 / 60); // 分単位
        const avgHoldingTime = holdingTimes.length > 0
            ? holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length
            : 0;
        // 最高・最低取引
        const sortedByPnl = [...history].sort((a, b) => b.pnl - a.pnl);
        const graduatedCount = history.filter(t => t.graduated).length +
            positions.filter(t => t.graduated).length;
        return {
            totalTrades: allTrades.length,
            winCount,
            lossCount,
            totalPnl,
            totalPnlPercent,
            avgHoldingTime,
            bestTrade: sortedByPnl[0] || null,
            worstTrade: sortedByPnl[sortedByPnl.length - 1] || null,
            currentPositions: positions.length,
            graduatedTokens: graduatedCount
        };
    }
    // 残高取得
    getBalance() {
        return this.currentBalance;
    }
    // 設定更新
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
    getConfig() {
        return { ...this.config };
    }
    // リセット
    reset() {
        this.positions.clear();
        this.bondingCurves.clear();
        this.tradeHistory = [];
        this.currentBalance = 100;
        this.pnlHistory = [];
        this.isPaused = false;
    }
}
exports.TradeManager = TradeManager;
//# sourceMappingURL=tradeManager.js.map