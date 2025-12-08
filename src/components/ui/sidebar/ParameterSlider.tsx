import React, { useState } from 'react';

interface ParameterSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
  tooltip: string;
  impact: string;
  color?: string;
}

export function ParameterSlider({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  onChange,
  tooltip,
  impact,
  color = '#00ff88'
}: ParameterSliderProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const percentage = ((value - min) / (max - min)) * 100;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      {/* 標籤和數值 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{
            fontSize: '15px',
            color: '#ffffff',
            fontWeight: '500'
          }}>
            {label}
          </div>
          <div
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              color: '#ffffff',
              cursor: 'help',
              position: 'relative'
            }}
          >
            ?
            {showTooltip && (
              <div style={{
                position: 'absolute',
                bottom: '110%',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0, 0, 0, 0.95)',
                color: '#ffffff',
                padding: '10px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                width: '220px',
                zIndex: 1000,
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                lineHeight: '1.4',
                whiteSpace: 'normal'
              }}>
                {tooltip}
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: '6px solid rgba(0, 0, 0, 0.95)'
                }} />
              </div>
            )}
          </div>
        </div>
        <div style={{
          fontSize: '18px',
          color: color,
          fontWeight: '700',
          fontFamily: 'monospace'
        }}>
          {value.toFixed(step < 1 ? 2 : 0)}{unit}
        </div>
      </div>

      {/* 滑桿 */}
      <div style={{ position: 'relative' }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          style={{
            width: '100%',
            height: '8px',
            borderRadius: '4px',
            outline: 'none',
            appearance: 'none',
            WebkitAppearance: 'none',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            cursor: 'pointer',
            background: `linear-gradient(to right, ${color} 0%, ${color} ${percentage}%, rgba(255, 255, 255, 0.1) ${percentage}%, rgba(255, 255, 255, 0.1) 100%)`
          }}
        />
        <style>{`
          input[type="range"]::-webkit-slider-thumb {
            appearance: none;
            -webkit-appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: ${color};
            cursor: pointer;
            border: 3px solid #000000;
            box-shadow: 0 0 10px ${color}80;
          }
          input[type="range"]::-moz-range-thumb {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: ${color};
            cursor: pointer;
            border: 3px solid #000000;
            box-shadow: 0 0 10px ${color}80;
          }
        `}</style>
      </div>

      {/* 範圍標示 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '6px',
        marginBottom: '8px'
      }}>
        <div style={{
          fontSize: '12px',
          color: '#777777',
          fontFamily: 'monospace'
        }}>
          {min}{unit}
        </div>
        <div style={{
          fontSize: '12px',
          color: '#777777',
          fontFamily: 'monospace'
        }}>
          {max}{unit}
        </div>
      </div>

      {/* 影響說明 */}
      <div style={{
        fontSize: '13px',
        color: '#999999',
        paddingLeft: '4px'
      }}>
        └─ Impact: {impact}
      </div>
    </div>
  );
}
