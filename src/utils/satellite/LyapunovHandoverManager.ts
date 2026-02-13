/**
 * Lyapunov Handover Manager — Algorithm 1
 *
 * Inter-Satellite Handover Decision Algorithm
 *
 * 核心機制：
 * 1. 條件觸發 (Conditional Triggering) — 只在必要時才進行換手
 * 2. 多屬性初始分配 (Multi-attribute Entropy) — 為需要換手的 cell 選擇衛星
 * 3. Swap Matching 優化 — 迭代改善 cell-satellite 分配
 *
 * 目標函數 (Eq. 32):
 *   δ'_f = Σ_s V × (Σ_c (x_{s,c} - 1/2) × Q_c / Σ Q)² + Σ_c M_{c,f} × m_{c,f}
 *   前半部 = Lyapunov queue 穩定性（負載均衡）
 *   後半部 = 換手頻率懲罰
 */

import * as THREE from 'three';
import type { HandoverState } from '@/types/handover';
import type { CellQueueState, LyapunovConfig, VirtualQueue } from '@/types/lyapunov';
import type { EarthFixedCell } from '@/features/beam-hopping/components/EarthFixedCells';

/** 衛星資訊 (用於 handover 決策) */
export interface SatelliteInfo {
  id: string;
  position: THREE.Vector3;
  /** 對每個 cell 的仰角 (度) */
  elevations: Map<number, number>;
  /** 預估剩餘服務時間 (秒) */
  remainingServiceTime: number;
  /** 當前負載（服務的 cell 數） */
  load: number;
}

/** Cell-Satellite 分配結果 */
export interface CellSatelliteAssignment {
  cellId: number;
  satelliteId: string;
  /** 是否為本 epoch 新分配（發生換手） */
  isHandover: boolean;
}

/** Handover 決策結果 */
export interface LyapunovHandoverResult {
  /** 所有 cell 的分配 */
  assignments: CellSatelliteAssignment[];
  /** 本 epoch 的換手次數 */
  handoverCount: number;
  /** 目標函數值 */
  objectiveValue: number;
  /** 觸發的 cells（哪些 cell 需要換手） */
  triggeredCells: number[];
}

/**
 * Dynamic Entropy Weights (Section III-B)
 *
 * Computes objective weights for multi-attribute satellite selection
 * using information entropy. Attributes with lower entropy (more variation)
 * get higher weights.
 *
 * E_j = -1/ln(n) × Σ_{i=1}^{n} p_{ij} × ln(p_{ij})
 * w_j = (1 - E_j) / Σ_{k=1}^{m} (1 - E_k)
 *
 * @param attributes Array of m attributes, each containing n candidate values
 * @returns Array of m weights summing to 1
 */
function computeEntropyWeights(attributes: number[][]): number[] {
  const m = attributes.length;
  if (m === 0) return [];

  const n = attributes[0].length;
  if (n <= 1) return attributes.map(() => 1 / m); // uniform if single candidate

  const entropies: number[] = [];
  const lnN = Math.log(n);

  for (let j = 0; j < m; j++) {
    const vals = attributes[j];
    const total = vals.reduce((s, v) => s + Math.max(v, 1e-10), 0);

    // Compute proportions p_{ij} = val_i / Σ val_i
    let entropy = 0;
    for (let i = 0; i < n; i++) {
      const p = Math.max(vals[i], 1e-10) / total;
      entropy -= p * Math.log(p);
    }
    // Normalize: E_j = entropy / ln(n), capped at [0, 1]
    entropies.push(Math.min(entropy / lnN, 1));
  }

  // w_j = (1 - E_j) / Σ(1 - E_k)
  const divergences = entropies.map(e => 1 - e);
  const totalDiv = divergences.reduce((s, d) => s + d, 0);

  if (totalDiv < 1e-10) return attributes.map(() => 1 / m); // all uniform → equal weights

  return divergences.map(d => d / totalDiv);
}

/**
 * Lyapunov Handover Manager (duplicate comment — see file header)
 */
export class LyapunovHandoverManager {
  private config: LyapunovConfig;
  /** 上一 epoch 的分配結果 */
  private previousAssignments: Map<number, string> = new Map();
  /** 累計換手次數 */
  private totalHandovers: number = 0;
  /** 累計 epoch 數 */
  private totalEpochs: number = 0;
  /** 最小仰角門檻 (度) */
  private readonly minElevation: number = 35;

  constructor(config: LyapunovConfig) {
    this.config = config;
  }

  /**
   * 執行一個 epoch 的換手決策 (Algorithm 1)
   *
   * Paper Algorithm 1 structure:
   *   Lines 1-14: Topology change — reassign cells with invisible satellites
   *   Line 15: Global condition check — σ_f == 0 OR (σ_f < σ₀ AND min_s(Σ_c x_{s,c} Q_c^f) > C_s)
   *   Lines 16-24: Entropy assignment for ALL cells (only if line 15 true)
   *   Lines 25-33: Swap matching + random adjust (only if line 15 true)
   */
  decide(
    cells: EarthFixedCell[],
    satellites: SatelliteInfo[],
    queueStates: CellQueueState[],
    virtualQueues?: VirtualQueue[],
  ): LyapunovHandoverResult {
    this.totalEpochs++;

    if (satellites.length === 0 || cells.length === 0) {
      return {
        assignments: [],
        handoverCount: 0,
        objectiveValue: 0,
        triggeredCells: [],
      };
    }

    // 建立 queue 映射
    const queueMap = new Map<number, CellQueueState>();
    for (const q of queueStates) {
      queueMap.set(q.cellId, q);
    }

    // Paper Section V-A: globally select the 2 satellites with longest service time
    const globalTop2 = this.selectGlobalTop2(satellites, cells);

    // Lines 1-14: Topology change — reassign cells where satellite is no longer visible
    const topologyChangedCells = this.detectTopologyChanges(cells, satellites);
    const currentAssignments = new Map(this.previousAssignments);

    // Reassign topology-changed cells via entropy assignment (restricted to global top-2)
    for (const cellId of topologyChangedCells) {
      const bestSat = this.entropyAssignment(cellId, cells, globalTop2, currentAssignments, queueMap);
      if (bestSat) {
        currentAssignments.set(cellId, bestSat);
      }
    }

    // 確保所有 cells 都有分配 (first epoch or missing cells)
    for (const cell of cells) {
      if (!currentAssignments.has(cell.id)) {
        const bestSat = this.entropyAssignment(cell.id, cells, globalTop2, currentAssignments, queueMap);
        if (bestSat) {
          currentAssignments.set(cell.id, bestSat);
        }
      }
    }

    // Build virtual queue lookup for penalty calculation
    const vqMap = new Map<number, number>();
    if (virtualQueues) {
      for (const vq of virtualQueues) vqMap.set(vq.cellId, vq.value);
    }

    // Line 15: Global condition — σ_f == 0 OR (σ_f < σ₀ AND min_s(Σ_c x_{s,c} Q_c^f) > C_s)
    // σ_f uses ALL visible satellites K (not just serving top-2) so σ = C/(K×B) can be < σ₀
    const globalTrigger = this.checkLine15Condition(cells, satellites, currentAssignments, queueMap);
    const triggeredCells = [...topologyChangedCells];

    if (globalTrigger) {
      // Lines 16-24: Full entropy re-assignment for ALL cells (restricted to global top-2)
      for (const cell of cells) {
        if (!topologyChangedCells.includes(cell.id)) {
          triggeredCells.push(cell.id);
        }
        const bestSat = this.entropyAssignment(cell.id, cells, globalTop2, currentAssignments, queueMap);
        if (bestSat) {
          currentAssignments.set(cell.id, bestSat);
        }
      }

      // Lines 25-33: Swap Matching + Random Adjust optimization
      this.swapMatching(currentAssignments, cells, globalTop2, queueMap, vqMap);
    }

    // Count handovers
    let handoverCount = 0;
    const assignments: CellSatelliteAssignment[] = [];

    for (const cell of cells) {
      const newSatId = currentAssignments.get(cell.id);
      const prevSatId = this.previousAssignments.get(cell.id);
      const isHandover = prevSatId !== undefined && prevSatId !== newSatId;

      if (isHandover) handoverCount++;

      assignments.push({
        cellId: cell.id,
        satelliteId: newSatId ?? '',
        isHandover,
      });
    }

    this.totalHandovers += handoverCount;
    this.previousAssignments = new Map(currentAssignments);

    const objectiveValue = this.computeObjective(currentAssignments, cells, satellites, queueMap, vqMap);

    return {
      assignments,
      handoverCount,
      objectiveValue,
      triggeredCells,
    };
  }

  /**
   * Lines 1-14: Detect topology changes — cells where the assigned satellite
   * is no longer visible (left coverage or below minimum elevation).
   */
  private detectTopologyChanges(
    cells: EarthFixedCell[],
    satellites: SatelliteInfo[],
  ): number[] {
    const changed: number[] = [];

    for (const cell of cells) {
      const currentSatId = this.previousAssignments.get(cell.id);

      // 沒有前次分配 → 需要初始分配
      if (!currentSatId) {
        changed.push(cell.id);
        continue;
      }

      const currentSat = satellites.find(s => s.id === currentSatId);

      // 衛星不可見 → topology change
      if (!currentSat) {
        changed.push(cell.id);
        continue;
      }

      // 仰角低於門檻 → topology change
      const elevation = currentSat.elevations.get(cell.id) ?? 0;
      if (elevation < this.minElevation) {
        changed.push(cell.id);
      }
    }

    return changed;
  }

  /**
   * Line 15: Global re-optimization condition
   *
   * Algorithm 1, Line 15:
   *   IF σ_f == 0 OR (σ_f < σ₀ AND min_s(Σ_c x_{s,c} Q_c^f) > C_s) THEN
   *     ... entropy assignment + swap matching for all cells ...
   *
   * Where:
   *   σ_f = resource utilization (used beams / total beam capacity)
   *   σ₀ = resourceUtilizationThreshold
   *   x_{s,c} = 1 if satellite s serves cell c, 0 otherwise
   *   Q_c^f = queue length of cell c
   *   C_s = per-satellite capacity per epoch (W × T_slot × log₂(1+SNR) × S)
   */
  private checkLine15Condition(
    cells: EarthFixedCell[],
    satellites: SatelliteInfo[],
    assignments: Map<number, string>,
    queueMap: Map<number, CellQueueState>,
  ): boolean {
    const sigma = this.computeResourceUtilization(satellites, assignments);

    // σ_f == 0: no resources used at all → trigger
    if (sigma === 0) return true;

    // σ_f >= σ₀: utilization sufficient → no trigger
    if (sigma >= this.config.resourceUtilizationThreshold) return false;

    // σ_f < σ₀: check capacity condition min_s(Σ_c x_{s,c} Q_c^f) > C_s
    // Compute per-satellite queue-weighted load (only for satellites with assignments)
    const satQueueLoad = new Map<string, number>();
    for (const [cellId, satId] of assignments) {
      const q = queueMap.get(cellId);
      if (q) {
        satQueueLoad.set(satId, (satQueueLoad.get(satId) ?? 0) + q.queueLength);
      }
    }

    // No assigned satellites → cannot evaluate condition
    if (satQueueLoad.size === 0) return false;

    // min_s(Σ_c x_{s,c} Q_c^f) — minimum queue load across assigned satellites only
    let minLoad = Infinity;
    for (const [, load] of satQueueLoad) {
      if (load < minLoad) minLoad = load;
    }

    // C_s: per-satellite capacity per epoch (Mbits)
    // C_s = W₁ × T_slot × log₂(1 + SNR) × slotsPerEpoch
    const snrLinear = Math.pow(10, this.config.targetSnrDb / 10);
    const C_s = this.config.satelliteBandwidthMhz *
      (this.config.slotDurationMs / 1000) *
      Math.log2(1 + snrLinear) *
      this.config.slotsPerEpoch;

    return minLoad > C_s;
  }

  /**
   * Step 2: 多屬性 Entropy 初始分配
   *
   * 考慮三個屬性：
   * 1. 衛星負載（越低越好）
   * 2. 剩餘服務時間（越長越好）
   * 3. 仰角（越高越好）
   */
  private entropyAssignment(
    cellId: number,
    cells: EarthFixedCell[],
    satellites: SatelliteInfo[],
    currentAssignments: Map<number, string>,
    queueMap: Map<number, CellQueueState>,
  ): string | null {
    if (satellites.length === 0) return null;

    // 過濾可見衛星（仰角 > minElevation）
    let candidates = satellites.filter(sat => {
      const elev = sat.elevations.get(cellId) ?? 0;
      return elev >= this.minElevation;
    });

    // Note: global top-2 satellite pre-filter is applied in decide() via selectGlobalTop2()
    // Per-cell filtering here only checks elevation visibility from the already-restricted set

    if (candidates.length === 0) {
      // 退化：選擇仰角最高的
      return satellites.reduce((best, s) => {
        const elev = s.elevations.get(cellId) ?? 0;
        const bestElev = best.elevations.get(cellId) ?? 0;
        return elev > bestElev ? s : best;
      }, satellites[0]).id;
    }

    // Compute raw attributes for each candidate
    const loads = candidates.map(s => this.countSatelliteLoad(s.id, currentAssignments));
    const elevs = candidates.map(s => s.elevations.get(cellId) ?? 0);
    const rsts = candidates.map(s => s.remainingServiceTime);

    // Dynamic entropy weights (v2: replaces fixed [0.4, 0.35, 0.25])
    // Load is "lower is better" → invert for normalization
    const maxLoad = Math.max(...loads, 1);
    const invertedLoads = loads.map(l => maxLoad - l + 1);
    const weights = computeEntropyWeights([invertedLoads, elevs, rsts]);

    // Normalize attributes and score each candidate
    const maxElev = Math.max(...elevs, 1);
    const maxRst = Math.max(...rsts, 1);
    const maxInvLoad = Math.max(...invertedLoads, 1);

    let bestScore = -Infinity;
    let bestSatId = candidates[0].id;

    for (let i = 0; i < candidates.length; i++) {
      const normLoad = invertedLoads[i] / maxInvLoad;
      const normElev = elevs[i] / maxElev;
      const normRst = rsts[i] / maxRst;

      const totalScore = weights[0] * normLoad + weights[1] * normElev + weights[2] * normRst;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestSatId = candidates[i].id;
      }
    }

    return bestSatId;
  }

  /**
   * Step 3: Swap Matching 優化
   *
   * 兩種 swap 操作：
   * 1. First kind: 兩顆衛星交換各自一個 cell
   * 2. Second kind: 一顆衛星的 cell 轉移給另一顆衛星
   *
   * 迭代直到無法改善
   */
  private swapMatching(
    assignments: Map<number, string>,
    cells: EarthFixedCell[],
    satellites: SatelliteInfo[],
    queueMap: Map<number, CellQueueState>,
    vqMap: Map<number, number> = new Map(),
  ): void {
    const maxIterations = 20;
    let improved = true;
    let iteration = 0;

    while (improved && iteration < maxIterations) {
      improved = false;
      iteration++;

      const currentObj = this.computeObjective(assignments, cells, satellites, queueMap, vqMap);

      // First kind swap: 交換兩顆衛星各自的一個 cell
      const cellIds = Array.from(assignments.keys());
      for (let i = 0; i < cellIds.length && !improved; i++) {
        for (let j = i + 1; j < cellIds.length && !improved; j++) {
          const cellA = cellIds[i];
          const cellB = cellIds[j];
          const satA = assignments.get(cellA)!;
          const satB = assignments.get(cellB)!;

          // 只有不同衛星才需要 swap
          if (satA === satB) continue;

          // 檢查可見性
          const satAInfo = satellites.find(s => s.id === satA);
          const satBInfo = satellites.find(s => s.id === satB);
          if (!satAInfo || !satBInfo) continue;

          const elevAtoB = satAInfo.elevations.get(cellB) ?? 0;
          const elevBtoA = satBInfo.elevations.get(cellA) ?? 0;
          if (elevAtoB < this.minElevation || elevBtoA < this.minElevation) continue;

          // 嘗試 swap
          assignments.set(cellA, satB);
          assignments.set(cellB, satA);

          const newObj = this.computeObjective(assignments, cells, satellites, queueMap, vqMap);
          if (newObj < currentObj) {
            improved = true;
          } else {
            // 還原
            assignments.set(cellA, satA);
            assignments.set(cellB, satB);
          }
        }
      }

      // Second kind swap: 將一個 cell 轉移到另一顆衛星
      if (!improved) {
        for (const cellId of cellIds) {
          const currentSat = assignments.get(cellId)!;

          for (const sat of satellites) {
            if (sat.id === currentSat) continue;

            const elev = sat.elevations.get(cellId) ?? 0;
            if (elev < this.minElevation) continue;

            assignments.set(cellId, sat.id);
            const newObj = this.computeObjective(assignments, cells, satellites, queueMap, vqMap);

            if (newObj < currentObj) {
              improved = true;
              break;
            } else {
              assignments.set(cellId, currentSat);
            }
          }
          if (improved) break;
        }
      }

      // Random adjust step: escape local optima by random perturbation
      // Paper Algorithm 1: C_s random swap attempts after deterministic swaps stall
      if (!improved) {
        const C_s = Math.max(Math.ceil(cellIds.length / 2), 5);
        const bestObj = this.computeObjective(assignments, cells, satellites, queueMap, vqMap);

        for (let r = 0; r < C_s; r++) {
          // Pick a random cell
          const randCellIdx = Math.floor(Math.random() * cellIds.length);
          const randCellId = cellIds[randCellIdx];
          const origSat = assignments.get(randCellId)!;

          // Collect visible satellites for this cell (excluding current)
          const visibleSats = satellites.filter(s => {
            if (s.id === origSat) return false;
            const elev = s.elevations.get(randCellId) ?? 0;
            return elev >= this.minElevation;
          });
          if (visibleSats.length === 0) continue;

          // Pick a random visible satellite
          const randSat = visibleSats[Math.floor(Math.random() * visibleSats.length)];
          assignments.set(randCellId, randSat.id);

          const newObj = this.computeObjective(assignments, cells, satellites, queueMap, vqMap);
          if (newObj < bestObj) {
            improved = true;
            break;
          } else {
            assignments.set(randCellId, origSat);
          }
        }
      }
    }
  }

  /**
   * 計算目標函數 (Eq. 32)
   *
   * δ'_f = V × Σ_s (Σ_c (x_{s,c} - 1/2) × Q_c / ΣQ)² + Σ_c M_{c,f} × m_{c,f}
   *
   * 前半部: 佇列加權歸一化負載偏差（以 1/2 為中心）
   * 後半部: 切換頻率懲罰
   */
  private computeObjective(
    assignments: Map<number, string>,
    cells: EarthFixedCell[],
    satellites: SatelliteInfo[],
    queueMap: Map<number, CellQueueState>,
    vqMap: Map<number, number> = new Map(),
  ): number {
    const V = this.config.lyapunovV;
    const totalQueue = Array.from(queueMap.values()).reduce((s, q) => s + q.queueLength, 0) || 1;

    // 負載均衡項 (Eq. 32): Σ_s (Σ_c (x_{s,c} - 1/2) × Q_c / ΣQ)²
    // x_{s,c} ∈ {0,1}: cell c 是否分配給衛星 s
    // (x_{s,c} - 1/2) = +0.5 if assigned, -0.5 if not
    let loadImbalanceTerm = 0;
    for (const sat of satellites) {
      let weightedSum = 0;
      for (const cell of cells) {
        const q = queueMap.get(cell.id);
        const qNorm = (q?.queueLength ?? 0) / totalQueue;
        const assignedToThis = assignments.get(cell.id) === sat.id;
        // (x_{s,c} - 1/2) × Q_c / ΣQ
        weightedSum += (assignedToThis ? 0.5 : -0.5) * qNorm;
      }
      loadImbalanceTerm += V * weightedSum * weightedSum;
    }

    // 換手頻率懲罰項 (Eq. 32): M_{c,f} × m_{c,f}
    // M_{c,f} = virtual queue value, m_{c,f} = handover indicator
    let handoverPenalty = 0;
    assignments.forEach((satId, cellId) => {
      const prevSat = this.previousAssignments.get(cellId);
      if (prevSat && prevSat !== satId) {
        handoverPenalty += vqMap.get(cellId) ?? 0;
      }
    });

    return loadImbalanceTerm + handoverPenalty;
  }

  /**
   * Paper Section V-A: "all beam cells are consistently served by
   * two satellites with the longest service time"
   *
   * Globally select the 2 satellites with longest remaining service time
   * that are visible (elevation >= minElevation) from at least one cell.
   */
  private selectGlobalTop2(
    satellites: SatelliteInfo[],
    cells: EarthFixedCell[],
  ): SatelliteInfo[] {
    const visible = satellites.filter(sat =>
      cells.some(cell => (sat.elevations.get(cell.id) ?? 0) >= this.minElevation),
    );
    if (visible.length <= 2) return visible;
    visible.sort((a, b) => b.remainingServiceTime - a.remainingServiceTime);
    return visible.slice(0, 2);
  }

  /**
   * 計算資源利用率 σ
   */
  private computeResourceUtilization(
    satellites: SatelliteInfo[],
    assignments: Map<number, string>,
  ): number {
    if (satellites.length === 0) return 0;

    const totalCapacity = satellites.length * this.config.beamsPerSatellite;
    const usedBeams = assignments.size;

    return totalCapacity > 0 ? usedBeams / totalCapacity : 0;
  }

  /**
   * 計算衛星的當前負載（被分配的 cell 數）
   */
  private countSatelliteLoad(satId: string, assignments: Map<number, string>): number {
    let count = 0;
    assignments.forEach(assignedSat => {
      if (assignedSat === satId) count++;
    });
    return count;
  }

  /**
   * @deprecated Lyapunov 模式已改用 epoch-driven 衛星選擇（Satellites.tsx:235），
   * 此方法不再被 lyapunov 分支呼叫。保留僅為 manager API 介面相容。
   *
   * Frame-based update (兼容現有 useFrame 迴圈)
   * Lyapunov 的換手是 epoch-based，不需要 frame-level 動畫。
   * 此方法提供簡化的 HandoverState 以與現有 Satellites 架構相容。
   */
  update(
    visibleSatellites: Map<string, THREE.Vector3>,
    _elapsedTime: number,
    _timeSpeed: number,
  ): HandoverState {
    // Select highest-elevation satellite (consistent with Algorithm 1 logic)
    // Elevation ≈ angle from horizon: higher position.y relative to distance → higher elevation
    let bestSatId: string | null = null;
    let bestElev = -Infinity;
    for (const [satId, pos] of visibleSatellites) {
      // Use y-component (height) as proxy for elevation when no cell context
      const dist = pos.length();
      const elev = dist > 0 ? Math.asin(pos.y / dist) : 0;
      if (elev > bestElev) {
        bestElev = elev;
        bestSatId = satId;
      }
    }

    return {
      phase: 'stable',
      currentSatelliteId: bestSatId,
      targetSatelliteId: null,
      candidateSatelliteIds: Array.from(visibleSatellites.keys()),
      progress: 0,
      signalStrength: { current: 1.0, target: 0.0 },
    };
  }

  /** 取得當前換手頻率 */
  getHandoverFrequency(): number {
    return this.totalEpochs > 0 ? this.totalHandovers / this.totalEpochs : 0;
  }

  /** 重置狀態 */
  reset(): void {
    this.previousAssignments.clear();
    this.totalHandovers = 0;
    this.totalEpochs = 0;
  }
}
