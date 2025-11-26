/**
 * RSRP-Based 換手管理器
 *
 * 基於 3GPP TS 38.214 標準的 RSRP 貪心算法
 * - 總是選擇 RSRP 值最高的衛星
 * - 添加換手遲滯（hysteresis）避免 ping-pong
 * - A3 事件觸發機制
 */

import * as THREE from 'three';
import { HandoverState } from '@/types/handover';
import { SatelliteMetrics } from '@/utils/satellite/EnhancedHandoverManager';

export class RSRPHandoverManager {
  private currentState: HandoverState;
  private phaseStartTime: number = 0;
  private lastHandoverTime: number = 0;

  // 3GPP A3 換手參數
  private readonly RSRP_HYSTERESIS_DB = 3.0;     // 遲滯值 3 dB
  private readonly TIME_TO_TRIGGER_MS = 5000;    // 觸發時間 5 秒
  private readonly HANDOVER_COOLDOWN = 5;        // 換手冷卻 5 秒
  private readonly MIN_RSRP_DBM = -120;          // 最小可用 RSRP

  // 階段持續時間（與 Enhanced 相同）
  private readonly PHASE_DURATIONS = {
    preparing: 12,
    selecting: 10,
    establishing: 12,
    switching: 12,
    completing: 4
  };

  private readonly UAV_POSITION = new THREE.Vector3(0, 10, 0);

  // A3 事件追蹤
  private a3EventStartTime: number | null = null;
  private a3TargetSatelliteId: string | null = null;

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

    return this.currentState;
  }

  /**
   * 穩定階段：使用 A3 事件檢測
   */
  private updateStablePhase(metrics: SatelliteMetrics[], currentTime: number) {
    const current = metrics.find(m => m.satelliteId === this.currentState.currentSatelliteId);

    if (!current) {
      this.initializeConnection(metrics, currentTime);
      return;
    }

    // 檢查 A3 事件：鄰居 RSRP > 服務 RSRP + hysteresis
    const bestNeighbor = this.findBestNeighbor(metrics, current);

    if (bestNeighbor &&
        bestNeighbor.rsrp > current.rsrp + this.RSRP_HYSTERESIS_DB &&
        currentTime - this.lastHandoverTime > this.HANDOVER_COOLDOWN) {

      // A3 事件開始
      if (this.a3EventStartTime === null) {
        this.a3EventStartTime = currentTime;
        this.a3TargetSatelliteId = bestNeighbor.satelliteId;
        console.log(`🔔 A3 事件開始: 鄰居 ${bestNeighbor.satelliteId} RSRP=${bestNeighbor.rsrp.toFixed(1)} dBm > 當前 ${current.rsrp.toFixed(1)} dBm + ${this.RSRP_HYSTERESIS_DB} dB`);
      }
      // 檢查是否同一目標且超過觸發時間
      else if (this.a3TargetSatelliteId === bestNeighbor.satelliteId &&
               (currentTime - this.a3EventStartTime) * 1000 >= this.TIME_TO_TRIGGER_MS) {
        console.log(`✅ A3 事件觸發: Time-to-Trigger ${this.TIME_TO_TRIGGER_MS}ms 已滿足`);
        this.enterPreparingPhase(metrics, currentTime);
        this.a3EventStartTime = null;
        this.a3TargetSatelliteId = null;
      }
    } else {
      // 重置 A3 事件
      if (this.a3EventStartTime !== null) {
        console.log(`❌ A3 事件取消: 條件不再滿足`);
        this.a3EventStartTime = null;
        this.a3TargetSatelliteId = null;
      }
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

      console.log(`🎯 選擇目標: ${targetId} (RSRP=${target?.rsrp.toFixed(1)} dBm vs 當前=${current?.rsrp.toFixed(1)} dBm)`);
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
    console.log(`🔄 進入換手準備階段，候選衛星(${candidates.length}): ${candidates.join(', ')}`);
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
    console.log(`🔀 開始切換連接`);
  }

  private enterCompletingPhase(currentTime: number) {
    this.currentState.phase = 'completing';
    this.phaseStartTime = currentTime;
    this.currentState.progress = 0;
  }

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
      }
    };
    this.lastHandoverTime = currentTime;
    console.log(`📶 初始連接 (RSRP-Based): ${best.satelliteId} (RSRP=${best.rsrp.toFixed(1)} dBm)`);
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
      }
    };
    this.a3EventStartTime = null;
    this.a3TargetSatelliteId = null;
  }

  /**
   * 計算衛星指標（包含 RSRP）
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

      // 簡化的 RSRP 估算（基於自由空間路徑損耗）
      // RSRP = Tx_Power - FSPL
      // FSPL = 20*log10(d) + 20*log10(f) + 32.45
      // 假設：Tx_Power = 50 dBm, f = 2 GHz (Starlink Ku band)
      const frequency_ghz = 2.0;
      const tx_power_dbm = 50.0;
      const fspl_db = 20 * Math.log10(distance) + 20 * Math.log10(frequency_ghz) + 32.45;
      const rsrp = tx_power_dbm - fspl_db;

      // 計算訊號品質（與 Enhanced 相同）
      const elevationFactor = Math.max(0, elevation / 90);
      const distanceFactor = Math.max(0, 1 - (distance / 2000));
      const signalQuality = elevationFactor * 0.7 + distanceFactor * 0.3;

      metrics.push({
        satelliteId,
        elevation,
        distance,
        signalQuality,
        rsrp // 添加 RSRP 字段
      });
    });

    return metrics;
  }

  getState(): HandoverState {
    return { ...this.currentState };
  }
}
