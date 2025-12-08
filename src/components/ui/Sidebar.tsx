import React, { useEffect, useRef, useState } from 'react';
import { HandoverMethodType, HANDOVER_METHODS, HandoverStats } from '@/types/handover-method';
import { ConstellationType } from '../controls/ConstellationSelector';
import { GlobalControls } from './sidebar/GlobalControls';

// Blend two colors (consistent with EnhancedSatelliteLinks)
function blendColors(color1: string, color2: string, ratio: number): string {
  const c1 = parseInt(color1.substring(1), 16);
  const c2 = parseInt(color2.substring(1), 16);

  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;

  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;

  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// Sidebar component - Monitoring and global controls
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

  // 全局控制
  timeSpeed: number;
  animationSpeed: 'fast' | 'normal' | 'slow';
  candidateCount: number;
  onTimeSpeedChange: (speed: number) => void;
  onAnimationSpeedChange: (speed: 'fast' | 'normal' | 'slow') => void;
  onCandidateCountChange: (count: number) => void;
}

export function Sidebar({
  currentConstellation,
  onConstellationChange,
  currentMethod,
  onMethodChange,
  stats,
  currentSatelliteId,
  currentPhase,
  timeSpeed,
  animationSpeed,
  candidateCount,
  onTimeSpeedChange,
  onAnimationSpeedChange,
  onCandidateCountChange
}: SidebarProps) {
  const method = HANDOVER_METHODS[currentMethod];
  const [connectionBorderColor, setConnectionBorderColor] = useState('#00ff88');
  const animationTimeRef = useRef(0);
  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number | null>(null);

  // Animation loop
  useEffect(() => {
    const animate = (time: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = time;
      }
      // Convert to seconds
      const totalSeconds = (time - startTimeRef.current) / 1000;
      animationTimeRef.current = totalSeconds;

      // Color logic (follows currentLink in EnhancedSatelliteLinks.tsx)
      let color = '#00ff88';

      // Simple simulation for progress
      const progress = 0.5;

      switch (currentPhase) {
        case 'stable':
          color = '#00ff88';
          break;
        case 'preparing':
          // Preparing: Green to Orange, slow warning flicker (0.8Hz)
          const warningFlicker = Math.sin(totalSeconds * 0.8 * Math.PI * 2) * 0.5 + 0.5;
          color = blendColors('#00ff88', '#ffaa00', 0.5 + warningFlicker * 0.2);
          break;
        case 'selecting':
          // Selecting: Main link stays green in 3D (no special case defined)
          // So keep green here too, not blue like target link
          color = '#00ff88';
          break;
        case 'establishing':
          // Establishing: Dark Orange
          color = '#cc8800';
          break;
        case 'switching':
          // Switching: Gray
          color = '#888888';
          break;
        case 'completing':
          // Completing: Green
          color = '#00ff88';
          break;
        default:
          color = '#00ff88';
      }

      setConnectionBorderColor(color);
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [currentPhase]);

  const constellations: ConstellationType[] = ['starlink', 'oneweb'];
  const constellationLabels = {
    starlink: 'Starlink',
    oneweb: 'OneWeb'
  };

  const methods: HandoverMethodType[] = ['rsrp', 'geometric', 'dqn'];

  // Format Satellite ID: Add constellation prefix
  const formatSatelliteId = (satId: string | null): string => {
    if (!satId) return 'No Connection';

    const match = satId.match(/^(?:sat-)?(\d+)$/);
    if (!match) return satId;

    const number = match[1];
    const prefix = currentConstellation === 'starlink' ? 'STARLINK' : 'ONEWEB';
    return `${prefix}-${number}`;
  };

  // Phase visual labels
  const getPhaseLabel = (phase: string): { text: string; color: string; bgColor: string } => {
    switch (phase) {
      case 'stable':
        return { text: 'Stable', color: '#00ff88', bgColor: 'rgba(0, 255, 136, 0.15)' };
      case 'preparing':
        return { text: 'Preparing', color: '#ffaa00', bgColor: 'rgba(255, 170, 0, 0.15)' };
      case 'selecting':
        return { text: 'Selecting', color: '#0088ff', bgColor: 'rgba(0, 136, 255, 0.15)' };
      case 'establishing':
        return { text: 'Establishing', color: '#00aaff', bgColor: 'rgba(0, 170, 255, 0.15)' };
      case 'switching':
        return { text: 'Switching', color: '#ff8800', bgColor: 'rgba(255, 136, 0, 0.15)' };
      case 'completing':
        return { text: 'Completing', color: '#00ff88', bgColor: 'rgba(0, 255, 136, 0.15)' };
      default:
        return { text: phase, color: '#999999', bgColor: 'rgba(255, 255, 255, 0.05)' };
    }
  };

  const phaseInfo = getPhaseLabel(currentPhase);

  return (
    <>
      {/* 側邊欄 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        height: '100%',
        width: '368px',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        backdropFilter: 'blur(10px)',
        borderRight: '1px solid rgba(255, 255, 255, 0.15))',
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
            fontSize: '20px',
            fontWeight: '600',
            letterSpacing: '0.5px',
            marginBottom: '8px'
          }}>
            🛰️ LEO Satellite Handover Simulator
          </div>
          <div style={{
            color: '#999999',
            fontSize: '13px'
          }}>
            Low Earth Orbit Satellite Handover Simulator
          </div>
        </div>

        {/* 可滾動內容區 */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}>
          {/* 星座選擇 */}
          <div>
            <div style={{
              fontSize: '15px',
              color: '#ffffff',
              fontWeight: '600',
              marginBottom: '12px'
            }}>
              🌍 Constellation
            </div>
            <div style={{
              display: 'flex',
              gap: '10px'
            }}>
              {constellations.map((constellation) => (
                <button
                  key={constellation}
                  onClick={() => onConstellationChange(constellation)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: currentConstellation === constellation
                      ? 'rgba(136, 204, 255, 0.2)'
                      : 'rgba(255, 255, 255, 0.05)',
                    border: currentConstellation === constellation
                      ? '2px solid #88ccff'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: currentConstellation === constellation ? '#88ccff' : '#cccccc',
                    fontSize: '14px',
                    fontWeight: currentConstellation === constellation ? '600' : '400',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    outline: 'none'
                  }}
                >
                  {constellationLabels[constellation]}
                </button>
              ))}
            </div>
          </div>

          {/* 當前連接狀態 */}
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
                📡 Current Connection
              </div>
            </div>

            {/* 連接衛星 */}
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              border: `2px solid ${connectionBorderColor}`,
              borderLeft: `8px solid ${connectionBorderColor}`,
              marginBottom: '12px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
              }}>
                <div style={{ fontSize: '14px', color: '#bbbbbb' }}>
                  Satellite ID
                </div>
                <div style={{
                  fontSize: '18px',
                  color: method.color,
                  fontWeight: '600',
                  fontFamily: 'monospace'
                }}>
                  {formatSatelliteId(currentSatelliteId)}
                </div>
              </div>

              {/* 換手階段 */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: stats.currentSatelliteElevation !== undefined ? '12px' : '0'
              }}>
                <div style={{ fontSize: '14px', color: '#bbbbbb' }}>
                  Phase
                </div>
                <div style={{
                  fontSize: '14px',
                  color: phaseInfo.color,
                  fontWeight: '600',
                  padding: '4px 12px',
                  backgroundColor: phaseInfo.bgColor,
                  borderRadius: '4px',
                  border: `1px solid ${phaseInfo.color}40`
                }}>
                  {phaseInfo.text}
                </div>
              </div>

              {/* 幾何資訊（Geometric 方法時顯示） */}
              {stats.currentSatelliteElevation !== undefined && stats.currentSatelliteDistance !== undefined && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <div>
                    <div style={{ fontSize: '14px', color: '#bbbbbb', marginBottom: '6px' }}>
                      Elevation
                    </div>
                    <div style={{ fontSize: '20px', color: method.color, fontWeight: '600', fontFamily: 'monospace' }}>
                      {stats.currentSatelliteElevation.toFixed(1)}°
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', color: '#bbbbbb', marginBottom: '6px' }}>
                      Distance
                    </div>
                    <div style={{ fontSize: '20px', color: method.color, fontWeight: '600', fontFamily: 'monospace' }}>
                      {stats.currentSatelliteDistance.toFixed(0)} km
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 換手方法選擇 */}
          <div>
            <div style={{
              fontSize: '15px',
              color: '#ffffff',
              fontWeight: '600',
              marginBottom: '12px'
            }}>
              🔄 Handover Method
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              {methods.map((m) => {
                const methodInfo = HANDOVER_METHODS[m];
                const isDisabled = m === 'dqn';
                return (
                  <button
                    key={m}
                    onClick={() => !isDisabled && onMethodChange(m)}
                    disabled={isDisabled}
                    style={{
                      padding: '14px',
                      backgroundColor: currentMethod === m
                        ? `${methodInfo.color}20`
                        : isDisabled
                        ? 'rgba(255, 255, 255, 0.02)'
                        : 'rgba(255, 255, 255, 0.05)',
                      border: currentMethod === m
                        ? `2px solid ${methodInfo.color}`
                        : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: isDisabled ? '#666666' : currentMethod === m ? methodInfo.color : '#cccccc',
                      fontSize: '14px',
                      fontWeight: currentMethod === m ? '600' : '400',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                      outline: 'none',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      opacity: isDisabled ? 0.5 : 1
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                        {methodInfo.name}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: currentMethod === m ? methodInfo.color : '#999999',
                        opacity: 0.8
                      }}>
                        {methodInfo.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 分隔線 */}
          <div style={{ borderTop: '2px solid rgba(255, 255, 255, 0.15)' }} />

          {/* 全局控制 */}
          <GlobalControls
            timeSpeed={timeSpeed}
            animationSpeed={animationSpeed}
            candidateCount={candidateCount}
            onTimeSpeedChange={onTimeSpeedChange}
            onAnimationSpeedChange={onAnimationSpeedChange}
            onCandidateCountChange={onCandidateCountChange}
          />

          {/* 分隔線 */}
          <div style={{ borderTop: '2px solid rgba(255, 255, 255, 0.15)' }} />

          {/* 性能統計 */}
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
                📊 Performance Stats
              </div>
            </div>

            {/* 指標網格 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
              marginBottom: '12px'
            }}>
              {/* 總換手次數 */}
              <div style={{
                padding: '14px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{ fontSize: '13px', color: '#bbbbbb', marginBottom: '8px' }}>
                  Total Handovers
                </div>
                <div style={{ fontSize: '24px', color: method.color, fontWeight: '600', fontFamily: 'monospace' }}>
                  {stats.totalHandovers}
                </div>
              </div>

              {/* Ping-pong 事件 */}
              <div style={{
                padding: '14px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{ fontSize: '13px', color: '#bbbbbb', marginBottom: '8px' }}>
                  Ping-pong Events
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '6px'
                }}>
                  <div style={{ fontSize: '24px', color: '#ff6600', fontWeight: '600', fontFamily: 'monospace' }}>
                    {stats.pingPongEvents}
                  </div>
                  <div style={{ fontSize: '13px', color: '#999999' }}>
                    ({stats.totalHandovers > 0
                      ? ((stats.pingPongEvents / stats.totalHandovers) * 100).toFixed(1)
                      : '0'}%)
                  </div>
                </div>
              </div>

              {/* 服務中斷 */}
              <div style={{
                padding: '14px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{ fontSize: '13px', color: '#bbbbbb', marginBottom: '8px' }}>
                  Interruptions
                </div>
                <div style={{ fontSize: '24px', color: '#ff0000', fontWeight: '600', fontFamily: 'monospace' }}>
                  {stats.serviceInterruptions}
                </div>
              </div>

              {/* 運行時間 */}
              <div style={{
                padding: '14px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{ fontSize: '13px', color: '#bbbbbb', marginBottom: '8px' }}>
                  Runtime
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '4px'
                }}>
                  <div style={{ fontSize: '20px', color: '#88ccff', fontWeight: '600', fontFamily: 'monospace' }}>
                    {(stats.elapsedTime / 60).toFixed(1)}
                  </div>
                  <div style={{ fontSize: '13px', color: '#999999' }}>
                    min
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}