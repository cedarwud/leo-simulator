import React from 'react';
import { Satellite, Radio, Zap, Activity } from 'lucide-react';
import { POLARIZATION_COLORS } from '../components/EarthFixedCells';
import { BeamManagementStats } from '../components/BeamHoppingSystem';
import { ENERGY_CONFIG } from '@/config/energy.config';

interface BeamHoppingSidebarProps {
  /** Beam management 統計數據 */
  stats?: BeamManagementStats;
}

export function BeamHoppingSidebar({
  stats,
}: BeamHoppingSidebarProps) {
  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      height: '100%',
      width: '320px',
      backgroundColor: 'rgba(0, 0, 0, 0.92)',
      backdropFilter: 'blur(10px)',
      borderRight: '1px solid rgba(255, 255, 255, 0.15)',
      overflow: 'hidden',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* 標題 */}
      <div style={{
        padding: '20px',
        borderBottom: '2px solid rgba(255, 255, 255, 0.15)',
      }}>
        <div style={{
          color: '#ffffff',
          fontSize: '24px',
          fontWeight: '600',
          letterSpacing: '0.5px',
          marginBottom: '6px',
        }}>
          Beam Management
        </div>
        <div style={{ color: '#aaaaaa', fontSize: '15px' }}>
          Inter-satellite Handover
        </div>
      </div>

      {/* 內容 */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}>
        {/* 連線狀態 */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '14px',
          }}>
            <Radio size={20} color={stats?.currentSatelliteId ? '#00ff88' : '#ff4444'} />
            <div style={{
              fontSize: '17px',
              color: '#ffffff',
              fontWeight: '600',
            }}>
              Connection Status
            </div>
          </div>
          <div style={{
            padding: '16px',
            backgroundColor: stats?.currentSatelliteId
              ? 'rgba(0, 255, 136, 0.08)'
              : 'rgba(255, 68, 68, 0.08)',
            borderRadius: '10px',
            border: `1px solid ${stats?.currentSatelliteId
              ? 'rgba(0, 255, 136, 0.25)'
              : 'rgba(255, 68, 68, 0.25)'}`,
          }}>
            {/* 衛星連線 */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <Satellite size={18} color="#cccccc" />
                <span style={{ fontSize: '15px', color: '#cccccc' }}>Satellite</span>
              </div>
              <span style={{
                fontSize: '16px',
                fontWeight: '600',
                color: stats?.currentSatelliteId ? '#00ff88' : '#ff4444',
                fontFamily: 'monospace',
              }}>
                {stats?.currentSatelliteId || 'No Signal'}
              </span>
            </div>

            {/* 波束連線 */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <Activity size={18} color="#cccccc" />
                <span style={{ fontSize: '15px', color: '#cccccc' }}>Serving Beam</span>
              </div>
              <span style={{
                fontSize: '16px',
                fontWeight: '600',
                color: stats?.currentBeamId != null ? '#00ff88' : '#888888',
                fontFamily: 'monospace',
              }}>
                {stats?.currentBeamId != null ? `B${stats.currentBeamId}` : '-'}
              </span>
            </div>

            {/* UE 位置 */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '15px', color: '#cccccc' }}>UE Location</span>
              <span style={{
                fontSize: '16px',
                fontWeight: '600',
                color: '#ff66aa',
                fontFamily: 'monospace',
              }}>
                Cell {stats?.handoverDetails?.ueCellId ?? '-'}
              </span>
            </div>
          </div>
        </div>

        {/* Data Queue - 論文 4-1 Fig.1 虛擬佇列 M_c */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '14px',
          }}>
            <Activity size={20} color="#ff66aa" />
            <div style={{
              fontSize: '17px',
              color: '#ffffff',
              fontWeight: '600',
            }}>
              Data Queue (M<sub>c</sub>)
            </div>
          </div>
          <div style={{
            padding: '16px',
            backgroundColor: 'rgba(255, 102, 170, 0.08)',
            borderRadius: '10px',
            border: '1px solid rgba(255, 102, 170, 0.25)',
          }}>
            {/* Queue 進度條 */}
            <div style={{
              marginBottom: '12px',
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '6px',
              }}>
                <span style={{ fontSize: '13px', color: '#cccccc' }}>
                  Cell {stats?.handoverDetails?.ueCellId ?? '-'}
                </span>
                <span style={{
                  fontSize: '13px',
                  color: !stats ? '#888888' :
                         (stats.ueDataQueue ?? 0) > 800 ? '#ff4444' :
                         (stats.ueDataQueue ?? 0) > 400 ? '#ffaa00' : '#44ff88',
                  fontFamily: 'monospace',
                }}>
                  {stats ? `${Math.round(stats.ueDataQueue ?? 0)} / 1000` : 'Loading...'}
                </span>
              </div>
              {/* 進度條背景 */}
              <div style={{
                width: '100%',
                height: '20px',
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderRadius: '4px',
                overflow: 'hidden',
                position: 'relative',
              }}>
                {/* 進度條填充 */}
                <div style={{
                  width: stats
                    ? `${Math.min((stats.ueDataQueue ?? 0) / 1000 * 100, 100)}%`
                    : '30%',  // 加載中顯示 30%
                  height: '100%',
                  backgroundColor: !stats ? '#888888' :
                                   (stats.ueDataQueue ?? 0) > 800 ? '#ff4444' :
                                   (stats.ueDataQueue ?? 0) > 400 ? '#ffaa00' : '#44ff88',
                  borderRadius: '4px',
                  transition: 'width 0.3s ease, background-color 0.3s ease',
                }} />
              </div>
            </div>
            {/* 說明文字 */}
            <div style={{
              fontSize: '12px',
              color: '#888888',
              fontStyle: 'italic',
            }}>
              Virtual queue for handover frequency control
            </div>
          </div>
        </div>

        {/* 能耗分析 */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '8px',
          }}>
            <Zap size={20} color="#00ff88" />
            <div style={{
              fontSize: '17px',
              color: '#ffffff',
              fontWeight: '600',
            }}>
              Energy Analysis
            </div>
          </div>
          <div style={{
            fontSize: '11px',
            color: '#888888',
            marginBottom: '14px',
            fontStyle: 'italic',
          }}>
            Ntabeni et al. (2025) - {ENERGY_CONFIG.ENERGY_PER_HANDOVER}J/handover
          </div>

          {/* 當前能耗與投影 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            marginBottom: '12px',
          }}>
            {/* 當前能耗 */}
            <div style={{
              padding: '12px',
              backgroundColor: 'rgba(0, 255, 136, 0.1)',
              borderRadius: '10px',
              border: '1px solid rgba(0, 255, 136, 0.25)',
            }}>
              <div style={{ fontSize: '12px', color: '#66ffaa', marginBottom: '4px' }}>
                Current
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                <span style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  color: '#00ff88',
                  fontFamily: 'monospace',
                }}>
                  {(stats?.energyConsumption ?? 0).toFixed(1)}
                </span>
                <span style={{ fontSize: '13px', color: '#aaaaaa' }}>J</span>
              </div>
            </div>

            {/* 投影到 3000s */}
            <div style={{
              padding: '12px',
              backgroundColor: stats?.energyProjection
                ? stats.energyProjection.rating === 'excellent' ? 'rgba(0, 255, 136, 0.15)'
                : stats.energyProjection.rating === 'good' ? 'rgba(0, 200, 255, 0.15)'
                : stats.energyProjection.rating === 'average' ? 'rgba(255, 170, 0, 0.15)'
                : 'rgba(255, 68, 68, 0.15)'
                : 'rgba(100, 100, 100, 0.1)',
              borderRadius: '10px',
              border: `1px solid ${stats?.energyProjection
                ? stats.energyProjection.rating === 'excellent' ? 'rgba(0, 255, 136, 0.4)'
                : stats.energyProjection.rating === 'good' ? 'rgba(0, 200, 255, 0.4)'
                : stats.energyProjection.rating === 'average' ? 'rgba(255, 170, 0, 0.4)'
                : 'rgba(255, 68, 68, 0.4)'
                : 'rgba(100, 100, 100, 0.3)'}`,
            }}>
              <div style={{ fontSize: '12px', color: '#aaaaaa', marginBottom: '4px' }}>
                @ 3000s
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                <span style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  color: stats?.energyProjection
                    ? stats.energyProjection.rating === 'excellent' ? '#00ff88'
                    : stats.energyProjection.rating === 'good' ? '#00ccff'
                    : stats.energyProjection.rating === 'average' ? '#ffaa00'
                    : '#ff4444'
                    : '#888888',
                  fontFamily: 'monospace',
                }}>
                  {stats?.energyProjection
                    ? stats.energyProjection.projectedAt3000s.toFixed(1)
                    : '—'}
                </span>
                <span style={{ fontSize: '13px', color: '#aaaaaa' }}>J</span>
              </div>
            </div>
          </div>

          {/* Baseline 比較 */}
          <div style={{
            padding: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <div style={{
              fontSize: '12px',
              color: '#888888',
              marginBottom: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              vs Baselines @ 3000s
            </div>

            {/* EA-QL (Best) */}
            <div style={{ marginBottom: '8px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px',
              }}>
                <span style={{ fontSize: '12px', color: '#66ffaa' }}>EA-QL (Best)</span>
                <span style={{ fontSize: '12px', color: '#aaaaaa', fontFamily: 'monospace' }}>4.5 J</span>
              </div>
              <div style={{
                width: '100%',
                height: '6px',
                backgroundColor: 'rgba(0, 255, 136, 0.2)',
                borderRadius: '3px',
                overflow: 'hidden',
                position: 'relative',
              }}>
                <div style={{
                  width: `${Math.min((4.5 / 14) * 100, 100)}%`,
                  height: '100%',
                  backgroundColor: '#00ff88',
                  borderRadius: '3px',
                }} />
                {stats?.energyProjection && (
                  <div style={{
                    position: 'absolute',
                    left: `${Math.min((stats.energyProjection.projectedAt3000s / 14) * 100, 100)}%`,
                    top: '-2px',
                    width: '2px',
                    height: '10px',
                    backgroundColor: '#ffffff',
                    borderRadius: '1px',
                  }} />
                )}
              </div>
            </div>

            {/* Traditional */}
            <div style={{ marginBottom: '8px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px',
              }}>
                <span style={{ fontSize: '12px', color: '#00ccff' }}>Traditional</span>
                <span style={{ fontSize: '12px', color: '#aaaaaa', fontFamily: 'monospace' }}>6.0 J</span>
              </div>
              <div style={{
                width: '100%',
                height: '6px',
                backgroundColor: 'rgba(0, 200, 255, 0.2)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${Math.min((6.0 / 14) * 100, 100)}%`,
                  height: '100%',
                  backgroundColor: '#00ccff',
                  borderRadius: '3px',
                }} />
              </div>
            </div>

            {/* Predictive */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px',
              }}>
                <span style={{ fontSize: '12px', color: '#ff8866' }}>Predictive</span>
                <span style={{ fontSize: '12px', color: '#aaaaaa', fontFamily: 'monospace' }}>14.0 J</span>
              </div>
              <div style={{
                width: '100%',
                height: '6px',
                backgroundColor: 'rgba(255, 136, 102, 0.2)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#ff8866',
                  borderRadius: '3px',
                }} />
              </div>
            </div>

            {/* Your Method 指示器 */}
            {stats?.energyProjection && (
              <div style={{
                padding: '8px 10px',
                backgroundColor: stats.energyProjection.rating === 'excellent' ? 'rgba(0, 255, 136, 0.15)'
                  : stats.energyProjection.rating === 'good' ? 'rgba(0, 200, 255, 0.15)'
                  : stats.energyProjection.rating === 'average' ? 'rgba(255, 170, 0, 0.15)'
                  : 'rgba(255, 68, 68, 0.15)',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{
                  fontSize: '13px',
                  fontWeight: '600',
                  color: stats.energyProjection.rating === 'excellent' ? '#00ff88'
                    : stats.energyProjection.rating === 'good' ? '#00ccff'
                    : stats.energyProjection.rating === 'average' ? '#ffaa00'
                    : '#ff4444',
                }}>
                  Your Method
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: '700',
                    color: '#ffffff',
                    fontFamily: 'monospace',
                  }}>
                    {stats.energyProjection.projectedAt3000s.toFixed(1)} J
                  </span>
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: stats.energyProjection.comparison.vsTraditional.percentage < 0
                      ? 'rgba(0, 255, 136, 0.3)'
                      : 'rgba(255, 68, 68, 0.3)',
                    color: stats.energyProjection.comparison.vsTraditional.percentage < 0
                      ? '#00ff88'
                      : '#ff6666',
                    fontFamily: 'monospace',
                  }}>
                    {stats.energyProjection.comparison.vsTraditional.percentage > 0 ? '+' : ''}
                    {stats.energyProjection.comparison.vsTraditional.percentage.toFixed(0)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 論文 4-1：雙極化配置圖例 */}
        <div>
          <div style={{
            fontSize: '17px',
            color: '#ffffff',
            fontWeight: '600',
            marginBottom: '14px',
          }}>
            Polarization Config
          </div>
          <div style={{
            fontSize: '12px',
            color: '#888888',
            marginBottom: '12px',
            fontStyle: 'italic',
          }}>
            Paper 4-1: Two orthogonal polarizations
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            {[
              { color: POLARIZATION_COLORS.A, label: 'Polarization A (B1, B3...)', id: 'pol-a' },
              { color: POLARIZATION_COLORS.B, label: 'Polarization B (B2, B4...)', id: 'pol-b' },
              { color: '#aaaaaa', label: 'Not Served', id: 'not-served' },
            ].map(({ color, label, id }) => (
              <div
                key={id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                }}
              >
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '4px',
                  backgroundColor: color,
                  boxShadow: `0 0 8px ${color}66`,
                }} />
                <span style={{ color: '#dddddd', fontSize: '15px' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
