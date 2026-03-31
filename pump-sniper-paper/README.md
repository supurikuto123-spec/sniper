# 🚀 Pump.fun Paper Trading Sniper Bot

Pump.funの仕組み（ボンディングカーブ）を学習・研究するための**ペーパートレード（模擬取引）**システムです。
実際の資金を使わずに、Pump.funでのスナイピング戦略をテストできます。

## ✨ 主な機能

### 📊 リアルタイムダッシュボード
- **Webブラウザ**で直感的に確認
- CMDを使わずに、**視覚的に**進捗を追跡
- 自動更新（WebSocket使用）

### 🎯 トレード追跡
- **何を**買ったか（トークン名・シンボル）
- **いくらで**買ったか（エントリー価格・使用SOL量）
- **今いくら**なのか（現在価格・時価総額・リアルタイム更新）
- **損益**（PnL）の可視化
- **何番目**に買ったか（ランキング表示）

### 📈 統計・分析
- 総損益（PnL）
- 勝率・敗率
- 最良/最悪トレード
- 卒業（Graduation）したトークン数
- 残高推移

## 🎮 使い方

### 1. 起動方法

```bash
# 方法1: 簡易起動（推奨）
./start.sh

# 方法2: 手動で個別起動
# ターミナル1（バックエンド）
cd backend
npm install
npm run dev

# ターミナル2（フロントエンド）
cd frontend
npm install
npm start
```

### 2. ダッシュボードへアクセス

起動後、ブラウザで以下のURLにアクセス：

```
http://localhost:3000
```

### 3. ペーパートレード開始

1. バックエンドが自動的に新規トークンを検出（シミュレーション）
2. 設定した条件に合うと自動的に「購入」
3. ダッシュボードにリアルタイムで表示
4. 手動で売却も可能（Sellボタン）

## 🔧 設定

`backend/src/tradeManager.ts` で設定可能：

```typescript
const DEFAULT_CONFIG = {
  maxPositions: 10,        // 同時保有最大数
  buyAmount: 0.1,          // 1回の購入SOL量
  takeProfitPercent: 100,  // 利確ライン（%）
  stopLossPercent: 50,       // 損切りライン（%）
  autoSell: false,          // 自動売却
  minLiquidity: 0,
  maxSlippage: 30
};
```

## 📁 プロジェクト構造

```
pump-sniper-paper/
├── backend/                    # Node.js + TypeScript
│   ├── src/
│   │   ├── index.ts           # メインサーバー
│   │   ├── bondingCurve.ts    # ボンディングカーブ計算
│   │   ├── tradeManager.ts    # 取引管理
│   │   ├── pumpSimulator.ts   # Pump.funシミュレーター
│   │   └── types.ts           # 型定義
│   ├── package.json
│   └── tsconfig.json
├── frontend/                   # React + TypeScript
│   ├── src/
│   │   ├── App.tsx            # メインダッシュボード
│   │   └── index.tsx          # エントリーポイント
│   ├── public/
│   │   └── index.html
│   └── package.json
├── start.sh                    # 簡易起動スクリプト
└── README.md                   # このファイル
```

## 🧪 技術仕様

### ボンディングカーブ計算
Pump.funと同じ**定積公式**を採用：
```
x * y = k
(x = 仮想SOLリザーブ, y = 仮想トークンリザーブ)
```

- 初期仮想SOL: 30 SOL
- 初期仮想トークン: 1,073,000,000,000,000 (最小単位)
- 卒業閾値: 85 SOL
- トークン総供給: 1,000,000,000

### シミュレーション機能
- ランダムな新規トークン生成（平均5秒ごと）
- ボンディングカーブ進行のシミュレーション
- 卒業（Graduation）イベント
- 価格変動のリアルタイム更新

## 🎨 ダッシュボード画面

### 表示項目
1. **Portfolio Overview**
   - 現在残高
   - 総損益（SOL・%）
   - アクティブポジション数

2. **Performance Stats**
   - 勝ち数・負け数
   - 勝率
   - 卒業トークン数

3. **Active Positions テーブル**
   | 項目 | 内容 |
   |------|------|
   | Token | トークン名・シンボル |
   | Buy Rank | 🥇1st, 🥈2nd...何番目に購入 |
   | Entry | 使用SOL・購入日時 |
   | Current | 現在時価総額・価格 |
   | Progress | ボンディングカーブ進捗バー |
   | PnL | 損益（SOL・%）|
   | Action | Sellボタン |

4. **Best/Worst Trade**
   - 最良・最悪の取引を表示

5. **Live Activity Log**
   - リアルタイムログ
   - 新規検出・購入・卒業・売却イベント

## ⚠️ 注意事項

- **これはペーパートレード（模擬取引）です**
- 実際の資金は使用しません
- 実際のPump.fun APIとは接続していません
- 学習・研究目的での使用を想定しています
- シミュレーション結果は実際の市場と異なる場合があります

## 🔧 開発者向け情報

### APIエンドポイント

```
GET  /api/positions      # 現在のポジション一覧
GET  /api/history        # 取引履歴
GET  /api/stats          # 統計情報
GET  /api/config         # 設定取得
POST /api/config         # 設定更新
POST /api/sell/:mint     # 手動売却
POST /api/reset          # リセット
```

### WebSocketイベント

```
connect/disconnect      # 接続状態
init                    # 初期データ
new_position            # 新規ポジション
positions_update        # ポジション更新
position_update         # 個別ポジション更新
position_closed         # ポジション売却
token_created           # 新規トークン
token_graduated         # トークン卒業
stats_update            # 統計更新
```

## 📜 ライセンス

MIT License - 学習・研究目的での使用を想定

## 🙏 謝辞

- Pump.funの技術的文書を参考にしました
- Solanaエコシステムの知見に基づいています
- ボンディングカーブの数学的モデルはUniswap V2方式を採用

---

**Enjoy paper trading! 🚀📊**
