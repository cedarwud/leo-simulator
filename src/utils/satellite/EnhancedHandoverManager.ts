import * as THREE from 'three';
import { HandoverState, HandoverPhase, SatelliteMetrics as SatelliteMetricsType } from '@/types/handover';

// 重新導出 SatelliteMetrics 供外部使用
export type SatelliteMetrics = SatelliteMetricsType;

/**
 * Geometric 換手配置介面
 */
export interface GeometricHandoverConfig {
  // 核心決策參數
  elevationWeight: number;        // 仰角權重 (0.5-0.9)
  triggerElevation: number;       // 觸發仰角 (30-60)
  handoverCooldown: number;       // 冷卻時間 (3-15)

  // 視覺參數
  animationSpeed: 'fast' | 'normal' | 'slow';
  candidateCount: number;         // 候選數量 (3-10)

  // 高級參數（可選）
  preparingElevation?: number;    // 準備階段仰角 (20-50)
  executeElevation?: number;      // 執行仰角 (10-30)
  maxDistance?: number;           // 最大距離歸一化 (1000-3000)
}

/**
 * 預設配置
 */
const DEFAULT_CONFIG: GeometricHandoverConfig = {
  elevationWeight: 0.7,
  triggerElevation: 45,
  handoverCooldown: 5,
  animationSpeed: 'normal',
  candidateCount: 6,
  preparingElevation: 30,
  executeElevation: 20,
  maxDistance: 2000
};

/**
 * 增強版換手管理器
 *
 * 實現多階段換手動畫：
 * 1. stable - 穩定連接
 * 2. preparing - 顯示多個候選衛星（虛線）
 * 3. selecting - 選擇最佳目標（高亮一條）
 * 4. establishing - 建立新連接（目標訊號增強）
 * 5. switching - 切換連接（舊連接減弱）
 * 6. completing - 完成換手
 */
export class EnhancedHandoverManager {
  private currentState: HandoverState = {
    phase: 'stable',
    currentSatelliteId: null,
    targetSatelliteId: null,
    candidateSatelliteIds: [],
    progress: 0,
    signalStrength: {
      current: 1.0,
      target: 0.0
    }
  };

  private phaseStartTime: number = 0;
  private lastHandoverTime: number = 0;

  // 可配置參數
  private config: GeometricHandoverConfig = DEFAULT_CONFIG;

  // 階段持續時間映射
  private readonly ANIMATION_SPEED_MAP = {
    fast: {
      preparing: 3,
      selecting: 2,
      establishing: 3,
      switching: 3,
      completing: 1
    },
    normal: {
      preparing: 12,
      selecting: 10,
      establishing: 12,
      switching: 12,
      completing: 4
    },
    slow: {
      preparing: 20,
      selecting: 15,
      establishing: 20,
      switching: 20,
      completing: 5
    }
  };

  private readonly UAV_POSITION = new THREE.Vector3(0, 10, 0);

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<GeometricHandoverConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 獲取當前配置
   */
  getConfig(): GeometricHandoverConfig {
    return { ...this.config };
  }

  /**
   * 獲取當前階段持續時間
   */
  private getPhaseDurations() {
    return this.ANIMATION_SPEED_MAP[this.config.animationSpeed];
  }

  /**
   * 更新換手狀態
   */
  update(
    visibleSatellites: Map<string, THREE.Vector3>,
    currentTime: number
  ): HandoverState {
    // 計算所有衛星指標
    const metrics = this.calculateMetrics(visibleSatellites);

    // 沒有可見衛星
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

    return this.currentState;
  }

  /**
   * 穩定階段：正常連接，監控仰角
   */
  private updateStablePhase(metrics: SatelliteMetrics[], currentTime: number) {
    const current = metrics.find(m => m.satelliteId === this.currentState.currentSatelliteId);

    if (!current) {
      // 當前衛星消失，立即換手
      this.initializeConnection(metrics, currentTime);
      return;
    }

    // 檢查是否需要開始尋找候選（使用動態配置）
    if (current.elevation < this.config.triggerElevation &&
        currentTime - this.lastHandoverTime > this.config.handoverCooldown) {
      this.enterPreparingPhase(metrics, currentTime);
    }
  }

  /**
   * 準備階段：顯示多個候選衛星
   */
  private updatePreparingPhase(metrics: SatelliteMetrics[], currentTime: number) {
    const elapsed = currentTime - this.phaseStartTime;
    const durations = this.getPhaseDurations();
    this.currentState.progress = Math.min(elapsed / durations.preparing, 1.0);

    const current = metrics.find(m => m.satelliteId === this.currentState.currentSatelliteId);

    // 更新候選列表（使用動態配置的候選數量）
    const candidates = metrics
      .filter(m => m.satelliteId !== this.currentState.currentSatelliteId)
      .sort((a, b) => b.signalQuality - a.signalQuality)
      .slice(0, this.config.candidateCount)
      .map(m => m.satelliteId);

    this.currentState.candidateSatelliteIds = candidates;

    // 當前衛星訊號開始緩慢減弱（更平緩的曲線）
    if (current) {
      this.currentState.signalStrength.current = 1.0 - (this.currentState.progress * 0.2);
    }

    // 階段完成或仰角過低，進入選擇階段（使用動態配置）
    const preparingElevation = this.config.preparingElevation ?? 30;
    if (this.currentState.progress >= 1.0 ||
        (current && current.elevation < preparingElevation)) {
      this.enterSelectingPhase(metrics, currentTime);
    }
  }

  /**
   * 選擇階段：確定最佳換手目標
   */
  private updateSelectingPhase(metrics: SatelliteMetrics[], currentTime: number) {
    const elapsed = currentTime - this.phaseStartTime;
    const durations = this.getPhaseDurations();
    this.currentState.progress = Math.min(elapsed / durations.selecting, 1.0);

    // 確保有目標
    if (!this.currentState.targetSatelliteId && this.currentState.candidateSatelliteIds.length > 0) {
      this.currentState.targetSatelliteId = this.currentState.candidateSatelliteIds[0];
    }

    // 目標訊號緩慢開始增強（選擇階段只是初步測試連接）
    this.currentState.signalStrength.target = this.currentState.progress * 0.3;

    // 當前訊號輕微減弱
    this.currentState.signalStrength.current = 0.8 - (this.currentState.progress * 0.1);

    // 階段完成，進入建立階段
    if (this.currentState.progress >= 1.0) {
      this.enterEstablishingPhase(currentTime);
    }
  }

  /**
   * 建立階段：與目標衛星建立連接
   */
  private updateEstablishingPhase(metrics: SatelliteMetrics[], currentTime: number) {
    const elapsed = currentTime - this.phaseStartTime;
    const durations = this.getPhaseDurations();
    this.currentState.progress = Math.min(elapsed / durations.establishing, 1.0);

    // 目標訊號緩慢持續增強（0.3 → 0.6）
    this.currentState.signalStrength.target = 0.3 + (this.currentState.progress * 0.3);

    // 當前訊號緩慢持續減弱（0.7 → 0.4）
    this.currentState.signalStrength.current = 0.7 - (this.currentState.progress * 0.3);

    const current = metrics.find(m => m.satelliteId === this.currentState.currentSatelliteId);

    // 階段完成或當前衛星仰角過低，進入切換階段（使用動態配置）
    const executeElevation = this.config.executeElevation ?? 20;
    if (this.currentState.progress >= 1.0 ||
        (current && current.elevation < executeElevation)) {
      this.enterSwitchingPhase(currentTime);
    }
  }

  /**
   * 切換階段：平滑切換連接
   */
  private updateSwitchingPhase(_metrics: SatelliteMetrics[], currentTime: number) {
    const elapsed = currentTime - this.phaseStartTime;
    const durations = this.getPhaseDurations();
    this.currentState.progress = Math.min(elapsed / durations.switching, 1.0);

    // 平滑的交叉淡入淡出（0.4 → 0, 0.6 → 1.0）
    this.currentState.signalStrength.current = 0.4 * (1 - this.currentState.progress);
    this.currentState.signalStrength.target = 0.6 + (this.currentState.progress * 0.4);

    // 階段完成，進入完成階段
    if (this.currentState.progress >= 1.0) {
      this.enterCompletingPhase(currentTime);
    }
  }

  /**
   * 完成階段：完成換手
   */
  private updateCompletingPhase(_metrics: SatelliteMetrics[], currentTime: number) {
    const elapsed = currentTime - this.phaseStartTime;
    const durations = this.getPhaseDurations();
    this.currentState.progress = Math.min(elapsed / durations.completing, 1.0);

    // 新連接訊號達到最大
    this.currentState.signalStrength.target = 0.9 + (this.currentState.progress * 0.1);

    // 階段完成，回到穩定狀態
    if (this.currentState.progress >= 1.0) {
      this.completeHandover();
    }
  }

  /**
   * 進入準備階段
   */
  private enterPreparingPhase(metrics: SatelliteMetrics[], currentTime: number) {
    this.currentState.phase = 'preparing';
    this.phaseStartTime = currentTime;
    this.currentState.progress = 0;

    // 找出候選衛星（使用動態配置的候選數量，排除當前）
    const candidates = metrics
      .filter(m => m.satelliteId !== this.currentState.currentSatelliteId)
      .sort((a, b) => b.signalQuality - a.signalQuality)
      .slice(0, this.config.candidateCount)
      .map(m => m.satelliteId);

    this.currentState.candidateSatelliteIds = candidates;
    // console.log(`🔄 Enter preparing phase, candidates(${candidates.length}): ${candidates.join(', ')}`);
  }

  /**
   * 進入選擇階段
   */
  private enterSelectingPhase(metrics: SatelliteMetrics[], currentTime: number) {
    this.currentState.phase = 'selecting';
    this.phaseStartTime = currentTime;
    this.currentState.progress = 0;

    // 選擇最佳候選
    if (this.currentState.candidateSatelliteIds.length > 0) {
      this.currentState.targetSatelliteId = this.currentState.candidateSatelliteIds[0];
      // console.log(`🎯 Select handover target: ${this.currentState.targetSatelliteId}`);
    }
  }

  /**
   * 進入建立階段
   */
  private enterEstablishingPhase(currentTime: number) {
    this.currentState.phase = 'establishing';
    this.phaseStartTime = currentTime;
    this.currentState.progress = 0;
    // console.log(`📡 Establishing connection with target satellite`);
  }

  /**
   * 進入切換階段
   */
  private enterSwitchingPhase(currentTime: number) {
    this.currentState.phase = 'switching';
    this.phaseStartTime = currentTime;
    this.currentState.progress = 0;
    // console.log(`🔀 Start switching connection`);
  }

  /**
   * 進入完成階段
   */
  private enterCompletingPhase(currentTime: number) {
    this.currentState.phase = 'completing';
    this.phaseStartTime = currentTime;
    this.currentState.progress = 0;
  }

  /**
   * 完成換手
   */
  private completeHandover() {
    // console.log(`✅ Handover complete: ${this.currentState.currentSatelliteId} → ${this.currentState.targetSatelliteId}`);

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

  /**
   * 初始化連接
   */
  private initializeConnection(metrics: SatelliteMetrics[], currentTime: number) {
    const best = metrics.reduce((a, b) => b.signalQuality > a.signalQuality ? b : a);
    this.currentState = {
      phase: 'stable',
      currentSatelliteId: best.satelliteId,
      targetSatelliteId: null,
      candidateSatelliteIds: [],
      progress: 0,
      signalStrength: {
        current: 1.0,
        target: 0.0
      }
    };
    this.lastHandoverTime = currentTime;
    // console.log(`📶 Initial connection: ${best.satelliteId}`);
  }

  /**
   * 重置狀態
   */
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
      }
    };
  }

  /**
   * 計算衛星指標
   */
  private calculateMetrics(visibleSatellites: Map<string, THREE.Vector3>): SatelliteMetrics[] {
    const metrics: SatelliteMetrics[] = [];
    const maxDistance = this.config.maxDistance ?? 2000;

    visibleSatellites.forEach((position, satelliteId) => {
      const distance = this.UAV_POSITION.distanceTo(position);

      // 計算仰角
      const dx = position.x - this.UAV_POSITION.x;
      const dy = position.y - this.UAV_POSITION.y;
      const dz = position.z - this.UAV_POSITION.z;
      const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
      const elevation = Math.atan2(dy, horizontalDistance) * (180 / Math.PI);

      // 計算訊號品質（使用動態配置的權重）
      const elevationFactor = Math.max(0, elevation / 90);
      const distanceFactor = Math.max(0, 1 - (distance / maxDistance));
      const signalQuality = elevationFactor * this.config.elevationWeight +
                           distanceFactor * (1 - this.config.elevationWeight);

      metrics.push({
        satelliteId,
        elevation,
        distance,
        signalQuality
      });
    });

    return metrics;
  }

  /**
   * 獲取當前狀態
   */
  getState(): HandoverState {
    return { ...this.currentState };
  }
}
