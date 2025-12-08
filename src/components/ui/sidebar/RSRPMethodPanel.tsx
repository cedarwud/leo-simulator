import React, { useState } from 'react';
import { HandoverStats } from '@/types/handover-method';
import { DualSemiCircleGauge } from '../SemiCircleGauge';
import { A4EventMonitor } from './A4EventMonitor';
import { CandidateList, CandidateItem, Candidate } from './CandidateList';
import { ParameterSlider } from './ParameterSlider';
import { RSRPHandoverConfig } from '@/utils/satellite/RSRPHandoverManager';

const STATIC_CANDIDATE_COLORS = ['#3b4455', '#4a5568', '#374151', '#2f3947', '#223040'];

interface RSRPMethodPanelProps {
  stats: HandoverStats;
  constellation?: 'starlink' | 'oneweb';
  currentPhase?: string;
  currentSatelliteId?: string | null;
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
  currentSatelliteId,
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
  const visibleCandidateIds = stats.candidateSatellites || [];

  // 準備候選衛星列表：只展示畫面上有連線的候選
  const candidatesFromEvent = a4Event?.candidatesAboveThreshold || [];
  const candidates: Array<{ id: string; rsrp: number; meetsA4: boolean }> = Array.from(new Set(visibleCandidateIds)).map((id) => {
    const match = candidatesFromEvent.find(c => c.satelliteId === id);
    return {
      id,
      rsrp: match?.rsrp ?? stats.averageRSRP ?? -95,
      meetsA4: !!match
    };
  });

  // 找出有效的目標衛星 ID
  // 1. Completing 階段：換手已完成但動畫仍在進行，此時目標已變成當前衛星
  // 2. 其他階段：優先使用鎖定的目標 (root > event)，最後回退到最佳候選
  // 注意：這裡確保了 UI 邊框與 3D 場景中的連線完全同步
  let effectiveTargetId: string | null | undefined = stats.targetSatelliteId || a4Event?.targetSatelliteId || a4Event?.bestCandidateId;
  
  // 當前階段如果是 completing，表示視覺上只剩下一條連線 (當前連線)，
  // 此時不應該在候選列表中顯示邊框，因為它已經成為當前連接而非候選。
  if (currentPhase === 'completing') {
    effectiveTargetId = null;
  }

  // 判斷是否處於任何與換手相關的階段 (包括準備階段)
  const isHandoverRelatedPhase = ['preparing', 'selecting', 'establishing', 'switching', 'completing'].includes(currentPhase);

  // 確保當前連接的衛星也出現在列表中（供辨識角色，即使暫時沒有列在候選清單）
  if (currentSatelliteId && !candidates.some(c => c.id === currentSatelliteId)) {
    candidates.unshift({
      id: currentSatelliteId,
      rsrp: stats.averageRSRP ?? -95,
      meetsA4: true
    });
  }
  // 若目標衛星正在換手，確保出現在列表中
  if (isHandoverRelatedPhase && effectiveTargetId && !candidates.some(c => c.id === effectiveTargetId)) {
    candidates.unshift({
      id: effectiveTargetId,
      rsrp: stats.targetSatelliteRSRP ?? stats.averageRSRP ?? -95,
      meetsA4: true
    });
  }

  // 對候選列表進行排序：
  // 1. 當前連線優先
  // 2. 目標連線次之
  // 3. 其餘按 RSRP 由高到低排序
  candidates.sort((a, b) => {
    const isCurrentA = currentSatelliteId && a.id === currentSatelliteId;
    const isCurrentB = currentSatelliteId && b.id === currentSatelliteId;
    if (isCurrentA && !isCurrentB) return -1;
    if (!isCurrentA && isCurrentB) return 1;

    const isTargetA = effectiveTargetId && a.id === effectiveTargetId;
    const isTargetB = effectiveTargetId && b.id === effectiveTargetId;
    if (isTargetA && !isTargetB) return -1;
    if (!isTargetA && isTargetB) return 1;

    return b.rsrp - a.rsrp;
  });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    }}>
      {/* 候選衛星列表 */}
      {candidates.length > 0 && (
        <CandidateList
          candidates={candidates}
          threshold={a4Event?.threshold || -100}
          maxDisplay={5}
          constellation={constellation}
          targetSatelliteId={effectiveTargetId || null}
          currentSatelliteId={currentSatelliteId || null}
          currentPhase={currentPhase}
          visibleCandidateIds={stats.candidateSatellites || []}
        />
      )}

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
            📡 Signal Quality Monitor
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
                Geometric Info
              </div>
              <div style={{
                fontSize: '16px',
                color: '#cccccc',
                fontWeight: '500'
              }}>
                Elevation: {stats.currentSatelliteElevation.toFixed(1)}°
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
                Distance: {stats.currentSatelliteDistance.toFixed(0)} km
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
              { threshold: -100, color: '#ff0000', label: 'Bad' },
              { threshold: -80, color: '#ff6600', label: 'Handover Req' },
              { threshold: -65, color: '#ffaa00', label: 'Handover Rec' },
              { threshold: -55, color: '#88ff00', label: 'Good' },
              { threshold: -50, color: '#00ff88', label: 'Excellent' }
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
              { threshold: -19, color: '#ff0000', label: 'Bad' },
              { threshold: -15, color: '#ffaa00', label: 'Handover Rec' },
              { threshold: -10, color: '#00ff88', label: 'Excellent' }
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
              { threshold: -5, color: '#ff0000', label: 'Bad' },
              { threshold: 10, color: '#ffaa00', label: 'Handover Rec' },
              { threshold: 20, color: '#00ff88', label: 'Excellent' }
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
                Handover Target
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
            🚦 A4 Event Monitor
            <div style={{ marginTop: '8px' }}>
              Signal stable, A4 event not triggered
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
            ⚙️ A4 Parameter Adjustment
          </div>
        </div>

        {/* A4 閾值 */}
        <ParameterSlider
          label="A4 Threshold"
          value={localConfig.a4Threshold}
          min={-110}
          max={-90}
          step={1}
          unit="dBm"
          onChange={(value) => handleConfigChange('a4Threshold', value)}
          tooltip="Absolute RSRP threshold. Satellites above this become candidates."
          impact="Lower value = easier to trigger handover"
          color="#0088ff"
        />

        {/* Time-to-Trigger */}
        <ParameterSlider
          label="Time-to-Trigger"
          value={localConfig.timeToTrigger}
          min={5}
          max={20}
          step={1}
          unit="s"
          onChange={(value) => handleConfigChange('timeToTrigger', value)}
          tooltip="Duration the event must persist to trigger handover."
          impact="Longer time = more stable but slower reaction."
          color="#0088ff"
        />

        {/* 換手冷卻時間 */}
        <ParameterSlider
          label="Handover Cooldown"
          value={localConfig.handoverCooldown}
          min={5}
          max={20}
          step={1}
          unit="s"
          onChange={(value) => handleConfigChange('handoverCooldown', value)}
          tooltip="Minimum interval between handovers."
          impact="Avoid ping-pong effect."
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
          💡 <strong>Hint</strong>: Adjusting these parameters immediately affects RSRP handover behavior.
        </div>
      </div>
    </div>
  );
}
