/**
 * 可見性計算器（簡化版）
 *
 * ⚠️ 重要修改：
 * - 由於數據已經預篩選（is_visible 標誌），此類主要用於：
 *   1. 從 3D 位置反算可見性信息（用於調試/顯示）
 *   2. 應用額外的仰角門檻篩選
 *   3. 提供批量篩選功能
 *
 * - 不再需要複雜的 ECI → ECEF → Look Angles 轉換
 * - 前端只需簡單的幾何計算
 */

import { Vector3 } from 'three';

// ==================== 接口定義 ====================

/**
 * 可見性信息
 */
export interface VisibilityInfo {
  isVisible: boolean;        // 是否可見
  elevation: number;         // 仰角（度）
  azimuth: number;          // 方位角（度）
  range: number;            // 距離（公里）
}

/**
 * 分層仰角門檻（基於 ntn-stack 標準）
 */
export enum ElevationThreshold {
  CRITICAL = 5.0,      // 臨界門檻（最低可用）
  EXECUTION = 10.0,    // 執行門檻（標準篩選）
  PREPARATION = 15.0,  // 預備觸發（Handover 準備）
}

// ==================== 可見性計算器 ====================

export class VisibilityCalculator {
  private minElevation: number;

  /**
   * 建構子
   *
   * @param minElevation - 最小仰角門檻（度），預設 10°
   */
  constructor(minElevation: number = ElevationThreshold.EXECUTION) {
    this.minElevation = minElevation;
  }

  /**
   * 從 3D 位置計算可見性信息
   *
   * 注意：這是簡化的逆向計算，用於：
   * - 顯示當前衛星的仰角/方位角
   * - 調試座標轉換
   * - UI 顯示
   *
   * @param position - Three.js 3D 位置
   * @returns 可見性信息
   */
  calculateVisibilityFromPosition(position: Vector3): VisibilityInfo {
    // 場景參數（需與 SatelliteOrbitCalculator 一致）
    const skyBase = 200;

    // 計算水平距離（X-Z 平面）
    const horizontalDist = Math.sqrt(position.x ** 2 + position.z ** 2);

    // 計算仰角（簡化計算）
    // elevation = arctan((y - skyBase) / horizontalDist)
    const elevation = Math.atan2(position.y - skyBase, horizontalDist) * (180 / Math.PI);

    // 計算方位角
    // azimuth: 0° = 北（+Z），90° = 東（+X）
    let azimuth = Math.atan2(position.x, position.z) * (180 / Math.PI);

    // 確保方位角在 0-360° 範圍
    if (azimuth < 0) {
      azimuth += 360;
    }

    // 計算距離（簡化）
    const range = position.length() / 1000; // 假設場景單位是米，轉換為公里

    return {
      isVisible: elevation >= this.minElevation,
      elevation: Math.max(0, elevation), // 仰角不應為負（地平線以下）
      azimuth,
      range,
    };
  }

  /**
   * 批量篩選可見衛星
   *
   * @param satellites - 衛星位置 Map（id → position）
   * @returns 可見衛星的可見性信息 Map（id → VisibilityInfo）
   */
  filterVisibleSatellites(satellites: Map<string, Vector3>): Map<string, VisibilityInfo> {
    const visible = new Map<string, VisibilityInfo>();

    satellites.forEach((position, id) => {
      const vis = this.calculateVisibilityFromPosition(position);

      if (vis.isVisible) {
        visible.set(id, vis);
      }
    });

    return visible;
  }

  /**
   * 分層篩選（用於 Handover 決策）
   *
   * @param satellites - 衛星位置 Map
   * @returns 分層結果
   */
  filterByLayeredThreshold(satellites: Map<string, Vector3>): {
    critical: Map<string, VisibilityInfo>;     // >= 5°
    execution: Map<string, VisibilityInfo>;    // >= 10°
    preparation: Map<string, VisibilityInfo>;  // >= 15°
  } {
    const result = {
      critical: new Map<string, VisibilityInfo>(),
      execution: new Map<string, VisibilityInfo>(),
      preparation: new Map<string, VisibilityInfo>(),
    };

    satellites.forEach((position, id) => {
      const vis = this.calculateVisibilityFromPosition(position);

      if (vis.elevation >= ElevationThreshold.PREPARATION) {
        result.preparation.set(id, vis);
      }

      if (vis.elevation >= ElevationThreshold.EXECUTION) {
        result.execution.set(id, vis);
      }

      if (vis.elevation >= ElevationThreshold.CRITICAL) {
        result.critical.set(id, vis);
      }
    });

    return result;
  }

  /**
   * 找出最高仰角的衛星
   *
   * @param satellites - 衛星位置 Map
   * @returns 最高仰角的衛星 ID 和信息，如果沒有則返回 null
   */
  findHighestElevationSatellite(
    satellites: Map<string, Vector3>
  ): { id: string; info: VisibilityInfo } | null {
    let highestId: string | null = null;
    let highestElevation = -Infinity;
    let highestInfo: VisibilityInfo | null = null;

    satellites.forEach((position, id) => {
      const vis = this.calculateVisibilityFromPosition(position);

      if (vis.isVisible && vis.elevation > highestElevation) {
        highestElevation = vis.elevation;
        highestId = id;
        highestInfo = vis;
      }
    });

    if (highestId && highestInfo) {
      return { id: highestId, info: highestInfo };
    }

    return null;
  }

  /**
   * 找出最近的衛星
   *
   * @param satellites - 衛星位置 Map
   * @returns 最近的衛星 ID 和信息，如果沒有則返回 null
   */
  findClosestSatellite(
    satellites: Map<string, Vector3>
  ): { id: string; info: VisibilityInfo } | null {
    let closestId: string | null = null;
    let closestRange = Infinity;
    let closestInfo: VisibilityInfo | null = null;

    satellites.forEach((position, id) => {
      const vis = this.calculateVisibilityFromPosition(position);

      if (vis.isVisible && vis.range < closestRange) {
        closestRange = vis.range;
        closestId = id;
        closestInfo = vis;
      }
    });

    if (closestId && closestInfo) {
      return { id: closestId, info: closestInfo };
    }

    return null;
  }

  // ==================== 配置方法 ====================

  /**
   * 設置最小仰角門檻
   */
  setMinElevation(elevation: number): void {
    this.minElevation = elevation;
  }

  /**
   * 獲取當前最小仰角門檻
   */
  getMinElevation(): number {
    return this.minElevation;
  }

  // ==================== 工具方法 ====================

  /**
   * 格式化仰角顯示
   */
  static formatElevation(elevation: number): string {
    return `${elevation.toFixed(1)}°`;
  }

  /**
   * 格式化方位角顯示（帶方向）
   */
  static formatAzimuth(azimuth: number): string {
    const directions = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
    const index = Math.round(azimuth / 45) % 8;
    return `${azimuth.toFixed(1)}° (${directions[index]})`;
  }

  /**
   * 格式化距離顯示
   */
  static formatRange(rangeKm: number): string {
    if (rangeKm < 1000) {
      return `${rangeKm.toFixed(1)} km`;
    } else {
      return `${(rangeKm / 1000).toFixed(2)} Mm`;
    }
  }
}

// ==================== 使用示例 ====================

/**
 * 使用示例：
 *
 * ```typescript
 * // 1. 創建可見性計算器
 * const visibilityCalc = new VisibilityCalculator(10); // 10° 最小仰角
 *
 * // 2. 在每幀篩選可見衛星
 * const positions = orbitCalculator.getVisibleSatellites(elapsedTime);
 * const visibleInfo = visibilityCalc.filterVisibleSatellites(positions);
 *
 * // 3. 找出最高仰角的衛星
 * const highest = visibilityCalc.findHighestElevationSatellite(positions);
 * if (highest) {
 *   console.log(`最高衛星: ${highest.id}, 仰角: ${highest.info.elevation}°`);
 * }
 *
 * // 4. 分層篩選（用於 Handover）
 * const layered = visibilityCalc.filterByLayeredThreshold(positions);
 * console.log(`準備階段: ${layered.preparation.size} 顆`);
 * console.log(`執行階段: ${layered.execution.size} 顆`);
 * ```
 */

/**
 * Handover 決策示例：
 *
 * ```typescript
 * // 使用分層門檻進行換手決策
 * const layered = visibilityCalc.filterByLayeredThreshold(satellitePositions);
 *
 * // 階段 1: 預備觸發（15°）
 * if (layered.preparation.size > 0) {
 *   // 開始準備換手
 *   const targetSatellite = findBestCandidate(layered.preparation);
 * }
 *
 * // 階段 2: 執行門檻（10°）
 * if (currentSatellite && layered.execution.has(currentSatellite.id)) {
 *   // 當前衛星仍然可用
 * } else {
 *   // 需要立即切換
 * }
 *
 * // 階段 3: 臨界門檻（5°）
 * if (layered.critical.size === 0) {
 *   // 沒有可用衛星，連接中斷
 * }
 * ```
 */
