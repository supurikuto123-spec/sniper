@echo off
chcp 65001
cls
echo 🚀 Pump.fun Paper Sniper Bot Launcher (Windows)
echo ================================================
echo.

echo 📦 Step 1/2: Starting Backend...
echo    Backend will run on http://localhost:3001
start "Backend Server" cmd /k "cd backend && npm install && npm run dev"

echo ⏳ Waiting 5 seconds...
timeout /t 5 /nobreak > nul

echo.
echo 🎨 Step 2/2: Starting Frontend...
echo    Dashboard will be available at http://localhost:3000
start "Frontend Dashboard" cmd /k "cd frontend && npm install && npm start"

echo.
echo ================================================
echo ✅ All services started!
echo.
echo 📊 Dashboard: http://localhost:3000
echo 🔌 API:      http://localhost:3001
echo.
echo ⚠️  2つの黒い窓（ターミナル）が開きます
echo    閉じるときは両方の窓を閉じてください
echo ================================================
pause
