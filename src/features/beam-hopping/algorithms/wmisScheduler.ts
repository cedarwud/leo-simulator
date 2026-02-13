/**
 * WMIS Beam Hopping Scheduler v2 — Lyapunov, Algorithm 2
 *
 * Weighted Maximum Independent Set greedy approximation for beam-cell assignment.
 *
 * v2 changes from v1:
 *   - Correct ρ_v formula (Eq. 35, Line 6): weight-based neighbor ratio
 *     ρ_v = w_v / (w_v + Σ_{v'∈V_v} (1-f(v')) × w_{v'})
 *     (v1 used ρ_v = w_v / (1 + degree_v) — wrong)
 *   - Intra-slot weight recalculation (Lines 15-17):
 *     After selecting each vertex, recalculate weights and re-sort
 *   - Queue update within slot (Line 17):
 *     Q_c decreases by served capacity for weight recalculation
 *
 * Weight (Eq. 35):
 *   w_v = (capacity)² + (Q_c^{f,t})² - (D_c^{f,t} - Q_c^{f,t})²
 */

import { ConflictGraph, ConflictVertex } from './conflictGraph';
import { CellQueueState, LyapunovConfig, DEFAULT_LYAPUNOV_CONFIG, CellCapacityMap } from '@/types/lyapunov';

/** Beam Hopping decision result: beam → cell assignments per slot */
export interface BeamHoppingDecision {
  /** Selected (cellId, beamId) combinations */
  assignments: Array<{
    cellId: number;
    beamId: number;
    polarization: 'A' | 'B';
    /** Satellite ID (available with v2 conflict graph) */
    satId?: string;
  }>;
}

/**
 * Compute vertex weight (Equation 35)
 *
 * w_v = (D_c^{f,t})² + (Q_c^{f,t})² - (D_c^{f,t} - Q_c^{f,t})²
 *     = 2 × capacity × Q_effective
 *
 * Where:
 *   D_c^{f,t} = per-slot capacity (Eq. 33)
 *   Q_c^{f,t} = effective remaining queue = max(Q_original - servedData, 0)
 *
 * If cellCapacityMap is provided, uses per-cell SINR-based capacity.
 * Otherwise falls back to fixed SNR capacity from config.
 */
export function computeVertexWeight(
  vertex: ConflictVertex,
  queueState: CellQueueState | undefined,
  config: LyapunovConfig,
  cellCapacityMap?: CellCapacityMap,
): number {
  if (!queueState) return 0;

  // Q_c^{f,t}: effective remaining queue at current slot
  const qEff = Math.max(queueState.queueLength - queueState.servedData, 0);

  const capacityPerSlot = cellCapacityMap?.get(vertex.cellId)
    ?? computeCapacityPerSlotForConfig(config);

  // w_v = cap² + Q_eff² - (cap - Q_eff)² = 2 × cap × Q_eff
  const weight =
    capacityPerSlot * capacityPerSlot +
    qEff * qEff -
    (capacityPerSlot - qEff) * (capacityPerSlot - qEff);

  return Math.max(weight, 0);
}

/**
 * Compute capacity per slot from config
 */
export function computeCapacityPerSlotForConfig(config: LyapunovConfig): number {
  const snrLinear = Math.pow(10, config.targetSnrDb / 10);
  return (
    (config.satelliteBandwidthMhz / config.beamsPerSatellite) *
    (config.slotDurationMs / 1000) *
    Math.log2(1 + snrLinear)
  );
}

/**
 * WMIS greedy solver v2 — Algorithm 2
 *
 * Uses the paper's correct ρ_v formula with neighbor weight sum,
 * and recalculates weights after each vertex selection.
 *
 * @param graph Conflict Graph
 * @param queueStates All cells' queue states
 * @param config Simulation config
 * @returns Beam hopping decision
 */
export function solveWMIS(
  graph: ConflictGraph,
  queueStates: CellQueueState[],
  config: LyapunovConfig = DEFAULT_LYAPUNOV_CONFIG,
  cellCapacityMap?: CellCapacityMap,
): BeamHoppingDecision {
  // Build cellId → queueState mapping (clone for intra-slot update)
  const queueMap = new Map<number, CellQueueState>();
  for (const q of queueStates) {
    queueMap.set(q.cellId, { ...q });
  }

  const defaultCapacity = computeCapacityPerSlotForConfig(config);

  // Build vertex lookup for neighbor weight computation
  const vertexMap = new Map<string, ConflictVertex>();
  for (const v of graph.vertices) {
    vertexMap.set(v.id, v);
  }

  // Accessibility status: f(v) = true means inaccessible
  const inaccessible = new Set<string>();

  // Line 4-5: Mark empty-queue vertices as inaccessible
  for (const v of graph.vertices) {
    const q = queueMap.get(v.cellId);
    if (!q || (q.queueLength <= 0 && q.arrivalData <= 0)) {
      inaccessible.add(v.id);
    }
  }

  const selected: ConflictVertex[] = [];

  // Iterative selection with recalculation (Lines 6-17)
  // Paper Algorithm 2: for k = 1 : |V_f| do — iterate until no accessible vertex remains.
  // Per-satellite beam limits are enforced by conflict graph edges (Eq.12), not a hard cap.
  const maxSelections = graph.vertices.length;
  while (selected.length < maxSelections) {
    // Calculate weights and ρ_v for all accessible vertices (Line 6)
    let bestVertex: ConflictVertex | null = null;
    let bestRatio = -Infinity;

    for (const v of graph.vertices) {
      if (inaccessible.has(v.id)) continue;

      const w_v = computeVertexWeight(v, queueMap.get(v.cellId), config, cellCapacityMap);
      if (w_v <= 0) continue;

      // ρ_v = w_v / (w_v + Σ_{v'∈V_v} (1-f(v')) × w_{v'})
      // Only count accessible neighbors
      let neighborWeightSum = 0;
      const neighbors = graph.adjacency.get(v.id);
      if (neighbors) {
        for (const nId of neighbors) {
          if (!inaccessible.has(nId)) {
            const nv = vertexMap.get(nId);
            if (nv) {
              neighborWeightSum += computeVertexWeight(nv, queueMap.get(nv.cellId), config, cellCapacityMap);
            }
          }
        }
      }

      const rho = w_v / (w_v + neighborWeightSum + 1e-10);

      if (rho > bestRatio) {
        bestRatio = rho;
        bestVertex = { ...v, weight: w_v };
      }
    }

    if (!bestVertex || bestRatio <= 0) break;

    // Line 10-13: Select vertex
    selected.push(bestVertex);

    // Line 14: Mark vertex and neighbors as inaccessible
    inaccessible.add(bestVertex.id);
    const neighbors = graph.adjacency.get(bestVertex.id);
    if (neighbors) {
      for (const nId of neighbors) {
        inaccessible.add(nId);
      }
    }

    // Line 17: Update Q_c^{f,t} for served cell (intra-slot queue update)
    const q = queueMap.get(bestVertex.cellId);
    if (q) {
      const cap = cellCapacityMap?.get(bestVertex.cellId) ?? defaultCapacity;
      q.servedData += cap;
      q.slotsServed += 1;
    }

    // Loop back: weights and ρ_v are recalculated (Line 15)
  }

  return {
    assignments: selected.map(v => ({
      cellId: v.cellId,
      beamId: v.beamId,
      polarization: v.polarization,
      satId: v.satId,
    })),
  };
}

/**
 * Monte Carlo WMIS — approximate optimal solution
 *
 * Runs WMIS multiple times (shuffling vertex evaluation order),
 * keeping the result with highest total weight.
 * Used for MOSEK+Greedy baseline.
 */
export function solveWMIS_MonteCarlo(
  graph: ConflictGraph,
  queueStates: CellQueueState[],
  config: LyapunovConfig = DEFAULT_LYAPUNOV_CONFIG,
  trials: number = 10,
  cellCapacityMap?: CellCapacityMap,
): BeamHoppingDecision {
  const queueMap = new Map<number, CellQueueState>();
  for (const q of queueStates) {
    queueMap.set(q.cellId, q);
  }

  // Check if any eligible vertices exist
  const hasEligible = graph.vertices.some(v => {
    const q = queueMap.get(v.cellId);
    return q && (q.queueLength > 0 || q.arrivalData > 0);
  });
  if (!hasEligible) return { assignments: [] };

  let bestAssignments: Array<{ cellId: number; beamId: number; polarization: 'A' | 'B' }> = [];
  let bestTotalWeight = -Infinity;

  for (let trial = 0; trial < trials; trial++) {
    // Create perturbed queue states to diversify WMIS solutions
    const perturbedQueues = queueStates.map(q => ({
      ...q,
      queueLength: q.queueLength * (0.8 + Math.random() * 0.4),
    }));

    const decision = solveWMIS(graph, perturbedQueues, config, cellCapacityMap);

    // Evaluate with original weights
    const totalWeight = decision.assignments.reduce((sum, a) => {
      const q = queueMap.get(a.cellId);
      if (!q) return sum;
      const v: ConflictVertex = {
        id: '', satId: '', cellId: a.cellId,
        beamId: a.beamId, polarization: a.polarization, weight: 0,
      };
      return sum + computeVertexWeight(v, q, config, cellCapacityMap);
    }, 0);

    if (totalWeight > bestTotalWeight) {
      bestTotalWeight = totalWeight;
      bestAssignments = decision.assignments;
    }
  }

  return { assignments: bestAssignments };
}

/**
 * Schedule an entire epoch of beam hopping
 *
 * Calls solveWMIS for each time slot, updating queue states between slots.
 */
export function scheduleEpoch(
  graph: ConflictGraph,
  queueStates: CellQueueState[],
  config: LyapunovConfig = DEFAULT_LYAPUNOV_CONFIG,
  cellCapacityMap?: CellCapacityMap,
): BeamHoppingDecision[] {
  const decisions: BeamHoppingDecision[] = [];
  // Clone queue states for simulation
  const simQueues = queueStates.map(q => ({ ...q }));

  const defaultCapacity = computeCapacityPerSlotForConfig(config);

  for (let slot = 0; slot < config.slotsPerEpoch; slot++) {
    const decision = solveWMIS(graph, simQueues, config, cellCapacityMap);
    decisions.push(decision);

    // Update queue (accumulate served data)
    for (const assignment of decision.assignments) {
      const q = simQueues.find(sq => sq.cellId === assignment.cellId);
      if (q) {
        const cap = cellCapacityMap?.get(assignment.cellId) ?? defaultCapacity;
        q.servedData += cap;
        q.slotsServed += 1;
      }
    }
  }

  return decisions;
}
