import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { format } from 'date-fns';
import styled, { createGlobalStyle, keyframes } from 'styled-components';

// ===== Helper Functions =====
const formatTime = (timestamp) => format(timestamp, 'HH:mm:ss');
const formatDate = (timestamp) => format(timestamp, 'MM/dd HH:mm');

const formatNumber = (num, decimals = 4) => {
  if (Math.abs(num) < 0.0001) return num.toExponential(2);
  return num.toFixed(decimals);
};

const formatPercent = (num) => {
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
};

const formatSOL = (num) => `${num.toFixed(4)} SOL`;

const formatMarketCap = (num) => {
  if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
};

const formatRank = (rank) => {
  if (rank === 1) return '🥇 1st';
  if (rank === 2) return '🥈 2nd';
  if (rank === 3) return '🥉 3rd';
  if (rank <= 10) return `🔥 ${rank}th`;
  if (rank <= 50) return `⚡ ${rank}th`;
  return `${rank}th`;
};

const truncateAddress = (address) => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const getPumpFunUrl = (mint) => `https://pump.fun/coin/${mint}`;

// ===== Global Styles =====
const GlobalStyle = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #16213e 100%);
    min-height: 100vh;
    color: #fff;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  }
`;

// ===== Animations =====
const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

const slideIn = keyframes`
  from { transform: translateX(-100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
`;

const pulseRed = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.7); }
  50% { box-shadow: 0 0 0 10px rgba(255, 71, 87, 0); }
`;

const pulseGreen = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(0, 255, 136, 0.7); }
  50% { box-shadow: 0 0 0 10px rgba(0, 255, 136, 0); }
`;

// ===== Styled Components =====
const Dashboard = styled.div`
  max-width: 1600px;
  margin: 0 auto;
  padding: 20px;
`;

const Header = styled.header`
  text-align: center;
  margin-bottom: 30px;
  padding: 20px;
  background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%);
  border-radius: 15px;
  border: 1px solid rgba(255,255,255,0.1);
`;

const Title = styled.h1`
  font-size: 2.5rem;
  background: linear-gradient(135deg, #00ff88, #00d4ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 10px;
`;

const Subtitle = styled.p`
  color: #888;
  font-size: 1.1rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
  
  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }
`;

const Card = styled.div`
  background: rgba(255,255,255,0.05);
  border-radius: 15px;
  padding: 20px;
  border: 1px solid rgba(255,255,255,0.1);
  backdrop-filter: blur(10px);
`;

const CardTitle = styled.h2`
  font-size: 1.3rem;
  margin-bottom: 15px;
  display: flex;
  align-items: center;
  gap: 10px;
  
  span {
    font-size: 1.5rem;
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
`;

const StatBox = styled.div`
  background: ${props => 
    props.$positive ? 'rgba(0, 255, 136, 0.15)' : 
    props.$negative ? 'rgba(255, 71, 87, 0.15)' : 
    props.$highlight ? 'rgba(0, 212, 255, 0.15)' : 
    'rgba(255,255,255,0.05)'
  };
  border-radius: 10px;
  padding: 15px;
  border: 1px solid ${props => 
    props.$positive ? 'rgba(0, 255, 136, 0.3)' : 
    props.$negative ? 'rgba(255, 71, 87, 0.3)' : 
    props.$highlight ? 'rgba(0, 212, 255, 0.3)' : 
    'rgba(255,255,255,0.1)'
  };
  text-align: center;
  transition: transform 0.2s;
  
  &:hover {
    transform: translateY(-2px);
  }
`;

const StatLabel = styled.div`
  font-size: 0.85rem;
  color: #888;
  margin-bottom: 5px;
`;

const StatValue = styled.div`
  font-size: 1.4rem;
  font-weight: bold;
  color: ${props => props.$color || '#fff'};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
`;

const Th = styled.th`
  text-align: left;
  padding: 12px;
  border-bottom: 2px solid rgba(255,255,255,0.2);
  color: #888;
  font-weight: 600;
`;

const Td = styled.td`
  padding: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  color: ${props => 
    props.$positive ? '#00ff88' : 
    props.$negative ? '#ff4757' : 
    '#fff'
  };
`;

const Tr = styled.tr`
  background: ${props => 
    props.$graduated ? 'rgba(255, 215, 0, 0.1)' : 
    'transparent'
  };
  transition: background 0.2s;
  
  &:hover {
    background: rgba(255,255,255,0.1);
  }
`;

const Badge = styled.span`
  display: inline-block;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: bold;
  background: linear-gradient(135deg, #ff6b6b, #ff8e53);
  color: white;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: rgba(255,255,255,0.1);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 5px;
  
  &::after {
    content: '';
    display: block;
    width: ${props => Math.min(props.$progress, 100)}%;
    height: 100%;
    background: linear-gradient(90deg, #00ff88, #00d4ff);
    border-radius: 4px;
    transition: width 0.3s;
  }
`;

const LogContainer = styled.div`
  max-height: 400px;
  overflow-y: auto;
  background: rgba(0,0,0,0.3);
  border-radius: 10px;
  padding: 10px;
  scroll-behavior: smooth;
`;

const LogItem = styled.div`
  padding: 10px;
  margin-bottom: 8px;
  border-radius: 8px;
  font-size: 0.9rem;
  border-left: 4px solid ${props => {
    switch(props.$type) {
      case 'success': return '#00ff88';
      case 'error': return '#ff4757';
      case 'warning': return '#ffa502';
      case 'trade': return '#00d4ff';
      case 'graduation': return '#ffd700';
      default: return '#74b9ff';
    }
  }};
  background: rgba(255,255,255,0.03);
  animation: ${slideIn} 0.2s ease;
`;

const LogTime = styled.span`
  color: #888;
  font-size: 0.8rem;
  margin-right: 10px;
`;

const StatusIndicator = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  background: ${props => props.$connected ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 71, 87, 0.2)'};
  color: ${props => props.$connected ? '#00ff88' : '#ff4757'};
  font-size: 0.9rem;
  margin-top: 15px;
  
  &::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    animation: ${pulse} 1.5s infinite;
  }
`;

const Button = styled.button`
  background: linear-gradient(135deg, #00ff88, #00d4ff);
  border: none;
  color: #000;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  margin-right: 10px;
  margin-bottom: 5px;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 20px rgba(0, 255, 136, 0.4);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const ButtonRed = styled(Button)`
  background: linear-gradient(135deg, #ff4757, #ff6b6b);
  color: #fff;
  box-shadow: 0 5px 20px rgba(255, 71, 87, 0.4);
`;

const ButtonGreen = styled(Button)`
  background: linear-gradient(135deg, #00ff88, #00d4ff);
  color: #000;
`;

const ButtonYellow = styled(Button)`
  background: linear-gradient(135deg, #ffa502, #ffc107);
  color: #000;
`;

const PauseButton = styled(Button)`
  background: ${props => props.$paused 
    ? 'linear-gradient(135deg, #00ff88, #00d4ff)' 
    : 'linear-gradient(135deg, #ffa502, #ff6348)'
  };
  color: ${props => props.$paused ? '#000' : '#fff'};
  animation: ${props => props.$paused ? 'none' : pulseRed} 2s infinite;
`;

const FullWidthCard = styled(Card)`
  grid-column: 1 / -1;
`;

const ButtonGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
`;

const ChartContainer = styled.div`
  width: 100%;
  height: 300px;
  background: rgba(0,0,0,0.2);
  border-radius: 10px;
  padding: 15px;
  position: relative;
`;

const AddressLink = styled.a`
  color: #00d4ff;
  text-decoration: none;
  font-family: monospace;
  font-size: 0.85rem;
  
  &:hover {
    text-decoration: underline;
    color: #00ff88;
  }
`;

const ExternalLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #ffd700;
  text-decoration: none;
  font-size: 0.8rem;
  margin-top: 5px;
  
  &:hover {
    text-decoration: underline;
  }
`;

const TokenInfo = styled.div`
  display: flex;
  flex-direction: column;
`;

const TokenName = styled.strong`
  font-size: 1rem;
`;

const TokenSymbol = styled.span`
  color: #888;
  font-size: 0.85rem;
`;

// ===== Mini Price Chart Component =====
const MiniPriceChart = ({ data, isPositive }) => {
  if (!data || data.length < 2) {
    return (
      <div style={{ 
        width: '100%', 
        height: '30px', 
        background: 'rgba(255,255,255,0.05)', 
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#666',
        fontSize: '0.7rem'
      }}>
        データ収集中...
      </div>
    );
  }

  const width = 120;
  const height = 30;
  const padding = 2;

  const prices = data.map(d => d.price || d);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 0.0001;

  const points = data.map((d, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * (width - 2 * padding);
    const price = d.price || d;
    const y = height - padding - ((price - minPrice) / priceRange) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(' ');

  const strokeColor = isPositive ? '#00ff88' : '#ff4757';

  return (
    <svg width="100%" height="30" viewBox={`0 0 ${width} ${height}`} style={{ borderRadius: '4px' }}>
      {/* Area under curve */}
      <polygon 
        fill={isPositive ? "rgba(0,255,136,0.2)" : "rgba(255,71,87,0.2)"} 
        stroke="none" 
        points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`} 
      />
      {/* Price line */}
      <polyline 
        fill="none" 
        stroke={strokeColor} 
        strokeWidth="1.5" 
        points={points}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// ===== SVG Chart Component (PnL Only) =====
const PnLChart = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div style={{color: '#666', textAlign: 'center', paddingTop: '120px'}}>
        <div style={{fontSize: '3rem', marginBottom: '15px'}}>📊</div>
        <div>損益データを収集中...</div>
        <div style={{fontSize: '0.85rem', marginTop: '10px', color: '#888'}}>
          トレードが行われるとチャートが表示されます
        </div>
      </div>
    );
  }
  
  const width = 1000;
  const height = 270;
  const padding = 50;
  
  // PnL のみ表示（損益のみ）
  const minPnl = Math.min(...data.map(d => d.totalPnl), -5);
  const maxPnl = Math.max(...data.map(d => d.totalPnl), 5);
  const pnlRange = maxPnl - minPnl || 10;
  
  // Generate points for PnL line
  const pnlPoints = data.map((d, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * (width - 2 * padding);
    const y = height - padding - ((d.totalPnl - minPnl) / pnlRange) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(' ');
  
  const currentPnl = data[data.length - 1]?.totalPnl || 0;
  const isPnlPositive = currentPnl >= 0;
  
  // Format time labels
  const timeLabels = data.length > 1 ? [
    formatTime(data[0].timestamp),
    formatTime(data[Math.floor(data.length / 2)].timestamp),
    formatTime(data[data.length - 1].timestamp)
  ] : ['開始', '', '現在'];
  
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{width: '100%', height: '100%'}}>
      {/* Background grid */}
      {[0, 0.25, 0.5, 0.75, 1].map(i => (
        <g key={i}>
          <line 
            x1={padding} 
            y1={padding + i * (height - 2 * padding)} 
            x2={width - padding} 
            y2={padding + i * (height - 2 * padding)} 
            stroke="rgba(255,255,255,0.08)" 
            strokeDasharray="5,5" 
          />
        </g>
      ))}
      
      {/* Vertical grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(i => (
        <line 
          key={`v${i}`}
          x1={padding + i * (width - 2 * padding)} 
          y1={padding} 
          x2={padding + i * (width - 2 * padding)} 
          y2={height - padding} 
          stroke="rgba(255,255,255,0.05)" 
          strokeDasharray="3,3" 
        />
      ))}
      
      {/* Zero line for PnL */}
      {minPnl < 0 && maxPnl > 0 && (
        <line
          x1={padding}
          y1={height - padding - ((0 - minPnl) / pnlRange) * (height - 2 * padding)}
          x2={width - padding}
          y2={height - padding - ((0 - minPnl) / pnlRange) * (height - 2 * padding)}
          stroke="rgba(255,255,255,0.5)"
          strokeDasharray="10,5"
          strokeWidth="2"
        />
      )}
      
      {/* Area under PnL curve */}
      {data.length > 1 && (
        <polygon 
          fill={isPnlPositive ? "rgba(0,212,255,0.1)" : "rgba(255,165,2,0.1)"} 
          stroke="none" 
          points={`${padding},${height - padding - ((0 - minPnl) / pnlRange) * (height - 2 * padding)} ${pnlPoints} ${width - padding},${height - padding - ((0 - minPnl) / pnlRange) * (height - 2 * padding)}`} 
        />
      )}
      
      {/* PnL Line (Main) */}
      <polyline 
        fill="none" 
        stroke={isPnlPositive ? "#00d4ff" : "#ffa502"} 
        strokeWidth="3" 
        points={pnlPoints}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Data points for PnL */}
      {data.map((d, i) => {
        const x = padding + (i / Math.max(data.length - 1, 1)) * (width - 2 * padding);
        const y = height - padding - ((d.totalPnl - minPnl) / pnlRange) * (height - 2 * padding);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="5" fill="#fff" stroke={isPnlPositive ? "#00d4ff" : "#ffa502"} strokeWidth="2" />
            {/* Show PnL value on key points */}
            {(i === data.length - 1 || i % Math.ceil(data.length / 8) === 0) && (
              <text x={x} y={y - 12} fill="#fff" fontSize="10" textAnchor="middle" opacity="0.9">
                {d.totalPnl >= 0 ? '+' : ''}{d.totalPnl.toFixed(2)}
              </text>
            )}
          </g>
        );
      })}
      
      {/* Axis labels */}
      <text x={padding} y={height - 15} fill="#888" fontSize="12" textAnchor="middle">{timeLabels[0]}</text>
      <text x={(width) / 2} y={height - 15} fill="#888" fontSize="12" textAnchor="middle">{timeLabels[1]}</text>
      <text x={width - padding} y={height - 15} fill="#888" fontSize="12" textAnchor="middle">{timeLabels[2]}</text>
      
      {/* Y-axis labels for PnL */}
      <text x={padding - 10} y={padding} fill="#00d4ff" fontSize="11" textAnchor="end" opacity="0.8">
        +{maxPnl.toFixed(2)} SOL
      </text>
      <text x={padding - 10} y={height - padding} fill="#ffa502" fontSize="11" textAnchor="end" opacity="0.8">
        {minPnl.toFixed(2)} SOL
      </text>
      
      {/* Legend (PnL Only) */}
      <g transform={`translate(${width - 200}, 25)`}>
        <rect x="0" y="0" width="180" height="35" rx="8" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.1)" />
        
        {/* PnL legend */}
        <line x1="15" y1="18" x2="45" y2="18" stroke={isPnlPositive ? "#00d4ff" : "#ffa502"} strokeWidth="3" />
        <text x="55" y="22" fill="#fff" fontSize="12">損益 ({currentPnl >= 0 ? '+' : ''}{currentPnl.toFixed(2)} SOL)</text>
      </g>
      
      {/* Title */}
      <text x={20} y={30} fill="#fff" fontSize="16" fontWeight="bold">📈 損益推移</text>
    </svg>
  );
};

// ===== Main Component =====
const App = () => {
  const [connected, setConnected] = useState(false);
  const [positions, setPositions] = useState([]);
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [paused, setPaused] = useState(false);
  const [pnlHistory, setPnlHistory] = useState([]);
  const logsEndRef = useRef(null);
  const logContainerRef = useRef(null);
  // 自動スクロールを無効化
  const shouldAutoScroll = false;

  // Fetch PnL History periodically
  useEffect(() => {
    const fetchPnlHistory = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/pnl-history');
        const data = await res.json();
        if (data.success) {
          setPnlHistory(data.data);
        }
      } catch (e) {
        // Silent fail
      }
    };
    
    fetchPnlHistory();
    const interval = setInterval(fetchPnlHistory, 5000);
    return () => clearInterval(interval);
  }, []);

  const addLog = useCallback((type, message, details) => {
    const newLog = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      type,
      message,
      details
    };
    setLogs(prev => [...prev.slice(-99), newLog]);
  }, []);

  // Socket connection
  useEffect(() => {
    const newSocket = io('http://localhost:3001');

    newSocket.on('connect', () => {
      setConnected(true);
      addLog('info', '🔗 Connected to server');
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      addLog('error', '❌ Disconnected from server');
    });

    newSocket.on('init', (data) => {
      setPositions(data.positions || []);
      setStats({ ...data.stats, balance: data.balance, initialBalance: 100 });
      setPaused(data.paused || false);
      addLog('info', '📊 Initial data loaded');
    });

    newSocket.on('new_position', (position) => {
      setPositions(prev => [position, ...prev]);
      addLog('trade', `🎯 SNIPED: ${position.tokenName} at ${formatRank(position.buyRank)}!`, position);
    });

    newSocket.on('positions_update', (updatedPositions) => {
      setPositions(updatedPositions);
    });

    newSocket.on('position_update', (position) => {
      setPositions(prev => prev.map(p => p.id === position.id ? position : p));
    });

    newSocket.on('position_closed', (position) => {
      setPositions(prev => prev.filter(p => p.id !== position.id));
      const pnl = position.pnl;
      const type = pnl >= 0 ? 'success' : 'error';
      const emoji = pnl >= 0 ? '💰' : '💸';
      addLog(type, `${emoji} SOLD: ${position.tokenSymbol} | PnL: ${formatSOL(pnl)} (${formatPercent(position.pnlPercent)})`, position);
    });

    newSocket.on('token_created', (data) => {
      if (data.position) {
        addLog('success', data.message);
      }
    });

    newSocket.on('token_graduated', (data) => {
      setPositions(prev => prev.map(p => 
        p.tokenMint === data.mint ? { ...p, graduated: true, graduatedAt: Date.now() } : p
      ));
      addLog('graduation', `🎓 GRADUATED: ${data.tokenName}!`, data);
    });

    newSocket.on('stats_update', (updatedStats) => {
      setStats(updatedStats);
    });

    newSocket.on('status_update', (status) => {
      setPaused(status.paused);
      addLog(status.paused ? 'warning' : 'success', status.paused ? '⏸️ Trading paused' : '▶️ Trading resumed');
    });

    newSocket.on('mass_sold', (data) => {
      addLog(data.reason === 'profitable' ? 'success' : data.reason === 'loss' ? 'error' : 'trade', 
        `📦 Mass sold: ${data.count} positions (PnL: ${formatSOL(data.totalPnl)})`);
    });

    return () => {
      newSocket.close();
    };
  }, [addLog]);

  const handleReset = () => {
    fetch('http://localhost:3001/api/reset', { method: 'POST' })
      .then(() => {
        setPositions([]);
        addLog('info', '🔄 Paper trading reset');
      });
  };

  const handleSell = (mint, symbol) => {
    fetch(`http://localhost:3001/api/sell/${mint}`, { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          addLog('success', `✅ Manual sell: ${symbol}`);
        }
      });
  };

  const handlePauseToggle = () => {
    fetch('http://localhost:3001/api/pause', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(res => res.json())
      .then(data => {
        setPaused(data.data.paused);
      });
  };

  const handleSellAll = () => {
    if (!window.confirm('全てのポジションを売却しますか？')) return;
    fetch('http://localhost:3001/api/sell-all', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          addLog('trade', `📦 Sold all: ${data.data.soldCount} positions`);
        }
      });
  };

  const handleSellProfitable = () => {
    fetch('http://localhost:3001/api/sell-profitable', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          addLog('success', `💰 Sold profitable: ${data.data.soldCount} positions (+${formatSOL(data.data.totalPnl)})`);
        }
      });
  };

  const handleSellLoss = () => {
    fetch('http://localhost:3001/api/sell-loss', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          addLog('error', `📉 Sold losing: ${data.data.soldCount} positions (${formatSOL(data.data.totalPnl)})`);
        }
      });
  };

  return (
    <>
      <GlobalStyle />
      <Dashboard>
        <Header>
          <Title>🚀 Pump.fun Paper Sniper Bot</Title>
          <Subtitle>リアルタイムペーパートレードダッシュボード</Subtitle>
          <StatusIndicator $connected={connected}>
            {connected ? '🟢 Connected' : '🔴 Disconnected'}
          </StatusIndicator>
          {paused && <Badge style={{marginLeft: '15px', background: '#ffa502'}}>⏸️ PAUSED</Badge>}
        </Header>

        {/* Control Panel */}
        <FullWidthCard>
          <CardTitle><span>🎮</span> コントロールパネル</CardTitle>
          <ButtonGroup>
            <PauseButton $paused={paused} onClick={handlePauseToggle}>
              {paused ? '▶️ 再開' : '⏸️ 一時停止'}
            </PauseButton>
            <ButtonGreen onClick={handleSellProfitable} disabled={positions.length === 0}>
              💰 利益のみ売却
            </ButtonGreen>
            <ButtonYellow onClick={handleSellLoss} disabled={positions.length === 0}>
              📉 損失のみ売却
            </ButtonYellow>
            <ButtonRed onClick={handleSellAll} disabled={positions.length === 0}>
              🚨 全て売却
            </ButtonRed>
            <Button onClick={handleReset}>🔄 リセット</Button>
          </ButtonGroup>
        </FullWidthCard>

        {/* Stats */}
        {stats && (
          <Grid>
            <Card>
              <CardTitle><span>💰</span> 残高概要</CardTitle>
              <StatsGrid>
                <StatBox $highlight>
                  <StatLabel>現金残高</StatLabel>
                  <StatValue $color="#00d4ff">{formatSOL(stats.balance)}</StatValue>
                </StatBox>
                <StatBox $highlight>
                  <StatLabel>評価額</StatLabel>
                  <StatValue $color="#ffd700">{formatSOL(stats.totalBalance?.positions || 0)}</StatValue>
                </StatBox>
                <StatBox $positive={stats.totalBalance?.total >= 100} $negative={stats.totalBalance?.total < 100}>
                  <StatLabel>総資産価値</StatLabel>
                  <StatValue $color={stats.totalBalance?.total >= 100 ? '#00ff88' : '#ff4757'}>
                    {formatSOL(stats.totalBalance?.total || 0)}
                  </StatValue>
                </StatBox>
                <StatBox $positive={stats.totalPnl >= 0} $negative={stats.totalPnl < 0}>
                  <StatLabel>総損益</StatLabel>
                  <StatValue $color={stats.totalPnl >= 0 ? '#00ff88' : '#ff4757'}>
                    {stats.totalPnl >= 0 ? '+' : ''}{formatSOL(stats.totalPnl)}
                  </StatValue>
                </StatBox>
              </StatsGrid>
            </Card>

            <Card>
              <CardTitle><span>📊</span> パフォーマンス</CardTitle>
              <StatsGrid>
                <StatBox $positive>
                  <StatLabel>勝利</StatLabel>
                  <StatValue $color="#00ff88">{stats.winCount}</StatValue>
                </StatBox>
                <StatBox $negative>
                  <StatLabel>敗北</StatLabel>
                  <StatValue $color="#ff4757">{stats.lossCount}</StatValue>
                </StatBox>
                <StatBox>
                  <StatLabel>勝率</StatLabel>
                  <StatValue>
                    {stats.totalTrades > 0 ? ((stats.winCount / stats.totalTrades) * 100).toFixed(1) : 0}%
                  </StatValue>
                </StatBox>
                <StatBox $highlight>
                  <StatLabel>卒業トークン</StatLabel>
                  <StatValue $color="#ffd700">{stats.graduatedTokens}</StatValue>
                </StatBox>
              </StatsGrid>
            </Card>
          </Grid>
        )}

        {/* PnL Chart */}
        <FullWidthCard>
          <CardTitle><span>📈</span> 損益推移チャート</CardTitle>
          <ChartContainer>
            <PnLChart data={pnlHistory} />
          </ChartContainer>
        </FullWidthCard>

        {/* Active Positions */}
        <Grid>
          <FullWidthCard>
            <CardTitle><span>📈</span> アクティブポジション ({positions.length})</CardTitle>
            {positions.length === 0 ? (
              <div style={{textAlign: 'center', padding: '40px', color: '#666'}}>
                🎯 新しいトークンを待機中...<br/>
                <small>一時停止中: {paused ? 'はい' : 'いいえ'}</small>
              </div>
            ) : (
              <div style={{overflowX: 'auto'}}>
                <Table>
                  <thead>
                    <tr>
                      <Th>トークン</Th>
                      <Th>コントラクト</Th>
                      <Th>買順位/ホルダー</Th>
                      <Th>購入額/価格</Th>
                      <Th>現在価格/価値</Th>
                      <Th>時価総額/進捗</Th>
                      <Th>価格推移</Th>
                      <Th>損益</Th>
                      <Th>アクション</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => (
                      <Tr key={pos.id} $graduated={pos.graduated}>
                        <Td>
                          <TokenInfo>
                            <TokenName>{pos.tokenName}</TokenName>
                            <TokenSymbol>${pos.tokenSymbol}</TokenSymbol>
                            {pos.graduated && <Badge style={{marginTop: '5px', fontSize: '0.7rem'}}>🎓 卒業</Badge>}
                          </TokenInfo>
                        </Td>
                        <Td>
                          <AddressLink 
                            href={getPumpFunUrl(pos.tokenMint)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            title={pos.tokenMint}
                          >
                            {truncateAddress(pos.tokenMint)}
                          </AddressLink>
                          <br/>
                          <ExternalLink href={getPumpFunUrl(pos.tokenMint)} target="_blank" rel="noopener noreferrer">
                            🔗 Pump.funで見る
                          </ExternalLink>
                        </Td>
                        <Td>
                          <div><Badge>{formatRank(pos.buyRank)}</Badge></div>
                          <div style={{color: '#888', fontSize: '0.8rem', marginTop: '4px'}}>
                            👥 {pos.holderCount || pos.totalBuyersAtEntry || 0} ホルダー
                          </div>
                        </Td>
                        <Td>
                          <div style={{fontWeight: 'bold'}}>{formatSOL(pos.solAmount)}</div>
                          <div style={{color: '#00d4ff', fontSize: '0.8rem'}}>
                            購入: {formatNumber(pos.entryPrice, 9)} SOL
                          </div>
                          <div style={{color: '#888', fontSize: '0.75rem'}}>
                            {formatDate(pos.buyTime)}
                          </div>
                        </Td>
                        <Td>
                          <div style={{fontWeight: 'bold', color: pos.currentPrice >= pos.entryPrice ? '#00ff88' : '#ff4757'}}>
                            {formatNumber(pos.currentPrice, 9)} SOL
                          </div>
                          <div style={{color: '#888', fontSize: '0.8rem'}}>
                            価値: {formatSOL((pos.solAmount * (1 + pos.pnlPercent / 100)) || pos.solAmount)}
                          </div>
                        </Td>
                        <Td>
                          <div>{formatMarketCap(pos.currentMarketCap)}</div>
                          <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px'}}>
                            <span style={{minWidth: '45px', fontSize: '0.8rem'}}>{pos.bondingCurveProgress.toFixed(1)}%</span>
                            <ProgressBar $progress={pos.bondingCurveProgress} />
                          </div>
                        </Td>
                        <Td style={{width: '130px'}}>
                          <MiniPriceChart data={pos.priceHistory} isPositive={pos.pnl >= 0} />
                        </Td>
                        <Td $positive={pos.pnl > 0} $negative={pos.pnl < 0}>
                          <div style={{fontWeight: 'bold'}}>
                            {pos.pnl >= 0 ? '+' : ''}{formatSOL(pos.pnl)}
                          </div>
                          <div style={{fontSize: '0.85rem'}}>
                            {formatPercent(pos.pnlPercent)}
                          </div>
                        </Td>
                        <Td>
                          <Button onClick={() => handleSell(pos.tokenMint, pos.tokenSymbol)}>
                            💰 売却
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </FullWidthCard>
        </Grid>

        {/* Best/Worst Trades */}
        <Grid>
          <Card>
            <CardTitle><span>🏆</span> 最高取引</CardTitle>
            {stats?.bestTrade ? (
              <div>
                <div style={{fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '10px'}}>
                  {stats.bestTrade.tokenName} (${stats.bestTrade.tokenSymbol})
                </div>
                <div style={{color: '#00ff88', fontSize: '1.5rem', fontWeight: 'bold'}}>
                  +{formatSOL(stats.bestTrade.pnl)} ({formatPercent(stats.bestTrade.pnlPercent)})
                </div>
                <div style={{color: '#888', marginTop: '10px'}}>
                  エントリー: {formatRank(stats.bestTrade.buyRank)}
                </div>
                <ExternalLink href={getPumpFunUrl(stats.bestTrade.tokenMint)} target="_blank" rel="noopener noreferrer">
                  🔗 Pump.funで見る
                </ExternalLink>
              </div>
            ) : (
              <div style={{color: '#666'}}>まだ取引がありません</div>
            )}
          </Card>

          <Card>
            <CardTitle><span>💸</span> 最低取引</CardTitle>
            {stats?.worstTrade ? (
              <div>
                <div style={{fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '10px'}}>
                  {stats.worstTrade.tokenName} (${stats.worstTrade.tokenSymbol})
                </div>
                <div style={{color: '#ff4757', fontSize: '1.5rem', fontWeight: 'bold'}}>
                  {formatSOL(stats.worstTrade.pnl)} ({formatPercent(stats.worstTrade.pnlPercent)})
                </div>
                <div style={{color: '#888', marginTop: '10px'}}>
                  エントリー: {formatRank(stats.worstTrade.buyRank)}
                </div>
                <ExternalLink href={getPumpFunUrl(stats.worstTrade.tokenMint)} target="_blank" rel="noopener noreferrer">
                  🔗 Pump.funで見る
                </ExternalLink>
              </div>
            ) : (
              <div style={{color: '#666'}}>まだ取引がありません</div>
            )}
          </Card>
        </Grid>

        {/* Activity Log */}
        <Card>
          <CardTitle><span>📜</span> アクティビティログ</CardTitle>
          <LogContainer ref={logContainerRef}>
            {logs.length === 0 ? (
              <div style={{color: '#666', textAlign: 'center', padding: '20px'}}>
                🚀 アクティビティを待機中...
              </div>
            ) : (
              logs.map((log) => (
                <LogItem key={log.id} $type={log.type}>
                  <LogTime>{formatTime(log.timestamp)}</LogTime>
                  {log.message}
                </LogItem>
              ))
            )}
            <div ref={logsEndRef} />
          </LogContainer>
        </Card>
      </Dashboard>
    </>
  );
};

export default App;