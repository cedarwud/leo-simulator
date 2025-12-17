import React from 'react';
import { HandoverMethodType, HandoverStats } from '@/types/handover-method';
import { ENERGY_CONFIG, calculateEnergySavings, ENERGY_ACADEMIC_REFERENCES } from '@/config/energy.config';

interface EnergyEfficiencyPanelProps {
  stats: HandoverStats;
  currentMethod: HandoverMethodType;
  methodColor: string;
}

/**
 * Energy Efficiency Panel
 *
 * 展示 LEO 衛星換手的能耗效率指標
 * 基於 Ntabeni et al. (2025) Energy-Aware Q-Learning 論文
 *
 * 主要指標:
 * - 累積能耗 (Joules)
 * - 平均功率 (Watts)
 * - 節能效果對比 (vs Geometric baseline)
 */
export function EnergyEfficiencyPanel({
  stats,
  currentMethod,
  methodColor
}: EnergyEfficiencyPanelProps) {
  // 計算節能效果（以 Geometric 為基準）
  const savings = calculateEnergySavings(
    stats.energyConsumption,
    stats.totalHandovers,
    'geometric'
  );

  // 根據模擬時間歸一化預期能耗（用於對比）
  // 論文基準數據是 3000 秒的數據
  const normalizedTime = stats.elapsedTime;
  const baseline = ENERGY_CONFIG.BASELINE_DATA[currentMethod];
  const expectedEnergyAt3000s = baseline.energyAt3000s;

  // 計算當前方法相對於 Geometric 的理論節能率
  const geometricBaseline = ENERGY_CONFIG.BASELINE_DATA.geometric;
  const theoreticalSavingsPercent = currentMethod !== 'geometric'
    ? ((geometricBaseline.energyAt3000s - expectedEnergyAt3000s) / geometricBaseline.energyAt3000s) * 100
    : 0;

  return (
    <div>
      {/* 標題 */}
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
          backgroundColor: '#00ff88',
          boxShadow: '0 0 10px #00ff88'
        }} />
        <div style={{
          color: '#ffffff',
          fontSize: '16px',
          fontWeight: '600',
          letterSpacing: '0.5px'
        }}>
          Energy Efficiency
        </div>
      </div>

      {/* 主要能耗指標 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '10px',
        marginBottom: '12px'
      }}>
        {/* 累積能耗 */}
        <div style={{
          padding: '14px',
          backgroundColor: 'rgba(0, 255, 136, 0.08)',
          borderRadius: '8px',
          border: '1px solid rgba(0, 255, 136, 0.2)'
        }}>
          <div style={{ fontSize: '12px', color: '#00ff88', marginBottom: '4px', opacity: 0.8 }}>
            Total Energy
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '4px'
          }}>
            <div style={{
              fontSize: '24px',
              color: '#00ff88',
              fontWeight: '600',
              fontFamily: 'monospace'
            }}>
              {stats.energyConsumption.toFixed(1)}
            </div>
            <div style={{ fontSize: '14px', color: '#999999' }}>J</div>
          </div>
        </div>

        {/* 平均功率 */}
        <div style={{
          padding: '14px',
          backgroundColor: 'rgba(0, 255, 136, 0.08)',
          borderRadius: '8px',
          border: '1px solid rgba(0, 255, 136, 0.2)'
        }}>
          <div style={{ fontSize: '12px', color: '#00ff88', marginBottom: '4px', opacity: 0.8 }}>
            Avg Power
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '4px'
          }}>
            <div style={{
              fontSize: '24px',
              color: '#00ff88',
              fontWeight: '600',
              fontFamily: 'monospace'
            }}>
              {((stats.averageEnergyPerSecond ?? 0) * 1000).toFixed(1)}
            </div>
            <div style={{ fontSize: '14px', color: '#999999' }}>mW</div>
          </div>
        </div>
      </div>

      {/* 每次換手能耗 */}
      <div style={{
        padding: '12px 14px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: '12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ fontSize: '13px', color: '#bbbbbb' }}>
          Energy per Handover
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '4px'
        }}>
          <span style={{
            fontSize: '18px',
            color: '#ffffff',
            fontWeight: '600',
            fontFamily: 'monospace'
          }}>
            {stats.energyPerHandover.toFixed(0)}
          </span>
          <span style={{ fontSize: '13px', color: '#999999' }}>J</span>
        </div>
      </div>

      {/* 節能效果對比卡片（僅非 Geometric 方法顯示） */}
      {currentMethod !== 'geometric' && (
        <div style={{
          padding: '14px',
          backgroundColor: savings.isEnergyEfficient
            ? 'rgba(0, 255, 136, 0.1)'
            : 'rgba(255, 136, 0, 0.1)',
          borderRadius: '8px',
          border: savings.isEnergyEfficient
            ? '1px solid rgba(0, 255, 136, 0.3)'
            : '1px solid rgba(255, 136, 0, 0.3)',
          marginBottom: '12px'
        }}>
          <div style={{
            fontSize: '12px',
            color: '#999999',
            marginBottom: '10px'
          }}>
            vs Geometric Baseline (Theory)
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            {/* 預期節能效果 */}
            <div>
              <div style={{ fontSize: '11px', color: '#888888', marginBottom: '4px' }}>
                Expected Savings
              </div>
              <div style={{
                fontSize: '22px',
                fontWeight: '600',
                fontFamily: 'monospace',
                color: theoreticalSavingsPercent > 0 ? '#00ff88' : '#ff8800'
              }}>
                {theoreticalSavingsPercent > 0 ? '-' : '+'}
                {Math.abs(theoreticalSavingsPercent).toFixed(0)}%
              </div>
            </div>

            {/* 預期換手減少 */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#888888', marginBottom: '4px' }}>
                Handover Reduction
              </div>
              <div style={{
                fontSize: '22px',
                fontWeight: '600',
                fontFamily: 'monospace',
                color: '#00ff88'
              }}>
                -65.9%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 學術參考 */}
      <div style={{
        padding: '10px 12px',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '6px',
        border: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        <div style={{
          fontSize: '10px',
          color: '#666666',
          lineHeight: '1.5'
        }}>
          <div style={{ marginBottom: '4px' }}>
            <span style={{ color: '#888888' }}>Energy Model: </span>
            {ENERGY_ACADEMIC_REFERENCES.primary.authors} ({ENERGY_ACADEMIC_REFERENCES.primary.year})
          </div>
          <div>
            <span style={{ color: '#888888' }}>E_handover = </span>
            {ENERGY_CONFIG.ENERGY_PER_HANDOVER}J
            <span style={{ color: '#555555' }}> [Chen et al., 2019]</span>
          </div>
        </div>
      </div>
    </div>
  );
}
