/**
 * LEO Constellation Generator — Section V-A
 *
 * Walker-Delta 30/40/1 constellation: 1200 satellites
 * - 30 orbital planes × 40 satellites/plane
 * - Altitude: 550 km, Inclination: 53°
 * - Only returns satellites visible (elevation > 35°) from the 20 beam cells
 *
 * Beam cell area: 4×5 hexagonal grid at 30°E, 20°N, 34.6 km spacing
 */

import * as THREE from 'three';
import type { SatelliteInfo } from '@/utils/satellite/LyapunovHandoverManager';

// Physical constants
const Re = 6371;            // Earth radius (km)
const MU = 398600.4418;     // Standard gravitational parameter (km³/s²)
const WE = 7.2921159e-5;    // Earth rotation rate (rad/s)
const J2 = 1.08263e-3;      // Earth's J2 oblateness coefficient
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export interface ConstellationConfig {
  numOrbits: number;
  satsPerOrbit: number;
  altitudeKm: number;
  inclinationDeg: number;
  minElevationDeg: number;
}

export const DEFAULT_CONSTELLATION: ConstellationConfig = {
  numOrbits: 30,
  satsPerOrbit: 40,
  altitudeKm: 550,
  inclinationDeg: 53,
  minElevationDeg: 35,
};

/** Beam cell geodetic position (precomputed ECEF) */
interface CellGeo {
  id: number;
  lat: number;   // radians
  lon: number;   // radians
  ecef: [number, number, number];
}

/** Generate the 20 beam cell positions (4×5 hex grid at 30°E, 20°N) */
function initCellPositions(): CellGeo[] {
  const baseLat = 20 * D2R;
  const baseLon = 30 * D2R;
  const spacing = 34.6; // km inter-cell distance
  const dLat = spacing / Re; // angular spacing in lat
  const dLon = spacing / (Re * Math.cos(baseLat)); // angular spacing in lon
  const rowDy = dLat * Math.sqrt(3) / 2; // hexagonal row offset

  const cells: CellGeo[] = [];
  let id = 1;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const hexShift = (row % 2) * 0.5;
      const lat = baseLat + row * rowDy;
      const lon = baseLon + (col + hexShift) * dLon;
      cells.push({
        id,
        lat,
        lon,
        ecef: geodToECEF(lat, lon),
      });
      id++;
    }
  }
  return cells;
}

function geodToECEF(lat: number, lon: number): [number, number, number] {
  return [
    Re * Math.cos(lat) * Math.cos(lon),
    Re * Math.cos(lat) * Math.sin(lon),
    Re * Math.sin(lat),
  ];
}

/** Compute elevation angle (degrees) from ground station to satellite */
function computeElevation(
  station: [number, number, number],
  sat: [number, number, number],
): number {
  const dx = sat[0] - station[0];
  const dy = sat[1] - station[1];
  const dz = sat[2] - station[2];
  const slant = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (slant < 1) return 90;

  // sin(elevation) = dot(slant_vector, station_up_unit) / |slant|
  const rS = Math.sqrt(station[0] ** 2 + station[1] ** 2 + station[2] ** 2);
  const sinEl = (dx * station[0] + dy * station[1] + dz * station[2]) / (slant * rS);
  return Math.asin(Math.max(-1, Math.min(1, sinEl))) * R2D;
}

// Cache cell positions (constant across epochs)
let cellGeoCache: CellGeo[] | null = null;
function getCellPositions(): CellGeo[] {
  if (!cellGeoCache) cellGeoCache = initCellPositions();
  return cellGeoCache;
}

/**
 * Compute the orbital period for a given altitude
 */
export function orbitalPeriod(altitudeKm: number): number {
  const r = Re + altitudeKm;
  return 2 * Math.PI * Math.sqrt(r ** 3 / MU);
}

/**
 * Generate visible LEO satellites for a given epoch.
 *
 * Computes positions for all 1200 satellites using Kepler circular orbit mechanics,
 * filters to those with elevation > minElevation from any beam cell.
 *
 * @param epochIndex Current epoch number
 * @param cellIds Optional cell IDs to match (default: 1-20)
 * @param config Constellation configuration
 * @param epochDurationS Duration of one epoch in seconds (default: 40s)
 * @returns Visible SatelliteInfo[] with per-cell elevations
 */
export function generateConstellation(
  epochIndex: number,
  cellIds?: number[],
  config: ConstellationConfig = DEFAULT_CONSTELLATION,
  epochDurationS: number = 40,
): SatelliteInfo[] {
  const r = Re + config.altitudeKm;
  const T = orbitalPeriod(config.altitudeKm);
  const n = 2 * Math.PI / T; // mean motion (rad/s)
  const inc = config.inclinationDeg * D2R;
  const t = epochIndex * epochDurationS;
  const gmst = WE * t;

  const allCells = getCellPositions();
  const activeCells = cellIds
    ? allCells.filter(c => cellIds.includes(c.id))
    : allCells;

  // Precompute trig for GMST and inclination
  const cosGmst = Math.cos(gmst);
  const sinGmst = Math.sin(gmst);
  const cosInc = Math.cos(inc);
  const sinInc = Math.sin(inc);

  // Cell area center for quick rejection filter
  const centerLat = 20 * D2R;
  const maxLatDiff = 35 * D2R; // Only check sats within ~35° latitude of cell area

  const visible: SatelliteInfo[] = [];

  // J2 RAAN precession rate (rad/s):
  // dΩ/dt = -3/2 × n × J2 × (Re/a)² × cos(i)
  const raanDriftRate = -1.5 * n * J2 * (Re / r) ** 2 * cosInc;

  for (let p = 0; p < config.numOrbits; p++) {
    const raan0 = (p * 2 * Math.PI) / config.numOrbits;
    const raan = raan0 + raanDriftRate * t;  // J2 RAAN drift
    const cosRaan = Math.cos(raan);
    const sinRaan = Math.sin(raan);

    for (let s = 0; s < config.satsPerOrbit; s++) {
      // Mean anomaly at epoch (Walker phase factor F=1)
      const M0 = (s * 2 * Math.PI) / config.satsPerOrbit;
      const phaseOffset = (p * 2 * Math.PI) / (config.numOrbits * config.satsPerOrbit);
      const theta = M0 + phaseOffset + n * t;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // ECI position
      const xECI = r * (cosRaan * cosT - sinRaan * sinT * cosInc);
      const yECI = r * (sinRaan * cosT + cosRaan * sinT * cosInc);
      const zECI = r * sinT * sinInc;

      // ECI → ECEF rotation
      const xE = xECI * cosGmst + yECI * sinGmst;
      const yE = -xECI * sinGmst + yECI * cosGmst;
      const zE = zECI;

      // Quick latitude filter: sub-satellite point latitude
      const subLat = Math.asin(Math.max(-1, Math.min(1, zE / r)));
      if (Math.abs(subLat - centerLat) > maxLatDiff) continue;

      // Compute elevation for each cell
      const elevations = new Map<number, number>();
      let maxElev = -90;
      for (const cell of activeCells) {
        const el = computeElevation(cell.ecef, [xE, yE, zE]);
        elevations.set(cell.id, el);
        if (el > maxElev) maxElev = el;
      }

      if (maxElev < config.minElevationDeg) continue;

      // Remaining service time via elevation rate (dElev/dt):
      // Compute satellite position at t + dt, then numerical differentiation
      const dt = 10; // seconds
      const tFuture = t + dt;
      const gmstFuture = WE * tFuture;
      const cosGmstF = Math.cos(gmstFuture);
      const sinGmstF = Math.sin(gmstFuture);
      const raanFuture = raan0 + raanDriftRate * tFuture;
      const cosRaanF = Math.cos(raanFuture);
      const sinRaanF = Math.sin(raanFuture);
      const thetaF = M0 + phaseOffset + n * tFuture;
      const cosTF = Math.cos(thetaF);
      const sinTF = Math.sin(thetaF);
      const xECIF = r * (cosRaanF * cosTF - sinRaanF * sinTF * cosInc);
      const yECIF = r * (sinRaanF * cosTF + cosRaanF * sinTF * cosInc);
      const zECIF = r * sinTF * sinInc;
      const xEF = xECIF * cosGmstF + yECIF * sinGmstF;
      const yEF = -xECIF * sinGmstF + yECIF * cosGmstF;
      const zEF = zECIF;

      // Find max-elevation cell's future elevation for dElev/dt
      let maxElevCell = activeCells[0];
      for (const cell of activeCells) {
        if ((elevations.get(cell.id) ?? 0) >= maxElev - 0.01) { maxElevCell = cell; break; }
      }
      const elevFuture = computeElevation(maxElevCell.ecef, [xEF, yEF, zEF]);
      const dElevDt = (elevFuture - maxElev) / dt; // degrees/second

      let remainingTime: number;
      if (dElevDt > 0.001) {
        // Ascending: time to peak ≈ (90 - elev) / dElev/dt, then descend
        // remaining ≈ 2 × timeToPeak (symmetric pass approximation)
        const timeToPeak = Math.min((90 - maxElev) / dElevDt, T * 0.1);
        remainingTime = timeToPeak * 2;
      } else if (dElevDt < -0.001) {
        // Descending: time to drop below minElev
        remainingTime = Math.max((maxElev - config.minElevationDeg) / Math.abs(dElevDt), 10);
      } else {
        // Near zenith / nearly stationary: use generous estimate
        remainingTime = T * 0.05;
      }
      remainingTime = Math.max(remainingTime, 10); // floor at 10s

      // Scene position for 3D visualization
      const subLon = Math.atan2(yE, xE);
      const sceneX = (subLon / D2R - 30) * 15; // degrees from center × scale
      const sceneZ = (subLat / D2R - 20) * 15;
      const sceneY = config.altitudeKm * 0.4;

      visible.push({
        id: `sat-${p}-${s}`,
        position: new THREE.Vector3(sceneX, sceneY, sceneZ),
        elevations,
        remainingServiceTime: remainingTime,
        load: 0,
      });
    }
  }

  return visible;
}
