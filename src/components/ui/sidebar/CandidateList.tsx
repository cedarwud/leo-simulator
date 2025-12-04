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
  bestCandidateId?: string;
  constellation?: 'starlink' | 'oneweb';
}

// 格式化衛星 ID：添加星座前綴
const formatSatelliteId = (satId: string, constellation: string = 'starlink'): string => {
  const match = satId.match(/^(?:sat-)?(\d+)$/);
  if (!match) return satId;

  const number = match[1];
  const prefix = constellation === 'starlink' ? 'Starlink' : 'OneWeb';
  return `${prefix}-${number}`;
}

export function CandidateList({
  candidates,
  threshold,
  maxDisplay = 5,
  bestCandidateId,
  constellation = 'starlink'
}: CandidateListProps) {
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
      {/* 標題 */}
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

      {/* 候選列表 */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {displayedCandidates.map((candidate, index) => {
          const rsrpColor = getRSRPColor(candidate.rsrp);
          const rsrpLabel = getRSRPLabel(candidate.rsrp);
          const meetsThreshold = candidate.rsrp > threshold;
          const isBest = bestCandidateId === candidate.id;

          return (
            <div
              key={candidate.id}
              style={{
                padding: '12px',
                backgroundColor: isBest
                  ? 'rgba(0, 221, 255, 0.15)'
                  : meetsThreshold
                  ? 'rgba(0, 136, 255, 0.1)'
                  : 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: isBest
                  ? '2px solid #00ddff'
                  : meetsThreshold
                  ? `1px solid ${rsrpColor}40`
                  : '1px solid rgba(255, 255, 255, 0.1)',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px'
              }}>
                {/* 排名和衛星 ID */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  {isBest ? (
                    <span style={{ fontSize: '20px' }}>⭐</span>
                  ) : (
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: index === 0
                        ? 'rgba(255, 215, 0, 0.2)'
                        : 'rgba(255, 255, 255, 0.1)',
                      border: index === 0
                        ? '2px solid #ffd700'
                        : '1px solid rgba(255, 255, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: '700',
                      color: index === 0 ? '#ffd700' : '#cccccc'
                    }}>
                      {index + 1}
                    </div>
                  )}
                  <div style={{
                    fontSize: '14px',
                    color: isBest ? '#00ddff' : '#ffffff',
                    fontWeight: isBest ? '600' : '500',
                    fontFamily: 'monospace'
                  }}>
                    {formatSatelliteId(candidate.id, constellation)}
                  </div>
                </div>

                {/* A4 符合標記 */}
                <div style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: meetsThreshold
                    ? 'rgba(0, 255, 136, 0.2)'
                    : 'rgba(255, 102, 0, 0.2)',
                  border: meetsThreshold
                    ? '1px solid #00ff88'
                    : '1px solid #ff6600',
                  color: meetsThreshold ? '#00ff88' : '#ff6600'
                }}>
                  {meetsThreshold ? '✓ A4' : '✗ A4'}
                </div>
              </div>

              {/* RSRP 顯示 */}
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

              {/* 幾何資訊（如果有） */}
              {(candidate.elevation !== undefined || candidate.distance !== undefined) && (
                <div style={{
                  marginTop: '8px',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  gap: '12px',
                  fontSize: '12px',
                  color: '#999999'
                }}>
                  {candidate.elevation !== undefined && (
                    <div>
                      仰角: <span style={{ color: '#cccccc', fontWeight: '600' }}>
                        {candidate.elevation.toFixed(1)}°
                      </span>
                    </div>
                  )}
                  {candidate.distance !== undefined && (
                    <div>
                      距離: <span style={{ color: '#cccccc', fontWeight: '600' }}>
                        {candidate.distance.toFixed(0)} km
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 顯示更多提示 */}
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
