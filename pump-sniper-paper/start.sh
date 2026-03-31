#!/bin/bash

# Pump.fun Paper Trading Sniper Bot - 起動スクリプト
# Usage: ./start.sh

echo "🚀 Pump.fun Paper Sniper Bot Launcher"
echo "======================================"

# 色の定義
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# バックエンド起動関数
start_backend() {
    echo -e "${BLUE}📦 Installing backend dependencies...${NC}"
    cd backend
    npm install
    
    echo -e "${GREEN}🚀 Starting backend server...${NC}"
    echo -e "${YELLOW}   Backend will run on http://localhost:3001${NC}"
    npm run dev &
    BACKEND_PID=$!
    cd ..
}

# フロントエンド起動関数
start_frontend() {
    echo -e "${BLUE}📦 Installing frontend dependencies...${NC}"
    cd frontend
    npm install
    
    echo -e "${GREEN}🎨 Starting frontend dashboard...${NC}"
    echo -e "${YELLOW}   Dashboard will be available at http://localhost:3000${NC}"
    npm start &
    FRONTEND_PID=$!
    cd ..
}

# クリーンアップ関数
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Shutting down...${NC}"
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
    fi
    echo -e "${GREEN}✅ Stopped${NC}"
    exit 0
}

# Ctrl+Cで停止
trap cleanup INT TERM

# メイン
echo ""
echo "Step 1/2: Starting Backend..."
start_backend

# バックエンドの起動を待つ
sleep 5

echo ""
echo "Step 2/2: Starting Frontend..."
start_frontend

echo ""
echo "======================================"
echo -e "${GREEN}✅ All services started!${NC}"
echo ""
echo "📊 Dashboard: http://localhost:3000"
echo "🔌 API:      http://localhost:3001"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo "======================================"

# プロセスの終了を待つ
wait
