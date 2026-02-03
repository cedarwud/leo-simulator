import React from 'react';
import { Satellite, Radio, Zap, Activity, ArrowRightLeft, Clock } from 'lucide-react';
import { FRF3_COLORS } from '../types';
import { BeamManagementStats } from '../components/BeamHoppingDemo';
import { ENERGY_CONFIG } from '@/config/energy.config';

interface BeamHoppingSidebarProps {
  /** Beam management 統計數據 */
  stats?: BeamManagementStats;
}

export function BeamHoppingSidebar({
  stats,
}: BeamHoppingSidebarProps) {
  const colors = Object.values(FRF3_COLORS);

  // 格式化時間 (秒 → MM:SS)
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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
          Intra-satellite Beam Handover
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

            {/* RSRP */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '15px', color: '#cccccc' }}>RSRP</span>
              <span style={{
                fontSize: '16px',
                fontWeight: '600',
                color: stats?.currentRSRP != null ? '#00aaff' : '#888888',
                fontFamily: 'monospace',
              }}>
                {stats?.currentRSRP != null ? `${stats.currentRSRP.toFixed(1)} dBm` : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* 換手統計 */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '14px',
          }}>
            <ArrowRightLeft size={20} color="#00aaff" />
            <div style={{
              fontSize: '17px',
              color: '#ffffff',
              fontWeight: '600',
            }}>
              Handover Statistics
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
          }}>
            {/* 波束換手 */}
            <div style={{
              padding: '14px',
              backgroundColor: 'rgba(0, 170, 255, 0.1)',
              borderRadius: '10px',
              border: '1px solid rgba(0, 170, 255, 0.25)',
            }}>
              <div style={{ fontSize: '14px', color: '#66ccff', marginBottom: '6px' }}>
                Beam Handovers
              </div>
              <div style={{
                fontSize: '32px',
                fontWeight: '700',
                color: '#00aaff',
                fontFamily: 'monospace',
              }}>
                {stats?.beamHandovers ?? 0}
              </div>
            </div>

            {/* 衛星換手 */}
            <div style={{
              padding: '14px',
              backgroundColor: 'rgba(255, 170, 0, 0.1)',
              borderRadius: '10px',
              border: '1px solid rgba(255, 170, 0, 0.25)',
            }}>
              <div style={{ fontSize: '14px', color: '#ffcc66', marginBottom: '6px' }}>
                Satellite Handovers
              </div>
              <div style={{
                fontSize: '32px',
                fontWeight: '700',
                color: '#ffaa00',
                fontFamily: 'monospace',
              }}>
                {stats?.satelliteHandovers ?? 0}
              </div>
            </div>
          </div>

          {/* 運行時間 */}
          <div style={{
            marginTop: '10px',
            padding: '12px 14px',
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <Clock size={16} color="#cccccc" />
              <span style={{ fontSize: '15px', color: '#cccccc' }}>Elapsed Time</span>
            </div>
            <span style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#ffffff',
              fontFamily: 'monospace',
            }}>
              {formatTime(stats?.elapsedTime ?? 0)}
            </span>
          </div>
        </div>

        {/* 能源效率 */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '14px',
          }}>
            <Zap size={20} color="#00ff88" />
            <div style={{
              fontSize: '17px',
              color: '#ffffff',
              fontWeight: '600',
            }}>
              Energy Consumption
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            marginBottom: '12px',
          }}>
            {/* 累積能耗 */}
            <div style={{
              padding: '14px',
              backgroundColor: 'rgba(0, 255, 136, 0.1)',
              borderRadius: '10px',
              border: '1px solid rgba(0, 255, 136, 0.25)',
            }}>
              <div style={{ fontSize: '14px', color: '#66ffaa', marginBottom: '6px' }}>
                Total Energy
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '4px',
              }}>
                <span style={{
                  fontSize: '28px',
                  fontWeight: '700',
                  color: '#00ff88',
                  fontFamily: 'monospace',
                }}>
                  {(stats?.energyConsumption ?? 0).toFixed(1)}
                </span>
                <span style={{ fontSize: '15px', color: '#aaaaaa' }}>J</span>
              </div>
            </div>

            {/* 換手頻率 */}
            <div style={{
              padding: '14px',
              backgroundColor: 'rgba(0, 255, 136, 0.1)',
              borderRadius: '10px',
              border: '1px solid rgba(0, 255, 136, 0.25)',
            }}>
              <div style={{ fontSize: '14px', color: '#66ffaa', marginBottom: '6px' }}>
                Handover Rate
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '4px',
              }}>
                <span style={{
                  fontSize: '28px',
                  fontWeight: '700',
                  color: '#00ff88',
                  fontFamily: 'monospace',
                }}>
                  {stats?.elapsedTime && stats.elapsedTime > 0
                    ? ((stats.totalHandovers / stats.elapsedTime) * 60).toFixed(1)
                    : '0.0'}
                </span>
                <span style={{ fontSize: '14px', color: '#aaaaaa' }}>/min</span>
              </div>
            </div>
          </div>

          {/* 每次換手能耗 */}
          <div style={{
            padding: '16px',
            backgroundColor: 'rgba(0, 255, 136, 0.06)',
            borderRadius: '10px',
            border: '1px solid rgba(0, 255, 136, 0.15)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: '16px', color: '#cccccc' }}>Energy per Handover</span>
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '4px',
            }}>
              <span style={{
                fontSize: '24px',
                fontWeight: '700',
                color: '#00ff88',
                fontFamily: 'monospace',
              }}>
                {ENERGY_CONFIG.ENERGY_PER_HANDOVER}
              </span>
              <span style={{ fontSize: '16px', color: '#aaaaaa' }}>J</span>
            </div>
          </div>
        </div>

        {/* 頻率複用圖例 */}
        <div>
          <div style={{
            fontSize: '17px',
            color: '#ffffff',
            fontWeight: '600',
            marginBottom: '14px',
          }}>
            Frequency Reuse (FRF3)
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            {[
              { color: colors[0], label: 'Group 0 (B0, B5, B6)', freq: 'f1' },
              { color: colors[1], label: 'Group 1 (B1, B3)', freq: 'f2' },
              { color: colors[2], label: 'Group 2 (B2, B4)', freq: 'f3' },
            ].map(({ color, label, freq }) => (
              <div
                key={freq}
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
