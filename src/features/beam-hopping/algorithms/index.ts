// Conflict Graph
export { buildConflictGraph, vertexId, parseVertexId } from './conflictGraph';
export type { ConflictGraph, ConflictVertex, SatelliteCellAssignment, ConflictPhysicalConfig } from './conflictGraph';

// WMIS Scheduler (Algorithm 2)
export { solveWMIS, solveWMIS_MonteCarlo, scheduleEpoch, computeCapacityPerSlotForConfig } from './wmisScheduler';
export type { BeamHoppingDecision } from './wmisScheduler';

// Lyapunov Optimizer (Section III)
export {
  initLyapunovState,
  updateVirtualQueues,
  computeDrift,
  computePenalty,
  runEpochDecision,
} from './lyapunovOptimizer';
export type { EpochDecisionResult, AlgorithmTimings } from './lyapunovOptimizer';

// Spectrum Sharing (Algorithm 3)
export {
  generateTerrestrialClusters,
  decideSpectrumSharing,
  applySpectrumSharingGain,
} from './spectrumSharing';

// Physical Layer Channel Model (Section II / V-A)
export {
  computeSlantDistance,
  computeFSPL,
  computePathLoss,
  computeChannelGain,
  computeAntennaGain,
  computeOffAxisAngle,
  computeNoisePower,
  computeSINR,
  computeCapacityPerSlot,
  computeInterferenceThreshold,
  computeSatTerrestrialINR,
  computeReceivedPower,
  computeRainAttenuation,
  computeGaseousAttenuation,
  computeCellCapacityMap,
  dbmToWatts,
  wattsToDbm,
  dbToLinear,
  linearToDb,
} from './channelModel';
export type { PhysicalLayerConfig } from './channelModel';
export { DEFAULT_PHYSICAL_LAYER_CONFIG } from './channelModel';

// Baseline Algorithms (Fig. 6-8 comparison)
export {
  initBaselineState,
  runBaselineEpoch,
} from './baselineRunner';
export type { BaselineState, BaselineResults } from './baselineRunner';

// Parameter Sweeps (Fig. 10, 11, 12)
export { runVParameterSweep, runArrivalRateSweep, runFig10CDFAnalysis } from './vSweep';
export type { VSweepResult, VSweepSeries, VSweepEpochMetrics, RateSweepResult, RateSweepSeries, Fig10CDFResult, CDFPoint } from './vSweep';

// LEO Constellation Generator (Section V-A)
export {
  generateConstellation,
  orbitalPeriod,
  DEFAULT_CONSTELLATION,
} from './constellation';
export type { ConstellationConfig } from './constellation';
