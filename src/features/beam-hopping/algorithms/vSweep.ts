/**
 * Parameter Sweep Runners — Lyapunov, Fig. 10, 11, 12
 *
 * Batch simulations for:
 *   Fig. 10: Static spectrum sharing SINR/INR CDF
 *   Fig. 12: V parameter sweep (handover frequency vs V)
 *   Fig. 11: Arrival rate sweep (queue stability vs rate)
 *
 * Shared simulation core runs per-epoch Lyapunov optimization
 * with Algorithm 1 (handover) + Algorithm 2 (WMIS beam hopping)
 * + Algorithm 3 (spectrum sharing / BSSA).
 */

import {
  CellQueueState,
  LyapunovConfig,
  DEFAULT_LYAPUNOV_CONFIG,
  VirtualQueue,
  TerrestrialCluster,
  DEFAULT_SPECTRUM_SHARING_CONFIG,
} from '@/types/lyapunov';
import { EarthFixedCell, SCENE_TO_KM_SCALE } from '../components/EarthFixedCells';
import { generateConstellation } from './constellation';
import { buildConflictGraph, SatelliteCellAssignment } from './conflictGraph';
import { solveWMIS } from './wmisScheduler';
import {
  computeSlantDistance,
  computeChannelGain,
  computeAntennaGain,
  computeNoisePower,
  computeCellCapacityMap,
  computeFSPL,
  DEFAULT_PHYSICAL_LAYER_CONFIG,
} from './channelModel';
import { LyapunovHandoverManager } from '@/utils/satellite/LyapunovHandoverManager';
import {
  generateTerrestrialClusters,
  decideSpectrumSharing,
  applySpectrumSharingGain,
} from './spectrumSharing';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Per-epoch metrics for one parameter value */
export interface VSweepEpochMetrics {
  epoch: number;
  handoverFrequency: number;
  driftPlusPenalty: number;
  avgQueueLength: number;
}

/** Results for one V value */
export interface VSweepSeries {
  V: number;
  metrics: VSweepEpochMetrics[];
}

/** Full V sweep result */
export interface VSweepResult {
  vValues: number[];
  series: VSweepSeries[];
}

/** Results for one arrival rate */
export interface RateSweepSeries {
  rateGbps: number;
  metrics: VSweepEpochMetrics[];
}

/** Full arrival rate sweep result */
export interface RateSweepResult {
  rates: number[];
  series: RateSweepSeries[];
}

// ─── Demand table ───────────────────────────────────────────────────────────

const DEMAND_TABLE = [
  0.0221, 0.0636, 0.0636, 0.0325, 0.0740, 0.0325, 0.0209,
  0.0428, 0.0429, 0.0532, 0.0844, 0.0428, 0.0325, 0.0221,
  0.0636, 0.0740, 0.0312, 0.0844, 0.0428, 0.0740,
];

// ─── Shared Simulation Core ─────────────────────────────────────────────────

/** Simulation options */
interface SimulationOptions {
  /** Enable Algorithm 3 (spectrum sharing / BSSA). Default: true */
  enableSpectrumSharing?: boolean;
  /** Full-buffer traffic model: queues always have data (Paper Fig.12). Default: false */
  fullBuffer?: boolean;
}

/** Progress callback for async operations */
export type ProgressCallback = (progress: number, label: string) => void;

/** Yield to main thread so UI stays responsive */
function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/** Epoch batch size before yielding to main thread.
 *  Each epoch includes constellation + conflict graph + WMIS × slotsPerEpoch,
 *  so even 1 epoch can take 10-50ms. Keep this small for smooth UI. */
const CHUNK_SIZE = 5;

/**
 * Run a single simulation with the given config.
 * Shared by both V sweep and rate sweep.
 *
 * Runs Algorithm 1 (handover) + Algorithm 2 (WMIS) + Algorithm 3 (BSSA).
 */
function runSimulation(
  cells: EarthFixedCell[],
  config: LyapunovConfig,
  numEpochs: number,
  options: SimulationOptions = {},
): VSweepEpochMetrics[] {
  const { enableSpectrumSharing = true, fullBuffer = false } = options;
  const cellIds = cells.map(c => c.id);
  const metrics: VSweepEpochMetrics[] = [];

  let dataQueues: CellQueueState[] = cellIds.map(cellId => ({
    cellId, queueLength: fullBuffer ? 1e6 : 0, arrivalData: 0, servedData: 0, slotsServed: 0,
  }));

  let virtualQueues: VirtualQueue[] = cellIds.map(cellId => ({
    cellId, value: 0,
  }));

  // Generate terrestrial clusters once for spectrum sharing
  const terrestrialClusters: TerrestrialCluster[] = enableSpectrumSharing
    ? generateTerrestrialClusters(cellIds)
    : [];

  let totalHandovers = 0;
  const handoverManager = new LyapunovHandoverManager(config);
  const epochDurationS = config.slotsPerEpoch * config.slotDurationMs / 1000;
  const snrLinear = Math.pow(10, config.targetSnrDb / 10);
  const defaultCapacity =
    (config.satelliteBandwidthMhz / config.beamsPerSatellite) *
    (config.slotDurationMs / 1000) *
    Math.log2(1 + snrLinear);

  for (let epoch = 1; epoch <= numEpochs; epoch++) {
    const satellites = generateConstellation(epoch, cellIds, undefined, epochDurationS);
    if (satellites.length === 0) continue;

    // Algorithm 1: Handover
    const hoResult = handoverManager.decide(cells, satellites, dataQueues, virtualQueues);
    const handoverIndicators = new Map<number, boolean>();
    for (const a of hoResult.assignments) {
      handoverIndicators.set(a.cellId, a.isHandover);
    }

    // Build v2 conflict graph
    const satAssignments: SatelliteCellAssignment[] = hoResult.assignments.map(a => {
      const sat = satellites.find(s => s.id === a.satelliteId);
      const elev = sat?.elevations.get(a.cellId) ?? 35;
      return {
        satId: a.satelliteId, cellId: a.cellId, elevationDeg: elev,
        satPosition: sat?.position
          ? { x: sat.position.x, y: sat.position.y, z: sat.position.z }
          : undefined,
      };
    });
    const conflictGraph = buildConflictGraph(cells, satAssignments, config.beamsPerSatellite, {
      physical: DEFAULT_PHYSICAL_LAYER_CONFIG,
      numVisibleSats: satellites.length,
      targetSnrDb: config.targetSnrDb,
      sceneToKmScale: SCENE_TO_KM_SCALE,
    });

    // Build capacity map + cell elevations
    const cellAssignments: Array<{ cellId: number; elevationDeg: number }> = [];
    const cellElevations = new Map<number, number>();
    for (const a of hoResult.assignments) {
      const sat = satellites.find(s => s.id === a.satelliteId);
      if (sat) {
        const elev = sat.elevations.get(a.cellId) ?? 35;
        cellAssignments.push({ cellId: a.cellId, elevationDeg: elev });
        cellElevations.set(a.cellId, elev);
      }
    }
    const cellCapacityMap = cellAssignments.length > 0
      ? computeCellCapacityMap(
          cellAssignments, DEFAULT_PHYSICAL_LAYER_CONFIG,
          config.satelliteBandwidthMhz, config.beamsPerSatellite, config.slotDurationMs,
        )
      : undefined;

    // Algorithm 2: WMIS beam hopping
    const simQueues = dataQueues.map(q => ({ ...q }));
    for (let slot = 0; slot < config.slotsPerEpoch; slot++) {
      const decision = solveWMIS(conflictGraph, simQueues, config, cellCapacityMap);
      for (const a of decision.assignments) {
        const q = simQueues.find(sq => sq.cellId === a.cellId);
        if (q) {
          const cap = cellCapacityMap?.get(a.cellId) ?? defaultCapacity;
          q.servedData += cap;
          q.slotsServed += 1;
        }
      }
    }

    // Algorithm 3: Spectrum sharing (BSSA)
    if (enableSpectrumSharing && terrestrialClusters.length > 0) {
      const ssDecisions = decideSpectrumSharing(
        simQueues, terrestrialClusters, config,
        DEFAULT_SPECTRUM_SHARING_CONFIG,
        cellElevations.size > 0 ? cellElevations : undefined,
      );
      const queuesWithSharing = applySpectrumSharingGain(simQueues, ssDecisions, config.slotsPerEpoch);
      // Copy back sharing gains
      for (let i = 0; i < simQueues.length; i++) {
        simQueues[i].servedData = queuesWithSharing[i].servedData;
      }
    }

    // Compute drift BEFORE Eq.1 update (Eq.26: Σ(D_c - Q_c)²)
    const drift = simQueues.reduce((s, q) => {
      const gap = q.servedData - q.queueLength;
      return s + gap * gap;
    }, 0);

    // Eq.1: Update data queues
    if (fullBuffer) {
      // Full-buffer: queues always have data, no arrival/departure dynamics
      dataQueues = simQueues.map(q => ({
        cellId: q.cellId,
        queueLength: 1e6, // Always full
        arrivalData: 0, servedData: 0, slotsServed: 0,
      }));
    } else {
      dataQueues = simQueues.map((q, i) => {
        const ratio = i < 20 ? DEMAND_TABLE[i] : 0.05;
        const demand = config.totalArrivalRateGbps * 1000 * ratio *
          (config.slotsPerEpoch * config.slotDurationMs / 1000);
        return {
          cellId: q.cellId,
          queueLength: Math.max(q.queueLength - q.servedData, 0) + demand,
          arrivalData: demand, servedData: 0, slotsServed: 0,
        };
      });
    }

    // Eq.17: Update virtual queues
    virtualQueues = virtualQueues.map(vq => {
      const didHandover = handoverIndicators.get(vq.cellId) ? 1 : 0;
      return { ...vq, value: Math.max(vq.value + didHandover - config.maxHandoverFrequency, 0) };
    });

    // Eq.26: δ_f = Σ M_c·m_c + V × Σ(D_c - Q_c)²
    const penalty = virtualQueues.reduce((s, vq) => {
      const didHandover = handoverIndicators.get(vq.cellId) ? 1 : 0;
      return s + vq.value * didHandover;
    }, 0);
    const driftPlusPenalty = penalty + config.lyapunovV * drift;

    const epochHandovers = Array.from(handoverIndicators.values()).filter(Boolean).length;
    totalHandovers += epochHandovers;

    metrics.push({
      epoch,
      handoverFrequency: totalHandovers / epoch,
      driftPlusPenalty,
      avgQueueLength: dataQueues.reduce((s, q) => s + q.queueLength, 0) / Math.max(dataQueues.length, 1),
    });
  }

  return metrics;
}

/**
 * Async version of runSimulation that yields every CHUNK_SIZE epochs.
 */
async function runSimulationAsync(
  cells: EarthFixedCell[],
  config: LyapunovConfig,
  numEpochs: number,
  options: SimulationOptions = {},
  onProgress?: (epochsDone: number, totalEpochs: number) => void,
): Promise<VSweepEpochMetrics[]> {
  const { enableSpectrumSharing = true, fullBuffer = false } = options;
  const cellIds = cells.map(c => c.id);
  const metrics: VSweepEpochMetrics[] = [];

  let dataQueues: CellQueueState[] = cellIds.map(cellId => ({
    cellId, queueLength: fullBuffer ? 1e6 : 0, arrivalData: 0, servedData: 0, slotsServed: 0,
  }));

  let virtualQueues: VirtualQueue[] = cellIds.map(cellId => ({
    cellId, value: 0,
  }));

  const terrestrialClusters: TerrestrialCluster[] = enableSpectrumSharing
    ? generateTerrestrialClusters(cellIds)
    : [];

  let totalHandovers = 0;
  const handoverManager = new LyapunovHandoverManager(config);
  const epochDurationS = config.slotsPerEpoch * config.slotDurationMs / 1000;
  const snrLinear = Math.pow(10, config.targetSnrDb / 10);
  const defaultCapacity =
    (config.satelliteBandwidthMhz / config.beamsPerSatellite) *
    (config.slotDurationMs / 1000) *
    Math.log2(1 + snrLinear);

  for (let epoch = 1; epoch <= numEpochs; epoch++) {
    // Yield every CHUNK_SIZE epochs
    if (epoch % CHUNK_SIZE === 0) {
      onProgress?.(epoch, numEpochs);
      await yieldToMain();
    }

    const satellites = generateConstellation(epoch, cellIds, undefined, epochDurationS);
    if (satellites.length === 0) continue;

    const hoResult = handoverManager.decide(cells, satellites, dataQueues, virtualQueues);
    const handoverIndicators = new Map<number, boolean>();
    for (const a of hoResult.assignments) {
      handoverIndicators.set(a.cellId, a.isHandover);
    }

    const satAssignments: SatelliteCellAssignment[] = hoResult.assignments.map(a => {
      const sat = satellites.find(s => s.id === a.satelliteId);
      const elev = sat?.elevations.get(a.cellId) ?? 35;
      return {
        satId: a.satelliteId, cellId: a.cellId, elevationDeg: elev,
        satPosition: sat?.position
          ? { x: sat.position.x, y: sat.position.y, z: sat.position.z }
          : undefined,
      };
    });
    const conflictGraph = buildConflictGraph(cells, satAssignments, config.beamsPerSatellite, {
      physical: DEFAULT_PHYSICAL_LAYER_CONFIG,
      numVisibleSats: satellites.length,
      targetSnrDb: config.targetSnrDb,
      sceneToKmScale: SCENE_TO_KM_SCALE,
    });

    const cellAssignments: Array<{ cellId: number; elevationDeg: number }> = [];
    const cellElevations = new Map<number, number>();
    for (const a of hoResult.assignments) {
      const sat = satellites.find(s => s.id === a.satelliteId);
      if (sat) {
        const elev = sat.elevations.get(a.cellId) ?? 35;
        cellAssignments.push({ cellId: a.cellId, elevationDeg: elev });
        cellElevations.set(a.cellId, elev);
      }
    }
    const cellCapacityMap = cellAssignments.length > 0
      ? computeCellCapacityMap(
          cellAssignments, DEFAULT_PHYSICAL_LAYER_CONFIG,
          config.satelliteBandwidthMhz, config.beamsPerSatellite, config.slotDurationMs,
        )
      : undefined;

    const simQueues = dataQueues.map(q => ({ ...q }));
    for (let slot = 0; slot < config.slotsPerEpoch; slot++) {
      const decision = solveWMIS(conflictGraph, simQueues, config, cellCapacityMap);
      for (const a of decision.assignments) {
        const q = simQueues.find(sq => sq.cellId === a.cellId);
        if (q) {
          const cap = cellCapacityMap?.get(a.cellId) ?? defaultCapacity;
          q.servedData += cap;
          q.slotsServed += 1;
        }
      }
    }

    if (enableSpectrumSharing && terrestrialClusters.length > 0) {
      const ssDecisions = decideSpectrumSharing(
        simQueues, terrestrialClusters, config,
        DEFAULT_SPECTRUM_SHARING_CONFIG,
        cellElevations.size > 0 ? cellElevations : undefined,
      );
      const queuesWithSharing = applySpectrumSharingGain(simQueues, ssDecisions, config.slotsPerEpoch);
      for (let i = 0; i < simQueues.length; i++) {
        simQueues[i].servedData = queuesWithSharing[i].servedData;
      }
    }

    const drift = simQueues.reduce((s, q) => {
      const gap = q.servedData - q.queueLength;
      return s + gap * gap;
    }, 0);

    if (fullBuffer) {
      dataQueues = simQueues.map(q => ({
        cellId: q.cellId,
        queueLength: 1e6,
        arrivalData: 0, servedData: 0, slotsServed: 0,
      }));
    } else {
      dataQueues = simQueues.map((q, i) => {
        const ratio = i < 20 ? DEMAND_TABLE[i] : 0.05;
        const demand = config.totalArrivalRateGbps * 1000 * ratio *
          (config.slotsPerEpoch * config.slotDurationMs / 1000);
        return {
          cellId: q.cellId,
          queueLength: Math.max(q.queueLength - q.servedData, 0) + demand,
          arrivalData: demand, servedData: 0, slotsServed: 0,
        };
      });
    }

    virtualQueues = virtualQueues.map(vq => {
      const didHandover = handoverIndicators.get(vq.cellId) ? 1 : 0;
      return { ...vq, value: Math.max(vq.value + didHandover - config.maxHandoverFrequency, 0) };
    });

    const penalty = virtualQueues.reduce((s, vq) => {
      const didHandover = handoverIndicators.get(vq.cellId) ? 1 : 0;
      return s + vq.value * didHandover;
    }, 0);
    const driftPlusPenalty = penalty + config.lyapunovV * drift;

    const epochHandovers = Array.from(handoverIndicators.values()).filter(Boolean).length;
    totalHandovers += epochHandovers;

    metrics.push({
      epoch,
      handoverFrequency: totalHandovers / epoch,
      driftPlusPenalty,
      avgQueueLength: dataQueues.reduce((s, q) => s + q.queueLength, 0) / Math.max(dataQueues.length, 1),
    });
  }

  return metrics;
}

// ─── V Parameter Sweep ──────────────────────────────────────────────────────

/**
 * Run V parameter sweep.
 *
 * @param cells Earth-fixed cells
 * @param vValues Array of V values to test (e.g., [10, 50, 100, 200, 500])
 * @param numEpochs Number of epochs per V value
 * @param baseConfig Base config (V will be overridden)
 */
export function runVParameterSweep(
  cells: EarthFixedCell[],
  vValues: number[] = [10, 50, 100, 200, 500],
  numEpochs: number = 20000,
  baseConfig: LyapunovConfig = DEFAULT_LYAPUNOV_CONFIG,
): VSweepResult {
  const series: VSweepSeries[] = [];
  for (const V of vValues) {
    const config: LyapunovConfig = { ...baseConfig, lyapunovV: V };
    // Fig.12: full-buffer traffic model per paper Section V-C
    // Paper Fig.12 uses B=4, σ₀=0.9 (Group 1 beam hopping) — no spectrum sharing
    series.push({ V, metrics: runSimulation(cells, config, numEpochs, { fullBuffer: true, enableSpectrumSharing: false }) });
  }
  return { vValues, series };
}

// ─── Arrival Rate Sweep (Fig. 11) ───────────────────────────────────────────

/**
 * Run arrival rate sweep.
 *
 * Tests queue stability under different network loads.
 * Paper Section V-C: queue stabilizes when rate < 10.99 Gbps.
 *
 * @param cells Earth-fixed cells
 * @param rates Array of arrival rates in Gbps
 * @param numEpochs Number of epochs per rate
 * @param baseConfig Base config (rate will be overridden)
 */
export function runArrivalRateSweep(
  cells: EarthFixedCell[],
  rates: number[] = [10.219, 10.608, 10.996, 11.385, 11.871],
  numEpochs: number = 20000,
  baseConfig: LyapunovConfig = DEFAULT_LYAPUNOV_CONFIG,
): RateSweepResult {
  const series: RateSweepSeries[] = [];
  for (const rate of rates) {
    const config: LyapunovConfig = { ...baseConfig, totalArrivalRateGbps: rate };
    series.push({ rateGbps: rate, metrics: runSimulation(cells, config, numEpochs) });
  }
  return { rates, series };
}

// ─── Fig. 10: Static Spectrum Sharing SINR/INR CDF ───────────────────────────

/** CDF data point: value → cumulative probability */
export interface CDFPoint {
  value: number;
  probability: number;
}

/** Fig.10 result: CDF curves for INR and SINR */
export interface Fig10CDFResult {
  /** INR CDF (dB): interference-to-noise ratio at terrestrial user from LEO */
  inrCdf: CDFPoint[];
  /** SINR CDF for wide-beam user (dB) */
  sinrWideCdf: CDFPoint[];
  /** SINR CDF for cell-edge user (dB) */
  sinrEdgeCdf: CDFPoint[];
  /** Number of Monte Carlo samples */
  numSamples: number;
}

/**
 * Run Fig.10 CDF analysis — static spectrum sharing INR/SINR
 *
 * Monte Carlo sampling of terrestrial user positions within beam coverage:
 * - INR: satellite off-axis power at terrestrial user / noise
 * - SINR: terrestrial signal / (noise + satellite interference)
 *
 * Paper Section V-A: 32,400 terrestrial cells modeled via Monte Carlo sampling
 * with configurable density (terrestrialCellsPerBeam in SpectrumSharingConfig).
 *
 * @param numSamples Number of random positions to sample
 * @param elevations Elevation angles to sample (uniform random within range)
 */
export function runFig10CDFAnalysis(
  numSamples: number = 10000,
  elevationRange: [number, number] = [35, 90],
): Fig10CDFResult {
  const cfg = DEFAULT_PHYSICAL_LAYER_CONFIG;
  const terrBwMhz = 100; // W₂ = 100 MHz terrestrial bandwidth
  const terrTxPowerDbm = 30; // Terrestrial BS power (typical)
  const terrUserDistKm = 1.0; // Terrestrial user distance from BS (paper: 1 km)

  // Collect samples
  const inrSamples: number[] = [];
  const sinrWideSamples: number[] = [];
  const sinrEdgeSamples: number[] = [];

  for (let i = 0; i < numSamples; i++) {
    // Random elevation for satellite
    const elev = elevationRange[0] +
      Math.random() * (elevationRange[1] - elevationRange[0]);

    // Random off-axis angle: 0 (beam center) to 2×beamwidth (cell edge + beyond)
    const offAxisWide = Math.random() * cfg.beamwidth3dBDeg * 0.5; // wide-beam user
    const offAxisEdge = cfg.beamwidth3dBDeg * (0.7 + Math.random() * 0.6); // edge user

    // Random terrestrial load factor
    const load = 0.4 + Math.random() * 0.2; // l ∈ [0.4, 0.6]

    // Satellite → terrestrial user path
    const satDist = computeSlantDistance(cfg.orbitalAltitudeKm, elev);
    const h = computeChannelGain(satDist, elev, cfg.frequencyGhz, cfg);
    const hDb = h > 0 ? 10 * Math.log10(h) : -200;

    // Noise for available terrestrial bandwidth (shared portion)
    const availBwMhz = terrBwMhz * (1 - load);
    const noisePowerW = computeNoisePower(cfg.receiverTempK, availBwMhz);
    const noiseDbm = 10 * Math.log10(noisePowerW * 1000);

    // --- INR at terrestrial user ---
    // I = P_sat × G_tx(θ_off) × G_rx_terrestrial × h
    // Use beam-center as worst-case off-axis angle for the interfering beam
    const satOffAxis = cfg.beamwidth3dBDeg * (0.3 + Math.random() * 0.7);
    const gTxOff = computeAntennaGain(satOffAxis, cfg.txPeakGainDbi, cfg.beamwidth3dBDeg, cfg.sideLobeLevel);
    const satInterfDbm = cfg.txPowerDbm + gTxOff + cfg.terrestrialRxGainDbi + hDb;
    const inrDb = satInterfDbm - noiseDbm;
    inrSamples.push(inrDb);

    // --- SINR for wide-beam terrestrial user ---
    // Terrestrial signal path loss (FSPL at 20 GHz, 1 km)
    const terrPL = computeFSPL(terrUserDistKm, cfg.frequencyGhz);
    const terrSignalDbm = terrTxPowerDbm - terrPL;
    const terrSignalW = Math.pow(10, (terrSignalDbm - 30) / 10);

    // Satellite interference at wide-beam user position
    const gTxWide = computeAntennaGain(offAxisWide, cfg.txPeakGainDbi, cfg.beamwidth3dBDeg, cfg.sideLobeLevel);
    const satInterfWideDbm = cfg.txPowerDbm + gTxWide + cfg.terrestrialRxGainDbi + hDb;
    const satInterfWideW = Math.pow(10, (satInterfWideDbm - 30) / 10);

    const sinrWide = 10 * Math.log10(terrSignalW / (noisePowerW + satInterfWideW));
    sinrWideSamples.push(sinrWide);

    // --- SINR for cell-edge terrestrial user ---
    const gTxEdge = computeAntennaGain(offAxisEdge, cfg.txPeakGainDbi, cfg.beamwidth3dBDeg, cfg.sideLobeLevel);
    const satInterfEdgeDbm = cfg.txPowerDbm + gTxEdge + cfg.terrestrialRxGainDbi + hDb;
    const satInterfEdgeW = Math.pow(10, (satInterfEdgeDbm - 30) / 10);

    const sinrEdge = 10 * Math.log10(terrSignalW / (noisePowerW + satInterfEdgeW));
    sinrEdgeSamples.push(sinrEdge);
  }

  // Build CDFs
  const buildCDF = (samples: number[]): CDFPoint[] => {
    const sorted = [...samples].sort((a, b) => a - b);
    const n = sorted.length;
    // Subsample for display (max 200 points)
    const step = Math.max(1, Math.floor(n / 200));
    const points: CDFPoint[] = [];
    for (let i = 0; i < n; i += step) {
      points.push({ value: sorted[i], probability: (i + 1) / n });
    }
    // Ensure last point
    if (points.length === 0 || points[points.length - 1].probability < 1) {
      points.push({ value: sorted[n - 1], probability: 1 });
    }
    return points;
  };

  return {
    inrCdf: buildCDF(inrSamples),
    sinrWideCdf: buildCDF(sinrWideSamples),
    sinrEdgeCdf: buildCDF(sinrEdgeSamples),
    numSamples,
  };
}

// ─── Async versions (non-blocking UI) ───────────────────────────────────────

/**
 * Async V parameter sweep — yields to main thread between epochs.
 */
export async function runVParameterSweepAsync(
  cells: EarthFixedCell[],
  vValues: number[] = [10, 50, 100, 200, 500],
  numEpochs: number = 20000,
  baseConfig: LyapunovConfig = DEFAULT_LYAPUNOV_CONFIG,
  onProgress?: ProgressCallback,
): Promise<VSweepResult> {
  const series: VSweepSeries[] = [];
  const totalWork = vValues.length * numEpochs;

  for (let vi = 0; vi < vValues.length; vi++) {
    const V = vValues[vi];
    const config: LyapunovConfig = { ...baseConfig, lyapunovV: V };
    const metrics = await runSimulationAsync(
      cells, config, numEpochs,
      { fullBuffer: true, enableSpectrumSharing: false },
      (epochsDone) => {
        const done = vi * numEpochs + epochsDone;
        onProgress?.(done / totalWork, `V=${V}: ${epochsDone}/${numEpochs}`);
      },
    );
    series.push({ V, metrics });
  }
  return { vValues, series };
}

/**
 * Async arrival rate sweep — yields to main thread between epochs.
 */
export async function runArrivalRateSweepAsync(
  cells: EarthFixedCell[],
  rates: number[] = [10.219, 10.608, 10.996, 11.385, 11.871],
  numEpochs: number = 20000,
  baseConfig: LyapunovConfig = DEFAULT_LYAPUNOV_CONFIG,
  onProgress?: ProgressCallback,
): Promise<RateSweepResult> {
  const series: RateSweepSeries[] = [];
  const totalWork = rates.length * numEpochs;

  for (let ri = 0; ri < rates.length; ri++) {
    const rate = rates[ri];
    const config: LyapunovConfig = { ...baseConfig, totalArrivalRateGbps: rate };
    const metrics = await runSimulationAsync(
      cells, config, numEpochs,
      {},
      (epochsDone) => {
        const done = ri * numEpochs + epochsDone;
        onProgress?.(done / totalWork, `${rate}G: ${epochsDone}/${numEpochs}`);
      },
    );
    series.push({ rateGbps: rate, metrics });
  }
  return { rates, series };
}

/**
 * Async CDF analysis — yields to main thread between sample chunks.
 */
export async function runFig10CDFAnalysisAsync(
  numSamples: number = 10000,
  elevationRange: [number, number] = [35, 90],
  onProgress?: ProgressCallback,
): Promise<Fig10CDFResult> {
  const cfg = DEFAULT_PHYSICAL_LAYER_CONFIG;
  const terrBwMhz = 100;
  const terrTxPowerDbm = 30;
  const terrUserDistKm = 1.0;

  const inrSamples: number[] = [];
  const sinrWideSamples: number[] = [];
  const sinrEdgeSamples: number[] = [];

  const CDF_CHUNK = 1000;

  for (let i = 0; i < numSamples; i++) {
    if (i > 0 && i % CDF_CHUNK === 0) {
      onProgress?.(i / numSamples, `${i}/${numSamples} samples`);
      await yieldToMain();
    }

    const elev = elevationRange[0] +
      Math.random() * (elevationRange[1] - elevationRange[0]);
    const offAxisWide = Math.random() * cfg.beamwidth3dBDeg * 0.5;
    const offAxisEdge = cfg.beamwidth3dBDeg * (0.7 + Math.random() * 0.6);
    const load = 0.4 + Math.random() * 0.2;

    const satDist = computeSlantDistance(cfg.orbitalAltitudeKm, elev);
    const h = computeChannelGain(satDist, elev, cfg.frequencyGhz, cfg);
    const hDb = h > 0 ? 10 * Math.log10(h) : -200;

    const availBwMhz = terrBwMhz * (1 - load);
    const noisePowerW = computeNoisePower(cfg.receiverTempK, availBwMhz);
    const noiseDbm = 10 * Math.log10(noisePowerW * 1000);

    const satOffAxis = cfg.beamwidth3dBDeg * (0.3 + Math.random() * 0.7);
    const gTxOff = computeAntennaGain(satOffAxis, cfg.txPeakGainDbi, cfg.beamwidth3dBDeg, cfg.sideLobeLevel);
    const satInterfDbm = cfg.txPowerDbm + gTxOff + cfg.terrestrialRxGainDbi + hDb;
    const inrDb = satInterfDbm - noiseDbm;
    inrSamples.push(inrDb);

    const terrPL = computeFSPL(terrUserDistKm, cfg.frequencyGhz);
    const terrSignalDbm = terrTxPowerDbm - terrPL;
    const terrSignalW = Math.pow(10, (terrSignalDbm - 30) / 10);

    const gTxWide = computeAntennaGain(offAxisWide, cfg.txPeakGainDbi, cfg.beamwidth3dBDeg, cfg.sideLobeLevel);
    const satInterfWideDbm = cfg.txPowerDbm + gTxWide + cfg.terrestrialRxGainDbi + hDb;
    const satInterfWideW = Math.pow(10, (satInterfWideDbm - 30) / 10);
    sinrWideSamples.push(10 * Math.log10(terrSignalW / (noisePowerW + satInterfWideW)));

    const gTxEdge = computeAntennaGain(offAxisEdge, cfg.txPeakGainDbi, cfg.beamwidth3dBDeg, cfg.sideLobeLevel);
    const satInterfEdgeDbm = cfg.txPowerDbm + gTxEdge + cfg.terrestrialRxGainDbi + hDb;
    const satInterfEdgeW = Math.pow(10, (satInterfEdgeDbm - 30) / 10);
    sinrEdgeSamples.push(10 * Math.log10(terrSignalW / (noisePowerW + satInterfEdgeW)));
  }

  const buildCDF = (samples: number[]): CDFPoint[] => {
    const sorted = [...samples].sort((a, b) => a - b);
    const n = sorted.length;
    const step = Math.max(1, Math.floor(n / 200));
    const points: CDFPoint[] = [];
    for (let i = 0; i < n; i += step) {
      points.push({ value: sorted[i], probability: (i + 1) / n });
    }
    if (points.length === 0 || points[points.length - 1].probability < 1) {
      points.push({ value: sorted[n - 1], probability: 1 });
    }
    return points;
  };

  return {
    inrCdf: buildCDF(inrSamples),
    sinrWideCdf: buildCDF(sinrWideSamples),
    sinrEdgeCdf: buildCDF(sinrEdgeSamples),
    numSamples,
  };
}
