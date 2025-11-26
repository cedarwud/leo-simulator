import React, { useState } from 'react';
import { ConstellationType } from '../controls/ConstellationSelector';
import { HandoverMethodType, HandoverStats, HANDOVER_METHODS } from '@/types/handover-method';

interface ControlSidebarProps {
  // 星座相關
  currentConstellation: ConstellationType;
  onConstellationChange: (constellation: ConstellationType) => void;

  // 換手方法相關
  currentMethod: HandoverMethodType;
  onMethodChange: (method: HandoverMethodType) => void;

  // 性能指標相關
  stats: HandoverStats;
  currentSatelliteId: string | null;
  currentPhase: string;
}

export function ControlSidebar({
  currentConstellation,
  onConstellationChange,
  currentMethod,
  onMethodChange,
  stats,
  currentSatelliteId,
  currentPhase
}: ControlSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const method = HANDOVER_METHODS[currentMethod];

  const constellations = [
    { value: 'starlink' as ConstellationType, label: 'Starlink', count: 98, visible: '10-15' },
    { value: 'oneweb' as ConstellationType, label: 'OneWeb', count: 26, visible: '3-5' }
  ];

  const methods: HandoverMethodType[] = ['geometric', 'rsrp'];

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
      {/* 側邊欄主體 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: isCollapsed ? '0px' : '320px',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(12px)',
          borderRight: '1px solid rgba(255, 255, 255, 0.1)',
          transition: 'width 0.3s ease-in-out',
          overflow: 'hidden',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* 標題區 */}
        <div
          style={{
            padding: '20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: '68px'
          }}
        >
          <div style={{
            color: '#ffffff',
            fontSize: '18px',
            fontWeight: '700',
            letterSpacing: '0.5px'
          }}>
            控制面板
          </div>
          <button
            onClick={() => setIsCollapsed(true)}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              padding: '8px 10px',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
            title="收合側邊欄"
          >
            ◀
          </button>
        </div>

        {/* 可滾動內容區 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '20px'
          }}
        >
          {/* 星座選擇區 */}
          <SectionTitle>星座選擇</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
            {constellations.map((constellation) => {
              const isActive = currentConstellation === constellation.value;
              return (
                <button
                  key={constellation.value}
                  onClick={() => onConstellationChange(constellation.value)}
                  style={{
                    backgroundColor: isActive ? 'rgba(0, 136, 255, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                    border: isActive ? '2px solid #0088ff' : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '12px 14px',
                    color: isActive ? '#00aaff' : '#cccccc',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: isActive ? '600' : '400',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '4px',
                    outline: 'none',
                    textAlign: 'left'
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
                    fontSize: '15px',
                    fontWeight: '600',
                    color: isActive ? '#00ddff' : '#ffffff'
                  }}>
                    {constellation.label}
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: isActive ? '#88ccff' : '#bbbbbb',
                    display: 'flex',
                    gap: '8px'
                  }}>
                    <span>{constellation.count} 顆</span>
                    <span>•</span>
                    <span>{constellation.visible} 可見</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 換手方法選擇區 */}
          <SectionTitle>換手方法</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
            {methods.map((methodId) => {
              const methodInfo = HANDOVER_METHODS[methodId];
              const isActive = currentMethod === methodId;

              return (
                <button
                  key={methodId}
                  onClick={() => onMethodChange(methodId)}
                  style={{
                    backgroundColor: isActive
                      ? `${methodInfo.color}30`
                      : 'rgba(255, 255, 255, 0.05)',
                    border: isActive
                      ? `2px solid ${methodInfo.color}`
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '12px 14px',
                    color: isActive ? methodInfo.color : '#cccccc',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: isActive ? '600' : '400',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '6px',
                    outline: 'none',
                    textAlign: 'left'
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
                    fontSize: '15px',
                    fontWeight: '600',
                    color: isActive ? methodInfo.color : '#ffffff'
                  }}>
                    {methodInfo.name}
                  </div>

                  <div style={{
                    fontSize: '13px',
                    color: isActive ? `${methodInfo.color}cc` : '#bbbbbb',
                    lineHeight: '1.4'
                  }}>
                    {methodInfo.description}
                  </div>

                  {methodInfo.academicReference && (
                    <div style={{
                      fontSize: '11px',
                      color: isActive ? `${methodInfo.color}99` : '#999999',
                      fontStyle: 'italic',
                      marginTop: '2px'
                    }}>
                      {methodInfo.academicReference}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* 性能指標區 */}
          <SectionTitle>性能指標</SectionTitle>
          <div style={{
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            padding: '14px',
            borderRadius: '8px',
            border: `1px solid ${method.color}40`
          }}>
            {/* 當前連接狀態 */}
            <div style={{
              marginBottom: '12px',
              padding: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '6px'
            }}>
              <div style={{ fontSize: '11px', color: '#bbbbbb', marginBottom: '4px' }}>
                當前連接
              </div>
              <div style={{ fontSize: '14px', color: '#ffffff', fontWeight: '600' }}>
                {currentSatelliteId || '無連接'}
              </div>
              <div style={{ fontSize: '11px', color: '#999999', marginTop: '2px' }}>
                階段: {currentPhase}
              </div>
            </div>

            {/* 指標網格 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              marginBottom: '12px'
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
              paddingTop: '10px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#999999' }}>
                運行時間
              </div>
              <div style={{ fontSize: '14px', color: method.color, fontWeight: '600' }}>
                {formatTime(stats.elapsedTime)}
              </div>
            </div>
          </div>

          {/* 底部說明 */}
          <div style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#999999',
            lineHeight: '1.5'
          }}>
            學術對比研究：不同換手策略的性能評估與對比
          </div>
        </div>
      </div>

      {/* 收合後的展開按鈕 */}
      {isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            zIndex: 1001,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            padding: '12px 14px',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(0, 136, 255, 0.3)';
            e.currentTarget.style.borderColor = '#0088ff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          }}
          title="展開側邊欄"
        >
          ☰
        </button>
      )}
    </>
  );
}

// 區塊標題元件
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      color: '#ffffff',
      fontSize: '14px',
      fontWeight: '600',
      marginBottom: '10px',
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      opacity: 0.9
    }}>
      {children}
    </div>
  );
}

// 指標卡片元件
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
      padding: '8px',
      backgroundColor: 'rgba(255, 255, 255, 0.03)',
      borderRadius: '4px',
      border: `1px solid ${color}20`
    }}>
      <div style={{
        fontSize: '10px',
        color: '#bbbbbb',
        marginBottom: '4px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        {label}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '4px'
      }}>
        <div style={{
          fontSize: '18px',
          color: color,
          fontWeight: '700'
        }}>
          {value}
        </div>
        <div style={{
          fontSize: '11px',
          color: '#999999'
        }}>
          {unit}
        </div>
      </div>
    </div>
  );
}
