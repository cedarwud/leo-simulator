// 波束視覺化元件
export { SatelliteBeams, SatelliteToCellBeam } from './SatelliteBeams';
export type { BeamAssignment } from './SatelliteBeams';
export { getVisibleCells, selectServingCells } from './SatelliteBeams';

// 地面 Cells 元件
export { EarthFixedCells, generateEarthFixedCells, DEFAULT_CELL_CONFIG } from './EarthFixedCells';
export type { EarthFixedCell } from './EarthFixedCells';
export { POLARIZATION_COLORS, getBeamPolarization, getBeamColor, getNeighborCellIds } from './EarthFixedCells';
