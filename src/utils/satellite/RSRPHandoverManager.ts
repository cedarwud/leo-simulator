/**
 * RSRP-Based 換手管理器
 *
 * 基於 3GPP TS 38.214 標準和論文：
 * "Performance Evaluation of Handover using A4 Event in LEO Satellites Network"
 * (Yu et al., 2022)
 *
 * 實現：
 * - A4 事件觸發機制（絕對閾值）
 * - 完整路徑損耗模型（FSPL + SF + CL）
 * - Time-to-Trigger (TTT) 機制
 */

import * as THREE from 'three';
import { HandoverState } from '@/types/handover';
import { SatelliteMetrics } from '@/utils/satellite/EnhancedHandoverManager';
import { calculatePathLoss, type PathLossBreakdown } from '@/utils/satellite/PathLossCalculator';

export class RSRPHandoverManager {
  private currentState: HandoverState;
  private phaseStartTime: number = 0;
  private lastHandoverTime: number = 0;

  // 3GPP A4 換手參數（基於論文 Section V）
  private readonly A4_THRESHOLD_DBM = -100;      // A4 絕對閾值 -100 dBm（論文測試值：-100, -101, -102）
  private readonly A4_OFFSET_DB = 0;             // A4 offset 0 dB（論文 Table II: Off = 0 dB）
  private readonly TIME_TO_TRIGGER_MS = 10000;   // Time-to-Trigger 10 秒（合理的 TTT 展示時間）
  private readonly HANDOVER_COOLDOWN = 12;       // 換手冷卻 12 秒（避免過於頻繁的換手）
  private readonly MIN_RSRP_DBM = -120;          // 最小可用 RSRP

  // 論文路徑損耗參數（Table II）
  private readonly FREQUENCY_GHZ = 2.0;          // S-band（論文使用 S-band）
  private readonly TX_POWER_DBM = 50.0;          // Satellite EIRP density 34 dBW/MHz ≈ 50 dBm

  // 階段持續時間（與 Enhanced 相同）
  private readonly PHASE_DURATIONS = {
    preparing: 12,
    selecting: 10,
    establishing: 12,
    switching: 12,
    completing: 4
  };

  private readonly UAV_POSITION = new THREE.Vector3(0, 10, 0);

  // A4 事件追蹤
  private eventStartTime: number | null = null;
  private eventTargetSatelliteId: string | null = null;

  constructor() {
    this.currentState = {
      phase: 'stable',
      currentSatelliteId: null,
      targetSatelliteId: null,
      candidateSatelliteIds: [],
      progress: 0,
      signalStrength: {
        current: 1.0,
        target: 0.0
      },
      a3Event: {
        active: false,
        eventType: 'A4',
        targetSatelliteId: null,
        elapsedTime: 0,
        requiredTime: this.TIME_TO_TRIGGER_MS / 1000,
        threshold: this.A4_THRESHOLD_DBM,
        candidatesAboveThreshold: []
      }
    };
  }

  /**
   * 更新換手狀態
   */
  update(
    visibleSatellites: Map<string, THREE.Vector3>,
    currentTime: number
  ): HandoverState {
    const metrics = this.calculateMetrics(visibleSatellites);

    if (metrics.length === 0) {
      this.resetState();
      return this.currentState;
    }

    // 初始連接
    if (!this.currentState.currentSatelliteId) {
      this.initializeConnection(metrics, currentTime);
      return this.currentState;
    }

    // 根據當前階段更新狀態
    switch (this.currentState.phase) {
      case 'stable':
        this.updateStablePhase(metrics, currentTime);
        break;
      case 'preparing':
        this.updatePreparingPhase(metrics, currentTime);
        break;
      case 'selecting':
        this.updateSelectingPhase(metrics, currentTime);
        break;
      case 'establishing':
        this.updateEstablishingPhase(metrics, currentTime);
        break;
      case 'switching':
        this.updateSwitchingPhase(metrics, currentTime);
        break;
      case 'completing':
        this.updateCompletingPhase(metrics, currentTime);
        break;
    }

    // 在所有階段都持續更新 A4 候選列表（用於側邊欄顯示）
    this.updateA4CandidatesList(metrics);

    return this.currentState;
  }

  /**
   * 穩定階段：使用 A4 事件檢測（基於論文）
   */
  private updateStablePhase(metrics: SatelliteMetrics[], currentTime: number) {
    const current = metrics.find(m => m.satelliteId === this.currentState.currentSatelliteId);

    if (!current) {
      this.initializeConnection(metrics, currentTime);
      return;
    }

    // A4 事件檢查：找出所有超過閾值的鄰居衛星（排除當前）
    // 條件：Mn + Offset > Threshold
    const candidatesAboveThreshold = metrics
      .filter(m =>
        m.satelliteId !== this.currentState.currentSatelliteId &&
        m.rsrp &&
        (m.rsrp + this.A4_OFFSET_DB) > this.A4_THRESHOLD_DBM
      )
      .map(m => ({
        satelliteId: m.satelliteId,
        rsrp: m.rsrp!
      }))
      .sort((a, b) => b.rsrp - a.rsrp); // 按 RSRP 排序，最高的在前

    // 檢查是否可以啟動事件：有候選衛星且冷卻時間已過
    const canStartEvent = candidatesAboveThreshold.length > 0 &&
                          currentTime - this.lastHandoverTime > this.HANDOVER_COOLDOWN;

    if (canStartEvent) {
      const bestCandidate = candidatesAboveThreshold[0];

      // A4 事件開始
      if (this.eventStartTime === null) {
        this.eventStartTime = currentTime;
        this.eventTargetSatelliteId = bestCandidate.satelliteId;
      }

      // 更新最佳候選（允許動態變化）
      this.eventTargetSatelliteId = bestCandidate.satelliteId;

      // 更新 A4 事件狀態（active = true）
      const elapsedTime = currentTime - this.eventStartTime;
      this.currentState.a3Event = {
        active: true,
        eventType: 'A4',
        targetSatelliteId: this.eventTargetSatelliteId,
        elapsedTime: elapsedTime,
        requiredTime: this.TIME_TO_TRIGGER_MS / 1000,
        threshold: this.A4_THRESHOLD_DBM,
        candidatesAboveThreshold: candidatesAboveThreshold
      };

      // 檢查是否超過觸發時間（不要求是同一目標，只要持續有候選就可以）
      if (elapsedTime >= this.TIME_TO_TRIGGER_MS / 1000) {
        this.enterPreparingPhase(metrics, currentTime);
        this.eventStartTime = null;
        this.eventTargetSatelliteId = null;
        // 清空事件狀態（換手開始，不再顯示候選列表）
        this.currentState.a3Event = {
          active: false,
          eventType: 'A4',
          targetSatelliteId: null,
          elapsedTime: 0,
          requiredTime: this.TIME_TO_TRIGGER_MS / 1000,
          threshold: this.A4_THRESHOLD_DBM,
          candidatesAboveThreshold: []
        };
      }
    } else {
      // 事件未啟動或取消（但仍然顯示候選衛星列表）
      if (this.eventStartTime !== null) {
        this.eventStartTime = null;
        this.eventTargetSatelliteId = null;
      }
      // 更新監測狀態（active = false，但保留候選衛星列表）
      this.currentState.a3Event = {
        active: false,
        eventType: 'A4',
        targetSatelliteId: null,
        elapsedTime: 0,
        requiredTime: this.TIME_TO_TRIGGER_MS / 1000,
        threshold: this.A4_THRESHOLD_DBM,
        candidatesAboveThreshold: candidatesAboveThreshold  // 保留候選列表用於顯示
      };
    }
  }

  /**
   * 更新 A4 候選列表（在所有階段都執行）
   */
  private updateA4CandidatesList(metrics: SatelliteMetrics[]) {
    // 計算所有超過 A4 閾值的候選衛星（排除當前）
    const candidatesAboveThreshold = metrics
      .filter(m =>
        m.satelliteId !== this.currentState.currentSatelliteId &&
        m.rsrp &&
        (m.rsrp + this.A4_OFFSET_DB) > this.A4_THRESHOLD_DBM
      )
      .map(m => ({
        satelliteId: m.satelliteId,
        rsrp: m.rsrp!
      }));

    // 找出最佳候選（RSRP 最高）
    const bestCandidate = candidatesAboveThreshold.length > 0
      ? candidatesAboveThreshold.reduce((best, current) =>
          current.rsrp > best.rsrp ? current : best
        )
      : null;

    // 按衛星編號排序（提取數字部分進行比較）
    candidatesAboveThreshold.sort((a, b) => {
      const numA = parseInt(a.satelliteId.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.satelliteId.replace(/\D/g, '')) || 0;
      return numA - numB;
    });

    // 更新 a3Event 中的候選列表，保持其他屬性不變
    if (this.currentState.a3Event) {
      this.currentState.a3Event = {
        ...this.currentState.a3Event,
        candidatesAboveThreshold: candidatesAboveThreshold,
        bestCandidateId: bestCandidate?.satelliteId || null,
        threshold: this.A4_THRESHOLD_DBM
      };
    }
  }

  /**
   * 找出最佳鄰居衛星（排除當前）
   */
  private findBestNeighbor(metrics: SatelliteMetrics[], current: SatelliteMetrics): SatelliteMetrics | null {
    const neighbors = metrics.filter(m => m.satelliteId !== current.satelliteId);
    if (neighbors.length === 0) return null;

    return neighbors.reduce((best, m) => m.rsrp > best.rsrp ? m : best);
  }

  /**
   * 準備階段
   */
  private updatePreparingPhase(metrics: SatelliteMetrics[], currentTime: number) {
    const elapsed = currentTime - this.phaseStartTime;
    this.currentState.progress = Math.min(elapsed / this.PHASE_DURATIONS.preparing, 1.0);

    const current = metrics.find(m => m.satelliteId === this.currentState.currentSatelliteId);

    // 更新候選列表（按 RSRP 排序，前 6 名）
    const candidates = metrics
      .filter(m => m.satelliteId !== this.currentState.currentSatelliteId)
      .sort((a, b) => b.rsrp - a.rsrp)
      .slice(0, 6)
      .map(m => m.satelliteId);

    this.currentState.candidateSatelliteIds = candidates;

    // 當前衛星訊號開始緩慢減弱
    if (current) {
      this.currentState.signalStrength.current = 1.0 - (this.currentState.progress * 0.2);
    }

    // 階段完成，進入選擇階段
    if (this.currentState.progress >= 1.0) {
      this.enterSelectingPhase(metrics, currentTime);
    }
  }

  /**
   * 選擇階段：選擇 RSRP 最高的候選
   */
  private updateSelectingPhase(metrics: SatelliteMetrics[], currentTime: number) {
    const elapsed = currentTime - this.phaseStartTime;
    this.currentState.progress = Math.min(elapsed / this.PHASE_DURATIONS.selecting, 1.0);

    // 確保有目標（RSRP 最高者）
    if (!this.currentState.targetSatelliteId && this.currentState.candidateSatelliteIds.length > 0) {
      const targetId = this.currentState.candidateSatelliteIds[0]; // 已按 RSRP 排序
      this.currentState.targetSatelliteId = targetId;

      const target = metrics.find(m => m.satelliteId === targetId);
      const current = metrics.find(m => m.satelliteId === this.currentState.currentSatelliteId);

      // console.log(`🎯 選擇目標: ${targetId} (RSRP=${target?.rsrp.toFixed(1)} dBm vs 當前=${current?.rsrp.toFixed(1)} dBm)`);
    }

    // 目標訊號緩慢開始增強
    this.currentState.signalStrength.target = this.currentState.progress * 0.3;

    // 當前訊號輕微減弱
    this.currentState.signalStrength.current = 0.8 - (this.currentState.progress * 0.1);

    // 階段完成
    if (this.currentState.progress >= 1.0) {
      this.enterEstablishingPhase(currentTime);
    }
  }

  /**
   * 建立階段
   */
  private updateEstablishingPhase(metrics: SatelliteMetrics[], currentTime: number) {
    const elapsed = currentTime - this.phaseStartTime;
    this.currentState.progress = Math.min(elapsed / this.PHASE_DURATIONS.establishing, 1.0);

    // 目標訊號緩慢持續增強（0.3 → 0.6）
    this.currentState.signalStrength.target = 0.3 + (this.currentState.progress * 0.3);

    // 當前訊號緩慢持續減弱（0.7 → 0.4）
    this.currentState.signalStrength.current = 0.7 - (this.currentState.progress * 0.3);

    // 階段完成
    if (this.currentState.progress >= 1.0) {
      this.enterSwitchingPhase(currentTime);
    }
  }

  /**
   * 切換階段
   */
  private updateSwitchingPhase(_metrics: SatelliteMetrics[], currentTime: number) {
    const elapsed = currentTime - this.phaseStartTime;
    this.currentState.progress = Math.min(elapsed / this.PHASE_DURATIONS.switching, 1.0);

    // 平滑的交叉淡入淡出（0.4 → 0, 0.6 → 1.0）
    this.currentState.signalStrength.current = 0.4 * (1 - this.currentState.progress);
    this.currentState.signalStrength.target = 0.6 + (this.currentState.progress * 0.4);

    // 階段完成
    if (this.currentState.progress >= 1.0) {
      this.enterCompletingPhase(currentTime);
    }
  }

  /**
   * 完成階段
   */
  private updateCompletingPhase(_metrics: SatelliteMetrics[], currentTime: number) {
    const elapsed = currentTime - this.phaseStartTime;
    this.currentState.progress = Math.min(elapsed / this.PHASE_DURATIONS.completing, 1.0);

    // 目標訊號達到最大
    this.currentState.signalStrength.target = 1.0;
    this.currentState.signalStrength.current = 0;

    // 階段完成
    if (this.currentState.progress >= 1.0) {
      this.completeHandover();
    }
  }

  // 階段切換方法
  private enterPreparingPhase(metrics: SatelliteMetrics[], currentTime: number) {
    this.currentState.phase = 'preparing';
    this.phaseStartTime = currentTime;
    this.currentState.progress = 0;

    const candidates = metrics
      .filter(m => m.satelliteId !== this.currentState.currentSatelliteId)
      .sort((a, b) => b.rsrp - a.rsrp)
      .slice(0, 6)
      .map(m => m.satelliteId);

    this.currentState.candidateSatelliteIds = candidates;
    // console.log(`🔄 進入換手準備階段，候選衛星(${candidates.length}): ${candidates.join(', ')}`);
  }

  private enterSelectingPhase(metrics: SatelliteMetrics[], currentTime: number) {
    this.currentState.phase = 'selecting';
    this.phaseStartTime = currentTime;
    this.currentState.progress = 0;

    if (this.currentState.candidateSatelliteIds.length > 0) {
      this.currentState.targetSatelliteId = this.currentState.candidateSatelliteIds[0];
    }
  }

  private enterEstablishingPhase(currentTime: number) {
    this.currentState.phase = 'establishing';
    this.phaseStartTime = currentTime;
    this.currentState.progress = 0;
  }

  private enterSwitchingPhase(currentTime: number) {
    this.currentState.phase = 'switching';
    this.phaseStartTime = currentTime;
    this.currentState.progress = 0;
    // console.log(`🔀 開始切換連接`);
  }

  private enterCompletingPhase(currentTime: number) {
    this.currentState.phase = 'completing';
    this.phaseStartTime = currentTime;
    this.currentState.progress = 0;
  }

  private completeHandover() {
    // console.log(`✅ 換手完成: ${this.currentState.currentSatelliteId} → ${this.currentState.targetSatelliteId}`);

    this.currentState.currentSatelliteId = this.currentState.targetSatelliteId;
    this.currentState.targetSatelliteId = null;
    this.currentState.candidateSatelliteIds = [];
    this.currentState.phase = 'stable';
    this.currentState.progress = 0;
    this.currentState.signalStrength = {
      current: 1.0,
      target: 0.0
    };
    this.lastHandoverTime = this.phaseStartTime;
  }

  private initializeConnection(metrics: SatelliteMetrics[], currentTime: number) {
    const best = metrics.reduce((a, b) => b.rsrp > a.rsrp ? b : a);
    this.currentState = {
      phase: 'stable',
      currentSatelliteId: best.satelliteId,
      targetSatelliteId: null,
      candidateSatelliteIds: [],
      progress: 0,
      signalStrength: {
        current: 1.0,
        target: 0.0
      },
      a3Event: {
        active: false,
        eventType: 'A4',
        targetSatelliteId: null,
        elapsedTime: 0,
        requiredTime: this.TIME_TO_TRIGGER_MS / 1000,
        threshold: this.A4_THRESHOLD_DBM,
        candidatesAboveThreshold: []
      }
    };
    this.lastHandoverTime = currentTime;
  }

  private resetState() {
    this.currentState = {
      phase: 'stable',
      currentSatelliteId: null,
      targetSatelliteId: null,
      candidateSatelliteIds: [],
      progress: 0,
      signalStrength: {
        current: 1.0,
        target: 0.0
      },
      a3Event: {
        active: false,
        eventType: 'A4',
        targetSatelliteId: null,
        elapsedTime: 0,
        requiredTime: this.TIME_TO_TRIGGER_MS / 1000,
        threshold: this.A4_THRESHOLD_DBM,
        candidatesAboveThreshold: []
      }
    };
    this.eventStartTime = null;
    this.eventTargetSatelliteId = null;
  }

  /**
   * 計算衛星指標（包含 RSRP）- 使用完整路徑損耗模型
   */
  private calculateMetrics(visibleSatellites: Map<string, THREE.Vector3>): SatelliteMetrics[] {
    const metrics: SatelliteMetrics[] = [];

    visibleSatellites.forEach((position, satelliteId) => {
      const distance = this.UAV_POSITION.distanceTo(position);

      // 計算仰角
      const dx = position.x - this.UAV_POSITION.x;
      const dy = position.y - this.UAV_POSITION.y;
      const dz = position.z - this.UAV_POSITION.z;
      const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
      const elevation = Math.atan2(dy, horizontalDistance) * (180 / Math.PI);

      // 使用完整路徑損耗模型（FSPL + SF + CL）
      // 基於論文: Yu et al., 2022
      // PL = PLb = FSPL(d, fc) + SF + CL(α, fc)
      const pathLoss = calculatePathLoss(
        distance,
        elevation,
        this.FREQUENCY_GHZ,
        this.TX_POWER_DBM,
        true,  // useLOS: suburban scenario
        false  // useSF: 確定性模擬，不使用隨機 SF
      );

      const rsrp = pathLoss.rsrp;

      // 計算訊號品質（與 Enhanced 相同）
      const elevationFactor = Math.max(0, elevation / 90);
      const distanceFactor = Math.max(0, 1 - (distance / 2000));
      const signalQuality = elevationFactor * 0.7 + distanceFactor * 0.3;

      metrics.push({
        satelliteId,
        elevation,
        distance,
        signalQuality,
        rsrp // RSRP 使用完整路徑損耗模型計算
      });
    });

    return metrics;
  }

  getState(): HandoverState {
    return { ...this.currentState };
  }
}
