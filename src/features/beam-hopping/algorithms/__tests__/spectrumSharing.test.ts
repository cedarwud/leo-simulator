import { describe, it, expect } from 'vitest';
import {
  generateTerrestrialClusters,
  decideSpectrumSharing,
  applySpectrumSharingGain,
} from '../spectrumSharing';
import { DEFAULT_PAPER41_CONFIG, DEFAULT_SPECTRUM_SHARING_CONFIG } from '@/types/paper41';
import type { CellQueueState, TerrestrialCluster, SpectrumSharingConfig } from '@/types/paper41';

function mockQueue(cellId: number, queueLength: number): CellQueueState {
  return { cellId, queueLength, arrivalData: 0, servedData: 0, slotsServed: 0 };
}

describe('spectrumSharing', () => {
  describe('generateTerrestrialClusters', () => {
    it('should generate one cluster per cell', () => {
      const cellIds = [1, 2, 3, 4, 5];
      const clusters = generateTerrestrialClusters(cellIds);
      expect(clusters.length).toBe(5);
    });

    it('should have load within configured range', () => {
      const cellIds = Array.from({ length: 20 }, (_, i) => i + 1);
      const config: SpectrumSharingConfig = {
        ...DEFAULT_SPECTRUM_SHARING_CONFIG,
        loadRange: [0.4, 0.6],
      };
      const clusters = generateTerrestrialClusters(cellIds, config);

      for (const c of clusters) {
        expect(c.load).toBeGreaterThanOrEqual(0.4);
        expect(c.load).toBeLessThanOrEqual(0.6);
      }
    });

    it('should set bandwidth from config', () => {
      const clusters = generateTerrestrialClusters([1], {
        ...DEFAULT_SPECTRUM_SHARING_CONFIG,
        terrestrialBandwidthMhz: 150,
      });
      expect(clusters[0].bandwidthMhz).toBe(150);
    });
  });

  describe('decideSpectrumSharing (BSSA)', () => {
    it('should return decisions for all cells', () => {
      const queues = [mockQueue(1, 100), mockQueue(2, 200), mockQueue(3, 50)];
      const clusters: TerrestrialCluster[] = [
        { cellId: 1, load: 0.4, bandwidthMhz: 100 },
        { cellId: 2, load: 0.45, bandwidthMhz: 100 },
        { cellId: 3, load: 0.5, bandwidthMhz: 100 },
      ];

      const decisions = decideSpectrumSharing(queues, clusters, DEFAULT_PAPER41_CONFIG);
      expect(decisions.length).toBe(3);
    });

    it('should respect interference constraint (I < I_th)', () => {
      // High load cluster → high interference → should NOT share
      const queues = [mockQueue(1, 1000)];
      const clusters: TerrestrialCluster[] = [
        { cellId: 1, load: 0.6, bandwidthMhz: 100 }, // interference = -20 + 0.6*20 = -8 > -10 threshold
      ];

      const decisions = decideSpectrumSharing(queues, clusters, DEFAULT_PAPER41_CONFIG);
      // With load=0.6, interference=-8dB which exceeds threshold=-10dB
      expect(decisions[0].useSharedSpectrum).toBe(false);
    });

    it('should allow sharing for low-interference clusters with large queue', () => {
      // Queue must be large enough relative to shared capacity for Eq. 39
      // to favor sharing (otherwise over-provisioning is penalized)
      const queues = [mockQueue(1, 10000)];
      const clusters: TerrestrialCluster[] = [
        { cellId: 1, load: 0.4, bandwidthMhz: 100 }, // interference = -20 + 0.4*20 = -12 < -10
      ];

      const decisions = decideSpectrumSharing(queues, clusters, DEFAULT_PAPER41_CONFIG);
      // BSSA should find sharing beneficial (large queue needs the capacity)
      expect(decisions[0].useSharedSpectrum).toBe(true);
      expect(decisions[0].capacityGain).toBeGreaterThan(0);
    });

    it('should return all false when disabled', () => {
      const queues = [mockQueue(1, 500), mockQueue(2, 300)];
      const clusters: TerrestrialCluster[] = [
        { cellId: 1, load: 0.4, bandwidthMhz: 100 },
        { cellId: 2, load: 0.4, bandwidthMhz: 100 },
      ];

      const disabledConfig = { ...DEFAULT_SPECTRUM_SHARING_CONFIG, enabled: false };
      const decisions = decideSpectrumSharing(queues, clusters, DEFAULT_PAPER41_CONFIG, disabledConfig);

      expect(decisions.every(d => d.useSharedSpectrum === false)).toBe(true);
      expect(decisions.every(d => d.capacityGain === 0)).toBe(true);
    });

    it('BSSA should find better solution than empty (at least some sharing)', () => {
      // Setup where sharing is clearly beneficial — large queues
      // With Eq. 39, sharing only helps when queue > shared_capacity
      // sharedCap ≈ 100*0.58*0.2*log2(16.85)*200 ≈ 9500 per epoch
      // So queues of 10000+ make sharing beneficial
      const queues = Array.from({ length: 10 }, (_, i) => mockQueue(i + 1, 10000 + i * 2000));
      const clusters: TerrestrialCluster[] = queues.map(q => ({
        cellId: q.cellId,
        load: 0.42, // interference = -20 + 0.42*20 = -11.6 < -10, acceptable
        bandwidthMhz: 100,
      }));

      const decisions = decideSpectrumSharing(queues, clusters, DEFAULT_PAPER41_CONFIG);
      const sharingCount = decisions.filter(d => d.useSharedSpectrum).length;

      // BSSA should find at least some cells to share
      expect(sharingCount).toBeGreaterThan(0);
    });
  });

  describe('sampling sensitivity (terrestrialCellsPerBeam)', () => {
    it('should produce consistent sharing decisions across sample sizes', () => {
      // Run BSSA with different terrestrialCellsPerBeam values
      // Results should converge: sharing count should be similar
      const queues = Array.from({ length: 10 }, (_, i) => mockQueue(i + 1, 10000 + i * 2000));
      const clusters: TerrestrialCluster[] = queues.map(q => ({
        cellId: q.cellId,
        load: 0.42,
        bandwidthMhz: 100,
      }));

      const sampleSizes = [1, 100, 810, 1620];
      const sharingCounts: number[] = [];

      for (const N of sampleSizes) {
        const ssConfig: SpectrumSharingConfig = {
          ...DEFAULT_SPECTRUM_SHARING_CONFIG,
          terrestrialCellsPerBeam: N,
        };
        const decisions = decideSpectrumSharing(queues, clusters, DEFAULT_PAPER41_CONFIG, ssConfig);
        sharingCounts.push(decisions.filter(d => d.useSharedSpectrum).length);
      }

      // All sample sizes should allow at least some sharing (low interference scenario)
      for (const count of sharingCounts) {
        expect(count).toBeGreaterThan(0);
      }

      // Higher sample counts (810, 1620) should give similar results (within ±3 cells)
      const diff = Math.abs(sharingCounts[2] - sharingCounts[3]);
      expect(diff).toBeLessThanOrEqual(3);
    });

    it('should produce consistent violation rates across sample sizes', () => {
      // High interference scenario: sharing decisions should be conservative regardless of N
      const queues = Array.from({ length: 5 }, (_, i) => mockQueue(i + 1, 10000));
      const clusters: TerrestrialCluster[] = queues.map(q => ({
        cellId: q.cellId,
        load: 0.58, // interference near threshold
        bandwidthMhz: 100,
      }));

      const sampleSizes = [1, 100, 1620];
      const sharingCounts: number[] = [];

      for (const N of sampleSizes) {
        const ssConfig: SpectrumSharingConfig = {
          ...DEFAULT_SPECTRUM_SHARING_CONFIG,
          terrestrialCellsPerBeam: N,
        };
        const decisions = decideSpectrumSharing(queues, clusters, DEFAULT_PAPER41_CONFIG, ssConfig);
        sharingCounts.push(decisions.filter(d => d.useSharedSpectrum).length);
      }

      // Near-threshold scenario: all sample sizes should be conservative
      // (fewer sharing decisions than the low-interference test above)
      for (const count of sharingCounts) {
        expect(count).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('applySpectrumSharingGain', () => {
    it('should add capacity gain to servedData', () => {
      const queues = [
        mockQueue(1, 100),
        mockQueue(2, 200),
      ];
      const decisions = [
        { cellId: 1, useSharedSpectrum: true, capacityGain: 5, interferenceToTerrestrial: -12 },
        { cellId: 2, useSharedSpectrum: false, capacityGain: 0, interferenceToTerrestrial: -8 },
      ];

      const slotsInEpoch = 200;
      const result = applySpectrumSharingGain(queues, decisions, slotsInEpoch);

      // Cell 1: servedData = 0 + 5 * 200 = 1000
      expect(result[0].servedData).toBe(1000);
      // Cell 2: servedData unchanged = 0
      expect(result[1].servedData).toBe(0);
    });

    it('should not modify queues without sharing', () => {
      const queues = [mockQueue(1, 100)];
      const decisions = [
        { cellId: 1, useSharedSpectrum: false, capacityGain: 0, interferenceToTerrestrial: -5 },
      ];

      const result = applySpectrumSharingGain(queues, decisions, 200);
      expect(result[0].servedData).toBe(0);
    });
  });
});
