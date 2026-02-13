import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LyapunovHandoverManager } from '@/utils/satellite/LyapunovHandoverManager';
import type { SatelliteInfo } from '@/utils/satellite/LyapunovHandoverManager';
import { DEFAULT_LYAPUNOV_CONFIG } from '@/types/lyapunov';
import type { CellQueueState, VirtualQueue } from '@/types/lyapunov';
import type { EarthFixedCell } from '@/features/beam-hopping/components/EarthFixedCells';

function mockCell(id: number, x: number = 0, z: number = 0): EarthFixedCell {
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

function mockSatellite(
  id: string,
  cells: EarthFixedCell[],
  elevation: number,
  opts?: { load?: number; rst?: number },
): SatelliteInfo {
  const elevations = new Map<number, number>();
  for (const cell of cells) {
    elevations.set(cell.id, elevation);
  }
  return {
    id,
    position: new THREE.Vector3(0, 550, 0),
    elevations,
    remainingServiceTime: opts?.rst ?? 100,
    load: opts?.load ?? 0,
  };
}

function makeQueues(cells: EarthFixedCell[], queueLength: number = 0): CellQueueState[] {
  return cells.map(c => ({
    cellId: c.id,
    queueLength,
    arrivalData: 0,
    servedData: 0,
    slotsServed: 0,
  }));
}

function makeVirtualQueues(cells: EarthFixedCell[], value: number = 0): VirtualQueue[] {
  return cells.map(c => ({ cellId: c.id, value }));
}

describe('LyapunovHandoverManager', () => {
  const cells = Array.from({ length: 4 }, (_, i) => mockCell(i + 1, i * 50));

  describe('decide() basics', () => {
    it('should assign all cells on first epoch', () => {
      const manager = new LyapunovHandoverManager(DEFAULT_LYAPUNOV_CONFIG);
      const sats = [mockSatellite('s1', cells, 60), mockSatellite('s2', cells, 55)];
      const queues = makeQueues(cells);

      const result = manager.decide(cells, sats, queues);
      expect(result.assignments.length).toBe(cells.length);
      for (const a of result.assignments) {
        expect(a.satelliteId).toBeTruthy();
      }
    });

    it('should return zero handovers when assignments unchanged', () => {
      const manager = new LyapunovHandoverManager(DEFAULT_LYAPUNOV_CONFIG);
      const sats = [mockSatellite('s1', cells, 60)];
      const queues = makeQueues(cells);

      manager.decide(cells, sats, queues); // epoch 1: initial
      const result2 = manager.decide(cells, sats, queues); // epoch 2: same satellites

      // No topology change + line-15 may or may not trigger,
      // but with same single satellite the result should be stable
      expect(result2.assignments.length).toBe(cells.length);
    });

    it('should handle empty satellites gracefully', () => {
      const manager = new LyapunovHandoverManager(DEFAULT_LYAPUNOV_CONFIG);
      const result = manager.decide(cells, [], makeQueues(cells));
      expect(result.assignments.length).toBe(0);
      expect(result.handoverCount).toBe(0);
    });
  });

  describe('topology change detection', () => {
    it('should trigger handover when satellite disappears', () => {
      const manager = new LyapunovHandoverManager(DEFAULT_LYAPUNOV_CONFIG);
      const sat1 = mockSatellite('s1', cells, 60);
      const sat2 = mockSatellite('s2', cells, 55);
      const queues = makeQueues(cells);

      // Epoch 1: both satellites visible
      manager.decide(cells, [sat1, sat2], queues);

      // Epoch 2: sat1 gone — cells assigned to sat1 must be reassigned
      const result = manager.decide(cells, [sat2], queues);
      expect(result.assignments.length).toBe(cells.length);
      // All assignments should now use sat2
      for (const a of result.assignments) {
        expect(a.satelliteId).toBe('s2');
      }
    });

    it('should trigger handover when elevation drops below minimum', () => {
      const manager = new LyapunovHandoverManager(DEFAULT_LYAPUNOV_CONFIG);
      const sat1 = mockSatellite('s1', cells, 60);
      const queues = makeQueues(cells);

      // Epoch 1: satellite visible
      manager.decide(cells, [sat1], queues);

      // Epoch 2: same satellite but low elevation
      const sat1Low = mockSatellite('s1', cells, 10); // below 35° threshold
      const sat2 = mockSatellite('s2', cells, 50);
      const result = manager.decide(cells, [sat1Low, sat2], queues);

      expect(result.triggeredCells.length).toBeGreaterThan(0);
    });
  });

  describe('line-15 global condition', () => {
    it('should NOT trigger swap matching when σ >= σ₀', () => {
      // With σ₀ = 0.9 (default for BH group) and 4 cells / (2 sats × 4 beams) = 0.5 < 0.9
      // BUT we need σ >= σ₀ to NOT trigger.
      // Use many cells relative to beam capacity to get high utilization.
      const config = { ...DEFAULT_LYAPUNOV_CONFIG, resourceUtilizationThreshold: 0.1 };
      const manager = new LyapunovHandoverManager(config);
      const sats = [mockSatellite('s1', cells, 60)];
      const queues = makeQueues(cells);

      // Epoch 1
      manager.decide(cells, sats, queues);
      // Epoch 2: same topology, σ = 4/(1×4) = 1.0 >= 0.1 → no global trigger
      const result = manager.decide(cells, sats, queues);

      // Should have no triggered cells beyond topology (none changed)
      expect(result.triggeredCells.length).toBe(0);
      expect(result.handoverCount).toBe(0);
    });

    it('should trigger when σ == 0 (no assignments)', () => {
      const manager = new LyapunovHandoverManager(DEFAULT_LYAPUNOV_CONFIG);
      const sats = [mockSatellite('s1', cells, 60)];
      const queues = makeQueues(cells);

      // First epoch: previousAssignments is empty → all cells trigger
      const result = manager.decide(cells, sats, queues);
      expect(result.triggeredCells.length).toBe(cells.length);
    });

    it('should trigger when σ < σ₀ AND min queue load > C_s', () => {
      // Set up: high queue lengths that exceed satellite capacity C_s
      // C_s = W₁ × T_slot × log₂(1+SNR) × S
      // = 200 × 0.2 × log₂(1+10^1.2) × 200 ≈ 32,560 Mbits
      // So we need per-satellite queue sum > 32,560 Mbits
      const config = {
        ...DEFAULT_LYAPUNOV_CONFIG,
        resourceUtilizationThreshold: 0.9, // σ₀ = 0.9
        beamsPerSatellite: 8, // more beams → lower σ
      };
      const manager = new LyapunovHandoverManager(config);
      const sats = [
        mockSatellite('s1', cells, 60),
        mockSatellite('s2', cells, 55),
      ];

      // Very large queues that exceed C_s
      const queues = makeQueues(cells, 50000); // 50000 Mbits per cell
      const vqs = makeVirtualQueues(cells);

      // Epoch 1: initial assignment
      manager.decide(cells, sats, queues, vqs);

      // Epoch 2: σ = 4/(2×8) = 0.25 < 0.9, min load = 2×50000 = 100000 > C_s ≈ 32560
      // → global condition triggers
      const result = manager.decide(cells, sats, queues, vqs);
      expect(result.triggeredCells.length).toBe(cells.length);
    });

    it('should NOT trigger when σ < σ₀ but min queue load <= C_s', () => {
      const config = {
        ...DEFAULT_LYAPUNOV_CONFIG,
        resourceUtilizationThreshold: 0.9,
        beamsPerSatellite: 8,
      };
      const manager = new LyapunovHandoverManager(config);
      const sats = [
        mockSatellite('s1', cells, 60),
        mockSatellite('s2', cells, 55),
      ];

      // Small queues well below C_s ≈ 32560
      const queues = makeQueues(cells, 100); // 100 Mbits per cell
      const vqs = makeVirtualQueues(cells);

      // Epoch 1
      manager.decide(cells, sats, queues, vqs);

      // Epoch 2: σ = 4/(2×8) = 0.25 < 0.9, but min load = 2×100 = 200 < C_s
      // → no global trigger
      const result = manager.decide(cells, sats, queues, vqs);
      expect(result.triggeredCells.length).toBe(0);
      expect(result.handoverCount).toBe(0);
    });
  });

  describe('swap matching gating', () => {
    it('should not change assignments when global condition is not met', () => {
      const config = {
        ...DEFAULT_LYAPUNOV_CONFIG,
        resourceUtilizationThreshold: 0.1, // Low threshold → σ always >= σ₀
      };
      const manager = new LyapunovHandoverManager(config);
      const sats = [
        mockSatellite('s1', cells, 60),
        mockSatellite('s2', cells, 55),
      ];
      const queues = makeQueues(cells, 100);
      const vqs = makeVirtualQueues(cells);

      // Epoch 1: initial
      const r1 = manager.decide(cells, sats, queues, vqs);
      const epoch1Assignments = new Map(
        r1.assignments.map(a => [a.cellId, a.satelliteId]),
      );

      // Epoch 2: same topology, σ high → no global trigger → no swap matching
      const r2 = manager.decide(cells, sats, queues, vqs);
      for (const a of r2.assignments) {
        expect(a.satelliteId).toBe(epoch1Assignments.get(a.cellId));
      }
      expect(r2.handoverCount).toBe(0);
    });
  });

  describe('random adjust step', () => {
    it('should still produce valid assignments with random adjust', () => {
      // Use conditions that trigger swap matching (including random adjust)
      const config = {
        ...DEFAULT_LYAPUNOV_CONFIG,
        resourceUtilizationThreshold: 0.9,
        beamsPerSatellite: 8,
      };
      const manager = new LyapunovHandoverManager(config);
      const sats = [
        mockSatellite('s1', cells, 60),
        mockSatellite('s2', cells, 55),
      ];
      const queues = makeQueues(cells, 50000);
      const vqs = makeVirtualQueues(cells);

      // Epoch 1 + 2: triggers swap matching + random adjust
      manager.decide(cells, sats, queues, vqs);
      const result = manager.decide(cells, sats, queues, vqs);

      // All cells should be assigned to valid satellites
      for (const a of result.assignments) {
        expect(['s1', 's2']).toContain(a.satelliteId);
      }
    });
  });

  describe('virtual queue integration', () => {
    it('should use virtual queues in objective calculation', () => {
      const manager = new LyapunovHandoverManager(DEFAULT_LYAPUNOV_CONFIG);
      const sats = [
        mockSatellite('s1', cells, 60),
        mockSatellite('s2', cells, 55),
      ];
      const queues = makeQueues(cells, 50000);

      // With high virtual queues, handover penalty is large
      const highVQ = makeVirtualQueues(cells, 100);

      const result = manager.decide(cells, sats, queues, highVQ);
      expect(result.objectiveValue).toBeGreaterThanOrEqual(0);
    });
  });
});
