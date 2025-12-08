import React from 'react';

export interface Candidate {
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
  currentSatelliteId?: string | null;
  currentPhase?: string;
  visibleCandidateIds?: string[];
}

const CURRENT_COLOR = '#0088ff';
const TARGET_COLOR = '#00ff88';
const CANDIDATE_COLOR = '#030408';
export const CANDIDATE_PALETTE = ['#070c13', '#060910', '#05070c', '#040509', '#030408'];
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const formatSatelliteId = (satId: string, constellation: string = 'starlink'): string => {
  const match = satId.match(/^(?:sat-)?(\d+)$/);
  if (!match) return satId;
  const number = match[1];
  const prefix = constellation === 'starlink' ? 'Starlink' : 'OneWeb';
  return `${prefix}-${number}`;
};

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

// Shadow boost based on RSRP (stronger signal -> deeper shadow)
function strengthShadowBoost(rsrp: number) {
  const strength = clamp((rsrp + 120) / 50, 0, 1); // 0..1
  return strength * 0.08; // up to +0.08 opacity
}

// Ensure readable text on colored cards
function getContrastTextColor(hex: string) {
  if (!hex.startsWith('#')) {
    return {
      isLight: false,
      text: '#f5f8ff',
      subtle: 'rgba(245, 248, 255, 0.82)'
    };
  }
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.substring(0, 2), 16) / 255;
  const g = parseInt(normalized.substring(2, 4), 16) / 255;
  const b = parseInt(normalized.substring(4, 6), 16) / 255;

  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  // Slightly lower the cut so more light cards choose dark text
  const isLight = luminance > 0.55;

  return {
    isLight,
    text: isLight ? '#0b1020' : '#f5f8ff',
    subtle: isLight ? 'rgba(11, 16, 32, 0.78)' : 'rgba(245, 248, 255, 0.82)'
  };
}

// Mix color1 toward color2 by ratio (0..1)
function mixColors(color1: string, color2: string, ratio: number) {
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

// Adjust card color brightness based on RSRP strength and role
function getCardColor(baseColor: string, rsrp: number, role: 'current' | 'target' | 'candidate') {
  // Normalize RSRP between -120 (weak) and -70 (strong)
  const strength = clamp((rsrp + 120) / 50, 0, 1);
  // Stronger spread for clearer contrast
  let offset = (strength - 0.5) * 0.9; // -0.45 .. 0.45

  if (role === 'current') offset += 0.12;   // current brighter
  if (role === 'target') offset += 0.08;    // target brighter
  if (role === 'candidate') offset -= 0.08; // candidates darker

  offset = clamp(offset, -0.45, 0.45);

  if (offset > 0) {
    return mixColors(baseColor, '#ffffff', offset);
  }
  if (offset < 0) {
    return mixColors(baseColor, '#000000', -offset * 0.7);
  }
  return baseColor;
}

export function CandidateItem({
  candidate,
  threshold,
  constellation,
  isCurrent,
  isTarget,
  currentPhase,
  isVisibleCandidate,
  candidateColor
}: {
  candidate: Candidate;
  threshold: number;
  constellation: string;
  isCurrent: boolean;
  isTarget: boolean;
  currentPhase?: string;
  isVisibleCandidate: boolean;
  candidateColor?: string;
}) {
  const isTargetActive = isTarget && ['establishing', 'switching', 'completing'].includes(currentPhase ?? '');
  const candidateBase = candidateColor || CANDIDATE_COLOR;
  const baseColor = isCurrent ? CURRENT_COLOR : isTargetActive ? TARGET_COLOR : candidateBase;
  const role: 'current' | 'target' | 'candidate' = isCurrent ? 'current' : isTargetActive ? 'target' : 'candidate';
  const isCandidateLinePhase = currentPhase === 'preparing' || currentPhase === 'selecting';
  const shouldColor =
    isCurrent || // always color current link
    isTargetActive || // color target only when solid link phases
    (!isCurrent && !isTargetActive && isCandidateLinePhase && isVisibleCandidate); // color only candidates that have a drawn link
  const cardColor = shouldColor
    ? getCardColor(baseColor, candidate.rsrp, role)
    : 'rgba(255, 255, 255, 0.05)';
  const contrast = getContrastTextColor(cardColor);
  const isCandidateColored = shouldColor && !isCurrent && !isTargetActive;
  // For blue/green cards prefer dark text; for colored candidates use white
  const isBlueCard = shouldColor && baseColor === CURRENT_COLOR;
  const forceDarkText = shouldColor && (isCurrent || isBlueCard);
  const textColor = isCandidateColored ? '#ffffff' : forceDarkText ? '#0b1020' : contrast.text;
  const subtleTextColor = isCandidateColored ? 'rgba(255, 255, 255, 0.82)' : forceDarkText ? 'rgba(11, 16, 32, 0.78)' : contrast.subtle;
  const isLight = contrast.isLight;
  const rsrpColor = getRSRPColor(candidate.rsrp);
  const rsrpLabel = getRSRPLabel(candidate.rsrp);
  const meetsThreshold = candidate.rsrp > threshold;

  const roleLabel = isCurrent ? 'Current' : isTargetActive ? 'Target' : 'Candidate';
  const rsrpBadgeText = isCandidateColored
    ? '#ffffff'
    : !shouldColor && rsrpLabel === 'Excellent'
    ? '#ffffff'
    : rsrpLabel === 'Excellent'
    ? '#0b1020'
    : rsrpColor;

  return (
    <div
      style={{
        padding: '12px',
        backgroundColor: cardColor,
        borderRadius: '8px',
        border: isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.14)',
        boxShadow: shouldColor
          ? (isLight
              ? `0 10px 24px rgba(0, 0, 0, ${0.18 + strengthShadowBoost(candidate.rsrp)})`
              : `0 10px 24px rgba(0, 0, 0, ${0.35 + strengthShadowBoost(candidate.rsrp)})`)
          : '0 6px 16px rgba(0, 0, 0, 0.2)',
        transition: 'transform 0.12s ease, box-shadow 0.12s ease'
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px'
      }}>
        <div style={{
          fontSize: '14px',
          color: textColor,
          fontWeight: '600',
          fontFamily: 'monospace'
        }}>
          {formatSatelliteId(candidate.id, constellation)}
        </div>
        <div style={{
          fontSize: '11px',
          fontWeight: '700',
          padding: '4px 10px',
          borderRadius: '999px',
          backgroundColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.16)',
          color: textColor,
          border: isLight ? '1px solid rgba(0, 0, 0, 0.35)' : isCurrent ? '1px solid rgba(0, 0, 0, 0.35)' : '1px solid rgba(255, 255, 255, 0.18)',
          textTransform: 'uppercase',
          letterSpacing: '0.4px'
        }}>
          {roleLabel}
        </div>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px'
      }}>
        <div style={{
          fontSize: '20px',
          color: textColor,
          fontWeight: '700',
          fontFamily: 'monospace'
        }}>
          {candidate.rsrp.toFixed(1)} dBm
        </div>
        <div style={{
          fontSize: '12px',
          color: rsrpBadgeText,
          fontWeight: '700',
          backgroundColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)',
          padding: '4px 10px',
          borderRadius: '6px',
          border: isLight
            ? '1px solid rgba(0, 0, 0, 0.35)'
            : isCurrent
            ? '1px solid rgba(0, 0, 0, 0.35)'
            : isCandidateColored
            ? '1px solid rgba(0, 0, 0, 0.35)'
            : `1px solid ${rsrpColor}66`
        }}>
          {rsrpLabel}
        </div>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{
          fontSize: '13px',
          color: subtleTextColor,
          fontWeight: '600',
          padding: '4px 10px',
          borderRadius: '6px',
          backgroundColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)',
          border: isLight
            ? '1px solid rgba(0, 0, 0, 0.35)'
            : isCurrent
            ? '1px solid rgba(0, 0, 0, 0.35)'
            : isCandidateColored
            ? '1px solid rgba(0, 0, 0, 0.35)'
            : '1px solid rgba(255, 255, 255, 0.14)'
        }}>
          {meetsThreshold ? '✓ A4' : '✗ Below A4'}
        </div>
        {candidate.elevation !== undefined && (
          <div style={{ fontSize: '13px', color: textColor, fontWeight: '600' }}>
            {candidate.elevation.toFixed(1)}°
          </div>
        )}
      </div>
    </div>
  );
}

export function CandidateList({
  candidates,
  threshold,
  maxDisplay = 5,
  constellation = 'starlink',
  targetSatelliteId,
  currentSatelliteId,
  currentPhase,
  visibleCandidateIds = []
}: CandidateListProps) {
  const displayedCandidates = candidates.slice(0, maxDisplay);
  const hasMore = candidates.length > maxDisplay;
  const isPreparingPhase = currentPhase === 'preparing';
  const isCandidateLinePhase = currentPhase === 'preparing' || currentPhase === 'selecting';

  const orderedCandidates = displayedCandidates
    .map((c, idx) => ({ c, idx }))
    .sort((a, b) => {
      const aCurrent = currentSatelliteId && a.c.id === currentSatelliteId;
      const bCurrent = currentSatelliteId && b.c.id === currentSatelliteId;
      if (aCurrent && !bCurrent) return -1;
      if (!aCurrent && bCurrent) return 1;

      const aTarget = targetSatelliteId && a.c.id === targetSatelliteId;
      const bTarget = targetSatelliteId && b.c.id === targetSatelliteId;
      if (aTarget && !bTarget) return -1;
      if (!aTarget && bTarget) return 1;

      const aColor = isCandidateLinePhase && visibleCandidateIds.includes(a.c.id);
      const bColor = isCandidateLinePhase && visibleCandidateIds.includes(b.c.id);
      if (aColor && !bColor) return -1;
      if (!aColor && bColor) return 1;

      return a.idx - b.idx;
    })
    .map(({ c }) => c);
  
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
          📡 Connections & Candidates
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
        gap: '10px'
      }}>
        {orderedCandidates.map((candidate) => {
          const paletteIdx = visibleCandidateIds.indexOf(candidate.id);
          const paletteColor = paletteIdx >= 0 && paletteIdx < CANDIDATE_PALETTE.length
            ? CANDIDATE_PALETTE[paletteIdx]
            : CANDIDATE_COLOR;
          return (
          <CandidateItem
            key={candidate.id}
            candidate={candidate}
            threshold={threshold}
            constellation={constellation}
            isCurrent={candidate.id === currentSatelliteId}
            isTarget={candidate.id === targetSatelliteId}
            currentPhase={currentPhase}
            isVisibleCandidate={visibleCandidateIds.includes(candidate.id)}
            candidateColor={paletteColor}
          />
        );
        })}
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
