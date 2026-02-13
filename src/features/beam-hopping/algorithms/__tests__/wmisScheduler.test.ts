import { describe, it, expect } from 'vitest';
import { computeVertexWeight, solveWMIS } from '../wmisScheduler';
import type { ConflictVertex } from '../conflictGraph';
import { buildConflictGraph } from '../conflictGraph';
import type { CellQueueState, LyapunovConfig } from '@/types/lyapunov';
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

function mockQueueState(cellId: number, queueLength: number): CellQueueState {
  return {
    cellId,
    queueLength,
    arrivalData: 0,
    servedData: 0,
    slotsServed: 0,
  };
}

describe('wmisScheduler', () => {
  const config = DEFAULT_LYAPUNOV_CONFIG;

  describe('computeVertexWeight (Eq. 35)', () => {
    const dummyVertex: ConflictVertex = { id: 'satdefault_cell1_beam1', satId: 'default', cellId: 1, beamId: 1, polarization: 'A', weight: 0 };

    it('should return positive weight for non-empty queue', () => {
      const queue = mockQueueState(1, 100);
      const weight = computeVertexWeight(dummyVertex, queue, config);
      expect(weight).toBeGreaterThan(0);
    });

    it('should return 0 for empty queue (Q=0, servedData=0)', () => {
      const queue = mockQueueState(1, 0);
      const weight = computeVertexWeight(dummyVertex, queue, config);
      // qEff = max(0-0, 0) = 0; w = 2 × cap × 0 = 0
      expect(weight).toBe(0);
    });

    it('should return 0 weight for undefined queue', () => {
      const weight = computeVertexWeight(dummyVertex, undefined, config);
      expect(weight).toBe(0);
    });

    it('should increase weight with longer queue', () => {
      const q1 = mockQueueState(1, 50);
      const q2 = mockQueueState(1, 200);
      const w1 = computeVertexWeight(dummyVertex, q1, config);
      const w2 = computeVertexWeight(dummyVertex, q2, config);
      expect(w2).toBeGreaterThan(w1);
    });

    it('weight formula: cap² + qEff² - (cap-qEff)² = 2×cap×qEff', () => {
      const queue = mockQueueState(1, 100);
      const snrLinear = Math.pow(10, config.targetSnrDb / 10);
      const capacity = (config.satelliteBandwidthMhz / config.beamsPerSatellite) *
        (config.slotDurationMs / 1000) *
        Math.log2(1 + snrLinear);

      // qEff = max(100 - 0, 0) = 100; w = 2 × cap × 100
      const expected = 2 * capacity * 100;
      const actual = computeVertexWeight(dummyVertex, queue, config);
      expect(actual).toBeCloseTo(expected, 0);
    });
  });

  describe('solveWMIS', () => {
    it('should respect per-satellite beam limit from conflict graph edges', () => {
      const cells = Array.from({ length: 10 }, (_, i) =>
        mockCell(i + 1, i * 50, 0)
      );
      const queues = cells.map(c => mockQueueState(c.id, 100));
      // Single satellite → conflict graph limits to B per satellite
      const graph = buildConflictGraph(cells, config.beamsPerSatellite);

      const decision = solveWMIS(graph, queues, config);

      expect(decision.assignments.length).toBeLessThanOrEqual(config.beamsPerSatellite);
    });

    it('should select more than B beams with multiple satellites', () => {
      // 8 cells across 2 satellites, B=4 → max could be 2×4=8
      const cells = Array.from({ length: 8 }, (_, i) =>
        mockCell(i + 1, i * 100, 0)  // spread far apart to avoid interference
      );
      const queues = cells.map(c => mockQueueState(c.id, 500));
      const testConfig = { ...config, beamsPerSatellite: 4 };

      // Assign first 4 cells to sat-A, last 4 to sat-B
      const assignments: import('../conflictGraph').SatelliteCellAssignment[] = cells.map((c, i) => ({
        satId: i < 4 ? 'sat-A' : 'sat-B',
        cellId: c.id,
        elevationDeg: 60,
      }));
      const graph = buildConflictGraph(cells, assignments, testConfig.beamsPerSatellite);

      const decision = solveWMIS(graph, queues, testConfig);

      // With 2 satellites × 4 beams, can select up to 8 (more than B=4)
      expect(decision.assignments.length).toBeGreaterThan(testConfig.beamsPerSatellite);
    });

    it('should not assign conflicting vertices', () => {
      const cells = Array.from({ length: 6 }, (_, i) =>
        mockCell(i + 1, i * 50, 0)
      );
      const queues = cells.map(c => mockQueueState(c.id, 100));
      const graph = buildConflictGraph(cells, config.beamsPerSatellite);

      const decision = solveWMIS(graph, queues, config);

      // No two assignments should have the same cellId
      const cellIds = decision.assignments.map(a => a.cellId);
      expect(new Set(cellIds).size).toBe(cellIds.length);

      // No two assignments should have the same beamId
      const beamIds = decision.assignments.map(a => a.beamId);
      expect(new Set(beamIds).size).toBe(beamIds.length);
    });

    it('should prioritize cells with longer queues', () => {
      // Create 2 cells far apart, one with much longer queue
      const cells = [mockCell(1, 0, 0), mockCell(2, 200, 0)];
      const queues = [
        mockQueueState(1, 10),    // small queue
        mockQueueState(2, 1000),  // large queue
      ];
      const graph = buildConflictGraph(cells, 4);

      const decision = solveWMIS(graph, queues, config);

      // Cell 2 should be among the selected (it has higher weight)
      const selectedCellIds = decision.assignments.map(a => a.cellId);
      expect(selectedCellIds).toContain(2);
    });

    it('should return empty for all-zero queues', () => {
      const cells = [mockCell(1, 0, 0), mockCell(2, 50, 0)];
      const queues = cells.map(c => mockQueueState(c.id, 0));
      const graph = buildConflictGraph(cells, config.beamsPerSatellite);

      const decision = solveWMIS(graph, queues, config);
      expect(decision.assignments.length).toBe(0);
    });
  });
});
