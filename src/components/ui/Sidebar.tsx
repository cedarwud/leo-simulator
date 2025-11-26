import React, { useState } from 'react';
import { HandoverMethodType, HANDOVER_METHODS, HandoverStats } from '@/types/handover-method';
import { ConstellationType } from '../controls/ConstellationSelector';

interface SidebarProps {
  // 星座選擇
  currentConstellation: ConstellationType;
  onConstellationChange: (constellation: ConstellationType) => void;

  // 換手方法
  currentMethod: HandoverMethodType;
  onMethodChange: (method: HandoverMethodType) => void;

  // 性能指標
  stats: HandoverStats;
  currentSatelliteId: string | null;
  currentPhase: string;
}

export function Sidebar({
  currentConstellation,
  onConstellationChange,
  currentMethod,
  onMethodChange,
  stats,
  currentSatelliteId,
  currentPhase
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const method = HANDOVER_METHODS[currentMethod];

  const constellations: ConstellationType[] = ['starlink', 'oneweb'];
  const constellationLabels = {
    starlink: 'Starlink',
    oneweb: 'OneWeb'
  };

  const methods: HandoverMethodType[] = ['geometric', 'rsrp'];

  // 切換星座
  const switchConstellation = (direction: 'prev' | 'next') => {
    const currentIndex = constellations.indexOf(currentConstellation);
    const newIndex = direction === 'next'
      ? (currentIndex + 1) % constellations.length
      : (currentIndex - 1 + constellations.length) % constellations.length;
    onConstellationChange(constellations[newIndex]);
  };

  // 格式化函數
  const formatNumber = (value: number | null, decimals: number = 1): string => {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    return value.toFixed(decimals);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getRSRPColor = (rsrp: number): string => {
    if (rsrp >= -80) return '#00ff88';
    if (rsrp >= -90) return '#88ff00';
    if (rsrp >= -100) return '#ffaa00';
    if (rsrp >= -110) return '#ff6600';
    return '#ff0000';
  };

  const pingPongRate = stats.totalHandovers > 0
    ? (stats.pingPongEvents / stats.totalHandovers * 100)
    : 0;

  return (
    <>
      {/* 側邊欄 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        height: '100%',
        width: isOpen ? '360px' : '0',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        backdropFilter: 'blur(10px)',
        borderRight: isOpen ? '1px solid rgba(255, 255, 255, 0.15)' : 'none',
        transition: 'width 0.3s ease',
        overflow: 'hidden',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* 標題區 */}
        <div style={{
          padding: '24px 20px',
          borderBottom: '2px solid rgba(255, 255, 255, 0.15)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{
            color: '#ffffff',
            fontSize: '20px',
            fontWeight: '600',
            letterSpacing: '0.5px'
          }}>
            LEO 衛星模擬器
          </div>
        </div>

        {/* 可滾動內容區 */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '32px'
        }}>
          {/* 1. 星座選擇 - 左右切換設計 */}
          <div>
            <div style={{
              color: '#ffffff',
              fontSize: '16px',
              fontWeight: '600',
              marginBottom: '16px',
              letterSpacing: '0.5px'
            }}>
              星座選擇
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <button
                onClick={() => switchConstellation('prev')}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '18px',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 136, 255, 0.3)';
                  e.currentTarget.style.borderColor = '#0088ff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                }}
              >
                ◀
              </button>

              <div style={{
                flex: 1,
                textAlign: 'center',
                color: '#00ddff',
                fontSize: '18px',
                fontWeight: '600'
              }}>
                {constellationLabels[currentConstellation]}
              </div>

              <button
                onClick={() => switchConstellation('next')}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '18px',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 136, 255, 0.3)';
                  e.currentTarget.style.borderColor = '#0088ff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                }}
              >
                ▶
              </button>
            </div>
          </div>

          {/* 分隔線 */}
          <div style={{ borderTop: '2px solid rgba(255, 255, 255, 0.15)' }} />

          {/* 2. 換手方法選擇 */}
          <div>
            <div style={{
              color: '#ffffff',
              fontSize: '16px',
              fontWeight: '600',
              marginBottom: '16px',
              letterSpacing: '0.5px'
            }}>
              換手方法
            </div>

            {methods.map((methodId) => {
              const methodInfo = HANDOVER_METHODS[methodId];
              const isActive = currentMethod === methodId;

              return (
                <button
                  key={methodId}
                  onClick={() => onMethodChange(methodId)}
                  style={{
                    width: '100%',
                    backgroundColor: isActive
                      ? `${methodInfo.color}30`
                      : 'rgba(255, 255, 255, 0.05)',
                    border: isActive
                      ? `2px solid ${methodInfo.color}`
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    color: isActive ? methodInfo.color : '#cccccc',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: isActive ? '600' : '400',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '8px',
                    outline: 'none',
                    textAlign: 'left',
                    marginBottom: '10px'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    }
                  }}
                >
                  <div style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: isActive ? methodInfo.color : '#ffffff'
                  }}>
                    {methodInfo.name}
                  </div>

                  <div style={{
                    fontSize: '14px',
                    color: isActive ? `${methodInfo.color}cc` : '#cccccc',
                    lineHeight: '1.5'
                  }}>
                    {methodInfo.description}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 分隔線 */}
          <div style={{ borderTop: '2px solid rgba(255, 255, 255, 0.15)' }} />

          {/* 3. 性能指標 */}
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '16px'
            }}>
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: method.color,
                boxShadow: `0 0 10px ${method.color}`
              }} />
              <div style={{
                color: '#ffffff',
                fontSize: '16px',
                fontWeight: '600',
                letterSpacing: '0.5px'
              }}>
                性能指標
              </div>
            </div>

            {/* 當前連接狀態 */}
            <div style={{
              marginBottom: '16px',
              padding: '14px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              border: `1px solid ${method.color}40`
            }}>
              <div style={{ fontSize: '15px', color: '#bbbbbb', marginBottom: '8px', fontWeight: '500' }}>
                當前連接
              </div>
              <div style={{ fontSize: '20px', color: '#ffffff', fontFamily: 'monospace', fontWeight: '600' }}>
                {currentSatelliteId || '無連接'}
              </div>
              <div style={{ fontSize: '15px', color: '#999999', marginTop: '6px' }}>
                階段: {currentPhase}
              </div>
            </div>

            {/* 指標網格 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
              marginBottom: '14px'
            }}>
              <MetricCard
                label="換手次數"
                value={stats.totalHandovers.toString()}
                unit=""
                color={method.color}
              />

              <MetricCard
                label="Ping-pong"
                value={stats.pingPongEvents.toString()}
                unit={`(${formatNumber(pingPongRate, 0)}%)`}
                color={pingPongRate > 20 ? '#ff6600' : method.color}
              />

              <MetricCard
                label="平均 RSRP"
                value={formatNumber(stats.averageRSRP, 1)}
                unit="dBm"
                color={getRSRPColor(stats.averageRSRP)}
              />

              <MetricCard
                label="平均 SINR"
                value={formatNumber(stats.averageSINR, 1)}
                unit="dB"
                color={stats.averageSINR > 10 ? '#00ff88' : '#ffaa00'}
              />

              <MetricCard
                label="連接時長"
                value={formatNumber(stats.connectionDuration, 0)}
                unit="秒"
                color={method.color}
              />

              <MetricCard
                label="服務中斷"
                value={stats.serviceInterruptions.toString()}
                unit="次"
                color={stats.serviceInterruptions > 0 ? '#ff0000' : '#00ff88'}
              />
            </div>

            {/* 運行時間 */}
            <div style={{
              paddingTop: '14px',
              marginTop: '14px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ fontSize: '15px', color: '#cccccc', fontWeight: '500' }}>
                運行時間
              </div>
              <div style={{ fontSize: '18px', color: method.color, fontWeight: '600', fontFamily: 'monospace' }}>
                {formatTime(stats.elapsedTime)}
              </div>
            </div>

            {/* 平均 RSRQ */}
            {stats.averageRSRQ !== 0 && (
              <div style={{
                marginTop: '12px',
                fontSize: '15px',
                color: '#cccccc',
                textAlign: 'center'
              }}>
                平均 RSRQ: {formatNumber(stats.averageRSRQ, 1)} dB
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 收合/展開按鈕 - 漢堡選單 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'absolute',
          top: '20px',
          left: isOpen ? '360px' : '0',
          zIndex: 1001,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderLeft: isOpen ? 'none' : '1px solid rgba(255, 255, 255, 0.2)',
          borderTopRightRadius: isOpen ? '8px' : '0',
          borderBottomRightRadius: isOpen ? '8px' : '0',
          borderTopLeftRadius: isOpen ? '0' : '8px',
          borderBottomLeftRadius: isOpen ? '0' : '8px',
          padding: '12px 10px',
          color: '#ffffff',
          cursor: 'pointer',
          fontSize: '20px',
          transition: 'all 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          backdropFilter: 'blur(10px)',
          outline: 'none',
          width: '44px',
          height: '44px'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(0, 136, 255, 0.4)';
          e.currentTarget.style.borderColor = '#0088ff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        }}
      >
        {/* 漢堡選單圖標 */}
        <div style={{
          width: '22px',
          height: '2px',
          backgroundColor: '#ffffff',
          borderRadius: '1px',
          transition: 'transform 0.3s ease'
        }} />
        <div style={{
          width: '22px',
          height: '2px',
          backgroundColor: '#ffffff',
          borderRadius: '1px',
          transition: 'transform 0.3s ease'
        }} />
        <div style={{
          width: '22px',
          height: '2px',
          backgroundColor: '#ffffff',
          borderRadius: '1px',
          transition: 'transform 0.3s ease'
        }} />
      </button>
    </>
  );
}

// 單個指標卡片
function MetricCard({
  label,
  value,
  unit,
  color
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <div style={{
      padding: '12px',
      backgroundColor: 'rgba(255, 255, 255, 0.03)',
      borderRadius: '6px',
      border: `1px solid ${color}20`
    }}>
      <div style={{
        fontSize: '15px',
        color: '#bbbbbb',
        marginBottom: '8px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        fontWeight: '500'
      }}>
        {label}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '4px'
      }}>
        <div style={{
          fontSize: '24px',
          color: color,
          fontWeight: '700',
          fontFamily: 'monospace'
        }}>
          {value}
        </div>
        <div style={{
          fontSize: '14px',
          color: '#999999',
          fontWeight: '500'
        }}>
          {unit}
        </div>
      </div>
    </div>
  );
}
