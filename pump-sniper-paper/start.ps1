# Pump.fun Paper Trading Sniper Bot - Windows起動スクリプト
# PowerShellで実行: .\start.ps1

Write-Host "🚀 Pump.fun Paper Sniper Bot Launcher (Windows)" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green

# バックエンド起動
Write-Host "📦 Step 1/2: Starting Backend..." -ForegroundColor Blue
Start-Job -ScriptBlock {
    Set-Location $using:PWD\backend
    npm install
    npm run dev
} | Out-Null

Write-Host "   Backend starting on http://localhost:3001" -ForegroundColor Yellow

# 5秒待機
Write-Host "⏳ Waiting 5 seconds..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# フロントエンド起動
Write-Host "🎨 Step 2/2: Starting Frontend..." -ForegroundColor Blue
Start-Job -ScriptBlock {
    Set-Location $using:PWD\frontend
    npm install
    npm start
} | Out-Null

Write-Host "   Frontend starting on http://localhost:3000" -ForegroundColor Yellow

Write-Host "" -ForegroundColor Green
Write-Host "✅ All services started!" -ForegroundColor Green
Write-Host "" -ForegroundColor White
Write-Host "📊 Dashboard: http://localhost:3000" -ForegroundColor Cyan
Write-Host "🔌 API:      http://localhost:3001" -ForegroundColor Cyan
Write-Host "" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Green

# プロセスの監視
while ($true) {
    Start-Sleep -Seconds 1
}
