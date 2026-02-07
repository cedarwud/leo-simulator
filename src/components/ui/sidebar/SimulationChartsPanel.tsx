import React, { useMemo, useState, useCallback } from 'react';
import type { EpochSnapshot, BaselineGroups, BaselineMetrics } from '@/types/paper41';
import { generateEarthFixedCells, DEFAULT_CELL_CONFIG } from '@/features/beam-hopping/components/EarthFixedCells';
import { runVParameterSweep, runArrivalRateSweep, runFig10CDFAnalysis, type VSweepResult, type RateSweepResult, type Fig10CDFResult } from '@/features/beam-hopping/algorithms/vSweep';

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
            <React.Fragment key={idx}>
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
            </React.Fragment>
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

type GroupKey = 'beamHopping' | 'handover' | 'spectrumSharing' | 'cdfAnalysis' | 'rateSweep' | 'vSweep';

interface GroupConfig {
  key: GroupKey;
  label: string;
  figNum: string;
  baselineNames: { key: string; label: string; color: string }[];
  /** Arrival rate (Gbps) for delay computation (Little's law) */
  arrivalRateGbps?: number;
}

const GROUP_CONFIGS: GroupConfig[] = [
  {
    key: 'beamHopping',
    label: 'Beam Hopping',
    figNum: 'Fig.6',
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
    figNum: 'Fig.7',
    arrivalRateGbps: 10.57,
    baselineNames: [
      { key: 'loadBalance', label: 'LoadBal', color: '#ff6666' },
      { key: 'entropy', label: 'Entropy', color: '#44ff88' },
      { key: 'cellClustering', label: 'Cluster', color: '#ffaa44' },
    ],
  },
  {
    key: 'spectrumSharing',
    label: 'Spectrum Sharing',
    figNum: 'Fig.8',
    arrivalRateGbps: 11.871,
    baselineNames: [
      { key: 'greedySS', label: 'GreedySS', color: '#ff6666' },
      { key: 'ga', label: 'GA', color: '#44ff88' },
      { key: 'bwo', label: 'BWO', color: '#ffaa44' },
    ],
  },
  {
    key: 'cdfAnalysis',
    label: 'CDF',
    figNum: 'Fig.10',
    baselineNames: [],
  },
  {
    key: 'rateSweep',
    label: 'Rate Sweep',
    figNum: 'Fig.11',
    baselineNames: [],
  },
  {
    key: 'vSweep',
    label: 'V Sweep',
    figNum: 'Fig.12',
    baselineNames: [],
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

/** V Sweep colors for different V values */
const V_SWEEP_COLORS = ['#44bbff', '#ff6666', '#44ff88', '#ffaa44', '#cc88ff', '#ff88cc'];

/** V Sweep sub-component */
function VSweepPanel() {
  const [sweepResult, setSweepResult] = useState<VSweepResult | null>(null);
  const [running, setRunning] = useState(false);

  // Generate cells deterministically (same as MainScene)
  const cells = useMemo(() => generateEarthFixedCells(DEFAULT_CELL_CONFIG), []);

  const runSweep = useCallback(() => {
    if (cells.length === 0 || running) return;
    setRunning(true);
    // Use setTimeout to avoid blocking UI
    setTimeout(() => {
      const result = runVParameterSweep(cells, [10, 50, 100, 200, 500], 20000);
      setSweepResult(result);
      setRunning(false);
    }, 50);
  }, [cells, running]);

  if (!sweepResult) {
    return (
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
          Fig. 12: Influence of parameter V on handover frequency and objective value
        </div>
        <button
          onClick={runSweep}
          disabled={running || !cells || cells.length === 0}
          style={{
            padding: '6px 16px',
            fontSize: '11px',
            backgroundColor: running ? '#333' : 'rgba(68, 187, 255, 0.2)',
            color: running ? '#666' : '#44bbff',
            border: '1px solid rgba(68, 187, 255, 0.3)',
            borderRadius: '4px',
            cursor: running ? 'wait' : 'pointer',
          }}
        >
          {running ? 'Running V sweep...' : 'Run V Parameter Sweep'}
        </button>
        <div style={{ fontSize: '9px', color: '#555', marginTop: '6px' }}>
          V = [10, 50, 100, 200, 500] x 20000 epochs
        </div>
      </div>
    );
  }

  const fmtFreq = (v: number) => v.toFixed(4);
  const fmtDrift = (v: number) => {
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toFixed(0);
  };

  // Build series for handover frequency
  const hoFreqSeries: ChartSeries[] = sweepResult.series.map((s, i) => ({
    data: s.metrics.map(m => m.handoverFrequency),
    color: V_SWEEP_COLORS[i % V_SWEEP_COLORS.length],
    label: `V=${s.V}`,
  }));

  // Build series for drift-plus-penalty
  const dppSeries: ChartSeries[] = sweepResult.series.map((s, i) => ({
    data: s.metrics.map(m => m.driftPlusPenalty),
    color: V_SWEEP_COLORS[i % V_SWEEP_COLORS.length],
    label: `V=${s.V}`,
  }));

  // Build series for avg queue length
  const queueSeries: ChartSeries[] = sweepResult.series.map((s, i) => ({
    data: s.metrics.map(m => m.avgQueueLength),
    color: V_SWEEP_COLORS[i % V_SWEEP_COLORS.length],
    label: `V=${s.V}`,
  }));

  return (
    <div>
      <MultiLineChart
        title="Handover Frequency vs V (Fig.12a)"
        formatValue={fmtFreq}
        series={hoFreqSeries}
      />
      <MultiLineChart
        title="Drift+Penalty vs V (Fig.12b)"
        formatValue={fmtDrift}
        series={dppSeries}
      />
      <MultiLineChart
        title="Avg Queue Length vs V"
        unit=" Mb"
        formatValue={(v: number) => v.toFixed(1)}
        series={queueSeries}
      />
      <button
        onClick={runSweep}
        disabled={running}
        style={{
          padding: '4px 12px',
          fontSize: '10px',
          backgroundColor: 'rgba(255,255,255,0.05)',
          color: '#888',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '3px',
          cursor: 'pointer',
          marginTop: '4px',
        }}
      >
        Re-run Sweep
      </button>
    </div>
  );
}

/** Rate Sweep sub-component (Fig. 11) */
function RateSweepPanel() {
  const [sweepResult, setSweepResult] = useState<RateSweepResult | null>(null);
  const [running, setRunning] = useState(false);

  const cells = useMemo(() => generateEarthFixedCells(DEFAULT_CELL_CONFIG), []);

  const runSweep = useCallback(() => {
    if (cells.length === 0 || running) return;
    setRunning(true);
    setTimeout(() => {
      const result = runArrivalRateSweep(cells, [10.219, 10.608, 10.996, 11.385, 11.871], 20000);
      setSweepResult(result);
      setRunning(false);
    }, 50);
  }, [cells, running]);

  if (!sweepResult) {
    return (
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
          Fig. 11: Queue stability region — avg queue length vs arrival rate
        </div>
        <button
          onClick={runSweep}
          disabled={running || !cells || cells.length === 0}
          style={{
            padding: '6px 16px',
            fontSize: '11px',
            backgroundColor: running ? '#333' : 'rgba(68, 187, 255, 0.2)',
            color: running ? '#666' : '#44bbff',
            border: '1px solid rgba(68, 187, 255, 0.3)',
            borderRadius: '4px',
            cursor: running ? 'wait' : 'pointer',
          }}
        >
          {running ? 'Running rate sweep...' : 'Run Arrival Rate Sweep'}
        </button>
        <div style={{ fontSize: '9px', color: '#555', marginTop: '6px' }}>
          Rates = [10.219, 10.608, 10.996, 11.385, 11.871] Gbps x 20000 epochs
        </div>
      </div>
    );
  }

  const fmtQueue = (v: number) => v.toFixed(1);

  const queueSeries: ChartSeries[] = sweepResult.series.map((s, i) => ({
    data: s.metrics.map(m => m.avgQueueLength),
    color: V_SWEEP_COLORS[i % V_SWEEP_COLORS.length],
    label: `${s.rateGbps}G`,
  }));

  const dppSeries: ChartSeries[] = sweepResult.series.map((s, i) => ({
    data: s.metrics.map(m => m.driftPlusPenalty),
    color: V_SWEEP_COLORS[i % V_SWEEP_COLORS.length],
    label: `${s.rateGbps}G`,
  }));

  const hoFreqSeries: ChartSeries[] = sweepResult.series.map((s, i) => ({
    data: s.metrics.map(m => m.handoverFrequency),
    color: V_SWEEP_COLORS[i % V_SWEEP_COLORS.length],
    label: `${s.rateGbps}G`,
  }));

  const fmtDrift = (v: number) => {
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toFixed(0);
  };

  return (
    <div>
      <MultiLineChart
        title="Objective Value P_o vs Rate (Fig.11a)"
        formatValue={fmtDrift}
        series={dppSeries}
      />
      <MultiLineChart
        title="Avg Queue Length vs Rate (Fig.11b)"
        unit=" Mb"
        formatValue={fmtQueue}
        series={queueSeries}
      />
      <MultiLineChart
        title="Handover Frequency vs Rate (Fig.11c)"
        formatValue={(v: number) => v.toFixed(4)}
        series={hoFreqSeries}
      />
      <button
        onClick={runSweep}
        disabled={running}
        style={{
          padding: '4px 12px',
          fontSize: '10px',
          backgroundColor: 'rgba(255,255,255,0.05)',
          color: '#888',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '3px',
          cursor: 'pointer',
          marginTop: '4px',
        }}
      >
        Re-run Sweep
      </button>
    </div>
  );
}

/** CDF SVG chart — shows cumulative probability vs value */
function CDFChart({
  curves,
  title,
  xLabel,
}: {
  curves: { data: { value: number; probability: number }[]; color: string; label: string }[];
  title: string;
  xLabel: string;
}) {
  const chartW = 300;
  const chartH = 72;
  const padT = 2;
  const padB = 2;

  const allValues = curves.flatMap(c => c.data.map(p => p.value));
  const xMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const xMax = allValues.length > 0 ? Math.max(...allValues) : 1;
  const xRange = xMax - xMin || 1;

  const buildPolyline = (data: { value: number; probability: number }[]) => {
    return data.map(p => {
      const x = ((p.value - xMin) / xRange) * chartW;
      const y = padT + (1 - p.probability) * (chartH - padT - padB);
      return `${x},${y}`;
    }).join(' ');
  };

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '11px', color: '#bbbbbb', marginBottom: '3px' }}>
        {title}
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
        {curves.map((c, idx) => (
          <polyline
            key={idx}
            points={buildPolyline(c.data)}
            fill="none"
            stroke={c.color}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '9px',
        color: '#555555',
        marginTop: '1px',
      }}>
        <span>{xMin.toFixed(1)} dB</span>
        <span style={{ color: '#777' }}>{xLabel}</span>
        <span>{xMax.toFixed(1)} dB</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '3px' }}>
        {curves.map((c, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '9px', color: '#999' }}>
            <svg width="12" height="6" viewBox="0 0 12 6">
              <line x1="0" y1="3" x2="12" y2="3" stroke={c.color} strokeWidth={1.5} />
            </svg>
            <span style={{ color: c.color }}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Fig.10 CDF sub-component */
function CDFAnalysisPanel() {
  const [cdfResult, setCdfResult] = useState<Fig10CDFResult | null>(null);
  const [running, setRunning] = useState(false);

  const runAnalysis = useCallback(() => {
    if (running) return;
    setRunning(true);
    setTimeout(() => {
      const result = runFig10CDFAnalysis(32400);
      setCdfResult(result);
      setRunning(false);
    }, 50);
  }, [running]);

  if (!cdfResult) {
    return (
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
          Fig. 10: Static spectrum sharing SINR/INR CDF
        </div>
        <button
          onClick={runAnalysis}
          disabled={running}
          style={{
            padding: '6px 16px',
            fontSize: '11px',
            backgroundColor: running ? '#333' : 'rgba(68, 187, 255, 0.2)',
            color: running ? '#666' : '#44bbff',
            border: '1px solid rgba(68, 187, 255, 0.3)',
            borderRadius: '4px',
            cursor: running ? 'wait' : 'pointer',
          }}
        >
          {running ? 'Running CDF analysis...' : 'Run CDF Analysis'}
        </button>
        <div style={{ fontSize: '9px', color: '#555', marginTop: '6px' }}>
          32,400 Monte Carlo samples
        </div>
      </div>
    );
  }

  return (
    <div>
      <CDFChart
        title="INR at Terrestrial User (Fig.10b)"
        xLabel="INR (dB)"
        curves={[
          { data: cdfResult.inrCdf, color: '#44bbff', label: 'INR' },
        ]}
      />
      <CDFChart
        title="SINR under Spectrum Sharing (Fig.10a)"
        xLabel="SINR (dB)"
        curves={[
          { data: cdfResult.sinrWideCdf, color: '#44ff88', label: 'Wide-beam' },
          { data: cdfResult.sinrEdgeCdf, color: '#ff6666', label: 'Cell-edge' },
        ]}
      />
      <div style={{ fontSize: '9px', color: '#555', marginTop: '4px' }}>
        {cdfResult.numSamples} samples, Ka-band 20 GHz
      </div>
      <button
        onClick={runAnalysis}
        disabled={running}
        style={{
          padding: '4px 12px',
          fontSize: '10px',
          backgroundColor: 'rgba(255,255,255,0.05)',
          color: '#888',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '3px',
          cursor: 'pointer',
          marginTop: '4px',
        }}
      >
        Re-run Analysis
      </button>
    </div>
  );
}

export function SimulationChartsPanel({ history }: SimulationChartsPanelProps) {
  const [activeGroup, setActiveGroup] = useState<GroupKey>('beamHopping');

  const chartData = useMemo(() => {
    if (history.length === 0 || activeGroup === 'vSweep' || activeGroup === 'rateSweep' || activeGroup === 'cdfAnalysis') return null;

    const gc = GROUP_CONFIGS.find(g => g.key === activeGroup)!;
    const gk = gc.key as Exclude<GroupKey, 'vSweep' | 'rateSweep' | 'cdfAnalysis'>;

    return {
      avgQueue: {
        proposed: extractMetric(history, gk, 'proposed', 'avgQueueLength'),
        baselines: gc.baselineNames.map(b => ({
          data: extractMetric(history, gk, b.key, 'avgQueueLength'),
          color: b.color,
          label: b.label,
        })),
      },
      hoFreq: {
        proposed: extractMetric(history, gk, 'proposed', 'handoverFrequency'),
        baselines: gc.baselineNames.map(b => ({
          data: extractMetric(history, gk, b.key, 'handoverFrequency'),
          color: b.color,
          label: b.label,
        })),
      },
      resourceUtil: {
        proposed: extractMetric(history, gk, 'proposed', 'resourceUtilization'),
        baselines: gc.baselineNames.map(b => ({
          data: extractMetric(history, gk, b.key, 'resourceUtilization'),
          color: b.color,
          label: b.label,
        })),
      },
      driftPenalty: {
        proposed: extractMetric(history, gk, 'proposed', 'driftPlusPenalty'),
        baselines: gc.baselineNames.map(b => ({
          data: extractMetric(history, gk, b.key, 'driftPlusPenalty'),
          color: b.color,
          label: b.label,
        })),
      },
    };
  }, [history, activeGroup]);

  if (activeGroup !== 'vSweep' && activeGroup !== 'rateSweep' && activeGroup !== 'cdfAnalysis' && (!chartData || history.length < 2)) {
    return (
      <div>
        <div style={{
          fontSize: '15px',
          color: '#ffffff',
          fontWeight: '600',
          marginBottom: '12px',
        }}>
          Simulation Charts
        </div>
        {/* Group selector tabs — always visible */}
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
                padding: '4px 6px',
                fontSize: '9px',
                fontWeight: activeGroup === g.key ? '700' : '400',
                color: activeGroup === g.key ? '#ffffff' : '#888888',
                backgroundColor: activeGroup === g.key ? 'rgba(68, 187, 255, 0.2)' : 'rgba(255,255,255,0.03)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {g.figNum}
            </button>
          ))}
        </div>
        <div style={{
          fontSize: '12px',
          color: '#888888',
          textAlign: 'center',
          padding: '20px 0',
        }}>
          Waiting for simulation data (epoch &ge; 2)...
        </div>
      </div>
    );
  }

  const gc = GROUP_CONFIGS.find(g => g.key === activeGroup)!;
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

  return (
    <div>
      <div style={{
        fontSize: '15px',
        color: '#ffffff',
        fontWeight: '600',
        marginBottom: '8px',
      }}>
        Simulation Charts
        <span style={{
          fontSize: '11px',
          color: '#888888',
          fontWeight: '400',
          marginLeft: '8px',
        }}>
          (Epoch {history[history.length - 1].epoch})
        </span>
      </div>

      {/* Group selector tabs */}
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
              padding: '4px 6px',
              fontSize: '9px',
              fontWeight: activeGroup === g.key ? '700' : '400',
              color: activeGroup === g.key ? '#ffffff' : '#888888',
              backgroundColor: activeGroup === g.key ? 'rgba(68, 187, 255, 0.2)' : 'rgba(255,255,255,0.03)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {g.figNum}: {g.label}
          </button>
        ))}
      </div>

      {activeGroup === 'vSweep' ? (
        <VSweepPanel />
      ) : activeGroup === 'cdfAnalysis' ? (
        <CDFAnalysisPanel />
      ) : activeGroup === 'rateSweep' ? (
        <RateSweepPanel />
      ) : chartData ? (
        <>
          <MultiLineChart
            title={`Avg Queue Length (${gc.figNum})`}
            unit=" Mb"
            formatValue={fmtQueue}
            series={buildSeries(chartData.avgQueue.proposed, chartData.avgQueue.baselines, '#44bbff')}
          />

          {/* Fig.9: Average delay (Little's law: delay = Q / perCellRate) */}
          {gc.arrivalRateGbps && (
            <MultiLineChart
              title={`Average Delay (Fig.9)`}
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
            title={`Handover Frequency (${gc.figNum})`}
            formatValue={fmtFreq}
            series={buildSeries(chartData.hoFreq.proposed, chartData.hoFreq.baselines, '#ff8844')}
          />

          <MultiLineChart
            title={`Resource Utilization (${gc.figNum})`}
            unit="%"
            formatValue={fmtUtil}
            series={buildSeries(chartData.resourceUtil.proposed, chartData.resourceUtil.baselines, '#44ff88')}
          />

          <MultiLineChart
            title={`Drift+Penalty (${gc.figNum})`}
            formatValue={fmtDrift}
            series={buildSeries(chartData.driftPenalty.proposed, chartData.driftPenalty.baselines, '#cc88ff')}
          />
        </>
      ) : null}
    </div>
  );
}
