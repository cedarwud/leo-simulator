/**
 * Paper-Faithful Baseline Runner — Fig. 6-8
 *
 * 3 comparison groups × (proposed + 3 baselines) each:
 *
 * Group 1 - Beam Hopping (Fig. 6): B=4, σ₀=0.9, 6.52 Gbps
 *   Greedy BH [40], MOSEK+Greedy [5], Swap Matching [13]
 *   All use proposed handover (Algo 1), no spectrum sharing
 *
 * Group 2 - Handover (Fig. 7): B=8, σ₀=0.6, 10.57 Gbps
 *   Load Balance [5], Entropy [11], Cell Clustering [41]
 *   All use proposed beam hopping (Algo 2), no spectrum sharing
 *
 * Group 3 - Spectrum Sharing (Fig. 8): B=8, σ₀=0.6, 11.871 Gbps
 *   Greedy SS [40], GA [42], BWO [43]
 *   All use proposed handover + beam hopping
 */

import {
  CellQueueState,
  CellCapacityMap,
  Paper41Config,
  BaselineMetrics,
  BaselineGroups,
  TerrestrialCluster,
  VirtualQueue,
  DEFAULT_PAPER41_CONFIG,
  BH_GROUP_CONFIG,
  HO_GROUP_CONFIG,
  SS_GROUP_CONFIG,
  DEFAULT_SPECTRUM_SHARING_CONFIG,
  DEFAULT_PAPER41_PHYSICAL_LAYER,
} from '@/types/paper41';
import { ConflictGraph } from './conflictGraph';
import { solveWMIS, solveWMIS_MonteCarlo } from './wmisScheduler';
import {
  computeCellCapacityMap,
  computeSlantDistance,
  computeChannelGain,
  computeAntennaGain,
  DEFAULT_PHYSICAL_LAYER_CONFIG,
} from './channelModel';
import { Paper41HandoverManager, SatelliteInfo } from '@/utils/satellite/Paper41HandoverManager';
import { EarthFixedCell, SCENE_TO_KM_SCALE } from '@/features/beam-hopping/components/EarthFixedCells';
import { buildConflictGraph, SatelliteCellAssignment, ConflictPhysicalConfig } from './conflictGraph';
import { decideSpectrumSharing } from './spectrumSharing';

// ═══════════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════════

interface SingleBaselineState {
  queues: CellQueueState[];
  virtualQueues: VirtualQueue[];
  totalHandovers: number;
  prevAssignments: Map<number, string>;
}

export interface BaselineState {
  beamHopping: {
    proposed: SingleBaselineState;
    greedyBH: SingleBaselineState;
    mosekGreedy: SingleBaselineState;
    swapMatchBH: SingleBaselineState;
  };
  handover: {
    proposed: SingleBaselineState;
    loadBalance: SingleBaselineState;
    entropy: SingleBaselineState;
    cellClustering: SingleBaselineState;
  };
  spectrumSharing: {
    proposed: SingleBaselineState;
    greedySS: SingleBaselineState;
    ga: SingleBaselineState;
    bwo: SingleBaselineState;
  };
  /** Paper41HandoverManager for proposed handover (Algorithm 1) — per group */
  _hoManagerBH?: Paper41HandoverManager;
  _hoManagerHO?: Paper41HandoverManager;
  _hoManagerSS?: Paper41HandoverManager;
}

export function initBaselineState(cellIds: number[]): BaselineState {
  const make = (): SingleBaselineState => ({
    queues: cellIds.map(cellId => ({
      cellId, queueLength: 0, arrivalData: 0, servedData: 0, slotsServed: 0,
    })),
    virtualQueues: cellIds.map(cellId => ({ cellId, value: 0 })),
    totalHandovers: 0,
    prevAssignments: new Map(),
  });

  return {
    beamHopping: { proposed: make(), greedyBH: make(), mosekGreedy: make(), swapMatchBH: make() },
    handover: { proposed: make(), loadBalance: make(), entropy: make(), cellClustering: make() },
    spectrumSharing: { proposed: make(), greedySS: make(), ga: make(), bwo: make() },
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  Common Helpers
// ═══════════════════════════════════════════════════════════════════════

const DEMAND_TABLE = [
  0.0221, 0.0636, 0.0636, 0.0325, 0.0740, 0.0325, 0.0209,
  0.0428, 0.0429, 0.0532, 0.0844, 0.0428, 0.0325, 0.0221,
  0.0636, 0.0740, 0.0312, 0.0844, 0.0428, 0.0740,
];

function computeDemand(index: number, config: Paper41Config): number {
  const ratio = index < 20 ? DEMAND_TABLE[index] : 0.05;
  return config.totalArrivalRateGbps * 1000 * ratio *
    (config.slotsPerEpoch * config.slotDurationMs / 1000);
}

function capPerSlot(config: Paper41Config): number {
  const snrLin = Math.pow(10, config.targetSnrDb / 10);
  return (config.satelliteBandwidthMhz / config.beamsPerSatellite) *
    (config.slotDurationMs / 1000) * Math.log2(1 + snrLin);
}

function mergeConfig(base: Paper41Config, group: Partial<Paper41Config>): Paper41Config {
  return { ...base, ...group };
}

/** Update queues after an epoch and compute metrics (Eq.1, 17, 26) */
function finishEpoch(
  state: SingleBaselineState,
  simQueues: CellQueueState[],
  currentAssignments: Map<number, string>,
  config: Paper41Config,
  epoch: number,
  extraServed?: Map<number, number>,
): { metrics: BaselineMetrics; updatedState: SingleBaselineState } {
  // Apply extra served data (spectrum sharing gain)
  if (extraServed) {
    for (const q of simQueues) {
      const extra = extraServed.get(q.cellId);
      if (extra) q.servedData += extra;
    }
  }

  // Derive per-cell handover indicators from prevAssignments → currentAssignments
  const handoverIndicators = new Map<number, boolean>();
  let handoverCount = 0;
  for (const q of simQueues) {
    const prev = state.prevAssignments.get(q.cellId);
    const curr = currentAssignments.get(q.cellId);
    const isHandover = prev !== undefined && prev !== curr;
    handoverIndicators.set(q.cellId, isHandover);
    if (isHandover) handoverCount++;
  }

  // Compute drift BEFORE Eq.1 queue update: Σ(D_c - Q_c)²
  const drift = simQueues.reduce((s, q) => {
    const gap = q.servedData - q.queueLength;
    return s + gap * gap;
  }, 0);

  const totalBeamSlots = config.beamsPerSatellite * config.slotsPerEpoch;
  const totalSlotsServed = simQueues.reduce((s, q) => s + q.slotsServed, 0);
  const resourceUtil = totalBeamSlots > 0 ? totalSlotsServed / totalBeamSlots : 0;

  // Eq.1: Update data queues
  const updatedQueues = simQueues.map((q, i) => {
    const demand = computeDemand(i, config);
    return {
      ...q,
      queueLength: Math.max(q.queueLength - q.servedData, 0) + demand,
      arrivalData: demand,
      servedData: 0,
      slotsServed: 0,
    };
  });

  // Eq.17: Update virtual queues
  const updatedVirtual = state.virtualQueues.map(vq => {
    const didHandover = handoverIndicators.get(vq.cellId) ? 1 : 0;
    return { ...vq, value: Math.max(vq.value + didHandover - config.maxHandoverFrequency, 0) };
  });

  // Eq.26: δ_f = Σ M_c·m_c + V × Σ(D_c - Q_c)²
  const penalty = updatedVirtual.reduce((s, vq) => {
    const didHandover = handoverIndicators.get(vq.cellId) ? 1 : 0;
    return s + vq.value * didHandover;
  }, 0);
  const driftPlusPenalty = penalty + config.lyapunovV * drift;

  const totalHandovers = state.totalHandovers + handoverCount;
  const avgQueue = updatedQueues.reduce((s, q) => s + q.queueLength, 0) / Math.max(updatedQueues.length, 1);

  return {
    metrics: {
      avgQueueLength: avgQueue,
      handoverFrequency: epoch > 0 ? totalHandovers / epoch : 0,
      resourceUtilization: resourceUtil,
      driftPlusPenalty,
    },
    updatedState: {
      queues: updatedQueues,
      virtualQueues: updatedVirtual,
      totalHandovers,
      prevAssignments: state.prevAssignments,
    },
  };
}

/** Build per-cell capacity map from handover assignments */
function buildCapacityMap(
  hoAssignments: Map<number, string>,
  cells: EarthFixedCell[],
  satellites: SatelliteInfo[],
  config: Paper41Config,
): CellCapacityMap | undefined {
  const assignments: Array<{ cellId: number; elevationDeg: number }> = [];
  for (const cell of cells) {
    const satId = hoAssignments.get(cell.id);
    if (!satId) continue;
    const sat = satellites.find(s => s.id === satId);
    if (!sat) continue;
    const elev = sat.elevations.get(cell.id) ?? 35;
    assignments.push({ cellId: cell.id, elevationDeg: elev });
  }
  if (assignments.length === 0) return undefined;
  return computeCellCapacityMap(
    assignments,
    DEFAULT_PHYSICAL_LAYER_CONFIG,
    config.satelliteBandwidthMhz,
    config.beamsPerSatellite,
    config.slotDurationMs,
  );
}

/** Build SatelliteCellAssignment[] for v2 conflict graph from handover map */
function buildSatAssignments(
  hoAssignments: Map<number, string>,
  cells: EarthFixedCell[],
  satellites: SatelliteInfo[],
): SatelliteCellAssignment[] {
  const result: SatelliteCellAssignment[] = [];
  for (const cell of cells) {
    const satId = hoAssignments.get(cell.id);
    if (!satId) continue;
    const sat = satellites.find(s => s.id === satId);
    if (!sat) continue;
    const elev = sat.elevations.get(cell.id) ?? 35;
    result.push({
      satId,
      cellId: cell.id,
      elevationDeg: elev,
      satPosition: sat.position ? { x: sat.position.x, y: sat.position.y, z: sat.position.z } : undefined,
    });
  }
  return result;
}

/** Build ConflictPhysicalConfig for Eq.8 interference-based edges */
function buildPhysConfig(satellites: SatelliteInfo[], config: Paper41Config): ConflictPhysicalConfig {
  return {
    physical: DEFAULT_PHYSICAL_LAYER_CONFIG,
    numVisibleSats: satellites.length,
    targetSnrDb: config.targetSnrDb,
    sceneToKmScale: SCENE_TO_KM_SCALE,
  };
}

/** Run WMIS beam hopping for an epoch, returns simQueues with servedData updated */
function runWMIS(
  simQueues: CellQueueState[],
  graph: ConflictGraph,
  config: Paper41Config,
  cellCapacityMap?: CellCapacityMap,
): void {
  const cap = capPerSlot(config);
  for (let slot = 0; slot < config.slotsPerEpoch; slot++) {
    const decision = solveWMIS(graph, simQueues, config, cellCapacityMap);
    for (const a of decision.assignments) {
      const q = simQueues.find(sq => sq.cellId === a.cellId);
      if (q) {
        const c = cellCapacityMap?.get(a.cellId) ?? cap;
        q.servedData += c;
        q.slotsServed += 1;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  GROUP 1: Beam Hopping Baselines (Fig. 6)
//  All use proposed handover, differ in beam allocation
// ═══════════════════════════════════════════════════════════════════════

/** Greedy BH: allocate beams to B cells with largest queue each slot */
function greedyBeamHopping(
  simQueues: CellQueueState[],
  config: Paper41Config,
): void {
  const cap = capPerSlot(config);
  for (let slot = 0; slot < config.slotsPerEpoch; slot++) {
    // Sort by current effective queue (queueLength - servedData so far)
    const sorted = simQueues
      .map((q, i) => ({ i, priority: Math.max(q.queueLength - q.servedData, 0) + q.arrivalData }))
      .sort((a, b) => b.priority - a.priority);
    const selected = sorted.slice(0, config.beamsPerSatellite);
    for (const { i } of selected) {
      simQueues[i].servedData += cap;
      simQueues[i].slotsServed += 1;
    }
  }
}

/** Swap Matching BH: greedy init + pairwise beam swaps to improve total weight */
function swapMatchBeamHopping(
  simQueues: CellQueueState[],
  config: Paper41Config,
): void {
  const cap = capPerSlot(config);
  for (let slot = 0; slot < config.slotsPerEpoch; slot++) {
    // Greedy init: top B cells by queue
    const indexed = simQueues
      .map((q, i) => ({ i, priority: Math.max(q.queueLength - q.servedData, 0) + q.arrivalData }))
      .sort((a, b) => b.priority - a.priority);

    const selectedSet = new Set(indexed.slice(0, config.beamsPerSatellite).map(s => s.i));
    const unselected = indexed.slice(config.beamsPerSatellite).map(s => s.i);

    // Swap matching: try swapping selected ↔ unselected
    let improved = true;
    let iter = 0;
    while (improved && iter < 10) {
      improved = false;
      iter++;
      const selectedArr = Array.from(selectedSet);
      for (const si of selectedArr) {
        for (const ui of unselected) {
          if (selectedSet.has(ui)) continue;
          const sPri = Math.max(simQueues[si].queueLength - simQueues[si].servedData, 0);
          const uPri = Math.max(simQueues[ui].queueLength - simQueues[ui].servedData, 0);
          if (uPri > sPri) {
            selectedSet.delete(si);
            selectedSet.add(ui);
            improved = true;
            break;
          }
        }
        if (improved) break;
      }
    }

    for (const i of selectedSet) {
      simQueues[i].servedData += cap;
      simQueues[i].slotsServed += 1;
    }
  }
}

/** Run Group 1 baselines for one epoch */
function runBeamHoppingGroup(
  state: BaselineState['beamHopping'],
  cells: EarthFixedCell[],
  satellites: SatelliteInfo[],
  baseConfig: Paper41Config,
  epoch: number,
  handoverManager: Paper41HandoverManager,
): { results: BaselineGroups['beamHopping']; updatedState: BaselineState['beamHopping'] } {
  const config = mergeConfig(baseConfig, BH_GROUP_CONFIG);

  // Shared handover: Algorithm 1 (Paper41HandoverManager)
  const hoResult = handoverManager.decide(cells, satellites, state.proposed.queues, state.proposed.virtualQueues);
  const hoAssignments = new Map<number, string>();
  for (const a of hoResult.assignments) {
    hoAssignments.set(a.cellId, a.satelliteId);
  }

  // v2 conflict graph from handover assignments
  const satAssignments = buildSatAssignments(hoAssignments, cells, satellites);
  const graph = buildConflictGraph(cells, satAssignments, config.beamsPerSatellite, buildPhysConfig(satellites, config));

  // Per-cell capacity from physical layer
  const capMap = buildCapacityMap(hoAssignments, cells, satellites, config);

  // Proposed: WMIS beam hopping
  const propQueues = state.proposed.queues.map(q => ({ ...q }));
  runWMIS(propQueues, graph, config, capMap);
  const prop = finishEpoch(state.proposed, propQueues, hoAssignments, config, epoch);
  prop.updatedState.prevAssignments = new Map(hoAssignments);

  // Greedy BH
  const gQueues = state.greedyBH.queues.map(q => ({ ...q }));
  greedyBeamHopping(gQueues, config);
  const g = finishEpoch(state.greedyBH, gQueues, hoAssignments, config, epoch);
  g.updatedState.prevAssignments = new Map(hoAssignments);

  // MOSEK+Greedy proxy: Monte Carlo WMIS heuristic (MOSEK convex solver requires commercial license)
  const mQueues = state.mosekGreedy.queues.map(q => ({ ...q }));
  const cap = capPerSlot(config);
  for (let slot = 0; slot < config.slotsPerEpoch; slot++) {
    const decision = solveWMIS_MonteCarlo(graph, mQueues, config, 50, capMap);
    for (const a of decision.assignments) {
      const q = mQueues.find(sq => sq.cellId === a.cellId);
      if (q) {
        const c = capMap?.get(a.cellId) ?? cap;
        q.servedData += c;
        q.slotsServed += 1;
      }
    }
  }
  const m = finishEpoch(state.mosekGreedy, mQueues, hoAssignments, config, epoch);
  m.updatedState.prevAssignments = new Map(hoAssignments);

  // Swap Matching BH
  const swQueues = state.swapMatchBH.queues.map(q => ({ ...q }));
  swapMatchBeamHopping(swQueues, config);
  const sw = finishEpoch(state.swapMatchBH, swQueues, hoAssignments, config, epoch);
  sw.updatedState.prevAssignments = new Map(hoAssignments);

  return {
    results: {
      proposed: prop.metrics,
      greedyBH: g.metrics,
      mosekGreedy: m.metrics,
      swapMatchBH: sw.metrics,
    },
    updatedState: {
      proposed: prop.updatedState,
      greedyBH: g.updatedState,
      mosekGreedy: m.updatedState,
      swapMatchBH: sw.updatedState,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  GROUP 2: Handover Baselines (Fig. 7)
//  All use proposed WMIS, differ in handover decision
// ═══════════════════════════════════════════════════════════════════════

const MIN_ELEVATION = 35;

/**
 * Topology-change filter: baselines only re-assign cells where the
 * previously assigned satellite is no longer visible (elev < MIN_ELEVATION).
 * Paper Section V-C: baseline handover triggered only on topology change.
 *
 * @returns assignments with unchanged cells kept from prev, changed cells re-assigned by strategy
 */
function applyTopologyChangeFilter(
  prevAssignments: Map<number, string>,
  fullReassignment: Map<number, string>,
  cells: EarthFixedCell[],
  satellites: SatelliteInfo[],
): Map<number, string> {
  if (prevAssignments.size === 0) return fullReassignment;

  const result = new Map<number, string>();
  for (const cell of cells) {
    const prevSat = prevAssignments.get(cell.id);
    if (prevSat) {
      // Check if previous satellite is still visible
      const satInfo = satellites.find(s => s.id === prevSat);
      const elev = satInfo?.elevations.get(cell.id) ?? 0;
      if (elev >= MIN_ELEVATION) {
        // No topology change — keep previous assignment
        result.set(cell.id, prevSat);
        continue;
      }
    }
    // Topology changed — use new assignment from strategy
    result.set(cell.id, fullReassignment.get(cell.id) ?? '');
  }
  return result;
}

/** Greedy handover: each cell → highest elevation satellite */
function greedyHandover(
  cells: EarthFixedCell[],
  satellites: SatelliteInfo[],
): Map<number, string> {
  const assignments = new Map<number, string>();
  for (const cell of cells) {
    let bestSat = satellites[0]?.id ?? '';
    let bestElev = -1;
    for (const sat of satellites) {
      const elev = sat.elevations.get(cell.id) ?? 0;
      if (elev > bestElev) { bestElev = elev; bestSat = sat.id; }
    }
    assignments.set(cell.id, bestSat);
  }
  return assignments;
}

/** Load Balance: each cell → satellite with minimum current load */
function loadBalanceHandover(
  cells: EarthFixedCell[],
  satellites: SatelliteInfo[],
): Map<number, string> {
  const loads = new Map<string, number>();
  for (const s of satellites) loads.set(s.id, 0);

  const assignments = new Map<number, string>();
  for (const cell of cells) {
    let bestSat = '';
    let minLoad = Infinity;
    for (const sat of satellites) {
      const elev = sat.elevations.get(cell.id) ?? 0;
      if (elev < MIN_ELEVATION) continue;
      const load = loads.get(sat.id) ?? 0;
      if (load < minLoad) { minLoad = load; bestSat = sat.id; }
    }
    if (!bestSat && satellites.length > 0) bestSat = satellites[0].id;
    assignments.set(cell.id, bestSat);
    loads.set(bestSat, (loads.get(bestSat) ?? 0) + 1);
  }
  return assignments;
}

/** Entropy-only handover: multi-attribute selection without conditional trigger or swap matching */
function entropyHandover(
  cells: EarthFixedCell[],
  satellites: SatelliteInfo[],
  currentAssignments: Map<number, string>,
): Map<number, string> {
  const assignments = new Map<number, string>();

  for (const cell of cells) {
    const candidates = satellites.filter(s => (s.elevations.get(cell.id) ?? 0) >= MIN_ELEVATION);
    if (candidates.length === 0) {
      // Fallback: highest elevation
      const best = satellites.reduce((b, s) =>
        (s.elevations.get(cell.id) ?? 0) > (b.elevations.get(cell.id) ?? 0) ? s : b, satellites[0]);
      assignments.set(cell.id, best?.id ?? '');
      continue;
    }

    // Three attributes: inverted load, elevation, remaining service time
    const loads = candidates.map(s => {
      let count = 0;
      currentAssignments.forEach(v => { if (v === s.id) count++; });
      return count;
    });
    const maxLoad = Math.max(...loads, 1);
    const invLoads = loads.map(l => maxLoad - l + 1);
    const elevs = candidates.map(s => s.elevations.get(cell.id) ?? 0);
    const rsts = candidates.map(s => s.remainingServiceTime);

    // Entropy weights
    const weights = entropyWeights([invLoads, elevs, rsts]);

    // Score each candidate
    const maxInvLoad = Math.max(...invLoads, 1);
    const maxElev = Math.max(...elevs, 1);
    const maxRst = Math.max(...rsts, 1);

    let bestScore = -Infinity;
    let bestSat = candidates[0].id;
    for (let i = 0; i < candidates.length; i++) {
      const score = weights[0] * invLoads[i] / maxInvLoad +
                    weights[1] * elevs[i] / maxElev +
                    weights[2] * rsts[i] / maxRst;
      if (score > bestScore) { bestScore = score; bestSat = candidates[i].id; }
    }
    assignments.set(cell.id, bestSat);
  }
  return assignments;
}

/** Entropy weight calculation: E_j = -1/ln(n) × Σ p×ln(p), w_j = (1-E_j)/Σ(1-E_k) */
function entropyWeights(attributes: number[][]): number[] {
  const m = attributes.length;
  if (m === 0) return [];
  const n = attributes[0].length;
  if (n <= 1) return attributes.map(() => 1 / m);

  const lnN = Math.log(n);
  const entropies: number[] = [];
  for (const vals of attributes) {
    const total = vals.reduce((s, v) => s + Math.max(v, 1e-10), 0);
    let E = 0;
    for (const v of vals) {
      const p = Math.max(v, 1e-10) / total;
      E -= p * Math.log(p);
    }
    entropies.push(Math.min(E / lnN, 1));
  }
  const divs = entropies.map(e => 1 - e);
  const totalDiv = divs.reduce((s, d) => s + d, 0);
  if (totalDiv < 1e-10) return attributes.map(() => 1 / m);
  return divs.map(d => d / totalDiv);
}

/** Cell Clustering: assign cells to nearest satellite by geographic distance */
function cellClusteringHandover(
  cells: EarthFixedCell[],
  satellites: SatelliteInfo[],
): Map<number, string> {
  const assignments = new Map<number, string>();
  // For each cell, assign to the visible satellite with shortest horizontal distance
  for (const cell of cells) {
    let bestSat = satellites[0]?.id ?? '';
    let bestDist = Infinity;
    for (const sat of satellites) {
      const elev = sat.elevations.get(cell.id) ?? 0;
      if (elev < MIN_ELEVATION) continue;
      // Use elevation as proxy for distance (higher = closer)
      // Invert: shortest distance = highest elevation
      const dist = 90 - elev; // Lower value = closer
      if (dist < bestDist) { bestDist = dist; bestSat = sat.id; }
    }
    if (!bestSat && satellites.length > 0) bestSat = satellites[0].id;
    assignments.set(cell.id, bestSat);
  }
  // Rebalance: if any satellite has too many cells, move excess to nearby satellites
  const satCells = new Map<string, number[]>();
  assignments.forEach((satId, cellId) => {
    if (!satCells.has(satId)) satCells.set(satId, []);
    satCells.get(satId)!.push(cellId);
  });
  const maxPerSat = Math.ceil(cells.length / Math.max(satellites.length, 1)) + 1;
  for (const [satId, cellIds] of satCells) {
    while (cellIds.length > maxPerSat) {
      const removedCellId = cellIds.pop()!;
      // Find next closest satellite with room
      let nextBest = '';
      let nextBestDist = Infinity;
      for (const sat of satellites) {
        if (sat.id === satId) continue;
        const satCellCount = satCells.get(sat.id)?.length ?? 0;
        if (satCellCount >= maxPerSat) continue;
        const elev = sat.elevations.get(removedCellId) ?? 0;
        if (elev < MIN_ELEVATION) continue;
        const dist = 90 - elev;
        if (dist < nextBestDist) { nextBestDist = dist; nextBest = sat.id; }
      }
      if (nextBest) {
        assignments.set(removedCellId, nextBest);
        if (!satCells.has(nextBest)) satCells.set(nextBest, []);
        satCells.get(nextBest)!.push(removedCellId);
      }
    }
  }
  return assignments;
}

/** Run Group 2 baselines for one epoch */
function runHandoverGroup(
  state: BaselineState['handover'],
  cells: EarthFixedCell[],
  satellites: SatelliteInfo[],
  baseConfig: Paper41Config,
  epoch: number,
  handoverManager: Paper41HandoverManager,
): { results: BaselineGroups['handover']; updatedState: BaselineState['handover'] } {
  const config = mergeConfig(baseConfig, HO_GROUP_CONFIG);

  // Proposed: full Algorithm 1 (conditional trigger → entropy → swap matching)
  const hoResult = handoverManager.decide(cells, satellites, state.proposed.queues, state.proposed.virtualQueues);
  const proposedAssignments = new Map<number, string>();
  for (const a of hoResult.assignments) {
    proposedAssignments.set(a.cellId, a.satelliteId);
  }

  // Different handover strategies
  // Baselines use topology-change trigger: only re-assign cells where satellite became invisible
  const hoStrategies: Record<string, Map<number, string>> = {
    proposed: proposedAssignments,
    loadBalance: applyTopologyChangeFilter(
      state.loadBalance.prevAssignments, loadBalanceHandover(cells, satellites), cells, satellites,
    ),
    entropy: applyTopologyChangeFilter(
      state.entropy.prevAssignments, entropyHandover(cells, satellites, state.entropy.prevAssignments), cells, satellites,
    ),
    cellClustering: applyTopologyChangeFilter(
      state.cellClustering.prevAssignments, cellClusteringHandover(cells, satellites), cells, satellites,
    ),
  };

  const results: Record<string, BaselineMetrics> = {};
  const updatedStates: Record<string, SingleBaselineState> = {};

  for (const [key, hoAssignments] of Object.entries(hoStrategies)) {
    const s = state[key as keyof typeof state];
    const simQueues = s.queues.map(q => ({ ...q }));
    const capMap = buildCapacityMap(hoAssignments, cells, satellites, config);
    // v2 conflict graph per handover strategy
    const satAsgn = buildSatAssignments(hoAssignments, cells, satellites);
    const graph = buildConflictGraph(cells, satAsgn, config.beamsPerSatellite, buildPhysConfig(satellites, config));
    runWMIS(simQueues, graph, config, capMap);
    const result = finishEpoch(s, simQueues, hoAssignments, config, epoch);
    result.updatedState.prevAssignments = new Map(hoAssignments);
    results[key] = result.metrics;
    updatedStates[key] = result.updatedState;
  }

  return {
    results: results as unknown as BaselineGroups['handover'],
    updatedState: updatedStates as unknown as BaselineState['handover'],
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  GROUP 3: Spectrum Sharing Baselines (Fig. 8)
//  All use proposed handover + beam hopping, differ in SS decision
// ═══════════════════════════════════════════════════════════════════════

/** Compute interference: physical model when elevation available, else simplified */
function baselineInterference(
  cluster: TerrestrialCluster,
  elevationDeg?: number,
): number {
  if (elevationDeg === undefined) {
    return -20 + cluster.load * 20;
  }
  const cfg = DEFAULT_PHYSICAL_LAYER_CONFIG;
  const dist = computeSlantDistance(cfg.orbitalAltitudeKm, elevationDeg);
  const h = computeChannelGain(dist, elevationDeg, cfg.frequencyGhz, cfg);
  const thetaOff = cfg.beamwidth3dBDeg * 0.5;
  const gTxOff = computeAntennaGain(thetaOff, cfg.txPeakGainDbi, cfg.beamwidth3dBDeg, cfg.sideLobeLevel);
  const hDb = h > 0 ? 10 * Math.log10(h) : -200;
  const rxPowerDbm = cfg.txPowerDbm + gTxOff + 0 + hDb;
  const wCenter = DEFAULT_PAPER41_PHYSICAL_LAYER.terrestrialCenterBandwidthMhz;
  const availBwHz = Math.max(cluster.bandwidthMhz - wCenter, 0) * 1e6;
  const noiseDbm = availBwHz > 0 ? -174 + 10 * Math.log10(availBwHz) : -174;
  return rxPowerDbm - noiseDbm;
}

/** Check constraint (16): per-cluster — interference violation fraction ≤ l_j (cluster load) */
function constraintOK(
  solution: number[],
  clusters: TerrestrialCluster[],
  threshold: number,
  cellElevations?: Map<number, number>,
): boolean {
  for (let i = 0; i < solution.length; i++) {
    if (solution[i] !== 1) continue;
    if (!clusters[i]) continue;
    const elev = cellElevations?.get(clusters[i].cellId);
    if (baselineInterference(clusters[i], elev) >= threshold) {
      // Single-sample per cluster: violation fraction = 1.0 > l_j (≤0.6)
      // This cluster violates constraint (16)
      return false;
    }
  }
  return true;
}

/** Eq. 39 fitness for spectrum sharing */
function ssFitness(
  solution: number[],
  queues: CellQueueState[],
  clusters: TerrestrialCluster[],
  config: Paper41Config,
  cellElevations?: Map<number, number>,
): number {
  const T = config.slotsPerEpoch;
  const snrLin = Math.pow(10, config.targetSnrDb / 10);
  const feasible = constraintOK(solution, clusters, DEFAULT_SPECTRUM_SHARING_CONFIG.interferenceThresholdDb, cellElevations);

  let fitness = 0;
  for (let i = 0; i < solution.length; i++) {
    const Qc = queues[i]?.queueLength ?? 0;
    const cluster = clusters[i];
    const wCenter = DEFAULT_PAPER41_PHYSICAL_LAYER.terrestrialCenterBandwidthMhz;
    const sharedBw = cluster ? Math.max(cluster.bandwidthMhz - wCenter, 0) : 0;
    const sharedCap = sharedBw * (config.slotDurationMs / 1000) * Math.log2(1 + snrLin);
    const Omega = Qc * Qc + (sharedCap * T) ** 2;
    if (feasible) {
      const Dc = solution[i] === 1 ? sharedCap * T : 0;
      fitness += Omega - (Dc - Qc) ** 2;
    } else {
      fitness += Omega - Qc * Qc;
    }
  }
  return fitness;
}

/** Compute spectrum sharing capacity gain map (cellId → extra Mbits served) */
function ssCapacityGain(
  solution: number[],
  queues: CellQueueState[],
  clusters: TerrestrialCluster[],
  config: Paper41Config,
  cellElevations?: Map<number, number>,
): Map<number, number> {
  const gain = new Map<number, number>();
  const snrLin = Math.pow(10, config.targetSnrDb / 10);
  const threshold = DEFAULT_SPECTRUM_SHARING_CONFIG.interferenceThresholdDb;

  for (let i = 0; i < solution.length; i++) {
    if (solution[i] !== 1) continue;
    const q = queues[i];
    const cluster = clusters[i];
    if (!q || !cluster) continue;
    const elev = cellElevations?.get(cluster.cellId);
    if (baselineInterference(cluster, elev) >= threshold) continue;

    const wCenter2 = DEFAULT_PAPER41_PHYSICAL_LAYER.terrestrialCenterBandwidthMhz;
    const capPerSlot = Math.max(cluster.bandwidthMhz - wCenter2, 0) *
      (config.slotDurationMs / 1000) * Math.log2(1 + snrLin);
    gain.set(q.cellId, capPerSlot * config.slotsPerEpoch);
  }
  return gain;
}

/** Greedy SS: set z=1 for cells with largest queue, respecting constraint */
function greedySpectrumSharing(
  queues: CellQueueState[],
  clusters: TerrestrialCluster[],
  cellElevations?: Map<number, number>,
): number[] {
  const result = new Array(queues.length).fill(0);
  const threshold = DEFAULT_SPECTRUM_SHARING_CONFIG.interferenceThresholdDb;
  const sorted = queues.map((_, i) => i).sort((a, b) => (queues[b]?.queueLength ?? 0) - (queues[a]?.queueLength ?? 0));

  for (const idx of sorted) {
    result[idx] = 1;
    if (!constraintOK(result, clusters, threshold, cellElevations)) {
      result[idx] = 0;
    }
  }
  return result;
}

/** GA-based spectrum sharing: binary genetic algorithm */
function gaSpectrumSharing(
  queues: CellQueueState[],
  clusters: TerrestrialCluster[],
  config: Paper41Config,
  cellElevations?: Map<number, number>,
): number[] {
  const dim = queues.length;
  const POP = 20;
  const GENS = 15;
  const P_CROSS = 0.7;
  const P_MUT = 0.05;

  // Initialize population randomly
  let pop: number[][] = [];
  for (let i = 0; i < POP; i++) {
    pop.push(Array.from({ length: dim }, () => Math.random() > 0.5 ? 1 : 0));
  }

  let bestSol = pop[0];
  let bestFit = ssFitness(bestSol, queues, clusters, config, cellElevations);

  for (let gen = 0; gen < GENS; gen++) {
    const fitnesses = pop.map(p => ssFitness(p, queues, clusters, config, cellElevations));

    // Update global best
    for (let i = 0; i < POP; i++) {
      if (fitnesses[i] > bestFit) { bestFit = fitnesses[i]; bestSol = [...pop[i]]; }
    }

    // Tournament selection + crossover + mutation → new population
    const newPop: number[][] = [bestSol]; // Elitism
    while (newPop.length < POP) {
      // Tournament selection (size 3)
      const select = () => {
        let best = Math.floor(Math.random() * POP);
        for (let t = 0; t < 2; t++) {
          const c = Math.floor(Math.random() * POP);
          if (fitnesses[c] > fitnesses[best]) best = c;
        }
        return pop[best];
      };

      const p1 = select();
      const p2 = select();

      // Uniform crossover
      const child = p1.map((v, i) =>
        Math.random() < P_CROSS ? (Math.random() < 0.5 ? v : p2[i]) : v
      );

      // Bit flip mutation
      for (let i = 0; i < dim; i++) {
        if (Math.random() < P_MUT) child[i] = 1 - child[i];
      }

      newPop.push(child);
    }
    pop = newPop;
  }

  return bestSol;
}

/** BWO: Binary Whale Optimization for spectrum sharing */
function bwoSpectrumSharing(
  queues: CellQueueState[],
  clusters: TerrestrialCluster[],
  config: Paper41Config,
  cellElevations?: Map<number, number>,
): number[] {
  const dim = queues.length;
  const POP = 20;
  const ITERS = 15;

  // Initialize continuous positions [-2, 2]
  const positions: number[][] = [];
  const solutions: number[][] = [];
  const fitnesses: number[] = [];

  for (let i = 0; i < POP; i++) {
    positions.push(Array.from({ length: dim }, () => Math.random() * 4 - 2));
    solutions.push(positions[i].map(x => 1 / (1 + Math.exp(-x)) > 0.5 ? 1 : 0));
    fitnesses[i] = ssFitness(solutions[i], queues, clusters, config, cellElevations);
  }

  let bestIdx = fitnesses.indexOf(Math.max(...fitnesses));
  let bestSol = [...solutions[bestIdx]];
  let bestFit = fitnesses[bestIdx];

  for (let t = 0; t < ITERS; t++) {
    const a = 2 - 2 * t / ITERS; // Linearly decreasing from 2 to 0

    for (let i = 0; i < POP; i++) {
      const r = Math.random();
      const A = 2 * a * Math.random() - a;
      const C = 2 * Math.random();
      const p = Math.random();
      const l = Math.random() * 2 - 1;

      for (let j = 0; j < dim; j++) {
        if (p < 0.5) {
          if (Math.abs(A) < 1) {
            // Encircling prey (exploitation)
            const D = Math.abs(C * positions[bestIdx][j] - positions[i][j]);
            positions[i][j] = positions[bestIdx][j] - A * D;
          } else {
            // Search for prey (exploration) — random whale
            const randIdx = Math.floor(Math.random() * POP);
            const D = Math.abs(C * positions[randIdx][j] - positions[i][j]);
            positions[i][j] = positions[randIdx][j] - A * D;
          }
        } else {
          // Spiral update
          const D = Math.abs(positions[bestIdx][j] - positions[i][j]);
          positions[i][j] = D * Math.exp(l) * Math.cos(2 * Math.PI * l) + positions[bestIdx][j];
        }
        // Clamp
        positions[i][j] = Math.max(-6, Math.min(6, positions[i][j]));
      }

      // Sigmoid binarization
      const newSol = positions[i].map(x => 1 / (1 + Math.exp(-x)) > Math.random() ? 1 : 0);
      const newFit = ssFitness(newSol, queues, clusters, config, cellElevations);
      if (newFit > fitnesses[i]) {
        solutions[i] = newSol;
        fitnesses[i] = newFit;
      }
      if (newFit > bestFit) {
        bestFit = newFit;
        bestSol = [...newSol];
        bestIdx = i;
      }
    }
  }

  return bestSol;
}

/** Run Group 3 baselines for one epoch */
function runSpectrumSharingGroup(
  state: BaselineState['spectrumSharing'],
  cells: EarthFixedCell[],
  satellites: SatelliteInfo[],
  baseConfig: Paper41Config,
  clusters: TerrestrialCluster[],
  epoch: number,
  handoverManager: Paper41HandoverManager,
): { results: BaselineGroups['spectrumSharing']; updatedState: BaselineState['spectrumSharing'] } {
  const config = mergeConfig(baseConfig, SS_GROUP_CONFIG);

  // Shared handover: Algorithm 1 (Paper41HandoverManager)
  const hoResult = handoverManager.decide(cells, satellites, state.proposed.queues, state.proposed.virtualQueues);
  const hoAssignments = new Map<number, string>();
  for (const a of hoResult.assignments) {
    hoAssignments.set(a.cellId, a.satelliteId);
  }

  // v2 conflict graph from handover assignments
  const satAsgn = buildSatAssignments(hoAssignments, cells, satellites);
  const graph = buildConflictGraph(cells, satAsgn, config.beamsPerSatellite, buildPhysConfig(satellites, config));

  // Per-cell capacity from physical layer
  const capMap = buildCapacityMap(hoAssignments, cells, satellites, config);

  // Build cell elevations for physical interference model
  const cellElevations = new Map<number, number>();
  for (const cell of cells) {
    const satId = hoAssignments.get(cell.id);
    if (!satId) continue;
    const sat = satellites.find(s => s.id === satId);
    if (sat) {
      const elev = sat.elevations.get(cell.id) ?? 35;
      cellElevations.set(cell.id, elev);
    }
  }

  // All share the same handover + beam hopping, differ in SS
  const ssStrategies: Record<string, number[]> = {};

  // Need reference queues for SS decisions
  const refQueues = state.proposed.queues;

  // Proposed: full Algorithm 3 (BSSA — Binary Sparrow Search)
  const bssaDecisions = decideSpectrumSharing(refQueues, clusters, config, undefined, cellElevations);
  ssStrategies.proposed = bssaDecisions.map(d => d.useSharedSpectrum ? 1 : 0);
  ssStrategies.greedySS = greedySpectrumSharing(refQueues, clusters, cellElevations);
  ssStrategies.ga = gaSpectrumSharing(refQueues, clusters, config, cellElevations);
  ssStrategies.bwo = bwoSpectrumSharing(refQueues, clusters, config, cellElevations);

  const results: Record<string, BaselineMetrics> = {};
  const updatedStates: Record<string, SingleBaselineState> = {};

  for (const [key, ssSolution] of Object.entries(ssStrategies)) {
    const s = state[key as keyof typeof state];
    const simQueues = s.queues.map(q => ({ ...q }));

    // Run shared BH (WMIS) with per-cell capacity
    runWMIS(simQueues, graph, config, capMap);

    // Apply SS gain with physical interference
    const extraServed = ssCapacityGain(ssSolution, simQueues, clusters, config, cellElevations);
    const result = finishEpoch(s, simQueues, hoAssignments, config, epoch, extraServed);
    result.updatedState.prevAssignments = new Map(hoAssignments);
    results[key] = result.metrics;
    updatedStates[key] = result.updatedState;
  }

  return {
    results: results as unknown as BaselineGroups['spectrumSharing'],
    updatedState: updatedStates as unknown as BaselineState['spectrumSharing'],
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  Unified Entry Point
// ═══════════════════════════════════════════════════════════════════════

export interface BaselineResults {
  groups: BaselineGroups;
}

export function runBaselineEpoch(
  state: BaselineState,
  cells: EarthFixedCell[],
  satellites: SatelliteInfo[],
  baseConfig: Paper41Config,
  clusters: TerrestrialCluster[],
  epoch: number,
): { results: BaselineGroups; updatedState: BaselineState } {
  // Ensure per-group handover managers exist (lazy init for backward compatibility)
  if (!state._hoManagerBH) {
    state._hoManagerBH = new Paper41HandoverManager(mergeConfig(baseConfig, BH_GROUP_CONFIG));
  }
  if (!state._hoManagerHO) {
    state._hoManagerHO = new Paper41HandoverManager(mergeConfig(baseConfig, HO_GROUP_CONFIG));
  }
  if (!state._hoManagerSS) {
    state._hoManagerSS = new Paper41HandoverManager(mergeConfig(baseConfig, SS_GROUP_CONFIG));
  }

  const bh = runBeamHoppingGroup(state.beamHopping, cells, satellites, baseConfig, epoch, state._hoManagerBH);
  const ho = runHandoverGroup(state.handover, cells, satellites, baseConfig, epoch, state._hoManagerHO);
  const ss = runSpectrumSharingGroup(state.spectrumSharing, cells, satellites, baseConfig, clusters, epoch, state._hoManagerSS);

  return {
    results: {
      beamHopping: bh.results,
      handover: ho.results,
      spectrumSharing: ss.results,
    },
    updatedState: {
      beamHopping: bh.updatedState,
      handover: ho.updatedState,
      spectrumSharing: ss.updatedState,
      _hoManagerBH: state._hoManagerBH,
      _hoManagerHO: state._hoManagerHO,
      _hoManagerSS: state._hoManagerSS,
    },
  };
}
