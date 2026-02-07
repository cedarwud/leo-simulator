/**
 * Satellite-Terrestrial Spectrum Sharing v2 — Paper 4-1, Algorithm 3
 *
 * Binary Sparrow Search Algorithm (BSSA) for dynamic spectrum sharing decisions.
 *
 * v2 changes from v1:
 *   - 4-stage BSSA (v1 had only Stage 3):
 *     Stage 1: Local Search on best sparrow (Lines 7-22)
 *     Stage 2: Adaptive Crossover on worse half (Lines 23-30)
 *     Stage 3: Standard SSA update (Line 31) — existing
 *     Stage 4: Greedy Search post-optimization (Lines 35-37)
 *   - Correct fitness function (Eq. 39) with queue-weighted formula
 *   - Binarization coefficient 2 in sigmoid (Eq. 38)
 *   - Tent chaotic initialization
 *
 * Interference constraint (Eq. 9, 16):
 *   Satellite sharing terrestrial spectrum must not exceed I^th_g = -10 dB
 */

import {
  CellQueueState,
  TerrestrialCluster,
  SpectrumSharingDecision,
  SpectrumSharingConfig,
  Paper41Config,
  DEFAULT_SPECTRUM_SHARING_CONFIG,
  DEFAULT_PAPER41_PHYSICAL_LAYER,
} from '@/types/paper41';
import {
  computeSlantDistance,
  computeChannelGain,
  computeAntennaGain,
  DEFAULT_PHYSICAL_LAYER_CONFIG,
  type PhysicalLayerConfig,
} from './channelModel';

/** BSSA configuration */
interface BSSAConfig {
  /** Population size */
  populationSize: number;
  /** Maximum iterations */
  maxIterations: number;
  /** Producer ratio (PD) */
  producerRatio: number;
  /** Scout ratio (SD) */
  scoutRatio: number;
  /** Safety threshold ST ∈ [0.5, 1.0] */
  safetyThreshold: number;
  /** Local search iterations N''' */
  localSearchIter: number;
  /** Local search mutation count a */
  localSearchMutations: number;
}

const DEFAULT_BSSA_CONFIG: BSSAConfig = {
  populationSize: 30,
  maxIterations: 20,
  producerRatio: 0.2,
  scoutRatio: 0.1,
  safetyThreshold: 0.8,
  localSearchIter: 5,
  localSearchMutations: 2,
};

// ─── Terrestrial Cluster Generation ──────────────────────────────────────

/**
 * Generate terrestrial cluster configurations
 */
export function generateTerrestrialClusters(
  cellIds: number[],
  config: SpectrumSharingConfig = DEFAULT_SPECTRUM_SHARING_CONFIG,
): TerrestrialCluster[] {
  return cellIds.map(cellId => ({
    cellId,
    load: config.loadRange[0] + Math.random() * (config.loadRange[1] - config.loadRange[0]),
    bandwidthMhz: config.terrestrialBandwidthMhz,
  }));
}

// ─── Interference Model ──────────────────────────────────────────────────

/**
 * Compute satellite-to-terrestrial interference using physical model (Eq. 9)
 *
 * I_{g,c} = P_sat × G_tx(θ_off) × G_rx_terrestrial × h(dist, elev, freq)
 *
 * θ_off = beamwidth_3dB × 0.5 (terrestrial station at beam edge)
 * G_rx_terrestrial = 0 dBi (omnidirectional ground antenna)
 *
 * @param cluster Terrestrial cluster info
 * @param satElevationDeg Satellite elevation from this cell (degrees), undefined → fallback
 * @param physConfig Physical layer config
 * @returns INR in dB
 */
function computeInterference(
  cluster: TerrestrialCluster,
  satElevationDeg?: number,
  physConfig?: PhysicalLayerConfig,
): number {
  // Fallback: simplified model when no elevation available
  if (satElevationDeg === undefined || !physConfig) {
    return -20 + cluster.load * 20;
  }

  const cfg = physConfig;
  const dist = computeSlantDistance(cfg.orbitalAltitudeKm, satElevationDeg);
  const h = computeChannelGain(dist, satElevationDeg, cfg.frequencyGhz, cfg);

  // Off-axis angle: terrestrial station at beam edge
  const thetaOff = cfg.beamwidth3dBDeg * 0.5;

  // Satellite Tx off-axis antenna gain (dBi)
  const gTxOff = computeAntennaGain(thetaOff, cfg.txPeakGainDbi, cfg.beamwidth3dBDeg, cfg.sideLobeLevel);
  // Terrestrial Rx: omnidirectional ground antenna (0 dBi)
  const gRxTerrestrial = 0;

  // P_sat (dBm) + G_tx(θ_off) (dBi) + G_rx (dBi) + 10log10(h) → received power dBm
  const hDb = h > 0 ? 10 * Math.log10(h) : -200;
  const receivedPowerDbm = cfg.txPowerDbm + gTxOff + gRxTerrestrial + hDb;

  // Noise power at terrestrial receiver (dBm)
  // N = kTB: k=-228.6 dBW/K/Hz, T=290K → N₀=-174 dBm/Hz
  // Eq. 36: available shared bandwidth = W₂ - W_center
  const wCenter = DEFAULT_PAPER41_PHYSICAL_LAYER.terrestrialCenterBandwidthMhz;
  const availableBwHz = Math.max(cluster.bandwidthMhz - wCenter, 0) * 1e6;
  const noisePowerDbm = availableBwHz > 0
    ? -174 + 10 * Math.log10(availableBwHz)
    : -174;

  // INR = received interference power - noise power (dB)
  const inrDb = receivedPowerDbm - noisePowerDbm;

  return inrDb;
}

/**
 * Compute interference at a specific off-axis angle (for multi-position sampling).
 * Same as computeInterference but with configurable off-axis angle for
 * spatial diversity across 32,400 terrestrial cells.
 */
function computeInterferenceAtOffset(
  cluster: TerrestrialCluster,
  satElevationDeg: number | undefined,
  physConfig: PhysicalLayerConfig,
  offAxisDeg: number,
): number {
  if (satElevationDeg === undefined) {
    return -20 + cluster.load * 20;
  }

  const cfg = physConfig;
  const dist = computeSlantDistance(cfg.orbitalAltitudeKm, satElevationDeg);
  const h = computeChannelGain(dist, satElevationDeg, cfg.frequencyGhz, cfg);

  const gTxOff = computeAntennaGain(offAxisDeg, cfg.txPeakGainDbi, cfg.beamwidth3dBDeg, cfg.sideLobeLevel);
  const gRxTerrestrial = 0;

  const hDb = h > 0 ? 10 * Math.log10(h) : -200;
  const receivedPowerDbm = cfg.txPowerDbm + gTxOff + gRxTerrestrial + hDb;

  const wCenter = DEFAULT_PAPER41_PHYSICAL_LAYER.terrestrialCenterBandwidthMhz;
  const availableBwHz = Math.max(cluster.bandwidthMhz - wCenter, 0) * 1e6;
  const noisePowerDbm = availableBwHz > 0
    ? -174 + 10 * Math.log10(availableBwHz)
    : -174;

  return receivedPowerDbm - noisePowerDbm;
}

/**
 * Check constraint (16): per-cluster interference time-proportion threshold
 *
 * Paper constraint (16): for each terrestrial cluster j where z_c = 1,
 * the fraction of positions where interference exceeds I_th must be ≤ l_j^f
 * (the cluster's load factor). This ties the allowed violation rate to the
 * terrestrial occupancy — higher terrestrial load allows more satellite
 * interference (since the band is already occupied).
 *
 * Paper Section V-A: 32,400 terrestrial cells. We sample N positions per beam
 * cell (terrestrialCellsPerBeam) with varying off-axis angles to approximate
 * the spatial diversity of terrestrial users within each beam's coverage.
 */
function checkConstraint16(
  solution: number[],
  clusters: TerrestrialCluster[],
  ssConfig: SpectrumSharingConfig,
  cellElevations?: Map<number, number>,
  physConfig?: PhysicalLayerConfig,
): boolean {
  const N = ssConfig.terrestrialCellsPerBeam ?? 1;

  for (let i = 0; i < solution.length; i++) {
    if (solution[i] !== 1) continue;
    const cluster = clusters[i];
    if (!cluster) continue;
    const elev = cellElevations?.get(cluster.cellId);

    // Per-cluster violation check: violation fraction ≤ l_j (cluster load)
    let clusterSamples = 0;
    let clusterViolations = 0;

    if (N <= 1 || !physConfig) {
      // Single sample (backward compatible)
      clusterSamples = 1;
      if (computeInterference(cluster, elev, physConfig) >= ssConfig.interferenceThresholdDb) {
        clusterViolations = 1;
      }
    } else {
      // Monte Carlo: sample N terrestrial positions per beam cell
      const beamwidthDeg = physConfig.beamwidth3dBDeg;
      for (let j = 0; j < N; j++) {
        clusterSamples++;
        const offAxisDeg = Math.random() * beamwidthDeg;
        const load = ssConfig.loadRange[0] +
          Math.random() * (ssConfig.loadRange[1] - ssConfig.loadRange[0]);
        const subCluster: TerrestrialCluster = {
          ...cluster,
          load,
        };
        const inr = computeInterferenceAtOffset(subCluster, elev, physConfig, offAxisDeg);
        if (inr >= ssConfig.interferenceThresholdDb) {
          clusterViolations++;
        }
      }
    }

    // Constraint (16): per-cluster violation fraction ≤ l_j^f
    if (clusterSamples > 0 && (clusterViolations / clusterSamples) > cluster.load) {
      return false;
    }
  }

  return true;
}

// ─── Capacity Gain ───────────────────────────────────────────────────────

/**
 * Compute additional capacity from spectrum sharing (Mbits/slot)
 *
 * Eq. 36: D'_{c,f} = (W₂ - W_center) × T_slot × log₂(1 + SNR_c)
 *
 * W₂ = terrestrial total bandwidth (e.g. 100 MHz)
 * W_center = reserved center bandwidth (e.g. 20 MHz)
 * Available shared bandwidth = W₂ - W_center
 */
function computeCapacityGainPerSlot(
  cluster: TerrestrialCluster,
  paperConfig: Paper41Config,
): number {
  const snrLinear = Math.pow(10, paperConfig.targetSnrDb / 10);
  const wCenter = DEFAULT_PAPER41_PHYSICAL_LAYER.terrestrialCenterBandwidthMhz;
  const sharedBw = cluster.bandwidthMhz - wCenter; // W₂ - W_center
  if (sharedBw <= 0) return 0;
  return sharedBw * (paperConfig.slotDurationMs / 1000) * Math.log2(1 + snrLinear);
}

// ─── Fitness Function (Eq. 39) ──────────────────────────────────────────

/**
 * Compute fitness per Eq. 39
 *
 * F_i = Σ_c Ω_c - (D'_{c,f} - Q'_{c,f})²  if constraint (16) holds
 *     = Σ_c Ω_c - (Q'_{c,f})²               otherwise
 *
 * where Ω_c = (Q'_{c,f})² + [(W₂ - W_center) × T_slot × log₂(1 + SNR_c) × T]²
 */
function computeFitness(
  solution: number[],
  queueStates: CellQueueState[],
  clusters: TerrestrialCluster[],
  paperConfig: Paper41Config,
  ssConfig: SpectrumSharingConfig,
  cellElevations?: Map<number, number>,
  physConfig?: PhysicalLayerConfig,
): number {
  const T = paperConfig.slotsPerEpoch;
  const snrLinear = Math.pow(10, paperConfig.targetSnrDb / 10);

  const constraint16Holds = checkConstraint16(solution, clusters, ssConfig, cellElevations, physConfig);

  let fitness = 0;
  for (let i = 0; i < solution.length; i++) {
    const q = queueStates[i];
    const cluster = clusters[i];
    const Qc = q?.queueLength ?? 0;

    // Shared capacity per slot for this cell (Eq. 36: W₂ - W_center)
    const wCenter = DEFAULT_PAPER41_PHYSICAL_LAYER.terrestrialCenterBandwidthMhz;
    const sharedBw = cluster ? Math.max(cluster.bandwidthMhz - wCenter, 0) : 0;
    const sharedCapPerSlot = sharedBw * (paperConfig.slotDurationMs / 1000) * Math.log2(1 + snrLinear);

    const Omega = Qc * Qc + (sharedCapPerSlot * T) ** 2;

    if (constraint16Holds) {
      const Dc = solution[i] === 1 ? sharedCapPerSlot * T : 0;
      fitness += Omega - (Dc - Qc) ** 2;
    } else {
      fitness += Omega - Qc * Qc; // = (sharedCapPerSlot * T)²
    }
  }
  return fitness;
}

// ─── Binarization (Eq. 38) ──────────────────────────────────────────────

/**
 * S-shape sigmoid with coefficient 2 (Eq. 38)
 *
 * S(x) = 1 / (1 + e^{-2x})
 */
function sigmoid2(x: number): number {
  return 1 / (1 + Math.exp(-2 * x));
}

/**
 * Binarize a continuous position vector using Eq. 38
 */
function binarize(position: number[]): number[] {
  return position.map(x => sigmoid2(x) > Math.random() ? 1 : 0);
}

// ─── Tent Chaotic Initialization ────────────────────────────────────────

/**
 * Generate tent chaotic sequence
 *
 * x_{n+1} = 2x_n         if x_n < 0.5
 *           2(1 - x_n)   if x_n ≥ 0.5
 */
function tentChaotic(seed: number, length: number): number[] {
  const seq: number[] = [];
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = x < 0.5 ? 2 * x : 2 * (1 - x);
    // Avoid fixed points
    if (x === 0 || x === 0.5 || x === 1) x = Math.random() * 0.4 + 0.1;
    seq.push(x);
  }
  return seq;
}

// ─── Binary Sparrow Search Algorithm (4-Stage) ──────────────────────────

/**
 * BSSA with all 4 stages from Algorithm 3:
 *
 * Stage 1: Local Search on best sparrow (Lines 7-22)
 * Stage 2: Adaptive Crossover on worse half (Lines 23-30)
 * Stage 3: Standard SSA update (Line 31)
 * Stage 4: Greedy Search post-optimization (Lines 35-37)
 */
function binarySSA(
  dim: number,
  queueStates: CellQueueState[],
  clusters: TerrestrialCluster[],
  paperConfig: Paper41Config,
  ssConfig: SpectrumSharingConfig,
  bssaConfig: BSSAConfig = DEFAULT_BSSA_CONFIG,
  cellElevations?: Map<number, number>,
  physConfig?: PhysicalLayerConfig,
): number[] {
  const { populationSize: n, maxIterations: tMax, producerRatio, scoutRatio, safetyThreshold: ST } = bssaConfig;
  const numProducers = Math.max(1, Math.floor(n * producerRatio));
  const numScouts = Math.max(1, Math.floor(n * scoutRatio));

  // ─── Tent Chaotic Initialization ─────────────────────────────────
  const positions: number[][] = [];
  const binarySolutions: number[][] = [];
  const fitnesses: number[] = [];

  for (let i = 0; i < n; i++) {
    const seed = (i + 1) / (n + 1); // Distribute seeds evenly
    const chaotic = tentChaotic(seed, dim);
    // Map [0,1] to [-4, 4] continuous search space
    const pos = chaotic.map(x => x * 8 - 4);
    positions.push(pos);

    const bin = binarize(pos);
    binarySolutions.push(bin);
    fitnesses[i] = computeFitness(bin, queueStates, clusters, paperConfig, ssConfig, cellElevations, physConfig);
  }

  // Track global best
  let bestIdx = 0;
  let bestFitness = fitnesses[0];
  for (let i = 1; i < n; i++) {
    if (fitnesses[i] > bestFitness) {
      bestFitness = fitnesses[i];
      bestIdx = i;
    }
  }
  let globalBest = [...binarySolutions[bestIdx]];
  let globalBestFitness = bestFitness;

  // ─── Main Loop ───────────────────────────────────────────────────
  for (let t = 0; t < tMax; t++) {
    // Sort indices by fitness (descending)
    const sortedIndices = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => fitnesses[b] - fitnesses[a]);

    const worstIdx = sortedIndices[n - 1];

    // ═══ Stage 1: Local Search on best sparrow (Lines 7-22) ═══
    const bestSparrowIdx = sortedIndices[0];
    for (let ls = 0; ls < bssaConfig.localSearchIter; ls++) {
      // Copy best sparrow
      const sbPrime = [...binarySolutions[bestSparrowIdx]];

      // Randomly select 'a' elements and flip them
      const flips = new Set<number>();
      while (flips.size < Math.min(bssaConfig.localSearchMutations, dim)) {
        flips.add(Math.floor(Math.random() * dim));
      }
      for (const idx of flips) {
        sbPrime[idx] = 1 - sbPrime[idx];
      }

      const sbPrimeFit = computeFitness(sbPrime, queueStates, clusters, paperConfig, ssConfig, cellElevations, physConfig);

      // Update best sparrow if improved
      if (sbPrimeFit > fitnesses[bestSparrowIdx]) {
        binarySolutions[bestSparrowIdx] = sbPrime;
        fitnesses[bestSparrowIdx] = sbPrimeFit;
      }

      // Update global best
      if (sbPrimeFit > globalBestFitness) {
        globalBestFitness = sbPrimeFit;
        globalBest = [...sbPrime];
      }
    }

    // ═══ Stage 2: Adaptive Crossover on worse half (Lines 23-30) ═══
    const halfN = Math.floor(n / 2);
    // Adaptive probability: υ = 0.55 - 0.1/(1 + exp(5 - 10*t/tMax))
    const upsilon = 0.55 - 0.1 / (1 + Math.exp(5 - 10 * t / tMax));

    for (let idx = halfN; idx < n; idx++) {
      const i = sortedIndices[idx];
      if (Math.random() < upsilon) {
        // Randomly select ζ ∈ {1,2,3} elements and flip them
        const zeta = Math.floor(Math.random() * 3) + 1;
        const flips = new Set<number>();
        while (flips.size < Math.min(zeta, dim)) {
          flips.add(Math.floor(Math.random() * dim));
        }
        for (const fidx of flips) {
          positions[i][fidx] = -positions[i][fidx]; // Flip in continuous space
        }
      }
    }

    // ═══ Stage 3: Standard SSA Update (Line 31) ═══
    const R2 = Math.random();

    // Producers
    for (let idx = 0; idx < numProducers; idx++) {
      const i = sortedIndices[idx];
      const alpha = Math.random() + 1e-10;

      for (let j = 0; j < dim; j++) {
        if (R2 < ST) {
          // Safe: normal exploration (Eq. 12a)
          positions[i][j] = positions[i][j] * Math.exp(-idx / (alpha * tMax));
        } else {
          // Danger: jump (Eq. 12b)
          const Q = Math.random() * 2 - 1;
          positions[i][j] = positions[i][j] + Q;
        }
      }
    }

    // Scroungers
    const bestProducerPos = positions[sortedIndices[0]];
    for (let idx = numProducers; idx < n; idx++) {
      const i = sortedIndices[idx];

      if (idx > n / 2) {
        // Hungry scrounger: large jump (Eq. 13a)
        const Q = Math.random() * 2 - 1;
        for (let j = 0; j < dim; j++) {
          positions[i][j] = Q * Math.exp(
            (positions[sortedIndices[n - 1]][j] - positions[i][j]) / (idx * idx + 1e-10),
          );
        }
      } else {
        // Normal scrounger: follow producer (Eq. 13b)
        for (let j = 0; j < dim; j++) {
          const A = Math.random() > 0.5 ? 1 : -1;
          positions[i][j] = bestProducerPos[j] +
            Math.abs(positions[i][j] - bestProducerPos[j]) * A;
        }
      }
    }

    // Scouts
    const scoutIndices = Array.from({ length: n }, (_, i) => i)
      .sort(() => Math.random() - 0.5)
      .slice(0, numScouts);

    for (const i of scoutIndices) {
      if (fitnesses[i] !== globalBestFitness) {
        // Non-best: move toward best + noise (Eq. 14a)
        const beta = Math.random() * 2 - 1;
        for (let j = 0; j < dim; j++) {
          const noise = (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
          positions[i][j] = positions[bestIdx][j] +
            beta * Math.abs(positions[i][j] - positions[bestIdx][j]) * noise;
        }
      } else {
        // Same as best: random jump (Eq. 14b)
        const K = Math.random() * 2 - 1;
        const fWorst = fitnesses[worstIdx];
        const eps = 1e-10;
        for (let j = 0; j < dim; j++) {
          positions[i][j] = positions[i][j] +
            K * (Math.abs(positions[i][j] - positions[worstIdx][j]) /
              (fitnesses[i] - fWorst + eps));
        }
      }
    }

    // ═══ Binarize + Evaluate ═══
    for (let i = 0; i < n; i++) {
      // Clamp to reasonable range
      for (let j = 0; j < dim; j++) {
        positions[i][j] = Math.max(-10, Math.min(10, positions[i][j]));
      }

      const newBin = binarize(positions[i]);
      const newFit = computeFitness(newBin, queueStates, clusters, paperConfig, ssConfig, cellElevations, physConfig);

      if (newFit > fitnesses[i]) {
        binarySolutions[i] = newBin;
        fitnesses[i] = newFit;
      }

      if (fitnesses[i] > globalBestFitness) {
        globalBestFitness = fitnesses[i];
        globalBest = [...binarySolutions[i]];
        bestIdx = i;
      }
    }
  }

  // ═══ Stage 4: Greedy Search (Lines 35-37) ═══
  // Post-optimization: try setting z=0 cells to z=1
  const greedyResult = [...globalBest];
  for (let i = 0; i < dim; i++) {
    if (greedyResult[i] === 0) {
      greedyResult[i] = 1;
      if (!checkConstraint16(greedyResult, clusters, ssConfig, cellElevations, physConfig)) {
        greedyResult[i] = 0; // Revert if constraint violated
      } else {
        // Check if fitness improved
        const newFit = computeFitness(greedyResult, queueStates, clusters, paperConfig, ssConfig, cellElevations, physConfig);
        if (newFit <= globalBestFitness) {
          greedyResult[i] = 0; // Revert if no improvement
        } else {
          globalBestFitness = newFit;
        }
      }
    }
  }

  return greedyResult;
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Execute spectrum sharing decision (Algorithm 3 — BSSA)
 */
export function decideSpectrumSharing(
  queueStates: CellQueueState[],
  clusters: TerrestrialCluster[],
  paperConfig: Paper41Config,
  ssConfig: SpectrumSharingConfig = DEFAULT_SPECTRUM_SHARING_CONFIG,
  cellElevations?: Map<number, number>,
): SpectrumSharingDecision[] {
  if (!ssConfig.enabled) {
    return queueStates.map(q => ({
      cellId: q.cellId,
      useSharedSpectrum: false,
      capacityGain: 0,
      interferenceToTerrestrial: 0,
    }));
  }

  // Build cluster mapping (maintain queueStates index order)
  const clusterMap = new Map<number, TerrestrialCluster>();
  for (const c of clusters) {
    clusterMap.set(c.cellId, c);
  }

  const orderedClusters = queueStates.map(q => clusterMap.get(q.cellId)!).filter(Boolean);

  // Run BSSA with physical interference model when elevations available
  const dim = queueStates.length;
  const physCfg = cellElevations ? DEFAULT_PHYSICAL_LAYER_CONFIG : undefined;
  const bestSolution = binarySSA(
    dim,
    queueStates,
    orderedClusters,
    paperConfig,
    ssConfig,
    undefined, // bssaConfig — use default
    cellElevations,
    physCfg,
  );

  // Convert to decision results
  const decisions: SpectrumSharingDecision[] = queueStates.map((q, i) => {
    const cluster = clusterMap.get(q.cellId);
    if (!cluster) {
      return {
        cellId: q.cellId,
        useSharedSpectrum: false,
        capacityGain: 0,
        interferenceToTerrestrial: 0,
      };
    }

    const useShared = bestSolution[i] === 1;
    const elev = cellElevations?.get(q.cellId);
    const interference = computeInterference(cluster, elev, physCfg);

    // Trust BSSA's proportional Constraint (16) — no additional per-cell hard threshold.
    // Constraint (16) already enforces per-cluster violation fraction ≤ l_j (cluster load).
    const capacityGain = useShared ? computeCapacityGainPerSlot(cluster, paperConfig) : 0;

    return {
      cellId: q.cellId,
      useSharedSpectrum: useShared,
      capacityGain,
      interferenceToTerrestrial: interference,
    };
  });

  return decisions;
}

/**
 * Apply spectrum sharing capacity gain to queue states
 */
export function applySpectrumSharingGain(
  queueStates: CellQueueState[],
  decisions: SpectrumSharingDecision[],
  slotsInEpoch: number,
): CellQueueState[] {
  const gainMap = new Map<number, number>();
  for (const d of decisions) {
    if (d.useSharedSpectrum) {
      gainMap.set(d.cellId, d.capacityGain * slotsInEpoch);
    }
  }

  return queueStates.map(q => {
    const extraCapacity = gainMap.get(q.cellId) ?? 0;
    return {
      ...q,
      servedData: q.servedData + extraCapacity,
    };
  });
}
