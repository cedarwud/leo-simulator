import React from 'react';
import { HandoverStats } from '@/types/handover-method';
import { DualSemiCircleGauge } from '../SemiCircleGauge';
import { A4EventMonitor } from './A4EventMonitor';
import { CandidateList } from './CandidateList';

interface RSRPMethodPanelProps {
  stats: HandoverStats;
  constellation?: 'starlink' | 'oneweb';
}

// 格式化衛星 ID：添加星座前綴
const formatSatelliteId = (satId: string | null, constellation: string = 'starlink'): string => {
  if (!satId) return '無連接';

  const match = satId.match(/^(?:sat-)?(\d+)$/);
  if (!match) return satId;

  const number = match[1];
  const prefix = constellation === 'starlink' ? 'Starlink' : 'OneWeb';
  return `${prefix}-${number}`;
}

export function RSRPMethodPanel({ stats, constellation = 'starlink' }: RSRPMethodPanelProps) {
  // A4 事件數據
  const a4Event = stats.a3Event; // 實際上使用的是 A4 事件，變數名稱是歷史遺留
  const hasA4Event = a4Event !== undefined;

  // 準備候選衛星列表
  // 注意：candidatesAboveThreshold 只包含 satelliteId 和 rsrp
  // elevation 和 distance 需要從其他地方獲取（暫時不顯示）
  const candidates = a4Event?.candidatesAboveThreshold?.map(candidate => ({
    id: candidate.satelliteId,
    rsrp: candidate.rsrp,
    meetsA4: true
  })) || [];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    }}>
      {/* 信號品質監測 */}
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
            backgroundColor: '#0088ff',
            boxShadow: '0 0 10px #0088ff'
          }} />
          <div style={{
            color: '#ffffff',
            fontSize: '16px',
            fontWeight: '600',
            letterSpacing: '0.5px'
          }}>
            📡 信號品質監測
          </div>
        </div>

        {/* 幾何資訊（輔助參考） */}
        {stats.currentSatelliteElevation !== undefined && stats.currentSatelliteDistance !== undefined && (
          <div style={{
            padding: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            marginBottom: '14px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px'
          }}>
            <div>
              <div style={{
                fontSize: '13px',
                color: '#999999',
                marginBottom: '6px'
              }}>
                幾何資訊
              </div>
              <div style={{
                fontSize: '16px',
                color: '#cccccc',
                fontWeight: '500'
              }}>
                仰角: {stats.currentSatelliteElevation.toFixed(1)}°
              </div>
            </div>
            <div>
              <div style={{
                fontSize: '13px',
                color: '#999999',
                marginBottom: '6px'
              }}>
                &nbsp;
              </div>
              <div style={{
                fontSize: '16px',
                color: '#cccccc',
                fontWeight: '500'
              }}>
                距離: {stats.currentSatelliteDistance.toFixed(0)} km
              </div>
            </div>
          </div>
        )}

        {/* RSRP/RSRQ/SINR 儀表板 */}
        <div style={{ marginBottom: '14px' }}>
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
      </div>

      {/* 分隔線 */}
      <div style={{ borderTop: '2px solid rgba(255, 255, 255, 0.15)' }} />

      {/* A4 事件監測 */}
      {hasA4Event && (
        <div>
          <A4EventMonitor
            neighborRSRP={-85} // 暫時使用固定值，待後端提供
            offset={0}
            threshold={a4Event.threshold || -100}
            tttProgress={a4Event.elapsedTime / a4Event.requiredTime}
            tttElapsed={a4Event.elapsedTime}
            tttTotal={a4Event.requiredTime}
            isTriggered={a4Event.active && a4Event.elapsedTime >= a4Event.requiredTime}
            isCounting={a4Event.active && a4Event.elapsedTime < a4Event.requiredTime}
          />
        </div>
      )}

      {/* 候選衛星列表 */}
      {candidates.length > 0 && (
        <CandidateList
          candidates={candidates}
          threshold={a4Event?.threshold || -100}
          maxDisplay={5}
          bestCandidateId={a4Event?.bestCandidateId}
          constellation={constellation}
        />
      )}

      {/* 最佳候選衛星（當 A4 事件觸發且有目標衛星時顯示） */}
      {hasA4Event && a4Event.active && a4Event.targetSatelliteId && (
        <div style={{
          padding: '14px 16px',
          backgroundColor: 'rgba(0, 221, 255, 0.1)',
          borderRadius: '8px',
          border: '2px solid rgba(0, 221, 255, 0.4)',
          marginBottom: '12px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '18px' }}>⭐</span>
              <span style={{
                fontSize: '14px',
                color: '#5599cc',
                fontWeight: '600'
              }}>
                換手目標
              </span>
            </div>
            <span style={{
              fontSize: '15px',
              color: '#00ddff',
              fontWeight: '600',
              fontFamily: 'monospace'
            }}>
              {formatSatelliteId(a4Event.targetSatelliteId, constellation)}
            </span>
          </div>
        </div>
      )}

      {/* 如果沒有 A4 事件數據，顯示說明 */}
      {!hasA4Event && (
        <div style={{
          padding: '16px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '14px',
            color: '#999999',
            lineHeight: '1.6'
          }}>
            🚦 A4 事件監測
            <div style={{ marginTop: '8px' }}>
              當前信號穩定，A4 事件未觸發
            </div>
          </div>
        </div>
      )}

      {/* 論文參考 */}
      <div style={{
        marginTop: '20px',
        padding: '14px',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <div style={{
          fontSize: '12px',
          color: '#8899aa',
          lineHeight: '1.6'
        }}>
          <div style={{
            fontWeight: '600',
            marginBottom: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            📖 參考論文
          </div>
          <div style={{ paddingLeft: '20px' }}>
            Yu et al. (2022) - Performance Evaluation of Handover using A4 Event in LEO Satellites Network
          </div>
        </div>
      </div>

      {/* 可選：A4 參數調整區域 */}
      {/*
      <div style={{ marginTop: '20px' }}>
        <div style={{
          color: '#ffffff',
          fontSize: '16px',
          fontWeight: '600',
          marginBottom: '16px',
          letterSpacing: '0.5px'
        }}>
          ⚙️ A4 參數（可選）
        </div>
        <div style={{
          fontSize: '14px',
          color: '#999999',
          padding: '14px',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          A4 參數調整功能開發中
        </div>
      </div>
      */}
    </div>
  );
}
