/**
 * Lyapunov Optimization Framework — Paper 4-1, Section III
 *
 * 將 Algorithm 1 (換手) 和 Algorithm 2 (beam hopping) 整合到
 * Lyapunov drift-plus-penalty 框架下，實現長期最佳化。
 *
 * Per-Epoch 決策流程：
 *   1. 讀取上一 epoch 結果：σ_{f-1}, M_f
 *   2. Algorithm 1: 決定每個 cell 的服務衛星 {x^f_{s,c}}
 *   3. Algorithm 2: 決定每個 slot 的 beam hopping {y^{f,t}_{s,c,b}}
 *   4. 更新 Q_c, M_c, σ_f
 *
 * Virtual Queue Update (Eq. 17):
 *   M_{c,f+1} = max(M_{c,f} + m_{c,f} - H̄, 0)
 *
 * Drift-Plus-Penalty (Eq. 26):
 *   δ_f = Σ_c M_{c,f} × m_{c,f} + V × Σ_c (D_c^f - Q_c^f)²
 */

import {
  CellQueueState,
  CellCapacityMap,
  VirtualQueue,
  LyapunovState,
  EpochSnapshot,
  Paper41Config,
  DEFAULT_PAPER41_CONFIG,
  TerrestrialCluster,
  SpectrumSharingConfig,
  DEFAULT_SPECTRUM_SHARING_CONFIG,
} from '@/types/paper41';
import { ConflictGraph } from './conflictGraph';
import { solveWMIS, BeamHoppingDecision } from './wmisScheduler';
import { decideSpectrumSharing, applySpectrumSharingGain } from './spectrumSharing';

/** Algorithm timing info (ms) */
export interface AlgorithmTimings {
  algorithm2: number;
  algorithm3: number;
}

/** Epoch 決策結果 */
export interface EpochDecisionResult {
  /** Beam hopping 決策序列 (每 slot 一個) */
  beamDecisions: BeamHoppingDecision[];
  /** 本 epoch 的換手指標 (cellId → 是否換手) */
  handoverIndicators: Map<number, boolean>;
  /** 更新後的 Lyapunov 狀態 */
  updatedState: LyapunovState;
  /** Algorithm execution times (ms) */
  timings: AlgorithmTimings;
}

/**
 * 初始化 Lyapunov 狀態
 */
export function initLyapunovState(cellIds: number[]): LyapunovState {
  return {
    epoch: 0,
    dataQueues: cellIds.map(cellId => ({
      cellId,
      queueLength: 0,
      arrivalData: 0,
      servedData: 0,
      slotsServed: 0,
    })),
    virtualQueues: cellIds.map(cellId => ({
      cellId,
      value: 0,
    })),
    resourceUtilization: 0,
    driftValue: 0,
    penaltyValue: 0,
    driftPlusPenalty: 0,
    totalHandovers: 0,
    avgHandoverFrequency: 0,
    history: [],
  };
}

/**
 * 更新 Virtual Queues (Equation 17)
 *
 * M_{c,f+1} = max(M_{c,f} + m_{c,f} - H̄, 0)
 *
 * @param virtualQueues 當前虛擬佇列狀態
 * @param handoverIndicators 本 epoch 的換手指標 (cellId → 是否換手)
 * @param maxHandoverFreq H̄ 門檻
 */
export function updateVirtualQueues(
  virtualQueues: VirtualQueue[],
  handoverIndicators: Map<number, boolean>,
  maxHandoverFreq: number,
): VirtualQueue[] {
  return virtualQueues.map(vq => {
    const didHandover = handoverIndicators.get(vq.cellId) ? 1 : 0;
    const newValue = Math.max(vq.value + didHandover - maxHandoverFreq, 0);
    return { ...vq, value: newValue };
  });
}

/**
 * 計算 Lyapunov Drift (Eq. 26)
 *
 * Drift = Σ_c (D_c^f - Q_c^f)²
 *
 * 衡量每個 cell 的服務量與佇列的差距。
 * 如果提供 servedQueues (含有本 epoch 的 servedData)，
 * 使用 (servedData - queueLength)²；否則退回 Σ Q_c²。
 *
 * @param dataQueues 佇列狀態（含 servedData 時使用 D-Q 公式）
 * @param useServiceGap 是否使用 (D-Q)² 公式（預設 true）
 */
export function computeDrift(
  dataQueues: CellQueueState[],
  useServiceGap: boolean = true,
): number {
  if (useServiceGap) {
    return dataQueues.reduce((sum, q) => {
      const gap = q.servedData - q.queueLength;
      return sum + gap * gap;
    }, 0);
  }
  // Fallback: Σ Q_c² (backward compatible)
  return dataQueues.reduce((sum, q) => sum + q.queueLength * q.queueLength, 0);
}

/**
 * 計算 Penalty (Eq. 30)
 *
 * Penalty = Σ_c M_{c,f} × m_{c,f}
 * 虛擬佇列越長，換手的懲罰越大
 */
export function computePenalty(
  virtualQueues: VirtualQueue[],
  handoverIndicators: Map<number, boolean>,
): number {
  return virtualQueues.reduce((sum, vq) => {
    const didHandover = handoverIndicators.get(vq.cellId) ? 1 : 0;
    return sum + vq.value * didHandover;
  }, 0);
}

/**
 * 執行單個 epoch 的 Lyapunov 優化決策
 *
 * 完整流程：
 * 1. 使用 WMIS 進行 beam hopping (每 slot)
 * 2. 更新 data queues
 * 3. 更新 virtual queues
 * 4. 計算 drift-plus-penalty
 * 5. 記錄 snapshot
 */
export function runEpochDecision(
  prevState: LyapunovState,
  conflictGraph: ConflictGraph,
  handoverIndicators: Map<number, boolean>,
  config: Paper41Config = DEFAULT_PAPER41_CONFIG,
  terrestrialClusters?: TerrestrialCluster[],
  ssConfig?: SpectrumSharingConfig,
  cellCapacityMap?: CellCapacityMap,
  cellElevations?: Map<number, number>,
  numServingSatellites?: number,
): EpochDecisionResult {
  const epoch = prevState.epoch + 1;
  const tBeamStart = performance.now();

  // Step 1: Beam hopping — 每個 slot 執行 WMIS
  const beamDecisions: BeamHoppingDecision[] = [];
  const simQueues = prevState.dataQueues.map(q => ({ ...q }));

  // Per-cell capacity: use physical-layer map if available, else fixed SNR
  const snrLinear = Math.pow(10, config.targetSnrDb / 10);
  const defaultCapacity =
    (config.satelliteBandwidthMhz / config.beamsPerSatellite) *
    (config.slotDurationMs / 1000) *
    Math.log2(1 + snrLinear);

  for (let slot = 0; slot < config.slotsPerEpoch; slot++) {
    const decision = solveWMIS(conflictGraph, simQueues, config, cellCapacityMap);
    beamDecisions.push(decision);

    // 更新 served data
    for (const assignment of decision.assignments) {
      const q = simQueues.find(sq => sq.cellId === assignment.cellId);
      if (q) {
        const cap = cellCapacityMap?.get(assignment.cellId) ?? defaultCapacity;
        q.servedData += cap;
        q.slotsServed += 1;
      }
    }
  }

  const tBeamEnd = performance.now();

  // Step 1.5: Spectrum sharing — 借用地面頻譜增加容量 (Algorithm 3)
  const tSSStart = performance.now();
  const spectrumDecisions = terrestrialClusters
    ? decideSpectrumSharing(simQueues, terrestrialClusters, config, ssConfig ?? DEFAULT_SPECTRUM_SHARING_CONFIG, cellElevations)
    : [];
  const queuesWithSharing = terrestrialClusters
    ? applySpectrumSharingGain(simQueues, spectrumDecisions, config.slotsPerEpoch)
    : simQueues;

  const tSSEnd = performance.now();

  // Step 1.8: Compute drift BEFORE Eq.1 update (need servedData)
  // Drift = Σ (D_c - Q_c)² where D_c = servedData, Q_c = queueLength
  const drift = computeDrift(queuesWithSharing);

  // Step 2: 更新 data queues (Eq. 1)
  const updatedDataQueues: CellQueueState[] = queuesWithSharing.map((q, index) => {
    const demand = config.totalArrivalRateGbps * 1000 *
      (index < 20 ? [
        0.0221, 0.0636, 0.0636, 0.0325, 0.0740, 0.0325, 0.0209,
        0.0428, 0.0429, 0.0532, 0.0844, 0.0428, 0.0325, 0.0221,
        0.0636, 0.0740, 0.0312, 0.0844, 0.0428, 0.0740,
      ][index] : 0.05) *
      (config.slotsPerEpoch * config.slotDurationMs / 1000);

    const newQueueLength = Math.max(q.queueLength - q.servedData, 0) + demand;

    return {
      cellId: q.cellId,
      queueLength: newQueueLength,
      arrivalData: demand,
      servedData: 0,
      slotsServed: 0,
    };
  });

  // Step 3: 更新 virtual queues (Eq. 17)
  const updatedVirtualQueues = updateVirtualQueues(
    prevState.virtualQueues,
    handoverIndicators,
    config.maxHandoverFrequency,
  );

  // Step 4: 計算 drift-plus-penalty (Eq. 26)
  // δ_f = Σ M_c·m_c + V × Σ(D_c - Q_c)²
  const penalty = computePenalty(updatedVirtualQueues, handoverIndicators);
  const driftPlusPenalty = penalty + config.lyapunovV * drift;

  // Step 5: 統計
  const epochHandovers = Array.from(handoverIndicators.values()).filter(Boolean).length;
  const totalHandovers = prevState.totalHandovers + epochHandovers;
  const avgHandoverFreq = epoch > 0 ? totalHandovers / epoch : 0;

  // 資源利用率 Eq.(11): σ_f = Σ_s Σ_c x_{s,c} / (K × B)
  // K = number of serving satellites, B = beams per satellite
  // Σ x_{s,c} = number of cell assignments (each cell assigned to one satellite)
  const K = numServingSatellites ?? (new Set(
    conflictGraph.vertices.map(v => v.satId),
  ).size || 1);
  const numAssignedCells = new Set(
    beamDecisions.flatMap(d => d.assignments.map(a => a.cellId)),
  ).size;
  const resourceUtilization = numAssignedCells / (K * config.beamsPerSatellite);

  // Snapshot
  const snapshot: EpochSnapshot = {
    epoch,
    queueLengths: updatedDataQueues.map(q => q.queueLength),
    avgQueueLength: updatedDataQueues.reduce((s, q) => s + q.queueLength, 0) / Math.max(updatedDataQueues.length, 1),
    totalHandovers,
    handoverFrequency: avgHandoverFreq,
    resourceUtilization,
    driftPlusPenalty,
  };

  const updatedState: LyapunovState = {
    epoch,
    dataQueues: updatedDataQueues,
    virtualQueues: updatedVirtualQueues,
    resourceUtilization,
    driftValue: drift,
    penaltyValue: penalty,
    driftPlusPenalty,
    totalHandovers,
    avgHandoverFrequency: avgHandoverFreq,
    history: [...prevState.history.slice(-19999), snapshot], // 保留最近 20000 個 epoch
  };

  return {
    beamDecisions,
    handoverIndicators,
    updatedState,
    timings: {
      algorithm2: tBeamEnd - tBeamStart,
      algorithm3: tSSEnd - tSSStart,
    },
  };
}
