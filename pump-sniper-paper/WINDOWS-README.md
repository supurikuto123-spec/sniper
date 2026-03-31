# Windows 用 簡単セットアップガイド

## ⚡ 超簡単版（1つのPowerShellで完結）

### 初回セットアップ（1回だけ）

```powershell
cd C:\Users\PC_User\Downloads\pump-sniper-paper
npm install
```

### 毎回の起動（これだけ！）

```powershell
cd C:\Users\PC_User\Downloads\pump-sniper-paper
npm run dev
```

これだけで **バックエンドとフロントエンドが同時に起動**します！

---

## 🖥️ 表示される画面

```
[BACKEND] 🚀 Pump.fun Simulator Started
[FRONTEND] Starting the development server...

[BACKEND] Backend Server: http://localhost:3001
[FRONTEND] Local: http://localhost:3000
```

その後、自動的にブラウザが開きます（開かない場合は手動で http://localhost:3000 を開いてください）。

---

## ❓ トラブルシューティング

### "concurrently : 用語 'concurrently' は...認識されません"
→ `npm install` がまだ完了していないか失敗しています。もう一度実行：
```powershell
npm install
```

### バックエンドは起動するがフロントエンドが起動しない
→ 別のPowerShellを開かずに、同じウィンドウでCtrl+Cを押して停止し、もう一度：
```powershell
npm run dev
```

### "Cannot find module"
→ backend と frontend の依存関係がインストールされていない：
```powershell
cd backend && npm install
cd ../frontend && npm install
cd ..
npm run dev
```

---

## 🛑 停止方法

PowerShellウィンドウで **Ctrl + C** を押すだけ。両方同時に停止します。
