import React, { useState } from 'react';
import { HandoverStats } from '@/types/handover-method';
import { DecisionFactorCard } from './DecisionFactorCard';
import { SignalQualityScore } from './SignalQualityScore';
import { ParameterSlider } from './ParameterSlider';

interface GeometricMethodPanelProps {
  stats: HandoverStats;
  onConfigChange?: (config: GeometricConfig) => void;
}

export interface GeometricConfig {
  elevationWeight: number;
  triggerElevation: number;
  handoverCooldown: number;
  // 注意：animationSpeed 和 candidateCount 已移至 CommonVisualControls
}

// 預設配置
const DEFAULT_CONFIG: GeometricConfig = {
  elevationWeight: 0.7,
  triggerElevation: 45,
  handoverCooldown: 5
};

// 預設配置選項
const PRESET_CONFIGS = {
  conservative: {
    name: '保守模式',
    desc: '減少換手，優先穩定',
    elevationWeight: 0.8,
    triggerElevation: 35,
    handoverCooldown: 10
  },
  balanced: {
    name: '平衡模式',
    desc: '當前推薦設定',
    elevationWeight: 0.7,
    triggerElevation: 45,
    handoverCooldown: 5
  },
  aggressive: {
    name: '激進模式',
    desc: '快速反應，頻繁換手',
    elevationWeight: 0.6,
    triggerElevation: 50,
    handoverCooldown: 3
  }
};

export function GeometricMethodPanel({ stats, onConfigChange }: GeometricMethodPanelProps) {
  const [config, setConfig] = useState<GeometricConfig>(DEFAULT_CONFIG);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateConfig = (updates: Partial<GeometricConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onConfigChange?.(newConfig);
  };

  const applyPreset = (presetKey: keyof typeof PRESET_CONFIGS) => {
    const preset = PRESET_CONFIGS[presetKey];
    updateConfig({
      elevationWeight: preset.elevationWeight,
      triggerElevation: preset.triggerElevation,
      handoverCooldown: preset.handoverCooldown
    });
  };

  // 計算當前衛星的信號品質分數（基於仰角和距離）
  const calculateSignalQuality = () => {
    if (!stats.currentSatelliteElevation || !stats.currentSatelliteDistance) {
      return 0;
    }
    const elevationFactor = Math.max(0, stats.currentSatelliteElevation / 90);
    const distanceFactor = Math.max(0, 1 - (stats.currentSatelliteDistance / 2000));
    return (elevationFactor * config.elevationWeight + distanceFactor * (1 - config.elevationWeight)) * 100;
  };

  const signalQuality = calculateSignalQuality();
  const elevation = stats.currentSatelliteElevation ?? 0;
  const distance = stats.currentSatelliteDistance ?? 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    }}>
      {/* 決策參數可視化 */}
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
            backgroundColor: '#00ff88',
            boxShadow: '0 0 10px #00ff88'
          }} />
          <div style={{
            color: '#ffffff',
            fontSize: '16px',
            fontWeight: '600',
            letterSpacing: '0.5px'
          }}>
            🎯 決策參數可視化
          </div>
        </div>

        {/* 仰角因素 */}
        <DecisionFactorCard
          label="仰角"
          value={elevation}
          weight={config.elevationWeight}
          unit="°"
          max={90}
          color="#00ff88"
          impact="決策主要因素"
        />

        {/* 距離因素 */}
        <DecisionFactorCard
          label="距離"
          value={distance}
          weight={1 - config.elevationWeight}
          unit="km"
          max={2000}
          color="#0088ff"
          impact="輔助決策因素"
        />

        {/* 信號品質分數 */}
        <SignalQualityScore
          value={signalQuality}
          label="信號品質分數"
          description="基於仰角和距離的綜合評分"
        />
      </div>

      {/* 分隔線 */}
      <div style={{ borderTop: '2px solid rgba(255, 255, 255, 0.15)' }} />

      {/* 參數調整 */}
      <div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <div style={{
              color: '#ffffff',
              fontSize: '16px',
              fontWeight: '600',
              letterSpacing: '0.5px'
            }}>
              ⚙️ 參數調整
            </div>
          </div>
          {/* 預設配置選擇器 */}
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                applyPreset(e.target.value as keyof typeof PRESET_CONFIGS);
              }
            }}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              padding: '6px 10px',
              color: '#ffffff',
              fontSize: '13px',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="">快速配置 ▼</option>
            <option value="conservative">保守模式</option>
            <option value="balanced">平衡模式</option>
            <option value="aggressive">激進模式</option>
          </select>
        </div>

        {/* 核心參數 */}
        <ParameterSlider
          label="仰角重要性"
          value={config.elevationWeight}
          min={0.5}
          max={0.9}
          step={0.05}
          unit="%"
          onChange={(value) => updateConfig({ elevationWeight: value })}
          tooltip="決定換手時優先選擇高仰角還是近距離的衛星。數值越高，越優先選擇高仰角衛星（更穩定）"
          impact="優先選擇高仰角衛星"
          color="#00ff88"
        />

        <ParameterSlider
          label="開始換手仰角"
          value={config.triggerElevation}
          min={30}
          max={60}
          step={5}
          unit="°"
          onChange={(value) => updateConfig({ triggerElevation: value })}
          tooltip="當前衛星仰角低於此值時，系統開始尋找新衛星。數值越大，越早開始換手"
          impact="數值越大越早換手"
          color="#00ff88"
        />

        <ParameterSlider
          label="換手冷卻時間"
          value={config.handoverCooldown}
          min={3}
          max={15}
          step={1}
          unit="秒"
          onChange={(value) => updateConfig({ handoverCooldown: value })}
          tooltip="兩次換手之間的最短間隔時間，用於防止頻繁切換（Ping-Pong）。時間越長，系統越穩定"
          impact="防止頻繁換手"
          color="#ffaa00"
        />

        {/* 視覺參數（換手速度、候選數量）已移至共用區域 */}

        {/* 高級設定（可展開） */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            color: '#cccccc',
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            outline: 'none'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
          }}
        >
          <span>{showAdvanced ? '🔼' : '🔽'}</span>
          高級設定 {showAdvanced ? '（點擊收起）' : '（點擊展開）'}
        </button>

        {showAdvanced && (
          <div style={{
            marginTop: '12px',
            padding: '14px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <div style={{
              fontSize: '14px',
              color: '#999999',
              lineHeight: '1.6'
            }}>
              高級設定功能開發中，將包含：
              <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                <li>準備仰角閾值（20-50°）</li>
                <li>執行仰角閾值（10-30°）</li>
                <li>最大距離歸一化（1000-3000 km）</li>
              </ul>
            </div>
          </div>
        )}

        {/* 重置按鈕 */}
        <button
          onClick={() => {
            setConfig(DEFAULT_CONFIG);
            onConfigChange?.(DEFAULT_CONFIG);
          }}
          style={{
            width: '100%',
            padding: '12px',
            marginTop: '12px',
            backgroundColor: 'rgba(255, 102, 0, 0.2)',
            border: '1px solid rgba(255, 102, 0, 0.4)',
            borderRadius: '6px',
            color: '#ff6600',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            outline: 'none'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 102, 0, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 102, 0, 0.2)';
          }}
        >
          🔄 重置為預設值
        </button>
      </div>
    </div>
  );
}
