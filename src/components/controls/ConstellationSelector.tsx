import React from 'react';

export type ConstellationType = 'starlink' | 'oneweb';

interface ConstellationSelectorProps {
  currentConstellation: ConstellationType;
  onConstellationChange: (constellation: ConstellationType) => void;
}

export function ConstellationSelector({
  currentConstellation,
  onConstellationChange
}: ConstellationSelectorProps) {
  const constellations = [
    { value: 'starlink' as ConstellationType, label: 'Starlink', count: 98, visible: '10-15' },
    { value: 'oneweb' as ConstellationType, label: 'OneWeb', count: 26, visible: '3-5' }
  ];

  return (
    <div style={{
      position: 'absolute',
      top: '20px',
      right: '20px',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: '16px',
      borderRadius: '8px',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    }}>
      <div style={{
        color: '#ffffff',
        fontSize: '16px',
        fontWeight: '600',
        marginBottom: '4px',
        letterSpacing: '0.5px'
      }}>
        星座選擇
      </div>

      {constellations.map((constellation) => {
        const isActive = currentConstellation === constellation.value;

        return (
          <button
            key={constellation.value}
            onClick={() => onConstellationChange(constellation.value)}
            style={{
              backgroundColor: isActive ? 'rgba(0, 136, 255, 0.3)' : 'rgba(255, 255, 255, 0.05)',
              border: isActive ? '2px solid #0088ff' : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              padding: '10px 14px',
              color: isActive ? '#00aaff' : '#cccccc',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: isActive ? '600' : '400',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '4px',
              minWidth: '160px',
              outline: 'none'
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }
            }}
          >
            <div style={{
              fontSize: '14px',
              fontWeight: '600',
              color: isActive ? '#00ddff' : '#ffffff'
            }}>
              {constellation.label}
            </div>
            <div style={{
              fontSize: '13px',
              color: isActive ? '#88ccff' : '#bbbbbb',
              display: 'flex',
              gap: '8px'
            }}>
              <span>{constellation.count} 顆</span>
              <span>•</span>
              <span>{constellation.visible} 可見</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
