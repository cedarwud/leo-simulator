import React, { useState } from 'react';
import { HandoverMethodType, HANDOVER_METHODS, HandoverStats } from '@/types/handover-method';
import { ConstellationType } from '../controls/ConstellationSelector';
import { DualSemiCircleGauge } from './SemiCircleGauge';

// 側邊欄組件 - 整合星座選擇、換手方法、性能指標
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

  const methods: HandoverMethodType[] = ['geometric', 'rsrp', 'dqn'];

  // 格式化衛星 ID：添加星座前綴
  const formatSatelliteId = (satId: string | null): string => {
    if (!satId) return '無連接';

    // 衛星 ID 可能是純數字（如 "45061"）或帶前綴（如 "sat-45061"）
    const match = satId.match(/^(?:sat-)?(\d+)$/);
    if (!match) return satId; // 如果不匹配，直接返回原值

    const number = match[1];
    const prefix = currentConstellation === 'starlink' ? 'STARLINK' : 'ONEWEB';
    return `${prefix}-${number}`;
  };

  // 階段的視覺化標籤
  const getPhaseLabel = (phase: string): { text: string; color: string; bgColor: string } => {
    switch (phase) {
      case 'stable':
        return { text: '穩定連接', color: '#00ff88', bgColor: 'rgba(0, 255, 136, 0.15)' };
      case 'preparing':
        return { text: '準備換手', color: '#ffaa00', bgColor: 'rgba(255, 170, 0, 0.15)' };
      case 'selecting':
        return { text: '選擇目標', color: '#0088ff', bgColor: 'rgba(0, 136, 255, 0.15)' };
      case 'establishing':
        return { text: '建立連接', color: '#00aaff', bgColor: 'rgba(0, 170, 255, 0.15)' };
      case 'switching':
        return { text: '切換中', color: '#ff8800', bgColor: 'rgba(255, 136, 0, 0.15)' };
      case 'completing':
        return { text: '完成換手', color: '#00ff88', bgColor: 'rgba(0, 255, 136, 0.15)' };
      default:
        return { text: phase, color: '#999999', bgColor: 'rgba(255, 255, 255, 0.05)' };
    }
  };

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

  // 信號品質評級函數
  const getSignalQuality = (type: 'rsrp' | 'rsrq' | 'sinr', value: number): {
    label: string;
    color: string;
    percentage: number;
    bgColor: string;
  } => {
    switch (type) {
      case 'rsrp':
        // RSRP 範圍: -120 到 -60 dBm
        if (value >= -80) {
          return { label: '優秀', color: '#00ff88', percentage: 100, bgColor: 'rgba(0, 255, 136, 0.15)' };
        } else if (value >= -90) {
          return { label: '良好', color: '#88ff00', percentage: 80, bgColor: 'rgba(136, 255, 0, 0.15)' };
        } else if (value >= -100) {
          return { label: '中等', color: '#ffaa00', percentage: 60, bgColor: 'rgba(255, 170, 0, 0.15)' };
        } else if (value >= -110) {
          return { label: '較差', color: '#ff6600', percentage: 40, bgColor: 'rgba(255, 102, 0, 0.15)' };
        } else {
          return { label: '極差', color: '#ff0000', percentage: 20, bgColor: 'rgba(255, 0, 0, 0.15)' };
        }

      case 'rsrq':
        // RSRQ 範圍: -19 到 -3 dB
        if (value >= -10) {
          return { label: '優秀', color: '#00ff88', percentage: 100, bgColor: 'rgba(0, 255, 136, 0.15)' };
        } else if (value >= -15) {
          return { label: '良好', color: '#88ff00', percentage: 75, bgColor: 'rgba(136, 255, 0, 0.15)' };
        } else if (value >= -20) {
          return { label: '中等', color: '#ffaa00', percentage: 50, bgColor: 'rgba(255, 170, 0, 0.15)' };
        } else {
          return { label: '較差', color: '#ff6600', percentage: 25, bgColor: 'rgba(255, 102, 0, 0.15)' };
        }

      case 'sinr':
        // SINR 範圍: -5 到 30 dB
        if (value >= 20) {
          return { label: '優秀', color: '#00ff88', percentage: 100, bgColor: 'rgba(0, 255, 136, 0.15)' };
        } else if (value >= 10) {
          return { label: '良好', color: '#88ff00', percentage: 75, bgColor: 'rgba(136, 255, 0, 0.15)' };
        } else if (value >= 0) {
          return { label: '中等', color: '#ffaa00', percentage: 50, bgColor: 'rgba(255, 170, 0, 0.15)' };
        } else if (value >= -5) {
          return { label: '較差', color: '#ff6600', percentage: 25, bgColor: 'rgba(255, 102, 0, 0.15)' };
        } else {
          return { label: '極差', color: '#ff0000', percentage: 10, bgColor: 'rgba(255, 0, 0, 0.15)' };
        }

      default:
        return { label: 'N/A', color: '#999999', percentage: 0, bgColor: 'rgba(255, 255, 255, 0.05)' };
    }
  };

  return (
    <>
      {/* CSS 動畫定義 */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.1);
          }
        }
      `}</style>

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
          padding: '20px',
          borderBottom: '2px solid rgba(255, 255, 255, 0.15)'
        }}>
          <div style={{
            color: '#ffffff',
            fontSize: '18px',
            fontWeight: '600',
            letterSpacing: '0.5px',
            textAlign: 'center'
          }}>
            衛星換手控制台
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
              const isDisabled = methodId === 'dqn'; // DQN 開發中

              return (
                <button
                  key={methodId}
                  onClick={() => !isDisabled && onMethodChange(methodId)}
                  disabled={isDisabled}
                  style={{
                    width: '100%',
                    backgroundColor: isActive
                      ? `${methodInfo.color}30`
                      : isDisabled
                      ? 'rgba(150, 150, 150, 0.15)'
                      : 'rgba(255, 255, 255, 0.05)',
                    border: isActive
                      ? `2px solid ${methodInfo.color}`
                      : isDisabled
                      ? '1px solid rgba(180, 180, 180, 0.4)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    color: isActive ? methodInfo.color : isDisabled ? '#999999' : '#cccccc',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: isActive ? '600' : '400',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '8px',
                    outline: 'none',
                    textAlign: 'left',
                    marginBottom: '10px',
                    opacity: isDisabled ? 0.75 : 1,
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive && !isDisabled) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive && !isDisabled) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    }
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%'
                  }}>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: isActive ? methodInfo.color : isDisabled ? '#999999' : '#ffffff',
                      flex: 1
                    }}>
                      {methodInfo.name}
                    </div>
                    {isDisabled && (
                      <div style={{
                        fontSize: '11px',
                        fontWeight: '600',
                        color: '#ff8800',
                        backgroundColor: 'rgba(255, 136, 0, 0.15)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: '1px solid rgba(255, 136, 0, 0.3)'
                      }}>
                        開發中
                      </div>
                    )}
                  </div>

                  <div style={{
                    fontSize: '14px',
                    color: isActive ? `${methodInfo.color}cc` : isDisabled ? '#777777' : '#cccccc',
                    lineHeight: '1.5'
                  }}>
                    {methodInfo.description}
                  </div>
                </button>
              );
            })}
          </div>

          {/* A4 事件監測已移至右側面板 */}

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

            {/* 可見衛星統計 - 3列網格布局 */}
            <div style={{
              marginBottom: '16px',
              padding: '14px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              border: '1px solid rgba(100, 180, 255, 0.3)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '12px'
            }}>
              {/* 可見衛星 */}
              <div>
                <div style={{ fontSize: '14px', color: '#bbbbbb', marginBottom: '6px', fontWeight: '500', textAlign: 'center' }}>
                  可見衛星
                </div>
                <div style={{ fontSize: '28px', color: '#64b4ff', fontFamily: 'monospace', fontWeight: '700', textAlign: 'center' }}>
                  {stats.visibleSatellites || 0}
                </div>
              </div>

              {/* 衛星總數 */}
              <div style={{
                borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                borderRight: '1px solid rgba(255, 255, 255, 0.1)',
                paddingLeft: '12px',
                paddingRight: '12px'
              }}>
                <div style={{ fontSize: '14px', color: '#bbbbbb', marginBottom: '6px', fontWeight: '500', textAlign: 'center' }}>
                  衛星總數
                </div>
                <div style={{ fontSize: '28px', color: '#888888', fontFamily: 'monospace', fontWeight: '700', textAlign: 'center' }}>
                  {stats.totalSatellites || 0}
                </div>
              </div>

              {/* 候選衛星 */}
              <div>
                <div style={{ fontSize: '14px', color: '#bbbbbb', marginBottom: '6px', fontWeight: '500', textAlign: 'center' }}>
                  候選衛星
                </div>
                <div style={{ fontSize: '28px', color: '#ffaa00', fontFamily: 'monospace', fontWeight: '700', textAlign: 'center' }}>
                  {stats.candidateSatellites?.length || 0}
                </div>
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
              {/* 標題和階段標籤 - 並排顯示 */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
              }}>
                <div style={{ fontSize: '15px', color: '#bbbbbb', fontWeight: '500' }}>
                  當前連接
                </div>
                {(() => {
                  const phaseInfo = getPhaseLabel(currentPhase);
                  return (
                    <div style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      backgroundColor: phaseInfo.bgColor,
                      border: `1px solid ${phaseInfo.color}60`,
                      fontSize: '14px',
                      color: phaseInfo.color,
                      fontWeight: '600',
                      whiteSpace: 'nowrap'
                    }}>
                      {phaseInfo.text}
                    </div>
                  );
                })()}
              </div>

              {/* 衛星 ID - 加上星座前綴 */}
              <div style={{
                fontSize: '20px',
                color: method.color,
                fontFamily: 'monospace',
                fontWeight: '600',
                marginBottom: '12px'
              }}>
                {formatSatelliteId(currentSatelliteId)}
              </div>

              {/* 幾何資訊 */}
              {stats.currentSatelliteElevation !== undefined && stats.currentSatelliteDistance !== undefined && (
                <div style={{
                  paddingTop: '12px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px'
                }}>
                  <div>
                    <div style={{ fontSize: '14px', color: '#bbbbbb', marginBottom: '6px' }}>
                      仰角
                    </div>
                    <div style={{ fontSize: '20px', color: method.color, fontWeight: '600', fontFamily: 'monospace' }}>
                      {stats.currentSatelliteElevation.toFixed(1)}°
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', color: '#bbbbbb', marginBottom: '6px' }}>
                      距離
                    </div>
                    <div style={{ fontSize: '20px', color: method.color, fontWeight: '600', fontFamily: 'monospace' }}>
                      {stats.currentSatelliteDistance.toFixed(0)} km
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 信號品質指標 - 半圓形儀表板 */}
            <div style={{ marginBottom: '14px' }}>
              {/* RSRP 儀表板 */}
              <DualSemiCircleGauge
                label="RSRP"
                currentValue={stats.averageRSRP}
                targetValue={stats.targetSatelliteRSRP ?? null}
                min={-100}
                max={-40}
                unit="dBm"
                zones={[
                  { threshold: -100, color: '#ff0000', label: '信號極差' },
                  { threshold: -80, color: '#ff6600', label: '需要換手' },
                  { threshold: -65, color: '#ffaa00', label: '建議換手' },
                  { threshold: -55, color: '#88ff00', label: '信號良好' },
                  { threshold: -50, color: '#00ff88', label: '信號優秀' }
                ]}
              />

              {/* RSRQ 儀表板 */}
              <DualSemiCircleGauge
                label="RSRQ"
                currentValue={stats.averageRSRQ}
                targetValue={stats.targetSatelliteRSRQ ?? null}
                min={-19}
                max={-3}
                unit="dB"
                zones={[
                  { threshold: -19, color: '#ff0000', label: '信號極差' },
                  { threshold: -15, color: '#ffaa00', label: '建議換手' },
                  { threshold: -10, color: '#00ff88', label: '信號優秀' }
                ]}
              />

              {/* SINR 儀表板 */}
              <DualSemiCircleGauge
                label="SINR"
                currentValue={stats.averageSINR}
                targetValue={stats.targetSatelliteSINR ?? null}
                min={-5}
                max={30}
                unit="dB"
                zones={[
                  { threshold: -5, color: '#ff0000', label: '信號極差' },
                  { threshold: 10, color: '#ffaa00', label: '建議換手' },
                  { threshold: 20, color: '#00ff88', label: '信號優秀' }
                ]}
              />
            </div>

            {/* 其他指標網格 */}
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
          </div>
        </div>
      </div>

      {/* 漢堡選單按鈕 - 固定在左上角 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          width: '36px',
          height: '36px',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '6px',
          padding: '8px',
          color: '#ffffff',
          cursor: 'pointer',
          fontSize: '16px',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          outline: 'none',
          zIndex: 1001,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        }}
      >
        ☰
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
