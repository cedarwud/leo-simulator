/**
 * Lyapunov Optimizer Hook — Per-Epoch 決策循環
 *
 * 在每個 epoch 結束時執行完整的 Lyapunov 決策流程：
 * 1. Algorithm 1: 換手決策（由 LyapunovHandoverManager 處理）
 * 2. Algorithm 2: Beam hopping（WMIS scheduler）
 * 3. 更新 virtual queues + drift-plus-penalty
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { EarthFixedCell, SCENE_TO_KM_SCALE } from '@/features/beam-hopping/components/EarthFixedCells';
import { buildConflictGraph, SatelliteCellAssignment, type ConflictGraph } from '@/features/beam-hopping/algorithms/conflictGraph';
import {
  initLyapunovState,
  runEpochDecision,
} from '@/features/beam-hopping/algorithms/lyapunovOptimizer';
import {
  initBaselineState,
  runBaselineEpoch,
  BaselineState,
} from '@/features/beam-hopping/algorithms/baselineRunner';
import { generateConstellation } from '@/features/beam-hopping/algorithms/constellation';
import { computeCellCapacityMap, DEFAULT_PHYSICAL_LAYER_CONFIG, type PhysicalLayerConfig } from '@/features/beam-hopping/algorithms/channelModel';
import {
  SimulationClock,
  CellQueueState,
  LyapunovState,
  LyapunovConfig,
  DEFAULT_LYAPUNOV_CONFIG,
  TerrestrialCluster,
  DEFAULT_SPECTRUM_SHARING_CONFIG,
} from '@/types/lyapunov';
import { generateTerrestrialClusters } from '@/features/beam-hopping/algorithms/spectrumSharing';
import {
  LyapunovHandoverManager,
  LyapunovHandoverResult,
  SatelliteInfo,
} from '@/utils/satellite/LyapunovHandoverManager';

/**
 * 管理 Lyapunov 優化框架的 per-epoch 決策循環
 */
export function useLyapunovOptimizer(
  cells: EarthFixedCell[],
  clock: SimulationClock,
  queueStates: CellQueueState[],
  config: LyapunovConfig = DEFAULT_LYAPUNOV_CONFIG,
  spectrumSharingEnabled: boolean = true,
) {
  // Lyapunov 狀態
  const [lyapunovState, setLyapunovState] = useState<LyapunovState>(() =>
    initLyapunovState(cells.map(c => c.id))
  );

  // 最新 handover 結果（暴露給外部使用）
  const [lastHandoverResult, setLastHandoverResult] = useState<LyapunovHandoverResult | null>(null);

  // 最新 beam decisions（暴露給 3D 視覺化使用）
  const [latestBeamDecisions, setLatestBeamDecisions] = useState<import('@/features/beam-hopping/algorithms/wmisScheduler').BeamHoppingDecision[]>([]);

  // Primary satellite position from epoch assignments (for visual satellite matching)
  const [epochPrimarySatPosition, setEpochPrimarySatPosition] = useState<{ x: number; y: number; z: number } | null>(null);

  // Current conflict graph (exposed for 3D visualization)
  const [currentConflictGraph, setCurrentConflictGraph] = useState<ConflictGraph | null>(null);

  // Current visible algorithmic satellites (exposed for 3D rendering)
  const [currentVisibleSatellites, setCurrentVisibleSatellites] = useState<SatelliteInfo[]>([]);

  // 追蹤上次執行的 epoch
  const prevEpochRef = useRef(0);

  // LyapunovHandoverManager 實例（persist across epochs）
  const handoverManagerRef = useRef<LyapunovHandoverManager>(
    new LyapunovHandoverManager(config)
  );

  // Baseline state (persist across epochs for fair comparison)
  const baselineStateRef = useRef<BaselineState>(
    initBaselineState(cells.map(c => c.id))
  );

  // 當任何 config 欄位變更時重建 manager + baselines
  useEffect(() => {
    handoverManagerRef.current = new LyapunovHandoverManager(config);
    baselineStateRef.current = initBaselineState(cells.map(c => c.id));
    prevEpochRef.current = 0;
  }, [config.lyapunovV, config.maxHandoverFrequency, config.resourceUtilizationThreshold,
      config.beamsPerSatellite, config.targetSnrDb, config.satelliteBandwidthMhz,
      config.slotDurationMs, config.slotsPerEpoch, config.totalArrivalRateGbps,
      config.rainRateMmPerH, config.enableShadowFading, config.enableAtmosphericEffects]);

  // Terrestrial clusters for spectrum sharing
  const terrestrialClusters = useMemo<TerrestrialCluster[]>(() => {
    if (cells.length === 0) return [];
    return generateTerrestrialClusters(cells.map(c => c.id));
  }, [cells.length]);

  // 每個 epoch 結束時執行決策
  useEffect(() => {
    if (cells.length === 0) return;

    const currentEpoch = clock.currentEpoch;
    if (currentEpoch <= prevEpochRef.current) return;
    prevEpochRef.current = currentEpoch;

    // Build physical layer config from user-adjustable settings
    const physConfig: PhysicalLayerConfig = {
      ...DEFAULT_PHYSICAL_LAYER_CONFIG,
      rainRateMmPerH: config.rainRateMmPerH ?? 10,
      enableShadowFading: config.enableShadowFading ?? true,
      enableAtmosphericEffects: config.enableAtmosphericEffects ?? true,
    };

    // Step 1: Generate LEO constellation (Section V-A: Walker-Delta 30/40/1)
    const epochDurationS = config.slotsPerEpoch * config.slotDurationMs / 1000;
    const satellites = generateConstellation(
      currentEpoch,
      cells.map(c => c.id),
      undefined, // default constellation config
      epochDurationS,
    );

    // Fallback: if no satellites visible, skip this epoch
    if (satellites.length === 0) return;

    // Expose algorithmic satellites for 3D rendering
    setCurrentVisibleSatellites(satellites);

    // Step 2: Algorithm 1 — 使用 LyapunovHandoverManager 做換手決策
    const tAlgo1Start = performance.now();
    const hoResult = handoverManagerRef.current.decide(
      cells, satellites, queueStates, lyapunovState.virtualQueues,
    );
    const tAlgo1End = performance.now();
    setLastHandoverResult(hoResult);

    // Step 3: 從換手結果中提取 handover indicators
    const handoverIndicators = new Map<number, boolean>();
    for (const assignment of hoResult.assignments) {
      handoverIndicators.set(assignment.cellId, assignment.isHandover);
    }

    // Step 2.5: Compute per-cell capacity map from handover assignments
    const cellAssignments: Array<{ cellId: number; elevationDeg: number }> = [];
    for (const assignment of hoResult.assignments) {
      const sat = satellites.find(s => s.id === assignment.satelliteId);
      if (sat) {
        const elev = sat.elevations.get(assignment.cellId) ?? 35;
        cellAssignments.push({ cellId: assignment.cellId, elevationDeg: elev });
      }
    }
    const cellCapacityMap = cellAssignments.length > 0
      ? computeCellCapacityMap(
          cellAssignments,
          physConfig,
          config.satelliteBandwidthMhz,
          config.beamsPerSatellite,
          config.slotDurationMs,
        )
      : undefined;

    // Build cell elevation map for spectrum sharing physical interference
    const cellElevations = new Map<number, number>();
    for (const a of cellAssignments) {
      cellElevations.set(a.cellId, a.elevationDeg);
    }

    // Step 3.5: Build v2 conflict graph from handover assignments
    const satAssignments: SatelliteCellAssignment[] = hoResult.assignments.map(a => {
      const sat = satellites.find(s => s.id === a.satelliteId);
      const elev = sat?.elevations.get(a.cellId) ?? 35;
      return {
        satId: a.satelliteId,
        cellId: a.cellId,
        elevationDeg: elev,
        satPosition: sat?.position ? { x: sat.position.x, y: sat.position.y, z: sat.position.z } : undefined,
      };
    });
    // Find most-assigned satellite's position for visual matching
    const satCellCounts = new Map<string, number>();
    for (const a of satAssignments) {
      satCellCounts.set(a.satId, (satCellCounts.get(a.satId) ?? 0) + 1);
    }
    let primarySatId = '';
    let maxCells = 0;
    for (const [sid, cnt] of satCellCounts) {
      if (cnt > maxCells) { maxCells = cnt; primarySatId = sid; }
    }
    const primaryAsgn = satAssignments.find(a => a.satId === primarySatId && a.satPosition);
    setEpochPrimarySatPosition(primaryAsgn?.satPosition ?? null);

    const conflictGraph = buildConflictGraph(cells, satAssignments, config.beamsPerSatellite, {
      physical: physConfig,
      numVisibleSats: satellites.length,
      targetSnrDb: config.targetSnrDb,
      sceneToKmScale: SCENE_TO_KM_SCALE,
    });
    setCurrentConflictGraph(conflictGraph);

    // 使用 queueStates 更新 Lyapunov state 的 data queues
    const stateWithCurrentQueues: LyapunovState = {
      ...lyapunovState,
      dataQueues: queueStates.length > 0 ? queueStates : lyapunovState.dataQueues,
    };

    // K = number of serving satellites for Eq.(11) resource utilization
    const numServingSats = new Set(satAssignments.map(a => a.satId)).size;

    const result = runEpochDecision(
      stateWithCurrentQueues,
      conflictGraph,
      handoverIndicators,
      config,
      spectrumSharingEnabled && terrestrialClusters.length > 0 ? terrestrialClusters : undefined,
      spectrumSharingEnabled ? undefined : { ...DEFAULT_SPECTRUM_SHARING_CONFIG, enabled: false },
      cellCapacityMap,
      cellElevations.size > 0 ? cellElevations : undefined,
      numServingSats,
    );
    const tEpochEnd = performance.now();

    // Step 4: 基線算法對比 (3 groups × 3+1 baselines)
    const baselineResult = runBaselineEpoch(
      baselineStateRef.current,
      cells,
      satellites,
      config,
      terrestrialClusters,
      currentEpoch,
    );
    baselineStateRef.current = baselineResult.updatedState;

    // 將基線結果和執行時間附加到最新的 snapshot
    const updatedState = result.updatedState;
    if (updatedState.history.length > 0) {
      const lastSnapshot = updatedState.history[updatedState.history.length - 1];
      lastSnapshot.baselineGroups = baselineResult.results;
      lastSnapshot.executionTimesMs = {
        algorithm1: tAlgo1End - tAlgo1Start,
        algorithm2: result.timings.algorithm2,
        algorithm3: result.timings.algorithm3,
        total: tEpochEnd - tAlgo1Start,
      };
    }

    setLyapunovState(updatedState);

    // Store beam decisions for 3D visualization (use last slot's decision)
    setLatestBeamDecisions(result.beamDecisions);
  }, [clock.currentEpoch, cells, queueStates, config, terrestrialClusters, spectrumSharingEnabled]);

  // Current slot's beam decision for 3D visualization
  // Use the decision for the current slot within the epoch
  const currentSlotDecision = latestBeamDecisions.length > 0
    ? latestBeamDecisions[Math.min(clock.currentSlot, latestBeamDecisions.length - 1)]
    : { assignments: [] };

  return {
    lyapunovState,
    /** 最新的 handover 決策結果 */
    lastHandoverResult,
    /** Position of most-assigned satellite from epoch decision (for visual satellite matching) */
    epochPrimarySatPosition,
    /** Current conflict graph (for 3D edge visualization) */
    currentConflictGraph,
    /** Current visible algorithmic satellites (for 3D rendering in Lyapunov mode) */
    currentVisibleSatellites,
    /** Current slot's WMIS beam assignments (v2 conflict graph, with satId) */
    currentBeamDecision: currentSlotDecision,
    /** Virtual queue 平均值 */
    avgVirtualQueue: lyapunovState.virtualQueues.length > 0
      ? lyapunovState.virtualQueues.reduce((s, v) => s + v.value, 0) / lyapunovState.virtualQueues.length
      : 0,
    /** 歷史記錄 */
    history: lyapunovState.history,
  };
}
