import React, { useEffect, useState } from 'react';
import { HandoverMethodType, HANDOVER_METHODS, HandoverStats } from '@/types/handover-method';
import { ConstellationType } from '../controls/ConstellationSelector';
import { GlobalControls } from './sidebar/GlobalControls';
import { EnergyEfficiencyPanel } from './sidebar/EnergyEfficiencyPanel';
import { VisualizationTogglePanel } from './sidebar/VisualizationTogglePanel';
import { SimulationClockPanel } from './sidebar/SimulationClockPanel';
import { Paper41ParamsPanel } from './sidebar/Paper41ParamsPanel';
import { SimulationChartsPanel } from './sidebar/SimulationChartsPanel';
import { ConstraintValidationPanel } from './sidebar/ConstraintValidationPanel';
import type { VisualizationToggles } from '@/types/unified-scene';
import type { SimulationClock, CellQueueState, LyapunovState, Paper41Config } from '@/types/paper41';

// Derive readable text colors based on background brightness
function getContrastTextColor(hex: string) {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.substring(0, 2), 16) / 255;
  const g = parseInt(normalized.substring(2, 4), 16) / 255;
  const b = parseInt(normalized.substring(4, 6), 16) / 255;

  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  // Lower threshold so more bright backgrounds use dark text
  const isLight = luminance > 0.55;

  return {
    isLight,
    text: isLight ? '#0b1020' : '#f5f8ff',
    subtle: isLight ? 'rgba(11, 16, 32, 0.78)' : 'rgba(245, 248, 255, 0.82)'
  };
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

  // 視覺化開關
  visualizationToggles: VisualizationToggles;
  onToggleChange: (key: keyof VisualizationToggles, value: boolean) => void;

  // Paper 4-1 模擬時鐘
  simulationClock: SimulationClock;
  queueStates: CellQueueState[];
  avgQueueLength: number;
  maxQueueLength: number;
  onTogglePlay: () => void;
  onStepSlot: () => void;
  onStepEpoch: () => void;
  onSetSpeed: (multiplier: number) => void;
  onResetClock: () => void;
  lyapunovState?: LyapunovState;

  // Paper 4-1 參數面板
  paper41Config?: Paper41Config;
  onPaper41ConfigChange?: (config: Paper41Config) => void;
  spectrumSharingEnabled?: boolean;
  onSpectrumSharingToggle?: (enabled: boolean) => void;
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
  onCandidateCountChange,
  visualizationToggles,
  onToggleChange,
  simulationClock,
  queueStates,
  avgQueueLength,
  maxQueueLength,
  onTogglePlay,
  onStepSlot,
  onStepEpoch,
  onSetSpeed,
  onResetClock,
  lyapunovState,
  paper41Config,
  onPaper41ConfigChange,
  spectrumSharingEnabled,
  onSpectrumSharingToggle,
}: SidebarProps) {
  const method = HANDOVER_METHODS[currentMethod];
  const [connectionBorderColor, setConnectionBorderColor] = useState('#0088ff');

  // Keep connection border color aligned with simplified three-color scheme
  useEffect(() => {
    let color = '#0088ff'; // current service link

    switch (currentPhase) {
      case 'preparing':
      case 'selecting':
        color = '#2d9aff'; // slightly dimmer blue while probing candidates
        break;
      case 'establishing':
        color = '#1f75c6'; // fading current link
        break;
      case 'switching':
        color = '#155a96'; // weakest current link during switch
        break;
      case 'completing':
        color = '#0088ff'; // back to stable tone
        break;
      default:
        color = '#0088ff';
    }

    setConnectionBorderColor(color);
  }, [currentPhase]);

  const constellations: ConstellationType[] = ['starlink', 'oneweb'];
  const constellationLabels = {
    starlink: 'Starlink',
    oneweb: 'OneWeb'
  };

  const methods: HandoverMethodType[] = ['rsrp', 'geometric', 'paper41', 'dqn'];
  const {
    text: cardTextColor,
    subtle: cardSubtleTextColor,
    isLight: isCardLight
  } = getContrastTextColor(connectionBorderColor);
  const chipBg = isCardLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)';
  const chipBorder = isCardLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.16)';

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
        return { text: 'Stable', color: '#0088ff', bgColor: 'rgba(0, 136, 255, 0.15)' };
      case 'preparing':
        return { text: 'Preparing', color: '#0088ff', bgColor: 'rgba(0, 136, 255, 0.12)' };
      case 'selecting':
        return { text: 'Selecting', color: '#0088ff', bgColor: 'rgba(0, 136, 255, 0.12)' };
      case 'establishing':
        return { text: 'Establishing', color: '#00ff88', bgColor: 'rgba(0, 255, 136, 0.12)' };
      case 'switching':
        return { text: 'Switching', color: '#00ff88', bgColor: 'rgba(0, 255, 136, 0.12)' };
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
            🛰️ LEO Satellite Handover
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
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 6px 18px rgba(0, 0, 0, 0.25)',
              marginBottom: '12px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
              }}>
                <div style={{ fontSize: '14px', color: cardSubtleTextColor }}>
                  Satellite ID
                </div>
                <div style={{
                  fontSize: '18px',
                  color: cardTextColor,
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
                <div style={{ fontSize: '14px', color: cardSubtleTextColor }}>
                  Phase
                </div>
                <div style={{
                  fontSize: '14px',
                  color: cardTextColor,
                  fontWeight: '600',
                  padding: '4px 12px',
                  backgroundColor: chipBg,
                  borderRadius: '4px',
                  border: `1px solid ${chipBorder}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: phaseInfo.color,
                    boxShadow: `0 0 8px ${phaseInfo.color}`
                  }} />
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
                  borderTop: isCardLight ? '1px solid rgba(0, 0, 0, 0.06)' : '1px solid rgba(255, 255, 255, 0.12)'
                }}>
                  <div>
                    <div style={{ fontSize: '14px', color: cardSubtleTextColor, marginBottom: '6px' }}>
                      Elevation
                    </div>
                    <div style={{ fontSize: '20px', color: cardTextColor, fontWeight: '600', fontFamily: 'monospace' }}>
                      {stats.currentSatelliteElevation.toFixed(1)}°
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', color: cardSubtleTextColor, marginBottom: '6px' }}>
                      Distance
                    </div>
                    <div style={{ fontSize: '20px', color: cardTextColor, fontWeight: '600', fontFamily: 'monospace' }}>
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

          {/* 視覺化選項 */}
          <VisualizationTogglePanel
            toggles={visualizationToggles}
            onToggleChange={onToggleChange}
          />

          {/* 分隔線 */}
          <div style={{ borderTop: '2px solid rgba(255, 255, 255, 0.15)' }} />

          {/* Paper 4-1 模擬時鐘 */}
          <SimulationClockPanel
            clock={simulationClock}
            queueStates={queueStates}
            avgQueueLength={avgQueueLength}
            maxQueueLength={maxQueueLength}
            onTogglePlay={onTogglePlay}
            onStepSlot={onStepSlot}
            onStepEpoch={onStepEpoch}
            onSetSpeed={onSetSpeed}
            onReset={onResetClock}
            lyapunovState={lyapunovState}
          />

          {/* Paper 4-1 參數面板 */}
          {paper41Config && onPaper41ConfigChange && (
            <>
              <div style={{ borderTop: '2px solid rgba(255, 255, 255, 0.15)' }} />
              <Paper41ParamsPanel
                config={paper41Config}
                onConfigChange={onPaper41ConfigChange}
                spectrumSharingEnabled={spectrumSharingEnabled ?? true}
                onSpectrumSharingToggle={onSpectrumSharingToggle ?? (() => {})}
              />
            </>
          )}

          {/* Paper 4-1 模擬結果圖表 (Fig. 6-9) */}
          {lyapunovState && lyapunovState.history.length > 0 && (
            <>
              <div style={{ borderTop: '2px solid rgba(255, 255, 255, 0.15)' }} />
              <SimulationChartsPanel history={lyapunovState.history} />
            </>
          )}

          {/* 約束驗證面板 */}
          {lyapunovState && paper41Config && lyapunovState.history.length > 1 && (
            <>
              <div style={{ borderTop: '2px solid rgba(255, 255, 255, 0.15)' }} />
              <ConstraintValidationPanel
                lyapunovState={lyapunovState}
                config={paper41Config}
              />
            </>
          )}

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

          {/* 分隔線 */}
          <div style={{ borderTop: '2px solid rgba(255, 255, 255, 0.15)' }} />

          {/* 能耗效率面板 (Ntabeni et al., 2025) */}
          <EnergyEfficiencyPanel
            stats={stats}
            currentMethod={currentMethod}
            methodColor={method.color}
          />
        </div>
      </div>
    </>
  );
}
