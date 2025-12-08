import React, { useRef, useState, useEffect } from 'react';

interface Candidate {
  id: string;
  rsrp: number;
  elevation?: number;
  distance?: number;
  meetsA4: boolean;
}

interface CandidateListProps {
  candidates: Candidate[];
  threshold: number;
  maxDisplay?: number;
  constellation?: 'starlink' | 'oneweb';
  targetSatelliteId?: string | null;
  currentPhase?: string;
  activeCandidateIds?: string[];
}

// Blend two colors
function blendColors(color1: string, color2: string, ratio: number): string {
  const c1 = parseInt(color1.substring(1), 16);
  const c2 = parseInt(color2.substring(1), 16);

  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;

  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;

  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const formatSatelliteId = (satId: string, constellation: string = 'starlink'): string => {
  const match = satId.match(/^(?:sat-)?(\d+)$/);
  if (!match) return satId;
  const number = match[1];
  const prefix = constellation === 'starlink' ? 'Starlink' : 'OneWeb';
  return `${prefix}-${number}`;
}

const getRSRPColor = (rsrp: number): string => {
  if (rsrp >= -80) return '#00ff88';
  if (rsrp >= -90) return '#88ff00';
  if (rsrp >= -100) return '#ffaa00';
  if (rsrp >= -110) return '#ff6600';
  return '#ff0000';
};

const getRSRPLabel = (rsrp: number): string => {
  if (rsrp >= -80) return 'Excellent';
  if (rsrp >= -90) return 'Good';
  if (rsrp >= -100) return 'Fair';
  if (rsrp >= -110) return 'Poor';
  return 'Bad';
};

// Individual candidate item component (encapsulates animation logic)
function CandidateItem({
  candidate,
  threshold,
  constellation,
  isActive,
  currentPhase
}: {
  candidate: Candidate;
  threshold: number;
  constellation: string;
  isActive: boolean;
  currentPhase?: string;
}) {
  const [borderColor, setBorderColor] = useState('transparent');
  const [isDashed, setIsDashed] = useState(true);
  const animationTimeRef = useRef(0);
  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number | null>(null);

  const rsrpColor = getRSRPColor(candidate.rsrp);
  const rsrpLabel = getRSRPLabel(candidate.rsrp);
  const meetsThreshold = candidate.rsrp > threshold;

  // Animation loop
  useEffect(() => {
    if (!isActive || !currentPhase) {
      setBorderColor('transparent');
      return;
    }

    const animate = (time: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = time;
      }
      const totalSeconds = (time - startTimeRef.current) / 1000;
      animationTimeRef.current = totalSeconds;

      let nextColor = '#00aaff';

      switch (currentPhase) {
        case 'preparing':
          // 準備階段：呼吸藍色 (虛線) - 提亮顏色
          const prepFlicker = Math.sin(totalSeconds * 0.5 * Math.PI * 2) * 0.5 + 0.5;
          nextColor = blendColors('#0088ff', '#00ffff', prepFlicker);
          setIsDashed(true);
          break;
        case 'selecting':
          // 選擇階段：高頻呼吸青色 (虛線)
          const selFlicker = Math.sin(totalSeconds * 0.8 * Math.PI * 2) * 0.5 + 0.5;
          nextColor = blendColors('#0066cc', '#00ccff', selFlicker);
          setIsDashed(true);
          break;
        case 'establishing':
          // 建立階段：藍色 (實線) - 呼應 3D 中目標連線變成藍色實線
          nextColor = '#0088ff';
          setIsDashed(false);
          break;
        case 'switching':
          // 切換階段：青色過渡 (實線) - 呼應 3D 中目標連線從藍變綠的過程
          // 避免使用灰色/黑色，保持目標的高亮狀態
          nextColor = '#00ccbb'; 
          setIsDashed(false);
          break;
        case 'completing':
          // 完成階段：亮綠色 (實線)
          nextColor = '#00ff88';
          setIsDashed(false);
          break;
        default:
          nextColor = 'transparent';
      }

      setBorderColor(nextColor);
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isActive, currentPhase]);

  // Determine final border style
  let borderStyle = meetsThreshold ? `1px solid ${rsrpColor}40` : '1px solid rgba(255, 255, 255, 0.1)';
  let borderLeftStyle = undefined;

  if (isActive && borderColor !== 'transparent') {
    // 活躍狀態（有連線）：顏色與連線同步
    borderStyle = `2px ${isDashed ? 'dashed' : 'solid'} ${borderColor}`;
    // 左側邊框應始終為實線，且寬度為 6px，以與「當前連接」保持一致的強調效果
    borderLeftStyle = `6px solid ${borderColor}`;
  }

  return (
    <div
      style={{
        padding: '12px',
        backgroundColor: meetsThreshold ? 'rgba(0, 136, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)',
        borderRadius: '6px',
        border: borderStyle,
        borderLeft: borderLeftStyle,
        transition: 'border-color 0.1s linear, border-width 0.1s linear'
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px'
      }}>
        <div style={{
          fontSize: '14px',
          color: '#ffffff',
          fontWeight: '500',
          fontFamily: 'monospace'
        }}>
          {formatSatelliteId(candidate.id, constellation)}
        </div>
        <div style={{
          fontSize: '11px',
          fontWeight: '600',
          padding: '3px 8px',
          borderRadius: '4px',
          backgroundColor: meetsThreshold ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 102, 0, 0.2)',
          border: meetsThreshold ? '1px solid #00ff88' : '1px solid #ff6600',
          color: meetsThreshold ? '#00ff88' : '#ff6600'
        }}>
          {meetsThreshold ? '✓ A4' : '✗ A4'}
        </div>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{
          fontSize: '20px',
          color: rsrpColor,
          fontWeight: '700',
          fontFamily: 'monospace'
        }}>
          {candidate.rsrp.toFixed(1)} dBm
        </div>
        <div style={{
          fontSize: '13px',
          color: rsrpColor,
          fontWeight: '600',
          backgroundColor: `${rsrpColor}20`,
          padding: '4px 8px',
          borderRadius: '4px',
          border: `1px solid ${rsrpColor}40`
        }}>
          {rsrpLabel}
        </div>
      </div>
    </div>
  );
}

export function CandidateList({
  candidates,
  threshold,
  maxDisplay = 5,
  constellation = 'starlink',
  currentPhase,
  activeCandidateIds = []
}: CandidateListProps) {
  const displayedCandidates = candidates.slice(0, maxDisplay);
  const hasMore = candidates.length > maxDisplay;
  
  if (candidates.length === 0) {
    return (
      <div style={{
        padding: '16px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: '12px'
      }}>
        <div style={{
          fontSize: '15px',
          color: '#ffffff',
          fontWeight: '600',
          marginBottom: '10px'
        }}>
          📡 Candidates (Met A4)
        </div>
        <div style={{
          padding: '12px',
          textAlign: 'center',
          fontSize: '14px',
          color: '#999999'
        }}>
          No candidates met criteria
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: '16px',
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      borderRadius: '8px',
      border: '1px solid rgba(0, 136, 255, 0.3)',
      marginBottom: '12px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <div style={{
          fontSize: '15px',
          color: '#ffffff',
          fontWeight: '600'
        }}>
          📡 Candidates (Met A4)
        </div>
        <div style={{
          fontSize: '14px',
          color: '#0088ff',
          fontWeight: '600',
          backgroundColor: 'rgba(0, 136, 255, 0.2)',
          padding: '4px 10px',
          borderRadius: '4px',
          border: '1px solid rgba(0, 136, 255, 0.4)'
        }}>
          {candidates.length} sats
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {displayedCandidates.map((candidate) => (
          <CandidateItem
            key={candidate.id}
            candidate={candidate}
            threshold={threshold}
            constellation={constellation}
            isActive={activeCandidateIds.includes(candidate.id)}
            currentPhase={currentPhase}
          />
        ))}
      </div>

      {hasMore && (
        <div style={{
          marginTop: '10px',
          padding: '8px',
          textAlign: 'center',
          fontSize: '13px',
          color: '#999999',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '4px',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          {candidates.length - maxDisplay} more candidates hidden
        </div>
      )}
    </div>
  );
}
