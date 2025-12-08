import React from 'react';

interface DecisionFactorCardProps {
  label: string;
  value: number;
  weight: number; // 0-1
  unit: string;
  max: number;
  color: string;
  impact: string;
}

export function DecisionFactorCard({
  label,
  value,
  weight,
  unit,
  max,
  color,
  impact
}: DecisionFactorCardProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const weightPercentage = weight * 100;

  return (
    <div style={{
      padding: '14px',
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      borderRadius: '8px',
      border: `1px solid ${color}40`,
      marginBottom: '12px'
    }}>
      {/* 標題和權重 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px'
      }}>
        <div style={{
          fontSize: '15px',
          color: '#ffffff',
          fontWeight: '600'
        }}>
          {label}
        </div>
        <div style={{
          fontSize: '13px',
          color: color,
          fontWeight: '600',
          backgroundColor: `${color}20`,
          padding: '4px 10px',
          borderRadius: '4px',
          border: `1px solid ${color}60`
        }}>
          ⭐ {weightPercentage.toFixed(0)}% Weight
        </div>
      </div>

      {/* 數值顯示 */}
      <div style={{
        fontSize: '32px',
        color: color,
        fontWeight: '700',
        fontFamily: 'monospace',
        marginBottom: '8px'
      }}>
        {value.toFixed(1)} {unit}
      </div>

      {/* 進度條 */}
      <div style={{
        width: '100%',
        height: '8px',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '4px',
        overflow: 'hidden',
        marginBottom: '8px'
      }}>
        <div style={{
          width: `${percentage}%`,
          height: '100%',
          backgroundColor: color,
          transition: 'width 0.3s ease',
          boxShadow: `0 0 10px ${color}80`
        }} />
      </div>

      {/* 影響說明 */}
      <div style={{
        fontSize: '13px',
        color: '#bbbbbb',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <span style={{ color: color }}>▲</span>
        {impact}
      </div>
    </div>
  );
}
