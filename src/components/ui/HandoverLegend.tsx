import React from 'react';

interface HandoverLegendProps {
  phase: string;
  show: boolean;
}

/**
 * 換手連線圖例 - 只在換手階段顯示
 */
export function HandoverLegend({ phase, show }: HandoverLegendProps) {
  if (!show) return null;

  // 根據階段顯示相關的圖例項目
  const getLegendItems = () => {
    switch (phase) {
      case 'preparing':
        return [
          { color: '#ffaa00', label: 'Current Link (Weakening)', type: 'solid' },
          { color: '#88aaff', label: 'Candidate Satellite', type: 'dashed' }
        ];
      case 'selecting':
        return [
          { color: '#ffaa00', label: 'Current Link', type: 'solid' },
          { color: '#00aaff', label: 'Selected Target', type: 'dashed' }
        ];
      case 'establishing':
        return [
          { color: '#cc8800', label: 'Old Link (Fading)', type: 'solid' },
          { color: '#0088ff', label: 'New Link (Establishing)', type: 'solid' }
        ];
      case 'switching':
        return [
          { color: '#888888', label: 'Old Link (Disconnecting)', type: 'solid' },
          { color: '#0088ff', label: 'New Link (Taking Over)', type: 'solid' }
        ];
      case 'completing':
        return [
          { color: '#00ff88', label: 'New Link (Established)', type: 'solid' }
        ];
      default:
        return [];
    }
  };

  const items = getLegendItems();
  if (items.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '320px', // 避開右側面板
      padding: '16px 20px',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(10px)',
      borderRadius: '12px',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
      zIndex: 900,
      animation: 'fadeIn 0.3s ease-out'
    }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* 標題 */}
      <div style={{
        fontSize: '13px',
        color: '#aaaaaa',
        marginBottom: '12px',
        fontWeight: '600',
        letterSpacing: '0.5px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        🔄 Connection Status Legend
      </div>

      {/* 圖例項目 */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        {items.map((item, index) => (
          <div key={index} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            {/* 線條示例 */}
            <div style={{
              width: '40px',
              height: '3px',
              backgroundColor: item.color,
              borderRadius: '2px',
              boxShadow: `0 0 8px ${item.color}`,
              ...(item.type === 'dashed' ? {
                backgroundImage: `linear-gradient(to right, ${item.color} 50%, transparent 50%)`,
                backgroundSize: '10px 3px',
                backgroundColor: 'transparent'
              } : {})
            }} />

            {/* 說明文字 */}
            <div style={{
              fontSize: '14px',
              color: '#ffffff',
              whiteSpace: 'nowrap'
            }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
