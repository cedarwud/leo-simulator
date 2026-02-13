import { useMemo, useState, type CSSProperties } from 'react';
import type { LyapunovState, LyapunovConfig, BaselineMetrics } from '@/types/lyapunov';

interface ConstraintValidationPanelProps {
  lyapunovState: LyapunovState;
  config: LyapunovConfig;
}

function StatusBadge({ pass, label }: { pass: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 6px',
      borderRadius: '3px',
      fontSize: '10px',
      fontWeight: '600',
      backgroundColor: pass ? 'rgba(68, 255, 136, 0.15)' : 'rgba(255, 68, 68, 0.15)',
      color: pass ? '#44ff88' : '#ff4444',
      border: `1px solid ${pass ? 'rgba(68, 255, 136, 0.3)' : 'rgba(255, 68, 68, 0.3)'}`,
    }}>
      {pass ? 'PASS' : 'FAIL'} {label}
    </span>
  );
}

function MetricRow({ label, value, threshold, unit, pass }: {
  label: string;
  value: string;
  threshold: string;
  unit?: string;
  pass: boolean;
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '5px 0',
      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    }}>
      <span style={{ fontSize: '11px', color: '#bbbbbb' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          fontFamily: 'monospace',
          fontSize: '11px',
          color: pass ? '#44ff88' : '#ff4444',
        }}>
          {value}{unit ?? ''}
        </span>
        <span style={{ fontSize: '9px', color: '#666666' }}>
          / {threshold}{unit ?? ''}
        </span>
      </div>
    </div>
  );
}

function computeStats(data: number[]): { mean: number; std: number; ci95: [number, number] } {
  const n = data.length;
  if (n === 0) return { mean: 0, std: 0, ci95: [0, 0] };
  const mean = data.reduce((s, v) => s + v, 0) / n;
  if (n < 2) return { mean, std: 0, ci95: [mean, mean] };
  const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  const ci = 1.96 * std / Math.sqrt(n);
  return { mean, std, ci95: [mean - ci, mean + ci] };
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{
      fontSize: '11px',
      color: '#cc88ff',
      fontWeight: '600',
      marginBottom: '6px',
    }}>
      {title}
    </div>
  );
}

const cardStyle: CSSProperties = {
  padding: '8px',
  backgroundColor: 'rgba(255, 255, 255, 0.04)',
  borderRadius: '6px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  marginBottom: '8px',
};

type GroupKey = 'beamHopping' | 'handover' | 'spectrumSharing';

const GROUP_META: Record<GroupKey, { label: string; baselines: { key: string; label: string; color: string }[] }> = {
  beamHopping: {
    label: 'Beam Mgmt',
    baselines: [
      { key: 'proposed', label: 'Proposed', color: '#44bbff' },
      { key: 'greedyBH', label: 'Greedy', color: '#ff6666' },
      { key: 'mosekGreedy', label: 'MOSEK+Gr', color: '#44ff88' },
      { key: 'swapMatchBH', label: 'SwapMatch', color: '#ffaa44' },
    ],
  },
  handover: {
    label: 'Handover',
    baselines: [
      { key: 'proposed', label: 'Proposed', color: '#44bbff' },
      { key: 'loadBalance', label: 'LoadBal', color: '#ff6666' },
      { key: 'entropy', label: 'Entropy', color: '#44ff88' },
      { key: 'cellClustering', label: 'Cluster', color: '#ffaa44' },
    ],
  },
  spectrumSharing: {
    label: 'Spectrum',
    baselines: [
      { key: 'proposed', label: 'Proposed', color: '#44bbff' },
      { key: 'greedySS', label: 'GreedySS', color: '#ff6666' },
      { key: 'ga', label: 'GA', color: '#44ff88' },
      { key: 'bwo', label: 'BWO', color: '#ffaa44' },
    ],
  },
};

export function ConstraintValidationPanel({
  lyapunovState,
  config,
}: ConstraintValidationPanelProps) {
  const [activeGroup, setActiveGroup] = useState<GroupKey>('beamHopping');

  const stats = useMemo(() => {
    const history = lyapunovState.history;
    if (history.length === 0) return null;

    const lastSnapshot = history[history.length - 1];
    const epochs = history.length;

    // Constraint checks
    const hoFreq = lyapunovState.avgHandoverFrequency;
    const hoFreqPass = hoFreq <= config.maxHandoverFrequency;
    const resourceUtil = lyapunovState.resourceUtilization;
    const resourceUtilPass = resourceUtil >= config.resourceUtilizationThreshold * 0.8;

    const recentQueues = history.slice(-10).map(h => h.avgQueueLength);
    const isStable = recentQueues.length >= 5 &&
      recentQueues[recentQueues.length - 1] <= recentQueues[0] * 1.5;

    const avgVQ = lyapunovState.virtualQueues.length > 0
      ? lyapunovState.virtualQueues.reduce((s, v) => s + v.value, 0) / lyapunovState.virtualQueues.length
      : 0;

    const recentDrift = history.slice(-10).map(h => h.driftPlusPenalty);
    const driftConverging = recentDrift.length >= 5 &&
      recentDrift[recentDrift.length - 1] <= recentDrift[0] * 1.2;

    // Proposed stats
    const proposedStats = {
      queue: computeStats(history.map(h => h.avgQueueLength)),
      hoFreq: computeStats(history.map(h => h.handoverFrequency)),
      util: computeStats(history.map(h => h.resourceUtilization)),
    };

    // Per-group baseline stats
    const groupStats: Record<GroupKey, Record<string, { queue: ReturnType<typeof computeStats>; hoFreq: ReturnType<typeof computeStats>; util: ReturnType<typeof computeStats> }>> = {
      beamHopping: {},
      handover: {},
      spectrumSharing: {},
    };

    for (const gk of ['beamHopping', 'handover', 'spectrumSharing'] as GroupKey[]) {
      const meta = GROUP_META[gk];
      for (const bl of meta.baselines) {
        groupStats[gk][bl.key] = {
          queue: computeStats(history.map(h => {
            const group = h.baselineGroups?.[gk];
            return (group as unknown as Record<string, BaselineMetrics>)?.[bl.key]?.avgQueueLength ?? 0;
          })),
          hoFreq: computeStats(history.map(h => {
            const group = h.baselineGroups?.[gk];
            return (group as unknown as Record<string, BaselineMetrics>)?.[bl.key]?.handoverFrequency ?? 0;
          })),
          util: computeStats(history.map(h => {
            const group = h.baselineGroups?.[gk];
            return (group as unknown as Record<string, BaselineMetrics>)?.[bl.key]?.resourceUtilization ?? 0;
          })),
        };
      }
    }

    // Execution time stats
    const avgExecTimes = history.some(h => h.executionTimesMs) ? {
      algorithm1: computeStats(history.filter(h => h.executionTimesMs).map(h => h.executionTimesMs!.algorithm1)),
      algorithm2: computeStats(history.filter(h => h.executionTimesMs).map(h => h.executionTimesMs!.algorithm2)),
      algorithm3: computeStats(history.filter(h => h.executionTimesMs).map(h => h.executionTimesMs!.algorithm3)),
      total: computeStats(history.filter(h => h.executionTimesMs).map(h => h.executionTimesMs!.total)),
    } : null;

    return {
      epochs,
      hoFreq,
      hoFreqPass,
      resourceUtil,
      resourceUtilPass,
      isStable,
      avgVQ,
      driftConverging,
      totalHandovers: lyapunovState.totalHandovers,
      lastSnapshot,
      proposedStats,
      groupStats,
      avgExecTimes,
    };
  }, [lyapunovState, config]);

  if (!stats || stats.epochs < 2) {
    return null;
  }

  const meta = GROUP_META[activeGroup];

  return (
    <div>
      <div style={{
        fontSize: '15px',
        color: '#ffffff',
        fontWeight: '600',
        marginBottom: '10px',
      }}>
        Constraint Validation
        <span style={{
          fontSize: '11px',
          color: '#888888',
          fontWeight: '400',
          marginLeft: '8px',
        }}>
          ({stats.epochs} epochs)
        </span>
      </div>

      {/* Status badges */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        marginBottom: '10px',
      }}>
        <StatusBadge pass={stats.hoFreqPass} label="HO Freq" />
        <StatusBadge pass={stats.resourceUtilPass} label="Util" />
        <StatusBadge pass={stats.isStable} label="Queue" />
        <StatusBadge pass={stats.driftConverging} label="Drift" />
      </div>

      {/* Detailed metrics */}
      <div style={cardStyle}>
        <MetricRow
          label="Avg HO Freq"
          value={stats.hoFreq.toFixed(4)}
          threshold={config.maxHandoverFrequency.toFixed(3)}
          pass={stats.hoFreqPass}
        />
        <MetricRow
          label="Resource Util"
          value={(stats.resourceUtil * 100).toFixed(1)}
          threshold={(config.resourceUtilizationThreshold * 100).toFixed(0)}
          unit="%"
          pass={stats.resourceUtilPass}
        />
        <MetricRow
          label="Total Handovers"
          value={stats.totalHandovers.toString()}
          threshold="-"
          pass={true}
        />
        <MetricRow
          label="Avg Virtual Queue"
          value={stats.avgVQ.toFixed(2)}
          threshold="<1.0"
          pass={stats.avgVQ < 1.0}
        />
      </div>

      {/* Group selector for baseline stats */}
      {stats.epochs >= 5 && (
        <>
          <div style={{
            display: 'flex',
            gap: '2px',
            marginBottom: '8px',
            borderRadius: '4px',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            {(['beamHopping', 'handover', 'spectrumSharing'] as GroupKey[]).map(gk => {
              const gm = GROUP_META[gk];
              return (
                <button
                  key={gk}
                  onClick={() => setActiveGroup(gk)}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    fontSize: '9px',
                    fontWeight: activeGroup === gk ? '700' : '400',
                    color: activeGroup === gk ? '#ffffff' : '#888888',
                    backgroundColor: activeGroup === gk ? 'rgba(204, 136, 255, 0.2)' : 'rgba(255,255,255,0.03)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {gm.label}
                </button>
              );
            })}
          </div>

          {/* Statistical summary table for selected group */}
          <div style={cardStyle}>
            <SectionHeader title={`${meta.label} (mean \u00B1 std)`} />
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                fontSize: '9px',
                color: '#cccccc',
                borderCollapse: 'collapse',
              }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '3px 4px', color: '#999' }}>Algorithm</th>
                    <th style={{ textAlign: 'right', padding: '3px 4px', color: '#999' }}>Queue</th>
                    <th style={{ textAlign: 'right', padding: '3px 4px', color: '#999' }}>HO Freq</th>
                    <th style={{ textAlign: 'right', padding: '3px 4px', color: '#999' }}>Util%</th>
                  </tr>
                </thead>
                <tbody>
                  {meta.baselines.map(bl => {
                    const s = stats.groupStats[activeGroup][bl.key];
                    if (!s) return null;
                    return (
                      <tr key={bl.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '3px 4px', color: bl.color, fontWeight: '600' }}>{bl.label}</td>
                        <td style={{ textAlign: 'right', padding: '3px 4px', fontFamily: 'monospace' }}>
                          {s.queue.mean.toFixed(1)}
                          <span style={{ color: '#666' }}>{'\u00B1'}{s.queue.std.toFixed(1)}</span>
                        </td>
                        <td style={{ textAlign: 'right', padding: '3px 4px', fontFamily: 'monospace' }}>
                          {s.hoFreq.mean.toFixed(4)}
                          <span style={{ color: '#666' }}>{'\u00B1'}{s.hoFreq.std.toFixed(4)}</span>
                        </td>
                        <td style={{ textAlign: 'right', padding: '3px 4px', fontFamily: 'monospace' }}>
                          {(s.util.mean * 100).toFixed(1)}
                          <span style={{ color: '#666' }}>{'\u00B1'}{(s.util.std * 100).toFixed(1)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Complexity / Execution Time */}
      {stats.avgExecTimes && (
        <div style={cardStyle}>
          <SectionHeader title="Complexity (avg ms/epoch)" />
          {([
            ['Algo 1 (Handover)', stats.avgExecTimes.algorithm1],
            ['Algo 2 (WMIS)', stats.avgExecTimes.algorithm2],
            ['Algo 3 (BSSA)', stats.avgExecTimes.algorithm3],
            ['Total', stats.avgExecTimes.total],
          ] as [string, ReturnType<typeof computeStats>][]).map(([label, s]) => (
            <div key={label} style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '3px 0',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <span style={{ fontSize: '10px', color: '#999' }}>{label}</span>
              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#88ccff' }}>
                {s.mean.toFixed(2)}
                <span style={{ color: '#555' }}>{'\u00B1'}{s.std.toFixed(2)} ms</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
