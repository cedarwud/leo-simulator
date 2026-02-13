/**
 * Conflict Graph Edge Visualization
 *
 * Renders conflict edges between cells in the 3D scene.
 * Edge types:
 *   - Same beam/satellite (Rule 2): orange
 *   - Inter-beam interference (Rule 3): yellow, semi-transparent
 *   - Same cell (Rule 1): skipped (self-conflict, no line to draw)
 */

import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import type { ConflictGraph } from '../algorithms/conflictGraph';
import { parseVertexId } from '../algorithms/conflictGraph';
import type { EarthFixedCell } from './EarthFixedCells';

interface ConflictEdgesProps {
  graph: ConflictGraph;
  cells: EarthFixedCell[];
}

/** Edge visual info */
interface EdgeInfo {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  opacity: number;
}

export function ConflictEdges({ graph, cells }: ConflictEdgesProps) {
  const edges = useMemo(() => {
    const cellPos = new Map<number, { x: number; z: number }>();
    for (const c of cells) {
      cellPos.set(c.id, c.position);
    }

    const edgeSet = new Set<string>();
    const result: EdgeInfo[] = [];
    const liftY = 3; // lift edges above ground plane

    for (const vi of graph.vertices) {
      const neighbors = graph.adjacency.get(vi.id);
      if (!neighbors) continue;

      for (const vjId of neighbors) {
        // Deduplicate: only process each edge once
        const edgeKey = vi.id < vjId ? `${vi.id}|${vjId}` : `${vjId}|${vi.id}`;
        if (edgeSet.has(edgeKey)) continue;
        edgeSet.add(edgeKey);

        const vj = parseVertexId(vjId);

        // Skip same-cell conflicts (Rule 1) — no line to draw
        if (vi.cellId === vj.cellId) continue;

        const posI = cellPos.get(vi.cellId);
        const posJ = cellPos.get(vj.cellId);
        if (!posI || !posJ) continue;

        // Determine conflict type
        let color: string;
        let opacity: number;
        if (vi.satId === vj.satId && vi.beamId === vj.beamId) {
          // Rule 2: same beam of same satellite
          color = '#ff8800';
          opacity = 0.6;
        } else {
          // Rule 3: inter-beam interference
          color = '#ffdd44';
          opacity = 0.3;
        }

        result.push({
          from: [posI.x, liftY, posI.z],
          to: [posJ.x, liftY, posJ.z],
          color,
          opacity,
        });
      }
    }

    return result;
  }, [graph, cells]);

  if (edges.length === 0) return null;

  return (
    <group>
      {edges.map((edge, i) => (
        <Line
          key={i}
          points={[edge.from, edge.to]}
          color={edge.color}
          lineWidth={1.5}
          opacity={edge.opacity}
          transparent
        />
      ))}
    </group>
  );
}
