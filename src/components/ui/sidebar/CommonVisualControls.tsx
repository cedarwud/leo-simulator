import React from 'react';
import { ParameterSlider } from './ParameterSlider';

interface CommonVisualControlsProps {
  animationSpeed: 'fast' | 'normal' | 'slow';
  candidateCount: number;
  onAnimationSpeedChange: (speed: 'fast' | 'normal' | 'slow') => void;
  onCandidateCountChange: (count: number) => void;
}

export function CommonVisualControls({
  animationSpeed,
  candidateCount,
  onAnimationSpeedChange,
  onCandidateCountChange
}: CommonVisualControlsProps) {
  return (
    <div style={{
      padding: '20px',
      backgroundColor: 'rgba(0, 136, 255, 0.1)',
      borderRadius: '8px',
      border: '2px solid #0088ff'
    }}>
      {/* 調試：明顯的標題 */}
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
          🎨 Visual Settings
        </div>
      </div>

      {/* 換手速度 */}
      <div style={{
        padding: '14px',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: '12px'
      }}>
        <div style={{
          fontSize: '15px',
          color: '#ffffff',
          fontWeight: '500',
          marginBottom: '12px'
        }}>
          Handover Animation Speed
        </div>
        <div style={{
          display: 'flex',
          gap: '8px'
        }}>
          {(['fast', 'normal', 'slow'] as const).map((speed) => (
            <button
              key={speed}
              onClick={() => onAnimationSpeedChange(speed)}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: animationSpeed === speed
                  ? 'rgba(0, 136, 255, 0.2)'
                  : 'rgba(255, 255, 255, 0.05)',
                border: animationSpeed === speed
                  ? '2px solid #0088ff'
                  : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                color: animationSpeed === speed ? '#0088ff' : '#cccccc',
                fontSize: '14px',
                fontWeight: animationSpeed === speed ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                outline: 'none'
              }}
              onMouseEnter={(e) => {
                if (animationSpeed !== speed) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (animationSpeed !== speed) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                }
              }}
            >
              {speed === 'fast' ? '⚡ Fast' : speed === 'normal' ? '🎯 Normal' : '🐢 Slow'}
            </button>
          ))}
        </div>
        <div style={{
          fontSize: '13px',
          color: '#999999',
          marginTop: '10px',
          paddingLeft: '4px'
        }}>
          └─ Impact: Speed of phase transitions (logic unaffected)
        </div>
      </div>

      {/* 候選衛星數量 */}
      <ParameterSlider
        label="Show Candidates"
        value={candidateCount}
        min={3}
        max={10}
        step={1}
        unit="sats"
        onChange={onCandidateCountChange}
        tooltip="Number of candidates shown in preparing phase (visual only)"
        impact="Show more/less candidate links"
        color="#0088ff"
      />

      <div style={{
        padding: '12px',
        backgroundColor: 'rgba(0, 136, 255, 0.1)',
        borderRadius: '6px',
        border: '1px solid rgba(0, 136, 255, 0.2)',
        fontSize: '13px',
        color: '#aaccff',
        lineHeight: '1.5'
      }}>
        💡 <strong>Hint</strong>: Settings apply to all methods, visual only.
      </div>
    </div>
  );
}
