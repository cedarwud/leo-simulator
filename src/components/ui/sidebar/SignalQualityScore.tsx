import React from 'react';

interface SignalQualityScoreProps {
  value: number; // 0-100
  label: string;
  description: string;
}

export function SignalQualityScore({
  value,
  label,
  description
}: SignalQualityScoreProps) {
  // 根據分數確定顏色和評級
  const getQualityInfo = (score: number) => {
    if (score >= 80) {
      return { level: 'Excellent', color: '#00ff88', bgColor: 'rgba(0, 255, 136, 0.15)' };
    } else if (score >= 60) {
      return { level: 'Good', color: '#88ff00', bgColor: 'rgba(136, 255, 0, 0.15)' };
    } else if (score >= 40) {
      return { level: 'Fair', color: '#ffaa00', bgColor: 'rgba(255, 170, 0, 0.15)' };
    } else if (score >= 20) {
      return { level: 'Poor', color: '#ff6600', bgColor: 'rgba(255, 102, 0, 0.15)' };
    } else {
      return { level: 'Bad', color: '#ff0000', bgColor: 'rgba(255, 0, 0, 0.15)' };
    }
  };

  const qualityInfo = getQualityInfo(value);

  return (
    <div style={{
      padding: '16px',
      backgroundColor: qualityInfo.bgColor,
      borderRadius: '8px',
      border: `2px solid ${qualityInfo.color}60`,
      marginBottom: '12px'
    }}>
      {/* 標題 */}
      <div style={{
        fontSize: '15px',
        color: '#ffffff',
        fontWeight: '600',
        marginBottom: '12px'
      }}>
        {label}
      </div>

      {/* 分數和評級 */}
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '12px',
        marginBottom: '12px'
      }}>
        <div style={{
          fontSize: '48px',
          color: qualityInfo.color,
          fontWeight: '700',
          fontFamily: 'monospace',
          lineHeight: '1'
        }}>
          {value.toFixed(0)}
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <div style={{
            fontSize: '18px',
            color: '#999999',
            fontWeight: '500'
          }}>
            %
          </div>
          <div style={{
            fontSize: '16px',
            color: qualityInfo.color,
            fontWeight: '600',
            backgroundColor: `${qualityInfo.color}20`,
            padding: '4px 10px',
            borderRadius: '4px',
            border: `1px solid ${qualityInfo.color}60`
          }}>
            {qualityInfo.level}
          </div>
        </div>
      </div>

      {/* 環形進度條 */}
      <div style={{
        width: '100%',
        height: '12px',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '6px',
        overflow: 'hidden',
        marginBottom: '10px',
        position: 'relative'
      }}>
        <div style={{
          width: `${value}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${qualityInfo.color}00, ${qualityInfo.color})`,
          transition: 'width 0.5s ease',
          boxShadow: `0 0 15px ${qualityInfo.color}80`
        }} />
      </div>

      {/* 說明 */}
      <div style={{
        fontSize: '13px',
        color: '#bbbbbb',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <span style={{ color: qualityInfo.color }}>▲</span>
        {description}
      </div>
    </div>
  );
}
