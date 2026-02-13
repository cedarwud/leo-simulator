import { describe, it, expect } from 'vitest';
import {
  initLyapunovState,
  updateVirtualQueues,
  computeDrift,
  computePenalty,
  runEpochDecision,
} from '../lyapunovOptimizer';
import { buildConflictGraph } from '../conflictGraph';
import { DEFAULT_LYAPUNOV_CONFIG } from '@/types/lyapunov';
import type { EarthFixedCell } from '@/features/beam-hopping/components/EarthFixedCells';

function mockCell(id: number, x: number, z: number): EarthFixedCell {
  return {
    id,
    position: { x, z },
    radius: 20,
    frequencyGroup: 0,
    dataQueue: 0,
    arrivalRate: 0.05,
    isServed: false,
    servingSatelliteId: null,
    servingBeamId: null,
    servingPolarization: null,
    servingBeamColor: null,
    isInterfered: false,
    interferingSources: [],
  };
}

describe('lyapunovOptimizer', () => {
  const cellIds = [1, 2, 3, 4, 5];

  describe('initLyapunovState', () => {
    it('should initialize all queues to zero', () => {
      const state = initLyapunovState(cellIds);
      expect(state.epoch).toBe(0);
      expect(state.dataQueues.length).toBe(5);
      expect(state.virtualQueues.length).toBe(5);
      expect(state.dataQueues.every(q => q.queueLength === 0)).toBe(true);
      expect(state.virtualQueues.every(v => v.value === 0)).toBe(true);
    });

    it('should have empty history', () => {
      const state = initLyapunovState(cellIds);
      expect(state.history.length).toBe(0);
    });
  });

  describe('updateVirtualQueues (Eq. 17)', () => {
    it('M_{c,f+1} = max(M_c + m_c - H̄, 0)', () => {
      const vqs = [
        { cellId: 1, value: 0.5 },
        { cellId: 2, value: 0 },
      ];
      const hoIndicators = new Map<number, boolean>();
      hoIndicators.set(1, true);  // did handover
      hoIndicators.set(2, false); // no handover

      const H_bar = 0.004;
      const updated = updateVirtualQueues(vqs, hoIndicators, H_bar);

      // Cell 1: max(0.5 + 1 - 0.004, 0) = 1.496
      expect(updated[0].value).toBeCloseTo(1.496, 3);

      // Cell 2: max(0 + 0 - 0.004, 0) = 0
      expect(updated[1].value).toBe(0);
    });

    it('should not go below zero', () => {
      const vqs = [{ cellId: 1, value: 0.001 }];
      const hoIndicators = new Map([[1, false]]);

      const updated = updateVirtualQueues(vqs, hoIndicators, 0.004);
      // max(0.001 + 0 - 0.004, 0) = 0
      expect(updated[0].value).toBe(0);
    });

    it('virtual queue grows when handover rate exceeds H̄', () => {
      let vqs = [{ cellId: 1, value: 0 }];
      const H_bar = 0.004;

      // 10 consecutive handovers
      for (let i = 0; i < 10; i++) {
        vqs = updateVirtualQueues(vqs, new Map([[1, true]]), H_bar);
      }

      // Should grow to ~10 × (1 - 0.004) = ~9.96
      expect(vqs[0].value).toBeGreaterThan(9);
    });
  });

  describe('computeDrift (Eq. 29)', () => {
    it('should compute sum of Q_c²', () => {
      const queues = [
        { cellId: 1, queueLength: 10, arrivalData: 0, servedData: 0, slotsServed: 0 },
        { cellId: 2, queueLength: 20, arrivalData: 0, servedData: 0, slotsServed: 0 },
      ];
      const drift = computeDrift(queues);
      expect(drift).toBe(10 * 10 + 20 * 20); // 100 + 400 = 500
    });
  });

  describe('computePenalty (Eq. 30)', () => {
    it('should compute sum of M_c × m_c', () => {
      const vqs = [
        { cellId: 1, value: 5 },
        { cellId: 2, value: 3 },
      ];
      const hoIndicators = new Map<number, boolean>();
      hoIndicators.set(1, true);
      hoIndicators.set(2, false);

      const penalty = computePenalty(vqs, hoIndicators);
      expect(penalty).toBe(5 * 1 + 3 * 0); // 5
    });

    it('should return 0 when no handovers', () => {
      const vqs = [
        { cellId: 1, value: 10 },
        { cellId: 2, value: 20 },
      ];
      const hoIndicators = new Map<number, boolean>();
      hoIndicators.set(1, false);
      hoIndicators.set(2, false);

      expect(computePenalty(vqs, hoIndicators)).toBe(0);
    });
  });

  describe('runEpochDecision', () => {
    it('should advance epoch by 1', () => {
      const cells = cellIds.map((id, i) => mockCell(id, i * 60, 0));
      const state = initLyapunovState(cellIds);
      const graph = buildConflictGraph(cells, 4);
      const hoIndicators = new Map(cellIds.map(id => [id, false] as [number, boolean]));

      const result = runEpochDecision(state, graph, hoIndicators, DEFAULT_LYAPUNOV_CONFIG);
      expect(result.updatedState.epoch).toBe(1);
    });

    it('should add snapshot to history', () => {
      const cells = cellIds.map((id, i) => mockCell(id, i * 60, 0));
      const state = initLyapunovState(cellIds);
      const graph = buildConflictGraph(cells, 4);
      const hoIndicators = new Map(cellIds.map(id => [id, false] as [number, boolean]));

      const result = runEpochDecision(state, graph, hoIndicators, DEFAULT_LYAPUNOV_CONFIG);
      expect(result.updatedState.history.length).toBe(1);
      expect(result.updatedState.history[0].epoch).toBe(1);
    });

    it('should have non-negative queue lengths', () => {
      const cells = cellIds.map((id, i) => mockCell(id, i * 60, 0));
      const state = initLyapunovState(cellIds);
      const graph = buildConflictGraph(cells, 4);
      const hoIndicators = new Map(cellIds.map(id => [id, false] as [number, boolean]));

      const result = runEpochDecision(state, graph, hoIndicators, DEFAULT_LYAPUNOV_CONFIG);
      for (const q of result.updatedState.dataQueues) {
        expect(q.queueLength).toBeGreaterThanOrEqual(0);
      }
    });

    it('should compute drift-plus-penalty correctly', () => {
      const cells = cellIds.map((id, i) => mockCell(id, i * 60, 0));
      const state = initLyapunovState(cellIds);
      const graph = buildConflictGraph(cells, 4);
      const hoIndicators = new Map(cellIds.map(id => [id, false] as [number, boolean]));
      const config = DEFAULT_LYAPUNOV_CONFIG;

      const result = runEpochDecision(state, graph, hoIndicators, config);
      const { driftValue, penaltyValue, driftPlusPenalty } = result.updatedState;

      expect(driftPlusPenalty).toBeCloseTo(driftValue + config.lyapunovV * penaltyValue, 5);
    });

    it('should track handover count correctly', () => {
      const cells = cellIds.map((id, i) => mockCell(id, i * 60, 0));
      const state = initLyapunovState(cellIds);
      const graph = buildConflictGraph(cells, 4);

      // 2 out of 5 cells did handover
      const hoIndicators = new Map<number, boolean>();
      hoIndicators.set(1, true);
      hoIndicators.set(2, true);
      hoIndicators.set(3, false);
      hoIndicators.set(4, false);
      hoIndicators.set(5, false);

      const result = runEpochDecision(state, graph, hoIndicators, DEFAULT_LYAPUNOV_CONFIG);
      expect(result.updatedState.totalHandovers).toBe(2);
    });

    it('should return algorithm timings', () => {
      const cells = cellIds.map((id, i) => mockCell(id, i * 60, 0));
      const state = initLyapunovState(cellIds);
      const graph = buildConflictGraph(cells, 4);
      const hoIndicators = new Map(cellIds.map(id => [id, false] as [number, boolean]));

      const result = runEpochDecision(state, graph, hoIndicators, DEFAULT_LYAPUNOV_CONFIG);
      expect(result.timings).toBeDefined();
      expect(result.timings.algorithm2).toBeGreaterThanOrEqual(0);
      expect(result.timings.algorithm3).toBeGreaterThanOrEqual(0);
    });
  });
});
