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
          🎨 視覺設定（通用）
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
          換手動畫速度
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
              {speed === 'fast' ? '⚡ 快速' : speed === 'normal' ? '🎯 正常' : '🐢 慢速'}
            </button>
          ))}
        </div>
        <div style={{
          fontSize: '13px',
          color: '#999999',
          marginTop: '10px',
          paddingLeft: '4px'
        }}>
          └─ 影響：換手階段過渡的速度（不影響決策邏輯）
        </div>
      </div>

      {/* 候選衛星數量 */}
      <ParameterSlider
        label="顯示候選數量"
        value={candidateCount}
        min={3}
        max={10}
        step={1}
        unit="顆"
        onChange={onCandidateCountChange}
        tooltip="準備階段顯示的候選衛星數量（僅影響視覺顯示，不影響換手決策）"
        impact="畫面顯示更多/更少候選連線"
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
        💡 <strong>提示</strong>：這些設定對所有換手方法都有效，僅影響視覺呈現，不改變實際換手決策邏輯
      </div>
    </div>
  );
}
