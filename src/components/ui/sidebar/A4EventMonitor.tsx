import React from 'react';

interface A4EventMonitorProps {
  neighborRSRP: number;
  threshold: number;
  tttProgress: number; // 0-1
  tttElapsed: number;
  tttTotal: number;
  isTriggered: boolean;
  isCounting: boolean;
}

export function A4EventMonitor({
  neighborRSRP,
  threshold,
  tttProgress,
  tttElapsed,
  tttTotal,
  isTriggered,
  isCounting
}: A4EventMonitorProps) {
  const conditionMet = neighborRSRP > threshold;
  const progressPercentage = tttProgress * 100;

  return (
    <div style={{
      padding: '16px',
      backgroundColor: isTriggered
        ? 'rgba(0, 255, 136, 0.15)'
        : isCounting
        ? 'rgba(255, 170, 0, 0.15)'
        : 'rgba(255, 255, 255, 0.05)',
      borderRadius: '8px',
      border: isTriggered
        ? '2px solid #00ff88'
        : isCounting
        ? '2px solid #ffaa00'
        : '1px solid rgba(255, 255, 255, 0.1)',
      marginBottom: '12px'
    }}>
      {/* 標題 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '14px'
      }}>
        <div style={{
          fontSize: '15px',
          color: '#ffffff',
          fontWeight: '600'
        }}>
          🚦 A4 Event Condition
        </div>
        <div style={{
          fontSize: '13px',
          fontWeight: '600',
          padding: '4px 10px',
          borderRadius: '4px',
          backgroundColor: conditionMet
            ? 'rgba(0, 255, 136, 0.2)'
            : 'rgba(255, 255, 255, 0.1)',
          border: conditionMet
            ? '1px solid #00ff88'
            : '1px solid rgba(255, 255, 255, 0.2)',
          color: conditionMet ? '#00ff88' : '#cccccc'
        }}>
          {conditionMet ? '✅ Met' : '⏸️ Idle'}
        </div>
      </div>

      {/* A4 條件公式 */}
      <div style={{
        padding: '12px',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '6px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        fontFamily: 'monospace',
        marginBottom: '14px'
      }}>
        <div style={{
          fontSize: '13px',
          color: '#999999',
          marginBottom: '8px'
        }}>
          Mn {'>'} Threshold
        </div>
        <div style={{
          fontSize: '18px',
          color: conditionMet ? '#00ff88' : '#cccccc',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ color: '#0088ff' }}>
            {neighborRSRP.toFixed(1)}
          </span>
          <span style={{ color: '#999999' }}>{'>'}</span>
          <span style={{ color: '#ff6600' }}>
            {threshold.toFixed(0)}
          </span>
          <span style={{
            marginLeft: 'auto',
            fontSize: '20px',
            color: conditionMet ? '#00ff88' : '#ff6600'
          }}>
            {conditionMet ? '✓' : '✗'}
          </span>
        </div>
        <div style={{
          fontSize: '13px',
          color: '#666666',
          marginTop: '8px',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <span>Neighbor RSRP</span>
          <span>Threshold</span>
          <span>Result</span>
        </div>
      </div>

      {/* TTT 計時器 */}
      {isCounting && (
        <div style={{
          padding: '12px',
          backgroundColor: 'rgba(255, 170, 0, 0.1)',
          borderRadius: '6px',
          border: '1px solid rgba(255, 170, 0, 0.3)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px'
          }}>
            <div style={{
              fontSize: '14px',
              color: '#ffffff',
              fontWeight: '500'
            }}>
              ⏱️ TTT Countdown
            </div>
            <div style={{
              fontSize: '20px',
              color: '#ffaa00',
              fontWeight: '700',
              fontFamily: 'monospace'
            }}>
              {tttElapsed.toFixed(1)}s / {tttTotal}s
            </div>
          </div>

          {/* 進度條 */}
          <div style={{
            width: '100%',
            height: '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '5px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            <div style={{
              width: `${progressPercentage}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #ffaa00, #ff6600)',
              transition: 'width 0.3s ease',
              boxShadow: '0 0 10px rgba(255, 170, 0, 0.8)'
            }} />
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '6px'
          }}>
            <div style={{
              fontSize: '12px',
              color: '#777777'
            }}>
              0s
            </div>
            <div style={{
              fontSize: '13px',
              color: '#ffaa00',
              fontWeight: '600'
            }}>
              {progressPercentage.toFixed(0)}%
            </div>
            <div style={{
              fontSize: '12px',
              color: '#777777'
            }}>
              {tttTotal}s
            </div>
          </div>
        </div>
      )}

      {/* 已觸發提示 */}
      {isTriggered && !isCounting && (
        <div style={{
          padding: '12px',
          backgroundColor: 'rgba(0, 255, 136, 0.1)',
          borderRadius: '6px',
          border: '1px solid rgba(0, 255, 136, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <div style={{
            fontSize: '24px'
          }}>
            ✅
          </div>
          <div>
            <div style={{
              fontSize: '14px',
              color: '#00ff88',
              fontWeight: '600'
            }}>
              A4 Event Triggered
            </div>
            <div style={{
              fontSize: '13px',
              color: '#999999',
              marginTop: '4px'
            }}>
              TTT completed, preparing handover
            </div>
          </div>
        </div>
      )}

      {/* 待機提示 */}
      {!isCounting && !isTriggered && (
        <div style={{
          padding: '10px',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '6px',
          fontSize: '13px',
          color: '#999999',
          textAlign: 'center'
        }}>
          ⏸️ Signal stable, no handover needed
        </div>
      )}
    </div>
  );
}
