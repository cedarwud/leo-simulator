import React from 'react';
import { ParameterSlider } from './ParameterSlider';

interface GlobalControlsProps {
  timeSpeed: number;
  animationSpeed: 'fast' | 'normal' | 'slow';
  candidateCount: number;
  onTimeSpeedChange: (speed: number) => void;
  onAnimationSpeedChange: (speed: 'fast' | 'normal' | 'slow') => void;
  onCandidateCountChange: (count: number) => void;
}

export function GlobalControls({
  timeSpeed,
  animationSpeed,
  candidateCount,
  onTimeSpeedChange,
  onAnimationSpeedChange,
  onCandidateCountChange
}: GlobalControlsProps) {
  const timeSpeedOptions = [
    { value: 1, label: '1x', icon: '🐌' },
    { value: 2, label: '2x', icon: '🚶' },
    { value: 3, label: '3x', icon: '🏃' },
    { value: 5, label: '5x', icon: '🚀' },
    { value: 10, label: '10x', icon: '⚡' }
  ];

  return (
    <div style={{
      padding: '20px',
      backgroundColor: 'rgba(255, 136, 0, 0.1)',
      borderRadius: '8px',
      border: '2px solid #ff8800'
    }}>
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
          backgroundColor: '#ff8800',
          boxShadow: '0 0 10px #ff8800'
        }} />
        <div style={{
          color: '#ffffff',
          fontSize: '16px',
          fontWeight: '600',
          letterSpacing: '0.5px'
        }}>
          ⚙️ Global Controls
        </div>
      </div>

      {/* 時間速度控制 */}
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
          ⏱️ Simulation Speed
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '6px'
        }}>
          {timeSpeedOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onTimeSpeedChange(option.value)}
              style={{
                padding: '8px 4px',
                backgroundColor: timeSpeed === option.value
                  ? 'rgba(255, 136, 0, 0.2)'
                  : 'rgba(255, 255, 255, 0.05)',
                border: timeSpeed === option.value
                  ? '2px solid #ff8800'
                  : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                color: timeSpeed === option.value ? '#ff8800' : '#cccccc',
                fontSize: '13px',
                fontWeight: timeSpeed === option.value ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                outline: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px'
              }}
              onMouseEnter={(e) => {
                if (timeSpeed !== option.value) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (timeSpeed !== option.value) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                }
              }}
            >
              <span style={{ fontSize: '16px' }}>{option.icon}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        <div style={{
          fontSize: '12px',
          color: '#999999',
          marginTop: '10px',
          paddingLeft: '4px'
        }}>
          └─ Controls time flow of satellite motion and handover logic
        </div>
      </div>

      {/* 動畫速度控制 */}
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
          🎬 Handover Animation Speed
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
                  ? 'rgba(255, 136, 0, 0.2)'
                  : 'rgba(255, 255, 255, 0.05)',
                border: animationSpeed === speed
                  ? '2px solid #ff8800'
                  : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                color: animationSpeed === speed ? '#ff8800' : '#cccccc',
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
          fontSize: '12px',
          color: '#999999',
          marginTop: '10px',
          paddingLeft: '4px'
        }}>
          └─ Controls visual speed of phase transitions
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
        color="#ff8800"
      />

      <div style={{
        padding: '12px',
        backgroundColor: 'rgba(255, 136, 0, 0.1)',
        borderRadius: '6px',
        border: '1px solid rgba(255, 136, 0, 0.2)',
        fontSize: '13px',
        color: '#ffbb77',
        lineHeight: '1.5',
        marginTop: '12px'
      }}>
        💡 <strong>Hint</strong>: Settings apply to all methods
      </div>
    </div>
  );
}
