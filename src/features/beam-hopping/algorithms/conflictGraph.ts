/**
 * Conflict Graph v2 — Section IV-C
 *
 * Each epoch builds conflict graph G = (V, E) for WMIS beam hopping scheduling.
 *
 * v2 changes from v1:
 *   - Vertex is now (satellite, cell, beam) triple (was (cell, beam))
 *   - Vertex ID: "sat{satId}_cell{cellId}_beam{beamId}"
 *   - Same-beam conflict is per-satellite (not global)
 *   - Interference check uses off-axis angle model (Eq. 8) instead of adjacency-only
 *
 * Conflict conditions (Section IV-C):
 *   1. Same cell — one cell served by at most one beam per slot (Eq. 10)
 *   2. Same beam of same satellite — one beam serves at most one cell per slot (Eq. 12)
 *   3. Inter-beam interference — off-axis angle threshold (Eq. 8, 14)
 */

import { EarthFixedCell, getBeamPolarization, getNeighborCellIds } from '../components/EarthFixedCells';
import {
  computeSlantDistance,
  computeOffAxisAngle,
  computeAntennaGain,
  computeInterferenceThreshold,
  computeChannelGain,
  type PhysicalLayerConfig,
  DEFAULT_PHYSICAL_LAYER_CONFIG,
} from './channelModel';

// ─── Types ─────────────────────────────────────────────────────────────────

/** Conflict Graph vertex — (satellite, cell, beam) triple */
export interface ConflictVertex {
  /** Vertex unique ID: "sat{satId}_cell{cellId}_beam{beamId}" */
  id: string;
  /** Serving satellite ID */
  satId: string;
  /** Cell ID */
  cellId: number;
  /** Beam ID (1-based) */
  beamId: number;
  /** Polarization ('A' | 'B'), determined by beamId */
  polarization: 'A' | 'B';
  /** Vertex weight (set by WMIS) */
  weight: number;
}

/** Conflict Graph */
export interface ConflictGraph {
  /** All vertices */
  vertices: ConflictVertex[];
  /** Adjacency list: vertexId → set of conflicting vertexIds */
  adjacency: Map<string, Set<string>>;
}

/** Satellite-cell assignment from Algorithm 1 (handover) */
export interface SatelliteCellAssignment {
  /** Satellite ID */
  satId: string;
  /** Assigned cell ID */
  cellId: number;
  /** Elevation angle from cell to satellite (degrees) */
  elevationDeg: number;
  /** Slant distance (km) — computed from elevation if not provided */
  slantDistanceKm?: number;
  /** Satellite ECEF position (km) — for accurate inter-satellite distance computation */
  satPosition?: { x: number; y: number; z: number };
}

/** Physical layer config for interference-based conflict detection */
export interface ConflictPhysicalConfig {
  /** Physical layer config */
  physical: PhysicalLayerConfig;
  /** Number of visible satellites per cell (for Eq. 8 threshold) */
  numVisibleSats?: number;
  /** Target SNR for all cells (dB), default 12 */
  targetSnrDb?: number;
  /** Inter-cell distance scale: scene units to km */
  sceneToKmScale?: number;
}

// ─── Vertex ID ─────────────────────────────────────────────────────────────

/**
 * Generate vertex ID (v2 format with satellite)
 */
export function vertexId(satId: string, cellId: number, beamId: number): string {
  return `sat${satId}_cell${cellId}_beam${beamId}`;
}

/**
 * Parse vertex ID into components
 */
export function parseVertexId(id: string): { satId: string; cellId: number; beamId: number } {
  const match = id.match(/^sat(.+)_cell(\d+)_beam(\d+)$/);
  if (!match) throw new Error(`Invalid vertex ID: ${id}`);
  return {
    satId: match[1],
    cellId: parseInt(match[2], 10),
    beamId: parseInt(match[3], 10),
  };
}

// ─── Build Conflict Graph ──────────────────────────────────────────────────

/**
 * Build conflict graph with satellite-cell assignments (v2)
 *
 * Each cell has an assigned satellite from Algorithm 1. Vertices are created
 * for each (satellite, cell, beam) triple. Conflict edges follow three rules:
 *   1. Same cell → conflict (Eq. 10)
 *   2. Same beam of same satellite → conflict (Eq. 12)
 *   3. Inter-beam interference based on off-axis angle (Eq. 8, 14)
 *
 * @param cells Earth-fixed cells
 * @param assignments Satellite-cell assignments from Algorithm 1
 * @param beamsPerSatellite Number of beams per satellite (default 4)
 * @param physConfig Physical layer config for interference checks (optional)
 */
export function buildConflictGraph(
  cells: EarthFixedCell[],
  assignments: SatelliteCellAssignment[],
  beamsPerSatellite: number,
  physConfig?: ConflictPhysicalConfig,
): ConflictGraph;

/**
 * Build conflict graph without satellite assignments (v1 fallback)
 *
 * All cells are assigned to a synthetic "default" satellite.
 * Uses adjacency-based interference (same as v1 behavior).
 *
 * @param cells Earth-fixed cells
 * @param beamsPerSatellite Number of beams per satellite (default 4)
 */
export function buildConflictGraph(
  cells: EarthFixedCell[],
  beamsPerSatellite: number,
): ConflictGraph;

// Implementation
export function buildConflictGraph(
  cells: EarthFixedCell[],
  assignmentsOrBeams: SatelliteCellAssignment[] | number,
  beamsPerSatelliteOrConfig?: number | ConflictPhysicalConfig,
  physConfig?: ConflictPhysicalConfig,
): ConflictGraph {
  // Detect which overload was called
  if (typeof assignmentsOrBeams === 'number') {
    // v1 fallback: buildConflictGraph(cells, beamsPerSatellite)
    const beamsPerSatellite = assignmentsOrBeams;
    const defaultAssignments: SatelliteCellAssignment[] = cells.map(c => ({
      satId: 'default',
      cellId: c.id,
      elevationDeg: 90,
    }));
    return buildConflictGraphImpl(cells, defaultAssignments, beamsPerSatellite, undefined);
  }

  // v2: buildConflictGraph(cells, assignments, beamsPerSatellite, physConfig?)
  const assignments = assignmentsOrBeams;
  const beamsPerSatellite = (beamsPerSatelliteOrConfig as number) ?? 4;
  return buildConflictGraphImpl(cells, assignments, beamsPerSatellite, physConfig);
}

function buildConflictGraphImpl(
  cells: EarthFixedCell[],
  assignments: SatelliteCellAssignment[],
  beamsPerSatellite: number,
  physConfig?: ConflictPhysicalConfig,
): ConflictGraph {
  const vertices: ConflictVertex[] = [];
  const adjacency = new Map<string, Set<string>>();

  // Build cell position lookup
  const cellPositions = new Map<number, { x: number; z: number }>();
  for (const cell of cells) {
    cellPositions.set(cell.id, cell.position);
  }

  // Build assignment lookup: cellId → SatelliteCellAssignment
  const assignmentMap = new Map<number, SatelliteCellAssignment>();
  for (const a of assignments) {
    assignmentMap.set(a.cellId, a);
  }

  // Precompute neighbor map for fallback adjacency check
  const neighborMap = new Map<number, number[]>();
  for (const cell of cells) {
    neighborMap.set(cell.id, getNeighborCellIds(cell.id, cells));
  }

  // Create vertices: one per (satellite, cell, beam)
  // Each assigned cell gets B vertices for its serving satellite
  for (const assignment of assignments) {
    const cell = cells.find(c => c.id === assignment.cellId);
    if (!cell) continue;

    for (let beamId = 1; beamId <= beamsPerSatellite; beamId++) {
      const id = vertexId(assignment.satId, assignment.cellId, beamId);
      vertices.push({
        id,
        satId: assignment.satId,
        cellId: assignment.cellId,
        beamId,
        polarization: getBeamPolarization(beamId),
        weight: 0,
      });
      adjacency.set(id, new Set());
    }
  }

  // Build edges: check all vertex pairs
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      const vi = vertices[i];
      const vj = vertices[j];

      if (hasConflict(vi, vj, assignmentMap, neighborMap, cellPositions, physConfig, beamsPerSatellite)) {
        adjacency.get(vi.id)!.add(vj.id);
        adjacency.get(vj.id)!.add(vi.id);
      }
    }
  }

  return { vertices, adjacency };
}

// ─── Conflict Detection ────────────────────────────────────────────────────

/**
 * Check if two vertices conflict (cannot both be active in same slot)
 */
export function hasConflict(
  vi: ConflictVertex,
  vj: ConflictVertex,
  assignmentMap: Map<number, SatelliteCellAssignment>,
  neighborMap: Map<number, number[]>,
  cellPositions: Map<number, { x: number; z: number }>,
  physConfig?: ConflictPhysicalConfig,
  beamsPerSatellite?: number,
): boolean {
  // Rule 1: Same cell — one cell gets at most one beam per slot (Eq. 10)
  if (vi.cellId === vj.cellId) {
    return true;
  }

  // Rule 2: Same beam of SAME satellite — one beam serves at most one cell (Eq. 12)
  // v2 fix: beams are per-satellite, NOT global
  if (vi.satId === vj.satId && vi.beamId === vj.beamId) {
    return true;
  }

  // Rule 3: Inter-beam interference (Eq. 14)
  // Only same-polarization beams can interfere
  if (vi.polarization === vj.polarization) {
    return checkInterBeamInterference(
      vi, vj, assignmentMap, neighborMap, cellPositions, physConfig, beamsPerSatellite,
    );
  }

  return false;
}

/**
 * Check inter-beam interference between two same-polarization vertices (Eq. 8, 14)
 *
 * If physical config is available, uses off-axis angle model.
 * Otherwise falls back to adjacency-based check (v1 behavior).
 */
function checkInterBeamInterference(
  vi: ConflictVertex,
  vj: ConflictVertex,
  assignmentMap: Map<number, SatelliteCellAssignment>,
  neighborMap: Map<number, number[]>,
  cellPositions: Map<number, { x: number; z: number }>,
  physConfig?: ConflictPhysicalConfig,
  beamsPerSatellite?: number,
): boolean {
  const ai = assignmentMap.get(vi.cellId);
  const aj = assignmentMap.get(vj.cellId);

  // If no physical config or assignment info, fall back to adjacency check
  if (!physConfig || !ai || !aj) {
    const neighbors = neighborMap.get(vi.cellId) ?? [];
    return neighbors.includes(vj.cellId);
  }

  const cfg = physConfig.physical;
  const numSats = physConfig.numVisibleSats ?? 3;
  const targetSnr = physConfig.targetSnrDb ?? 12;
  const scaleToKm = physConfig.sceneToKmScale ?? 1;

  // Compute slant distances
  const dSatI = ai.slantDistanceKm ?? computeSlantDistance(cfg.orbitalAltitudeKm, ai.elevationDeg);
  const dSatJ = aj.slantDistanceKm ?? computeSlantDistance(cfg.orbitalAltitudeKm, aj.elevationDeg);

  // Compute inter-cell distance (km)
  const posI = cellPositions.get(vi.cellId);
  const posJ = cellPositions.get(vj.cellId);
  if (!posI || !posJ) {
    const neighbors = neighborMap.get(vi.cellId) ?? [];
    return neighbors.includes(vj.cellId);
  }

  const dx = posI.x - posJ.x;
  const dz = posI.z - posJ.z;
  const cellDistKm = Math.sqrt(dx * dx + dz * dz) * scaleToKm;

  if (cellDistKm <= 0) return true; // Same location = conflict

  // Check interference from vi's satellite to vj's cell
  // θ_{c',s',c} = off-axis angle at vi's satellite between vi's cell and vj's cell
  const thetaTx = computeOffAxisAngle(dSatI, dSatI, cellDistKm);

  // Compute cross-satellite slant distance: from vi's satellite to vj's cell
  let dCrossSat: number;
  if (ai.satPosition && aj.satPosition && vi.satId !== vj.satId) {
    // Real 3D inter-satellite distance for computing cross-link geometry
    const dxS = ai.satPosition.x - aj.satPosition.x;
    const dyS = ai.satPosition.y - aj.satPosition.y;
    const dzS = ai.satPosition.z - aj.satPosition.z;
    const interSatDist = Math.sqrt(dxS * dxS + dyS * dyS + dzS * dzS);
    // Cross-satellite slant distance from vi's sat to vj's cell ≈ slant(vj) + inter-satellite offset
    // More accurately: use the inter-satellite geometry to estimate the effective cross distance
    dCrossSat = Math.sqrt(dSatJ * dSatJ + interSatDist * interSatDist - 2 * dSatJ * interSatDist * Math.cos(Math.PI / 3));
    dCrossSat = Math.max(dCrossSat, dSatJ * 0.5); // floor to prevent degenerate values
  } else {
    // Same satellite or no position info: use elevation-based approximation
    dCrossSat = computeSlantDistance(
      cfg.orbitalAltitudeKm,
      Math.max(10, ai.elevationDeg - 5),
    );
  }
  const thetaRx = computeOffAxisAngle(dSatJ, dCrossSat, cellDistKm);

  // Antenna gain attenuation at these angles
  const g1 = computeAntennaGain(thetaTx, cfg.txPeakGainDbi, cfg.beamwidth3dBDeg, cfg.sideLobeLevel);
  const g2 = computeAntennaGain(thetaRx, cfg.rxPeakGainDbi, cfg.beamwidth3dBDeg, cfg.sideLobeLevel);

  // Total off-axis gain (dBi)
  const totalGain = g1 + g2;

  // Compute interference threshold G_th (Eq. 8)
  // Channel gain ratio: h_{interfering} / h_{serving} using full channel model
  const freq = cfg.frequencyGhz;
  const hServing = computeChannelGain(dSatI, ai.elevationDeg, freq, cfg);
  const hInterfering = computeChannelGain(dCrossSat, aj.elevationDeg, freq, cfg);
  const channelGainRatio = hServing > 0 ? hInterfering / hServing : (dSatI / dCrossSat) ** 2;
  const B = beamsPerSatellite ?? 4;
  const gTh = computeInterferenceThreshold(
    cfg.interBeamINRThresholdDb,
    numSats,
    B,
    targetSnr,
    targetSnr,
    channelGainRatio,
  );

  // Conflict if combined antenna gain exceeds threshold (interference too strong)
  // Paper: G_1(θ) + G_2(θ) < G_th means NO conflict (interference acceptable)
  // So conflict when: G_1(θ) + G_2(θ) >= G_th
  return totalGain >= gTh;
}
