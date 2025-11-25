import * as THREE from 'three';
import { HandoverState, HandoverPhase, SatelliteMetrics } from '@/types/handover';

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

  // 換手參數（大幅提早觸發，延長整個過程）
  private readonly TRIGGER_ELEVATION = 45;      // 開始尋找候選（度）- 更早觸發
  private readonly PREPARING_ELEVATION = 30;    // 進入準備階段（度）
  private readonly EXECUTE_ELEVATION = 20;      // 執行換手（度）
  private readonly HANDOVER_COOLDOWN = 5;       // 換手冷卻（秒）

  // 階段持續時間（大幅延長以清楚展示整個換手流程）
  private readonly PHASE_DURATIONS = {
    preparing: 12,     // 準備階段 12 秒（顯示多個候選，訊號逐漸減弱）
    selecting: 10,     // 選擇階段 10 秒（從候選中挑選最佳目標）
    establishing: 12,  // 建立階段 12 秒（目標訊號逐漸建立增強）
    switching: 12,     // 切換階段 12 秒（平滑過渡，訊號轉移）
    completing: 4      // 完成階段 4 秒（穩定新連接）
  };

  private readonly UAV_POSITION = new THREE.Vector3(0, 10, 0);

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

    // 檢查是否需要開始尋找候選
    if (current.elevation < this.TRIGGER_ELEVATION &&
        currentTime - this.lastHandoverTime > this.HANDOVER_COOLDOWN) {
      this.enterPreparingPhase(metrics, currentTime);
    }
  }

  /**
   * 準備階段：顯示多個候選衛星
   */
  private updatePreparingPhase(metrics: SatelliteMetrics[], currentTime: number) {
    const elapsed = currentTime - this.phaseStartTime;
    this.currentState.progress = Math.min(elapsed / this.PHASE_DURATIONS.preparing, 1.0);

    const current = metrics.find(m => m.satelliteId === this.currentState.currentSatelliteId);

    // 更新候選列表（排除當前衛星，選擇前6名以展示更豐富的視覺效果）
    const candidates = metrics
      .filter(m => m.satelliteId !== this.currentState.currentSatelliteId)
      .sort((a, b) => b.signalQuality - a.signalQuality)
      .slice(0, 6)
      .map(m => m.satelliteId);

    this.currentState.candidateSatelliteIds = candidates;

    // 當前衛星訊號開始緩慢減弱（更平緩的曲線）
    if (current) {
      this.currentState.signalStrength.current = 1.0 - (this.currentState.progress * 0.2);
    }

    // 階段完成或仰角過低，進入選擇階段
    if (this.currentState.progress >= 1.0 ||
        (current && current.elevation < this.PREPARING_ELEVATION)) {
      this.enterSelectingPhase(metrics, currentTime);
    }
  }

  /**
   * 選擇階段：確定最佳換手目標
   */
  private updateSelectingPhase(metrics: SatelliteMetrics[], currentTime: number) {
    const elapsed = currentTime - this.phaseStartTime;
    this.currentState.progress = Math.min(elapsed / this.PHASE_DURATIONS.selecting, 1.0);

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
    this.currentState.progress = Math.min(elapsed / this.PHASE_DURATIONS.establishing, 1.0);

    // 目標訊號緩慢持續增強（0.3 → 0.6）
    this.currentState.signalStrength.target = 0.3 + (this.currentState.progress * 0.3);

    // 當前訊號緩慢持續減弱（0.7 → 0.4）
    this.currentState.signalStrength.current = 0.7 - (this.currentState.progress * 0.3);

    const current = metrics.find(m => m.satelliteId === this.currentState.currentSatelliteId);

    // 階段完成或當前衛星仰角過低，進入切換階段
    if (this.currentState.progress >= 1.0 ||
        (current && current.elevation < this.EXECUTE_ELEVATION)) {
      this.enterSwitchingPhase(currentTime);
    }
  }

  /**
   * 切換階段：平滑切換連接
   */
  private updateSwitchingPhase(_metrics: SatelliteMetrics[], currentTime: number) {
    const elapsed = currentTime - this.phaseStartTime;
    this.currentState.progress = Math.min(elapsed / this.PHASE_DURATIONS.switching, 1.0);

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
    this.currentState.progress = Math.min(elapsed / this.PHASE_DURATIONS.completing, 1.0);

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

    // 找出候選衛星（前6名，排除當前）
    const candidates = metrics
      .filter(m => m.satelliteId !== this.currentState.currentSatelliteId)
      .sort((a, b) => b.signalQuality - a.signalQuality)
      .slice(0, 6)
      .map(m => m.satelliteId);

    this.currentState.candidateSatelliteIds = candidates;
    console.log(`🔄 進入換手準備階段，候選衛星(${candidates.length}): ${candidates.join(', ')}`);
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
      console.log(`🎯 選擇換手目標: ${this.currentState.targetSatelliteId}`);
    }
  }

  /**
   * 進入建立階段
   */
  private enterEstablishingPhase(currentTime: number) {
    this.currentState.phase = 'establishing';
    this.phaseStartTime = currentTime;
    this.currentState.progress = 0;
    console.log(`📡 建立與目標衛星的連接`);
  }

  /**
   * 進入切換階段
   */
  private enterSwitchingPhase(currentTime: number) {
    this.currentState.phase = 'switching';
    this.phaseStartTime = currentTime;
    this.currentState.progress = 0;
    console.log(`🔀 開始切換連接`);
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
    console.log(`✅ 換手完成: ${this.currentState.currentSatelliteId} → ${this.currentState.targetSatelliteId}`);

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
    console.log(`📶 初始連接: ${best.satelliteId}`);
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

    visibleSatellites.forEach((position, satelliteId) => {
      const distance = this.UAV_POSITION.distanceTo(position);

      // 計算仰角
      const dx = position.x - this.UAV_POSITION.x;
      const dy = position.y - this.UAV_POSITION.y;
      const dz = position.z - this.UAV_POSITION.z;
      const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
      const elevation = Math.atan2(dy, horizontalDistance) * (180 / Math.PI);

      // 計算訊號品質（基於仰角和距離）
      const elevationFactor = Math.max(0, elevation / 90);
      const distanceFactor = Math.max(0, 1 - (distance / 2000));
      const signalQuality = elevationFactor * 0.7 + distanceFactor * 0.3;

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
