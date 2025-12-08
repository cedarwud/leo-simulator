import React from 'react';

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
  phaseProgress?: number;
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
  if (rsrp >= -80) return '優秀';
  if (rsrp >= -90) return '良好';
  if (rsrp >= -100) return '中等';
  if (rsrp >= -110) return '較差';
  return '極差';
};

export function CandidateList({
  candidates,
  threshold,
  maxDisplay = 5,
  constellation = 'starlink'
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
          📡 候選衛星 (符合 A4)
        </div>
        <div style={{
          padding: '12px',
          textAlign: 'center',
          fontSize: '14px',
          color: '#999999'
        }}>
          暫無符合條件的候選衛星
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
          📡 候選衛星 (符合 A4)
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
          {candidates.length} 顆
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {displayedCandidates.map((candidate) => {
          const rsrpColor = getRSRPColor(candidate.rsrp);
          const rsrpLabel = getRSRPLabel(candidate.rsrp);
          const meetsThreshold = candidate.rsrp > threshold;

          return (
            <div
              key={candidate.id}
              style={{
                padding: '12px',
                backgroundColor: meetsThreshold ? 'rgba(0, 136, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: meetsThreshold ? `1px solid ${rsrpColor}40` : '1px solid rgba(255, 255, 255, 0.1)'
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
          還有 {candidates.length - maxDisplay} 顆候選衛星未顯示
        </div>
      )}
    </div>
  );
}
