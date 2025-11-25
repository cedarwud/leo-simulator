import * as THREE from 'three';

interface SatelliteMetrics {
  satelliteId: string;
  position: THREE.Vector3;
  distance: number;
  elevation: number;  // 仰角
}

/**
 * 換手管理器
 *
 * 負責：
 * 1. 選擇最佳衛星連接
 * 2. 偵測換手條件
 * 3. 決定換手目標
 */
export class HandoverManager {
  private currentSatelliteId: string | null = null;
  private handoverTargetId: string | null = null;
  private lastHandoverTime: number = 0;

  // 換手參數（基於 orbit-engine/docs/satellite_handover_standards.md）
  private readonly HANDOVER_TRIGGER_ELEVATION = 15;  // 預備觸發門檻（度）
  private readonly HANDOVER_EXECUTE_ELEVATION = 10;  // 執行門檻（度）
  private readonly HANDOVER_CRITICAL_ELEVATION = 5;  // 臨界門檻（度）
  private readonly HANDOVER_COOLDOWN = 5;            // 換手冷卻時間（秒）
  private readonly UAV_POSITION = new THREE.Vector3(0, 10, 0); // UAV 固定位置

  /**
   * 更新連接狀態
   *
   * @param visibleSatellites - 可見衛星位置集合
   * @param currentTime - 當前時間（秒）
   * @returns 更新後的連接狀態
   */
  update(
    visibleSatellites: Map<string, THREE.Vector3>,
    currentTime: number
  ): {
    activeSatelliteId: string | null;
    handoverTargetId: string | null;
  } {
    // 計算所有可見衛星的指標
    const metrics = this.calculateSatelliteMetrics(visibleSatellites);

    // 如果沒有可見衛星，斷開連接
    if (metrics.length === 0) {
      this.currentSatelliteId = null;
      this.handoverTargetId = null;
      return {
        activeSatelliteId: null,
        handoverTargetId: null
      };
    }

    // 如果沒有當前連接，選擇最佳衛星
    if (!this.currentSatelliteId) {
      this.currentSatelliteId = this.selectBestSatellite(metrics).satelliteId;
      this.handoverTargetId = null;
      this.lastHandoverTime = currentTime;
      return {
        activeSatelliteId: this.currentSatelliteId,
        handoverTargetId: null
      };
    }

    // 檢查當前衛星是否仍然可見
    const currentMetrics = metrics.find(m => m.satelliteId === this.currentSatelliteId);
    if (!currentMetrics) {
      // 當前衛星不可見，立即換手到最佳衛星
      this.currentSatelliteId = this.selectBestSatellite(metrics).satelliteId;
      this.handoverTargetId = null;
      this.lastHandoverTime = currentTime;
      return {
        activeSatelliteId: this.currentSatelliteId,
        handoverTargetId: null
      };
    }

    // 檢查換手狀態
    // 階段 1: 仰角 < 15° → 進入準備階段，顯示換手目標（黃色虛線）
    if (currentMetrics.elevation < this.HANDOVER_TRIGGER_ELEVATION) {
      // 選擇換手目標（排除當前衛星）
      const candidateMetrics = metrics.filter(m => m.satelliteId !== this.currentSatelliteId);

      if (candidateMetrics.length > 0) {
        const target = this.selectBestSatellite(candidateMetrics);

        // 只有在換手目標顯著優於當前衛星時才設置
        // 或當前衛星仰角過低時必須設置
        if (!this.handoverTargetId ||
            target.elevation - currentMetrics.elevation > 5 ||
            currentMetrics.elevation < this.HANDOVER_EXECUTE_ELEVATION) {
          this.handoverTargetId = target.satelliteId;
        }

        // 階段 2: 仰角 < 10° → 執行換手
        if (currentMetrics.elevation < this.HANDOVER_EXECUTE_ELEVATION &&
            currentTime - this.lastHandoverTime >= this.HANDOVER_COOLDOWN) {
          this.currentSatelliteId = this.handoverTargetId;
          this.handoverTargetId = null;
          this.lastHandoverTime = currentTime;
        }
      }
    } else {
      // 仰角正常，取消換手準備
      this.handoverTargetId = null;
    }

    return {
      activeSatelliteId: this.currentSatelliteId,
      handoverTargetId: this.handoverTargetId
    };
  }

  /**
   * 計算衛星指標
   */
  private calculateSatelliteMetrics(
    visibleSatellites: Map<string, THREE.Vector3>
  ): SatelliteMetrics[] {
    const metrics: SatelliteMetrics[] = [];

    visibleSatellites.forEach((position, satelliteId) => {
      const distance = this.UAV_POSITION.distanceTo(position);

      // 計算仰角（elevation）
      const dx = position.x - this.UAV_POSITION.x;
      const dy = position.y - this.UAV_POSITION.y;
      const dz = position.z - this.UAV_POSITION.z;
      const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
      const elevation = Math.atan2(dy, horizontalDistance) * (180 / Math.PI);

      metrics.push({
        satelliteId,
        position,
        distance,
        elevation
      });
    });

    return metrics;
  }

  /**
   * 選擇最佳衛星（仰角最高）
   */
  private selectBestSatellite(metrics: SatelliteMetrics[]): SatelliteMetrics {
    return metrics.reduce((best, current) =>
      current.elevation > best.elevation ? current : best
    );
  }

  /**
   * 重置狀態
   */
  reset() {
    this.currentSatelliteId = null;
    this.handoverTargetId = null;
    this.lastHandoverTime = 0;
  }
}
