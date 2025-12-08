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
  // Note: animationSpeed and candidateCount moved to CommonVisualControls
}

// Default configuration
const DEFAULT_CONFIG: GeometricConfig = {
  elevationWeight: 0.7,
  triggerElevation: 45,
  handoverCooldown: 5
};

// Preset configuration options
const PRESET_CONFIGS = {
  conservative: {
    name: 'Conservative',
    desc: 'Reduce handovers, prioritize stability',
    elevationWeight: 0.8,
    triggerElevation: 35,
    handoverCooldown: 10
  },
  balanced: {
    name: 'Balanced',
    desc: 'Current recommended settings',
    elevationWeight: 0.7,
    triggerElevation: 45,
    handoverCooldown: 5
  },
  aggressive: {
    name: 'Aggressive',
    desc: 'Fast reaction, frequent handovers',
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

  // Calculate signal quality score (based on elevation and distance)
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
            🎯 Decision Parameters Visualization
          </div>
        </div>

        {/* 仰角因素 */}
        <DecisionFactorCard
          label="Elevation"
          value={elevation}
          weight={config.elevationWeight}
          unit="°"
          max={90}
          color="#00ff88"
          impact="Primary decision factor"
        />

        {/* 距離因素 */}
        <DecisionFactorCard
          label="Distance"
          value={distance}
          weight={1 - config.elevationWeight}
          unit="km"
          max={2000}
          color="#0088ff"
          impact="Secondary decision factor"
        />

        {/* 信號品質分數 */}
        <SignalQualityScore
          value={signalQuality}
          label="Signal Quality Score"
          description="Comprehensive score based on elevation and distance"
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
              ⚙️ Parameter Adjustment
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
            <option value="">Quick Config ▼</option>
            <option value="conservative">Conservative</option>
            <option value="balanced">Balanced</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </div>

        {/* 核心參數 */}
        <ParameterSlider
          label="Elevation Weight"
          value={config.elevationWeight}
          min={0.5}
          max={0.9}
          step={0.05}
          unit="%"
          onChange={(value) => updateConfig({ elevationWeight: value })}
          tooltip="Prioritize high elevation vs close distance. Higher value favors high elevation (more stable)."
          impact="Prioritize high elevation satellites"
          color="#00ff88"
        />

        <ParameterSlider
          label="Trigger Elevation"
          value={config.triggerElevation}
          min={30}
          max={60}
          step={5}
          unit="°"
          onChange={(value) => updateConfig({ triggerElevation: value })}
          tooltip="Start looking for new satellites when elevation drops below this. Higher value = earlier handover."
          impact="Higher value = earlier handover"
          color="#00ff88"
        />

        <ParameterSlider
          label="Handover Cooldown"
          value={config.handoverCooldown}
          min={3}
          max={15}
          step={1}
          unit="s"
          onChange={(value) => updateConfig({ handoverCooldown: value })}
          tooltip="Min interval between handovers to prevent ping-pong. Longer time = more stable."
          impact="Prevent frequent handovers"
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
          Advanced Settings {showAdvanced ? '(Click to collapse)' : '(Click to expand)'}
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
              Advanced settings under development:
              <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                <li>Preparing Elevation Threshold (20-50°)</li>
                <li>Execution Elevation Threshold (10-30°)</li>
                <li>Max Distance Normalization (1000-3000 km)</li>
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
          🔄 Reset to Default
        </button>
      </div>
    </div>
  );
}
