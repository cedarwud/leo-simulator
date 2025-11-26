import React from 'react';

interface SemiCircleGaugeProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  zones: Array<{
    threshold: number; // 從這個值開始
    color: string;
    label: string;
  }>;
  size?: number;
  showLabel?: boolean;
}

/**
 * 半圓形儀表板組件
 * 用於顯示信號強度指標（RSRP/RSRQ/SINR）
 * 包含分區顏色、動態指針和品質標籤
 */
export function SemiCircleGauge({
  label,
  value,
  min,
  max,
  unit,
  zones,
  size = 120,
  showLabel = true
}: SemiCircleGaugeProps) {
  const centerX = size / 2;
  const radius = size / 2 - 10;
  const centerY = radius + 10; // 圓心在底部，讓上半圓完整顯示

  // 計算當前值的角度（上半圓：180° → 270° → 0°，從左到右經過頂部）
  const percentage = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = 180 + percentage * 180; // 180°(左) → 270°(頂) → 360°/0°(右)

  // 計算指針終點
  const pointerLength = radius - 5;
  const pointerX = centerX + pointerLength * Math.cos((angle * Math.PI) / 180);
  const pointerY = centerY + pointerLength * Math.sin((angle * Math.PI) / 180);

  // 根據當前值確定所在區域
  let currentZone = zones[0];
  for (let i = zones.length - 1; i >= 0; i--) {
    if (value >= zones[i].threshold) {
      currentZone = zones[i];
      break;
    }
  }

  // 生成分區弧線（上半圓：180° → 360°）
  const createArc = (startAngle: number, endAngle: number) => {
    const start = {
      x: centerX + radius * Math.cos((startAngle * Math.PI) / 180),
      y: centerY + radius * Math.sin((startAngle * Math.PI) / 180)
    };
    const end = {
      x: centerX + radius * Math.cos((endAngle * Math.PI) / 180),
      y: centerY + radius * Math.sin((endAngle * Math.PI) / 180)
    };

    // 計算角度差
    const angleDiff = Math.abs(endAngle - startAngle);
    const largeArcFlag = angleDiff > 180 ? 1 : 0;
    // 順時針走上半圓
    const sweepFlag = 1;

    return `M ${centerX} ${centerY} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y} Z`;
  };

  // 計算每個區域的角度範圍
  const zoneArcs = zones.map((zone, index) => {
    const nextZone = zones[index + 1];
    const startValue = zone.threshold;
    const endValue = nextZone ? nextZone.threshold : max;

    const startPercentage = (startValue - min) / (max - min);
    const endPercentage = (endValue - min) / (max - min);

    // 上半圓：180°(左) → 360°(右)
    const startAngle = 180 + startPercentage * 180;
    const endAngle = 180 + endPercentage * 180;

    return {
      path: createArc(startAngle, endAngle),
      color: zone.color
    };
  });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px'
    }}>
      {showLabel && (
        <div style={{
          fontSize: '14px',
          color: '#cccccc',
          fontWeight: '600',
          letterSpacing: '0.5px'
        }}>
          {label}
        </div>
      )}

      <svg width={size} height={centerY + 10} style={{ overflow: 'visible' }}>
        {/* 背景半圓 */}
        <path
          d={createArc(180, 360)}
          fill="rgba(255, 255, 255, 0.05)"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="1"
        />

        {/* 分區弧線 */}
        {zoneArcs.map((arc, index) => (
          <path
            key={index}
            d={arc.path}
            fill={arc.color}
            opacity={0.3}
            stroke={arc.color}
            strokeWidth="1"
          />
        ))}

        {/* 中心圓 */}
        <circle
          cx={centerX}
          cy={centerY}
          r={8}
          fill={currentZone.color}
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth="2"
        />

        {/* 指針 */}
        <line
          x1={centerX}
          y1={centerY}
          x2={pointerX}
          y2={pointerY}
          stroke={currentZone.color}
          strokeWidth="3"
          strokeLinecap="round"
          style={{
            filter: `drop-shadow(0 0 4px ${currentZone.color})`
          }}
        />

        {/* 刻度線 */}
        {[0, 0.25, 0.5, 0.75, 1].map((tick, index) => {
          const tickAngle = 180 + tick * 180; // 上半圓：180° → 360°
          const innerRadius = radius - 5;
          const outerRadius = radius;
          const x1 = centerX + innerRadius * Math.cos((tickAngle * Math.PI) / 180);
          const y1 = centerY + innerRadius * Math.sin((tickAngle * Math.PI) / 180);
          const x2 = centerX + outerRadius * Math.cos((tickAngle * Math.PI) / 180);
          const y2 = centerY + outerRadius * Math.sin((tickAngle * Math.PI) / 180);

          return (
            <line
              key={index}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(255, 255, 255, 0.3)"
              strokeWidth="1"
            />
          );
        })}
      </svg>

      {/* 數值顯示 */}
      <div style={{
        fontSize: '18px',
        color: currentZone.color,
        fontWeight: '700',
        fontFamily: 'monospace',
        textShadow: `0 0 10px ${currentZone.color}`,
        marginTop: '-10px'
      }}>
        {value.toFixed(1)} {unit}
      </div>

      {/* 狀態標籤 */}
      <div style={{
        fontSize: '12px',
        color: currentZone.color,
        fontWeight: '600',
        padding: '4px 10px',
        backgroundColor: `${currentZone.color}20`,
        border: `1px solid ${currentZone.color}60`,
        borderRadius: '6px',
        marginTop: '-4px'
      }}>
        {currentZone.label}
      </div>
    </div>
  );
}

/**
 * 雙半圓對比組件（當前 vs 目標）
 */
interface DualSemiCircleGaugeProps {
  label: string;
  currentValue: number;
  targetValue: number | null;
  min: number;
  max: number;
  unit: string;
  zones: Array<{
    threshold: number;
    color: string;
    label: string;
  }>;
}

export function DualSemiCircleGauge({
  label,
  currentValue,
  targetValue,
  min,
  max,
  unit,
  zones
}: DualSemiCircleGaugeProps) {
  const showTarget = targetValue !== null;
  const gaugeSize = showTarget ? 100 : 140;

  if (!showTarget) {
    // 只顯示當前衛星
    return (
      <div style={{
        padding: '16px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <div style={{
          fontSize: '15px',
          color: '#ffffff',
          fontWeight: '600',
          marginBottom: '12px',
          textAlign: 'center',
          letterSpacing: '0.5px'
        }}>
          {label}
        </div>
        <SemiCircleGauge
          label=""
          value={currentValue}
          min={min}
          max={max}
          unit={unit}
          zones={zones}
          size={gaugeSize}
          showLabel={false}
        />
      </div>
    );
  }

  // 顯示雙半圓對比
  return (
    <div style={{
      padding: '16px',
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      borderRadius: '10px',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    }}>
      <div style={{
        fontSize: '15px',
        color: '#ffffff',
        fontWeight: '600',
        marginBottom: '12px',
        textAlign: 'center',
        letterSpacing: '0.5px'
      }}>
        {label}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px'
      }}>
        {/* 當前衛星 */}
        <div>
          <div style={{
            fontSize: '14px',
            color: '#00ff88',
            fontWeight: '600',
            marginBottom: '8px',
            textAlign: 'center'
          }}>
            當前
          </div>
          <SemiCircleGauge
            label=""
            value={currentValue}
            min={min}
            max={max}
            unit={unit}
            zones={zones}
            size={gaugeSize}
            showLabel={false}
          />
        </div>

        {/* 目標衛星 */}
        <div>
          <div style={{
            fontSize: '14px',
            color: '#0088ff',
            fontWeight: '600',
            marginBottom: '8px',
            textAlign: 'center'
          }}>
            目標
          </div>
          <SemiCircleGauge
            label=""
            value={targetValue}
            min={min}
            max={max}
            unit={unit}
            zones={zones}
            size={gaugeSize}
            showLabel={false}
          />
        </div>
      </div>
    </div>
  );
}
