import React from 'react';
import { SimulationClock, CellQueueState, LyapunovState } from '@/types/paper41';

interface SimulationClockPanelProps {
  clock: SimulationClock;
  queueStates: CellQueueState[];
  avgQueueLength: number;
  maxQueueLength: number;
  onTogglePlay: () => void;
  onStepSlot: () => void;
  onStepEpoch: () => void;
  onSetSpeed: (multiplier: number) => void;
  onReset: () => void;
  lyapunovState?: LyapunovState;
}

const SPEED_OPTIONS = [1, 5, 10, 50];

export function SimulationClockPanel({
  clock,
  queueStates,
  avgQueueLength,
  maxQueueLength,
  onTogglePlay,
  onStepSlot,
  onStepEpoch,
  onSetSpeed,
  onReset,
  lyapunovState,
}: SimulationClockPanelProps) {
  const epochProgress = (clock.currentSlot / clock.slotsPerEpoch) * 100;
  const totalElapsedSec =
    ((clock.currentEpoch - 1) * clock.slotsPerEpoch + (clock.currentSlot - 1)) *
    (clock.slotDurationMs / 1000);

  return (
    <div>
      {/* Header */}
      <div style={{
        fontSize: '15px',
        color: '#ffffff',
        fontWeight: '600',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        Paper 4-1 Simulation Clock
      </div>

      {/* Epoch / Slot display */}
      <div style={{
        padding: '12px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        marginBottom: '10px',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}>
          <div>
            <div style={{ fontSize: '12px', color: '#999999', marginBottom: '4px' }}>Epoch</div>
            <div style={{ fontSize: '22px', color: '#88ccff', fontWeight: '600', fontFamily: 'monospace' }}>
              {clock.currentEpoch}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#999999', marginBottom: '4px' }}>Slot</div>
            <div style={{ fontSize: '22px', color: '#88ccff', fontWeight: '600', fontFamily: 'monospace' }}>
              {clock.currentSlot}<span style={{ fontSize: '14px', color: '#666666' }}>/{clock.slotsPerEpoch}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#999999', marginBottom: '4px' }}>Elapsed</div>
            <div style={{ fontSize: '18px', color: '#88ccff', fontWeight: '600', fontFamily: 'monospace' }}>
              {totalElapsedSec < 60
                ? `${totalElapsedSec.toFixed(1)}s`
                : `${(totalElapsedSec / 60).toFixed(1)}m`}
            </div>
          </div>
        </div>

        {/* Epoch progress bar */}
        <div style={{
          width: '100%',
          height: '4px',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${epochProgress}%`,
            height: '100%',
            backgroundColor: '#88ccff',
            borderRadius: '2px',
            transition: 'width 0.1s ease',
          }} />
        </div>
      </div>

      {/* Playback controls */}
      <div style={{
        display: 'flex',
        gap: '6px',
        marginBottom: '10px',
      }}>
        {/* Play/Pause */}
        <button
          onClick={onTogglePlay}
          style={{
            flex: 1,
            padding: '8px',
            backgroundColor: clock.isPlaying
              ? 'rgba(255, 100, 100, 0.2)'
              : 'rgba(100, 255, 100, 0.2)',
            border: `1px solid ${clock.isPlaying ? 'rgba(255, 100, 100, 0.5)' : 'rgba(100, 255, 100, 0.5)'}`,
            borderRadius: '6px',
            color: clock.isPlaying ? '#ff8888' : '#88ff88',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {clock.isPlaying ? 'Pause' : 'Play'}
        </button>

        {/* Step Slot */}
        <button
          onClick={onStepSlot}
          disabled={clock.isPlaying}
          style={{
            padding: '8px 12px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '6px',
            color: clock.isPlaying ? '#555555' : '#cccccc',
            fontSize: '12px',
            cursor: clock.isPlaying ? 'not-allowed' : 'pointer',
            outline: 'none',
          }}
        >
          +Slot
        </button>

        {/* Step Epoch */}
        <button
          onClick={onStepEpoch}
          disabled={clock.isPlaying}
          style={{
            padding: '8px 12px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '6px',
            color: clock.isPlaying ? '#555555' : '#cccccc',
            fontSize: '12px',
            cursor: clock.isPlaying ? 'not-allowed' : 'pointer',
            outline: 'none',
          }}
        >
          +Epoch
        </button>

        {/* Reset */}
        <button
          onClick={onReset}
          style={{
            padding: '8px 12px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '6px',
            color: '#cccccc',
            fontSize: '12px',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          Reset
        </button>
      </div>

      {/* Speed selector */}
      <div style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '12px',
      }}>
        <div style={{ fontSize: '12px', color: '#999999', alignSelf: 'center', marginRight: '4px' }}>
          Speed:
        </div>
        {SPEED_OPTIONS.map(speed => (
          <button
            key={speed}
            onClick={() => onSetSpeed(speed)}
            style={{
              padding: '4px 10px',
              backgroundColor: clock.speedMultiplier === speed
                ? 'rgba(136, 204, 255, 0.2)'
                : 'rgba(255, 255, 255, 0.05)',
              border: clock.speedMultiplier === speed
                ? '1px solid #88ccff'
                : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              color: clock.speedMultiplier === speed ? '#88ccff' : '#999999',
              fontSize: '12px',
              fontWeight: clock.speedMultiplier === speed ? '600' : '400',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {speed}x
          </button>
        ))}
      </div>

      {/* Queue Statistics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px',
      }}>
        <div style={{
          padding: '10px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '6px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <div style={{ fontSize: '11px', color: '#999999', marginBottom: '4px' }}>
            Avg Queue (Mbits)
          </div>
          <div style={{ fontSize: '18px', color: '#ffaa44', fontWeight: '600', fontFamily: 'monospace' }}>
            {avgQueueLength.toFixed(1)}
          </div>
        </div>

        <div style={{
          padding: '10px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '6px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <div style={{ fontSize: '11px', color: '#999999', marginBottom: '4px' }}>
            Max Queue (Mbits)
          </div>
          <div style={{ fontSize: '18px', color: '#ff6644', fontWeight: '600', fontFamily: 'monospace' }}>
            {maxQueueLength.toFixed(1)}
          </div>
        </div>

        <div style={{
          padding: '10px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '6px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <div style={{ fontSize: '11px', color: '#999999', marginBottom: '4px' }}>
            Served Cells
          </div>
          <div style={{ fontSize: '18px', color: '#44ff88', fontWeight: '600', fontFamily: 'monospace' }}>
            {queueStates.filter(q => q.slotsServed > 0).length}
            <span style={{ fontSize: '12px', color: '#666666' }}>/{queueStates.length}</span>
          </div>
        </div>

        <div style={{
          padding: '10px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '6px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <div style={{ fontSize: '11px', color: '#999999', marginBottom: '4px' }}>
            Slot Duration
          </div>
          <div style={{ fontSize: '18px', color: '#88ccff', fontWeight: '600', fontFamily: 'monospace' }}>
            {clock.slotDurationMs}<span style={{ fontSize: '12px', color: '#666666' }}>ms</span>
          </div>
        </div>
      </div>

      {/* Lyapunov Framework Metrics */}
      {lyapunovState && lyapunovState.epoch > 0 && (
        <>
          <div style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            marginTop: '10px',
            paddingTop: '10px',
          }}>
            <div style={{ fontSize: '12px', color: '#cc88ff', fontWeight: '600', marginBottom: '8px' }}>
              Lyapunov Framework
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
            }}>
              <div style={{
                padding: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}>
                <div style={{ fontSize: '10px', color: '#999999', marginBottom: '3px' }}>
                  HO Freq
                </div>
                <div style={{
                  fontSize: '16px',
                  fontFamily: 'monospace',
                  fontWeight: '600',
                  color: lyapunovState.avgHandoverFrequency > 0.004 ? '#ff6644' : '#44ff88',
                }}>
                  {lyapunovState.avgHandoverFrequency.toFixed(4)}
                </div>
              </div>

              <div style={{
                padding: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}>
                <div style={{ fontSize: '10px', color: '#999999', marginBottom: '3px' }}>
                  Resource Util
                </div>
                <div style={{ fontSize: '16px', color: '#cc88ff', fontWeight: '600', fontFamily: 'monospace' }}>
                  {(lyapunovState.resourceUtilization * 100).toFixed(0)}%
                </div>
              </div>

              <div style={{
                padding: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}>
                <div style={{ fontSize: '10px', color: '#999999', marginBottom: '3px' }}>
                  Drift+Penalty
                </div>
                <div style={{ fontSize: '14px', color: '#cc88ff', fontWeight: '600', fontFamily: 'monospace' }}>
                  {lyapunovState.driftPlusPenalty < 1000
                    ? lyapunovState.driftPlusPenalty.toFixed(1)
                    : `${(lyapunovState.driftPlusPenalty / 1000).toFixed(1)}k`}
                </div>
              </div>

              <div style={{
                padding: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}>
                <div style={{ fontSize: '10px', color: '#999999', marginBottom: '3px' }}>
                  Total HOs
                </div>
                <div style={{ fontSize: '16px', color: '#cc88ff', fontWeight: '600', fontFamily: 'monospace' }}>
                  {lyapunovState.totalHandovers}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
