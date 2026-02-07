import { describe, it, expect } from 'vitest';
import {
  buildConflictGraph,
  hasConflict,
  vertexId,
  parseVertexId,
} from '../conflictGraph';
import type { ConflictVertex, SatelliteCellAssignment, ConflictPhysicalConfig } from '../conflictGraph';
import type { EarthFixedCell } from '@/features/beam-hopping/components/EarthFixedCells';
import { DEFAULT_PHYSICAL_LAYER_CONFIG } from '../channelModel';

/** Helper to create a mock cell */
function mockCell(id: number, x: number, z: number, radius = 20): EarthFixedCell {
  return {
    id,
    position: { x, z },
    radius,
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

/** Helper to create a vertex for testing */
function makeVertex(satId: string, cellId: number, beamId: number, pol: 'A' | 'B'): ConflictVertex {
  return {
    id: vertexId(satId, cellId, beamId),
    satId,
    cellId,
    beamId,
    polarization: pol,
    weight: 0,
  };
}

/** Helper: build neighborMap from cells */
function buildNeighborMap(cells: EarthFixedCell[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const c of cells) {
    const neighbors: number[] = [];
    for (const other of cells) {
      if (other.id === c.id) continue;
      const dx = other.position.x - c.position.x;
      const dz = other.position.z - c.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < c.radius * Math.sqrt(3) * 1.1) {
        neighbors.push(other.id);
      }
    }
    map.set(c.id, neighbors);
  }
  return map;
}

/** Helper: build cell positions map */
function buildCellPositions(cells: EarthFixedCell[]): Map<number, { x: number; z: number }> {
  const map = new Map<number, { x: number; z: number }>();
  for (const c of cells) map.set(c.id, c.position);
  return map;
}

describe('conflictGraph v2', () => {
  describe('vertexId / parseVertexId', () => {
    it('should encode and decode vertex id with satellite', () => {
      const vid = vertexId('sat1', 5, 3);
      expect(vid).toBe('satsat1_cell5_beam3');
      const parsed = parseVertexId(vid);
      expect(parsed.satId).toBe('sat1');
      expect(parsed.cellId).toBe(5);
      expect(parsed.beamId).toBe(3);
    });

    it('should throw for invalid vertex ID', () => {
      expect(() => parseVertexId('invalid')).toThrow();
    });
  });

  describe('hasConflict', () => {
    const emptyAssignments = new Map<number, SatelliteCellAssignment>();
    const emptyPositions = new Map<number, { x: number; z: number }>();

    it('Rule 1: same cell → conflict', () => {
      const v1 = makeVertex('s1', 1, 1, 'A');
      const v2 = makeVertex('s1', 1, 2, 'B');
      expect(hasConflict(v1, v2, emptyAssignments, new Map(), emptyPositions)).toBe(true);
    });

    it('Rule 2: same beam of same satellite → conflict', () => {
      const v1 = makeVertex('s1', 1, 3, 'A');
      const v2 = makeVertex('s1', 2, 3, 'A');
      expect(hasConflict(v1, v2, emptyAssignments, new Map(), emptyPositions)).toBe(true);
    });

    it('Rule 2 fix: same beam of DIFFERENT satellites → NO conflict', () => {
      const v1 = makeVertex('s1', 1, 3, 'A');
      const v2 = makeVertex('s2', 2, 3, 'A');
      // No adjacency means Rule 3 fails too (different cells, not neighbors)
      const cells = [mockCell(1, 0, 0), mockCell(2, 200, 0)];
      const neighborMap = buildNeighborMap(cells);
      expect(hasConflict(v1, v2, emptyAssignments, neighborMap, emptyPositions)).toBe(false);
    });

    it('Rule 3: same polarization + adjacent cells → conflict (adjacency fallback)', () => {
      const cells = [
        mockCell(1, 0, 0, 20),
        mockCell(2, 34, 0, 20), // ~34 units apart < sqrt(3)*20*1.1 ≈ 38.1
      ];
      const neighborMap = buildNeighborMap(cells);
      const v1 = makeVertex('s1', 1, 1, 'A');
      const v2 = makeVertex('s1', 2, 3, 'A'); // different beam, same polarization
      // No physConfig → adjacency fallback
      expect(hasConflict(v1, v2, emptyAssignments, neighborMap, emptyPositions)).toBe(true);
    });

    it('No conflict: different cell, different beam, different polarization', () => {
      const cells = [
        mockCell(1, 0, 0, 20),
        mockCell(2, 100, 0, 20),
      ];
      const neighborMap = buildNeighborMap(cells);
      const v1 = makeVertex('s1', 1, 1, 'A');
      const v2 = makeVertex('s1', 2, 2, 'B');
      expect(hasConflict(v1, v2, emptyAssignments, neighborMap, emptyPositions)).toBe(false);
    });

    it('No conflict: same polarization but non-adjacent cells', () => {
      const cells = [
        mockCell(1, 0, 0, 20),
        mockCell(2, 200, 0, 20),
      ];
      const neighborMap = buildNeighborMap(cells);
      const v1 = makeVertex('s1', 1, 1, 'A');
      const v2 = makeVertex('s1', 2, 3, 'A');
      expect(hasConflict(v1, v2, emptyAssignments, neighborMap, emptyPositions)).toBe(false);
    });
  });

  describe('buildConflictGraph v1 fallback', () => {
    it('should create vertices for all cell-beam combinations', () => {
      const cells = [mockCell(1, 0, 0), mockCell(2, 50, 0)];
      const graph = buildConflictGraph(cells, 4);

      // 2 cells × 4 beams = 8 vertices
      expect(graph.vertices.length).toBe(8);
    });

    it('vertices should have satId "default"', () => {
      const cells = [mockCell(1, 0, 0)];
      const graph = buildConflictGraph(cells, 2);

      for (const v of graph.vertices) {
        expect(v.satId).toBe('default');
      }
    });

    it('should have adjacency entries for same-cell conflicts', () => {
      const cells = [mockCell(1, 0, 0)];
      const graph = buildConflictGraph(cells, 4);

      // All 4 beams conflict with each other for same cell
      // With v1 fallback (single satellite), same-beam = conflict too
      // But same-cell already covers it: each vertex has 3 same-cell neighbors
      for (const v of graph.vertices) {
        const neighbors = graph.adjacency.get(v.id);
        expect(neighbors).toBeDefined();
        expect(neighbors!.size).toBeGreaterThanOrEqual(3);
      }
    });

    it('should build correct adjacency lists', () => {
      const cells = [mockCell(1, 0, 0), mockCell(2, 200, 0)];
      const graph = buildConflictGraph(cells, 2);

      for (const v of graph.vertices) {
        expect(graph.adjacency.has(v.id)).toBe(true);
      }
    });
  });

  describe('buildConflictGraph v2 with assignments', () => {
    it('should create vertices with correct satIds', () => {
      const cells = [mockCell(1, 0, 0), mockCell(2, 50, 0)];
      const assignments: SatelliteCellAssignment[] = [
        { satId: 'sat-A', cellId: 1, elevationDeg: 60 },
        { satId: 'sat-B', cellId: 2, elevationDeg: 45 },
      ];
      const graph = buildConflictGraph(cells, assignments, 4);

      expect(graph.vertices.length).toBe(8);

      const cell1Verts = graph.vertices.filter(v => v.cellId === 1);
      const cell2Verts = graph.vertices.filter(v => v.cellId === 2);
      expect(cell1Verts.every(v => v.satId === 'sat-A')).toBe(true);
      expect(cell2Verts.every(v => v.satId === 'sat-B')).toBe(true);
    });

    it('same beam of different satellites should NOT conflict', () => {
      const cells = [mockCell(1, 0, 0), mockCell(2, 200, 0)]; // far apart
      const assignments: SatelliteCellAssignment[] = [
        { satId: 'sat-A', cellId: 1, elevationDeg: 60 },
        { satId: 'sat-B', cellId: 2, elevationDeg: 45 },
      ];
      const graph = buildConflictGraph(cells, assignments, 4);

      // beam 1 of sat-A (cell 1) vs beam 1 of sat-B (cell 2)
      const v1 = graph.vertices.find(v => v.satId === 'sat-A' && v.cellId === 1 && v.beamId === 1)!;
      const v2 = graph.vertices.find(v => v.satId === 'sat-B' && v.cellId === 2 && v.beamId === 1)!;
      expect(v1).toBeDefined();
      expect(v2).toBeDefined();

      // They should NOT conflict (different satellites, far apart cells)
      const adj = graph.adjacency.get(v1.id)!;
      expect(adj.has(v2.id)).toBe(false);
    });

    it('same beam of same satellite should conflict', () => {
      const cells = [mockCell(1, 0, 0), mockCell(2, 200, 0)];
      const assignments: SatelliteCellAssignment[] = [
        { satId: 'sat-A', cellId: 1, elevationDeg: 60 },
        { satId: 'sat-A', cellId: 2, elevationDeg: 45 }, // same satellite for both
      ];
      const graph = buildConflictGraph(cells, assignments, 4);

      const v1 = graph.vertices.find(v => v.cellId === 1 && v.beamId === 1)!;
      const v2 = graph.vertices.find(v => v.cellId === 2 && v.beamId === 1)!;

      // Same beam, same satellite → conflict
      const adj = graph.adjacency.get(v1.id)!;
      expect(adj.has(v2.id)).toBe(true);
    });

    it('with physConfig: adjacent cells with same polarization should conflict', () => {
      // Two cells close together
      const cells = [mockCell(1, 0, 0, 20), mockCell(2, 34, 0, 20)];
      const assignments: SatelliteCellAssignment[] = [
        { satId: 'sat-A', cellId: 1, elevationDeg: 60 },
        { satId: 'sat-B', cellId: 2, elevationDeg: 55 },
      ];
      const physConfig: ConflictPhysicalConfig = {
        physical: DEFAULT_PHYSICAL_LAYER_CONFIG,
        numVisibleSats: 3,
        targetSnrDb: 12,
        sceneToKmScale: 34.6 / 34, // Map 34 scene units to 34.6 km
      };
      const graph = buildConflictGraph(cells, assignments, 4, physConfig);

      // Beam 1 (pol A) of cell 1 vs Beam 3 (pol A) of cell 2
      const v1 = graph.vertices.find(v => v.cellId === 1 && v.beamId === 1)!;
      const v2 = graph.vertices.find(v => v.cellId === 2 && v.beamId === 3)!;
      expect(v1.polarization).toBe('A');
      expect(v2.polarization).toBe('A');

      // Close cells should have inter-beam interference → conflict
      const adj = graph.adjacency.get(v1.id)!;
      expect(adj.has(v2.id)).toBe(true);
    });

    it('with physConfig: same-polarization beams always conflict (Ka-band sidelobe floor)', () => {
      // With Ka-band parameters (38 dBi peak, 1.5° beamwidth, 25 dB SLL),
      // the sidelobe gain floor (13 dBi Tx + 10 dBi Rx = 23 dBi) always
      // exceeds G_th (~-28 dB). This is physically correct — the paper uses
      // dual-polarization specifically to manage this.
      const cells = [mockCell(1, 0, 0, 20), mockCell(2, 200, 0, 20)];
      const assignments: SatelliteCellAssignment[] = [
        { satId: 'sat-A', cellId: 1, elevationDeg: 60 },
        { satId: 'sat-B', cellId: 2, elevationDeg: 55 },
      ];
      const physConfig: ConflictPhysicalConfig = {
        physical: DEFAULT_PHYSICAL_LAYER_CONFIG,
        numVisibleSats: 3,
        targetSnrDb: 12,
        sceneToKmScale: 34.6 / 34,
      };
      const graph = buildConflictGraph(cells, assignments, 4, physConfig);

      // Beam 1 (pol A) of cell 1 vs Beam 3 (pol A) of cell 2
      const v1 = graph.vertices.find(v => v.cellId === 1 && v.beamId === 1)!;
      const v2 = graph.vertices.find(v => v.cellId === 2 && v.beamId === 3)!;

      // Same polarization → always conflict with physConfig (Ka-band model)
      const adj = graph.adjacency.get(v1.id)!;
      expect(adj.has(v2.id)).toBe(true);
    });

    it('without physConfig: far apart cells with same polarization should NOT conflict', () => {
      // Adjacency-based fallback only creates edges for neighboring cells
      const cells = [mockCell(1, 0, 0, 20), mockCell(2, 200, 0, 20)];
      const assignments: SatelliteCellAssignment[] = [
        { satId: 'sat-A', cellId: 1, elevationDeg: 60 },
        { satId: 'sat-B', cellId: 2, elevationDeg: 55 },
      ];
      // No physConfig → adjacency-based fallback
      const graph = buildConflictGraph(cells, assignments, 4);

      const v1 = graph.vertices.find(v => v.cellId === 1 && v.beamId === 1)!;
      const v2 = graph.vertices.find(v => v.cellId === 2 && v.beamId === 3)!;

      const adj = graph.adjacency.get(v1.id)!;
      expect(adj.has(v2.id)).toBe(false);
    });

    it('different polarization beams should never conflict from interference', () => {
      const cells = [mockCell(1, 0, 0, 20), mockCell(2, 34, 0, 20)]; // adjacent
      const assignments: SatelliteCellAssignment[] = [
        { satId: 'sat-A', cellId: 1, elevationDeg: 60 },
        { satId: 'sat-A', cellId: 2, elevationDeg: 55 },
      ];
      const graph = buildConflictGraph(cells, assignments, 4);

      // Beam 1 (pol A) of cell 1 vs Beam 2 (pol B) of cell 2
      const v1 = graph.vertices.find(v => v.cellId === 1 && v.beamId === 1)!;
      const v2 = graph.vertices.find(v => v.cellId === 2 && v.beamId === 2)!;
      expect(v1.polarization).toBe('A');
      expect(v2.polarization).toBe('B');

      // Different polarization, different cell, beam 1 of sat-A vs beam 2 of sat-A (different beams)
      // So no conflict at all
      const adj = graph.adjacency.get(v1.id)!;
      expect(adj.has(v2.id)).toBe(false);
    });
  });

  describe('vertex ID format', () => {
    it('v2 vertices use sat{satId}_cell{cellId}_beam{beamId} format', () => {
      const cells = [mockCell(1, 0, 0)];
      const assignments: SatelliteCellAssignment[] = [
        { satId: 'leo-42', cellId: 1, elevationDeg: 60 },
      ];
      const graph = buildConflictGraph(cells, assignments, 2);

      expect(graph.vertices[0].id).toBe('satleo-42_cell1_beam1');
      expect(graph.vertices[1].id).toBe('satleo-42_cell1_beam2');
    });

    it('parseVertexId correctly extracts satellite ID with special chars', () => {
      const parsed = parseVertexId('satleo-42_cell5_beam3');
      expect(parsed.satId).toBe('leo-42');
      expect(parsed.cellId).toBe(5);
      expect(parsed.beamId).toBe(3);
    });
  });
});
