import React, { useState } from 'react';
import { HandoverStats } from '@/types/handover-method';
import { DualSemiCircleGauge } from '../SemiCircleGauge';
import { A4EventMonitor } from './A4EventMonitor';
import { CandidateList } from './CandidateList';
import { ParameterSlider } from './ParameterSlider';
import { RSRPHandoverConfig } from '@/utils/satellite/RSRPHandoverManager';

interface RSRPMethodPanelProps {
  stats: HandoverStats;
  constellation?: 'starlink' | 'oneweb';
  currentPhase?: string;
  onConfigChange?: (config: RSRPHandoverConfig) => void;
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

export function RSRPMethodPanel({
  stats,
  constellation = 'starlink',
  currentPhase = 'stable',
  onConfigChange
}: RSRPMethodPanelProps) {
  // 本地配置狀態
  const [localConfig, setLocalConfig] = useState<RSRPHandoverConfig>({
    a4Threshold: -100,
    timeToTrigger: 10,
    handoverCooldown: 12
  });

  // 參數變更處理
  const handleConfigChange = (key: keyof RSRPHandoverConfig, value: number) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    onConfigChange?.(newConfig);
  };

  // A4 事件數據
  const a4Event = stats.a3Event; // 使用 a3Event（歷史欄位名稱，實際是 A4 事件）
  const hasA4Event = a4Event !== undefined;

  // 準備候選衛星列表
  // 注意：candidatesAboveThreshold 只包含 satelliteId 和 rsrp
  // elevation 和 distance 需要從其他地方獲取（暫時不顯示）
  let candidates = a4Event?.candidatesAboveThreshold?.map(candidate => ({
    id: candidate.satelliteId,
    rsrp: candidate.rsrp,
    meetsA4: true
  })) || [];

  // 在換手階段，確保目標衛星包含在候選列表中（即使它不在 candidatesAboveThreshold 中）
  const isActiveHandoverPhase = ['selecting', 'establishing', 'switching', 'completing'].includes(currentPhase);
  if (isActiveHandoverPhase && a4Event?.targetSatelliteId) {
    const targetExists = candidates.some(c => c.id === a4Event.targetSatelliteId);
    if (!targetExists && stats.targetSatelliteRSRP !== undefined) {
      // 將目標衛星添加到候選列表開頭
      candidates = [{
        id: a4Event.targetSatelliteId,
        rsrp: stats.targetSatelliteRSRP,
        meetsA4: true
      }, ...candidates];
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    }}>
      {/* A4 事件監測 */}
      {hasA4Event && (
        <div>
          <A4EventMonitor
            neighborRSRP={-85} // 暫時使用固定值，待後端提供
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
          constellation={constellation}
        />
      )}

      {/* 分隔線 */}
      <div style={{ borderTop: '2px solid rgba(255, 255, 255, 0.15)' }} />

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

      {/* 分隔線 */}
      <div style={{ borderTop: '2px solid rgba(255, 255, 255, 0.15)' }} />

      {/* A4 參數調整區域 */}
      <div style={{
        padding: '20px',
        backgroundColor: 'rgba(0, 136, 255, 0.1)',
        borderRadius: '8px',
        border: '2px solid #0088ff'
      }}>
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
            ⚙️ A4 參數調整
          </div>
        </div>

        {/* A4 閾值 */}
        <ParameterSlider
          label="A4 閾值"
          value={localConfig.a4Threshold}
          min={-110}
          max={-90}
          step={1}
          unit="dBm"
          onChange={(value) => handleConfigChange('a4Threshold', value)}
          tooltip="RSRP 絕對閾值，超過此值的衛星成為候選"
          impact="數值越低越容易觸發換手"
          color="#0088ff"
        />

        {/* Time-to-Trigger */}
        <ParameterSlider
          label="Time-to-Trigger"
          value={localConfig.timeToTrigger}
          min={5}
          max={20}
          step={1}
          unit="秒"
          onChange={(value) => handleConfigChange('timeToTrigger', value)}
          tooltip="事件必須持續的時間才會觸發換手"
          impact="時間越長越穩定但反應越慢"
          color="#0088ff"
        />

        {/* 換手冷卻時間 */}
        <ParameterSlider
          label="換手冷卻"
          value={localConfig.handoverCooldown}
          min={5}
          max={20}
          step={1}
          unit="秒"
          onChange={(value) => handleConfigChange('handoverCooldown', value)}
          tooltip="兩次換手之間的最小間隔時間"
          impact="避免 ping-pong 效應"
          color="#0088ff"
        />

        <div style={{
          padding: '12px',
          backgroundColor: 'rgba(0, 136, 255, 0.1)',
          borderRadius: '6px',
          border: '1px solid rgba(0, 136, 255, 0.2)',
          fontSize: '13px',
          color: '#77aaff',
          lineHeight: '1.5',
          marginTop: '12px'
        }}>
          💡 <strong>提示</strong>：調整這些參數會立即影響 RSRP 換手行為
        </div>
      </div>
    </div>
  );
}
