import React from 'react';
import { HandoverStats } from '@/types/handover-method';

interface A4EventPanelProps {
  stats: HandoverStats;
  constellation: 'starlink' | 'oneweb';
}

// 格式化衛星 ID：添加星座前綴
const formatSatelliteId = (satId: string | null, constellation: string = 'starlink'): string => {
  if (!satId) return '無連接';

  const match = satId.match(/^(?:sat-)?(\d+)$/);
  if (!match) return satId;

  const number = match[1];
  const prefix = constellation === 'starlink' ? 'Starlink' : 'OneWeb';
  return `${prefix}-${number}`;
};

export function A4EventPanel({ stats, constellation }: A4EventPanelProps) {
  // 如果沒有 A4 事件數據，不顯示面板
  if (!stats.a3Event) {
    return null;
  }

  const a4Event = stats.a3Event;

  return (
    <>
      {/* CSS 動畫定義 */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.1);
          }
        }
      `}</style>

      {/* 右側面板 */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        height: '100%',
        width: '340px',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        backdropFilter: 'blur(10px)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.15)',
        overflow: 'hidden',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* 標題區 */}
        <div style={{
          padding: '24px 20px',
          borderBottom: '2px solid rgba(255, 255, 255, 0.15)'
        }}>
          <div style={{
            color: '#ffffff',
            fontSize: '18px',
            fontWeight: '600',
            letterSpacing: '0.5px',
            textAlign: 'center'
          }}>
            A4 事件監測
          </div>
        </div>

        {/* 內容區 */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '20px'
        }}>
          {/* A4 事件卡片 */}
          <div style={{
            backgroundColor: a4Event.active ? 'rgba(0, 136, 255, 0.1)' : 'rgba(0, 136, 255, 0.05)',
            border: a4Event.active ? '2px solid #0088ff' : '2px solid rgba(0, 136, 255, 0.4)',
            borderRadius: '10px',
            padding: '16px',
            transition: 'all 0.3s ease'
          }}>
            {/* 標題 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '12px'
            }}>
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: a4Event.active ? '#0088ff' : '#4499cc',
                animation: a4Event.active ? 'pulse 1.5s ease-in-out infinite' : 'none',
                boxShadow: a4Event.active ? '0 0 10px #0088ff' : 'none',
                transition: 'all 0.3s ease'
              }} />
              <div style={{
                color: a4Event.active ? '#0088ff' : '#4499cc',
                fontSize: '15px',
                fontWeight: '600',
                letterSpacing: '0.5px'
              }}>
                {a4Event.active ? 'A4 換手事件進行中' : 'A4 事件監測中'}
              </div>
            </div>

            {/* 說明文字 */}
            <div style={{
              fontSize: '13px',
              color: '#aaddff',
              marginBottom: '16px',
              lineHeight: '1.6'
            }}>
              {a4Event.active
                ? '3GPP A4 事件：鄰居衛星 RSRP 超過絕對閾值，正在評估是否換手（基於論文）'
                : '3GPP A4 事件：持續監測鄰居衛星 RSRP，超過閾值時觸發換手評估'
              }
            </div>

            {/* 閾值顯示 */}
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '16px',
              border: '1px solid rgba(136, 204, 255, 0.3)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
              }}>
                <span style={{ fontSize: '13px', color: '#88ccff', fontWeight: '600' }}>
                  A4 絕對閾值
                </span>
                <span style={{ fontSize: '16px', color: '#00ddff', fontWeight: '600' }}>
                  {a4Event.threshold?.toFixed(1)} dBm
                </span>
              </div>

              {/* 候選衛星列表 */}
              {a4Event.candidatesAboveThreshold && a4Event.candidatesAboveThreshold.length > 0 ? (
                <div>
                  <div style={{
                    fontSize: '12px',
                    color: '#aaddff',
                    marginBottom: '10px',
                    fontWeight: '600'
                  }}>
                    超過閾值的候選衛星 ({a4Event.candidatesAboveThreshold.length} 顆)
                  </div>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    maxHeight: '320px',
                    overflowY: 'auto'
                  }}>
                    {a4Event.candidatesAboveThreshold.map((candidate) => {
                      const isBest = candidate.satelliteId === a4Event.bestCandidateId;
                      return (
                        <div key={candidate.satelliteId} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 10px',
                          backgroundColor: isBest ? 'rgba(0, 221, 255, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                          borderRadius: '6px',
                          border: isBest ? '1px solid #00ddff' : '1px solid rgba(255, 255, 255, 0.05)',
                          transition: 'all 0.2s ease'
                        }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            {isBest && (
                              <span style={{ fontSize: '14px' }}>⭐</span>
                            )}
                            <span style={{
                              color: isBest ? '#00ddff' : '#88ccff',
                              fontWeight: isBest ? '600' : '400',
                              fontSize: '13px'
                            }}>
                              {formatSatelliteId(candidate.satelliteId, constellation)}
                            </span>
                          </div>
                          <span style={{
                            color: isBest ? '#00ff88' : '#66bbff',
                            fontFamily: 'monospace',
                            fontWeight: isBest ? '600' : '400',
                            fontSize: '13px'
                          }}>
                            {candidate.rsrp.toFixed(1)} dBm
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{
                  fontSize: '12px',
                  color: '#6688aa',
                  fontStyle: 'italic',
                  textAlign: 'center',
                  padding: '12px'
                }}>
                  暫無候選衛星超過閾值
                </div>
              )}
            </div>

            {/* TTT 進度條（僅在事件啟動時顯示） */}
            {a4Event.active && (
              <div style={{
                marginBottom: '12px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                  fontSize: '12px',
                  color: '#88ccff'
                }}>
                  <span style={{ fontWeight: '600' }}>Time-to-Trigger</span>
                  <span style={{ fontFamily: 'monospace' }}>
                    {a4Event.elapsedTime.toFixed(1)}s / {a4Event.requiredTime.toFixed(1)}s
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '5px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min((a4Event.elapsedTime / a4Event.requiredTime) * 100, 100)}%`,
                    backgroundColor: '#0088ff',
                    transition: 'width 0.3s ease',
                    boxShadow: '0 0 10px #0088ff'
                  }} />
                </div>
              </div>
            )}

            {/* 最佳候選衛星（僅在事件啟動時顯示） */}
            {a4Event.active && a4Event.targetSatelliteId && (
              <div style={{
                fontSize: '13px',
                color: '#88ccff',
                padding: '10px',
                backgroundColor: 'rgba(0, 221, 255, 0.1)',
                borderRadius: '8px',
                border: '1px solid rgba(0, 221, 255, 0.3)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ color: '#5599cc', fontWeight: '600' }}>最佳候選</span>
                <span style={{ color: '#00ddff', fontWeight: '600' }}>
                  {formatSatelliteId(a4Event.targetSatelliteId, constellation)}
                </span>
              </div>
            )}
          </div>

          {/* 論文參考 */}
          <div style={{
            marginTop: '20px',
            padding: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <div style={{
              fontSize: '11px',
              color: '#8899aa',
              lineHeight: '1.6'
            }}>
              <div style={{ fontWeight: '600', marginBottom: '4px' }}>📖 參考論文</div>
              Yu et al. (2022) - Performance Evaluation of Handover using A4 Event in LEO Satellites Network
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
