import { useMemo, useState, Fragment } from 'react';
import type { EpochSnapshot, BaselineGroups, BaselineMetrics } from '@/types/lyapunov';

interface SimulationChartsPanelProps {
  history: EpochSnapshot[];
}

/** A single series for the multi-line chart */
interface ChartSeries {
  data: number[];
  color: string;
  label: string;
  dashed?: boolean;
}

/** Multi-line SVG chart with legend */
function MultiLineChart({
  series,
  title,
  unit,
  formatValue,
  maxPoints = 100,
}: {
  series: ChartSeries[];
  title: string;
  unit?: string;
  formatValue?: (v: number) => string;
  maxPoints?: number;
}) {
  const chartW = 300;
  const chartH = 72;
  const padT = 2;
  const padB = 2;

  const fmt = formatValue ?? ((v: number) => v.toFixed(2));

  // Compute global min/max across ALL series for consistent Y axis
  const allValues = series.flatMap(s => {
    const d = s.data.length > maxPoints ? s.data.slice(-maxPoints) : s.data;
    return d;
  });
  const globalMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const globalMax = allValues.length > 0 ? Math.max(...allValues) : 1;
  const range = globalMax - globalMin || 1;

  const buildPolyline = (data: number[]) => {
    const display = data.length > maxPoints ? data.slice(-maxPoints) : data;
    return display.map((v, i) => {
      const x = (i / Math.max(display.length - 1, 1)) * chartW;
      const y = padT + (1 - (v - globalMin) / range) * (chartH - padT - padB);
      return `${x},${y}`;
    }).join(' ');
  };

  // Latest values for the proposed series (first one)
  const proposedLast = series[0]?.data.length > 0
    ? series[0].data[series[0].data.length - 1]
    : 0;

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '11px',
        color: '#bbbbbb',
        marginBottom: '3px',
      }}>
        <span>{title}</span>
        <span style={{ fontFamily: 'monospace', color: series[0]?.color ?? '#fff' }}>
          {fmt(proposedLast)}{unit ?? ''}
        </span>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${chartW} ${chartH}`}
        preserveAspectRatio="none"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '4px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {[...series].reverse().map((s, idx) => {
          if (s.data.length < 2) return null;
          const points = buildPolyline(s.data);
          return (
            <Fragment key={idx}>
              {!s.dashed && (
                <polygon
                  points={`0,${chartH - padB} ${points} ${chartW},${chartH - padB}`}
                  fill={s.color}
                  fillOpacity={0.08}
                />
              )}
              <polyline
                points={points}
                fill="none"
                stroke={s.color}
                strokeWidth={s.dashed ? 1 : 1.5}
                strokeDasharray={s.dashed ? '4,3' : undefined}
                strokeLinejoin="round"
                strokeOpacity={s.dashed ? 0.7 : 1}
              />
            </Fragment>
          );
        })}
      </svg>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '9px',
        color: '#555555',
        marginTop: '1px',
      }}>
        <span>{fmt(globalMin)}</span>
        <span>{fmt(globalMax)}</span>
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        marginTop: '3px',
      }}>
        {series.map((s, idx) => {
          const lastVal = s.data.length > 0 ? s.data[s.data.length - 1] : 0;
          return (
            <div key={idx} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              fontSize: '9px',
              color: '#999999',
            }}>
              <svg width="12" height="6" viewBox="0 0 12 6">
                <line
                  x1="0" y1="3" x2="12" y2="3"
                  stroke={s.color}
                  strokeWidth={1.5}
                  strokeDasharray={s.dashed ? '3,2' : undefined}
                />
              </svg>
              <span style={{ color: s.color }}>{s.label}</span>
              <span style={{ fontFamily: 'monospace', color: '#666' }}>{fmt(lastVal)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type GroupKey = 'beamHopping' | 'handover' | 'spectrumSharing';

interface GroupConfig {
  key: GroupKey;
  label: string;
  baselineNames: { key: string; label: string; color: string }[];
  /** Arrival rate (Gbps) for delay computation (Little's law) */
  arrivalRateGbps?: number;
}

const GROUP_CONFIGS: GroupConfig[] = [
  {
    key: 'beamHopping',
    label: 'Beam Mgmt',
    arrivalRateGbps: 6.52,
    baselineNames: [
      { key: 'greedyBH', label: 'Greedy', color: '#ff6666' },
      { key: 'mosekGreedy', label: 'MOSEK+Gr', color: '#44ff88' },
      { key: 'swapMatchBH', label: 'SwapMatch', color: '#ffaa44' },
    ],
  },
  {
    key: 'handover',
    label: 'Handover',
    arrivalRateGbps: 10.57,
    baselineNames: [
      { key: 'loadBalance', label: 'LoadBal', color: '#ff6666' },
      { key: 'entropy', label: 'Entropy', color: '#44ff88' },
      { key: 'cellClustering', label: 'Cluster', color: '#ffaa44' },
    ],
  },
  {
    key: 'spectrumSharing',
    label: 'Spectrum',
    arrivalRateGbps: 11.871,
    baselineNames: [
      { key: 'greedySS', label: 'GreedySS', color: '#ff6666' },
      { key: 'ga', label: 'GA', color: '#44ff88' },
      { key: 'bwo', label: 'BWO', color: '#ffaa44' },
    ],
  },
];

/** Extract a metric from a baseline group */
function extractMetric(
  history: EpochSnapshot[],
  groupKey: keyof BaselineGroups,
  baselineKey: string,
  metric: keyof BaselineMetrics,
): number[] {
  return history.map(h => {
    const group = h.baselineGroups?.[groupKey];
    if (!group) return 0;
    const baseline = (group as Record<string, BaselineMetrics>)[baselineKey];
    return baseline?.[metric] ?? 0;
  });
}

export function SimulationChartsPanel({ history }: SimulationChartsPanelProps) {
  const [activeGroup, setActiveGroup] = useState<GroupKey>('beamHopping');

  const chartData = useMemo(() => {
    if (history.length === 0) return null;

    const gc = GROUP_CONFIGS.find(g => g.key === activeGroup)!;

    return {
      avgQueue: {
        proposed: extractMetric(history, activeGroup, 'proposed', 'avgQueueLength'),
        baselines: gc.baselineNames.map(b => ({
          data: extractMetric(history, activeGroup, b.key, 'avgQueueLength'),
          color: b.color,
          label: b.label,
        })),
      },
      hoFreq: {
        proposed: extractMetric(history, activeGroup, 'proposed', 'handoverFrequency'),
        baselines: gc.baselineNames.map(b => ({
          data: extractMetric(history, activeGroup, b.key, 'handoverFrequency'),
          color: b.color,
          label: b.label,
        })),
      },
      resourceUtil: {
        proposed: extractMetric(history, activeGroup, 'proposed', 'resourceUtilization'),
        baselines: gc.baselineNames.map(b => ({
          data: extractMetric(history, activeGroup, b.key, 'resourceUtilization'),
          color: b.color,
          label: b.label,
        })),
      },
      driftPenalty: {
        proposed: extractMetric(history, activeGroup, 'proposed', 'driftPlusPenalty'),
        baselines: gc.baselineNames.map(b => ({
          data: extractMetric(history, activeGroup, b.key, 'driftPlusPenalty'),
          color: b.color,
          label: b.label,
        })),
      },
    };
  }, [history, activeGroup]);

  const fmtQueue = (v: number) => v.toFixed(1);
  const fmtFreq = (v: number) => v.toFixed(4);
  const fmtUtil = (v: number) => (v * 100).toFixed(1);
  const fmtDrift = (v: number) => {
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toFixed(0);
  };

  const buildSeries = (
    proposedData: number[],
    baselines: { data: number[]; color: string; label: string }[],
    proposedColor: string,
  ): ChartSeries[] => [
    { data: proposedData, color: proposedColor, label: 'Proposed' },
    ...baselines.map(b => ({ data: b.data, color: b.color, label: b.label, dashed: true })),
  ];

  const gc = GROUP_CONFIGS.find(g => g.key === activeGroup)!;

  return (
    <div>
      <div style={{
        fontSize: '15px',
        color: '#ffffff',
        fontWeight: '600',
        marginBottom: '8px',
      }}>
        Simulation Charts
        {history.length > 0 && (
          <span style={{
            fontSize: '11px',
            color: '#888888',
            fontWeight: '400',
            marginLeft: '8px',
          }}>
            (Epoch {history[history.length - 1].epoch})
          </span>
        )}
      </div>

      {/* Comparison group tabs */}
      <div style={{
        display: 'flex',
        gap: '2px',
        marginBottom: '10px',
        borderRadius: '4px',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
      }}>
        {GROUP_CONFIGS.map(g => (
          <button
            key={g.key}
            onClick={() => setActiveGroup(g.key)}
            style={{
              flex: 1,
              padding: '5px 8px',
              fontSize: '10px',
              fontWeight: activeGroup === g.key ? '700' : '400',
              color: activeGroup === g.key ? '#ffffff' : '#888888',
              backgroundColor: activeGroup === g.key ? 'rgba(68, 187, 255, 0.2)' : 'rgba(255,255,255,0.03)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Real-time charts */}
      {!chartData || history.length < 2 ? (
        <div style={{
          fontSize: '12px',
          color: '#888888',
          textAlign: 'center',
          padding: '20px 0',
        }}>
          Waiting for simulation data (epoch &ge; 2)...
        </div>
      ) : (
        <>
          <MultiLineChart
            title="Average Queue Length"
            unit=" Mb"
            formatValue={fmtQueue}
            series={buildSeries(chartData.avgQueue.proposed, chartData.avgQueue.baselines, '#44bbff')}
          />

          {gc.arrivalRateGbps && (
            <MultiLineChart
              title="Average Delay"
              unit=" s"
              formatValue={(v: number) => v < 0.001 ? v.toExponential(1) : v.toFixed(3)}
              series={buildSeries(
                chartData.avgQueue.proposed.map(q => q / (gc.arrivalRateGbps! * 1000 / 20)),
                chartData.avgQueue.baselines.map(b => ({
                  ...b,
                  data: b.data.map(q => q / (gc.arrivalRateGbps! * 1000 / 20)),
                })),
                '#88ddff',
              )}
            />
          )}

          <MultiLineChart
            title="Handover Frequency"
            formatValue={fmtFreq}
            series={buildSeries(chartData.hoFreq.proposed, chartData.hoFreq.baselines, '#ff8844')}
          />

          <MultiLineChart
            title="Resource Utilization"
            unit="%"
            formatValue={fmtUtil}
            series={buildSeries(chartData.resourceUtil.proposed, chartData.resourceUtil.baselines, '#44ff88')}
          />

          <MultiLineChart
            title="Drift + Penalty"
            formatValue={fmtDrift}
            series={buildSeries(chartData.driftPenalty.proposed, chartData.driftPenalty.baselines, '#cc88ff')}
          />
        </>
      )}
    </div>
  );
}
