/**
 * 衛星軌道計算器（基於預生成時間序列）
 *
 * ⚠️ 重要修改：
 * - 不再使用 satellite.js 進行實時 SGP4 計算
 * - 改為載入預生成的時間序列 JSON 數據
 * - 前端只做簡單的時間插值
 *
 * 優點：
 * - 避免時間基準錯誤（TLE epoch vs 當前時間）
 * - 性能優異（60 FPS 輕鬆達成）
 * - 準確性高（使用 Python Skyfield 預計算）
 */

import { Vector3 } from 'three';

// ==================== 數據接口 ====================

/**
 * 單個時間序列數據點
 */
export interface TimeseriesPoint {
  time: string;                    // ISO 時間格式
  time_offset_seconds: number;     // 相對於起始時間的偏移（秒）
  elevation_deg: number;           // 仰角（度）
  azimuth_deg: number;            // 方位角（度）
  range_km: number;               // 距離（公里）
  is_visible: boolean;            // 是否可見（仰角 >= min_elevation）
}

/**
 * 衛星完整數據
 */
export interface SatelliteData {
  id: string;                     // 衛星 ID（例: sat-56171）
  name: string;                   // 衛星名稱（例: STARLINK-30270）
  tle_epoch: string;              // TLE epoch 時間（ISO 格式）
  tle_age_days: number;           // TLE 數據年齡（天）
  observer: {
    name: string;
    latitude: number;
    longitude: number;
    altitude_m: number;
  };
  config: {
    min_elevation_deg: number;
    time_step_seconds: number;
    time_points: number;
  };
  statistics: {
    visible_points: number;
    visible_percentage: number;
    max_elevation: number;
  };
  position_timeseries: TimeseriesPoint[];
}

/**
 * JSON 文件根結構
 */
export interface TimeseriesDataFile {
  metadata: {
    generated_at: string;
    generator: string;
    description: string;
    warning: string;
  };
  statistics: {
    total_satellites: number;
    processed_satellites: number;
    visible_satellites: number;
  };
  satellites: SatelliteData[];
}

// ==================== 可見窗口 ====================

/**
 * 可見窗口（連續可見的時間段）
 */
interface VisibleWindow {
  startIndex: number;              // 開始索引
  endIndex: number;                // 結束索引
  duration: number;                // 持續時間（時間點數）
  durationSeconds: number;         // 持續時間（秒）
}

// ==================== 衛星軌道計算器 ====================

export class SatelliteOrbitCalculator {
  // 數據存儲
  private satelliteData: Map<string, SatelliteData> = new Map();
  private visibleWindows: Map<string, VisibleWindow[]> = new Map();

  // 狀態
  private isLoaded: boolean = false;
  private loadError: string | null = null;

  /**
   * 載入預生成的時間序列數據
   *
   * @param jsonUrl - JSON 文件的 URL（通常是 /data/satellite-timeseries.json）
   */
  async loadTimeseries(jsonUrl: string): Promise<void> {
    console.log(`📡 載入衛星時間序列數據: ${jsonUrl}`);

    try {
      const response = await fetch(jsonUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: TimeseriesDataFile = await response.json();

      // 驗證數據格式
      if (!data.satellites || !Array.isArray(data.satellites)) {
        throw new Error('無效的數據格式：缺少 satellites 數組');
      }

      // 載入每顆衛星
      data.satellites.forEach((sat) => {
        this.satelliteData.set(sat.id, sat);

        // 提取可見窗口
        const windows = this.extractVisibleWindows(sat.position_timeseries, sat.config.time_step_seconds);
        this.visibleWindows.set(sat.id, windows);
      });

      this.isLoaded = true;

      console.log(`✅ 成功載入 ${this.satelliteData.size} 顆衛星的時間序列數據`);
      console.log(`📊 統計:`, data.statistics);
      console.log(`⚠️  ${data.metadata.warning}`);

    } catch (error) {
      this.loadError = error instanceof Error ? error.message : String(error);
      console.error('❌ 載入時間序列數據失敗:', this.loadError);
      throw error;
    }
  }

  /**
   * 提取可見窗口
   *
   * 目的：識別連續可見的時間段，避免軌跡在不可見期跳躍
   *
   * 例如：
   * - 地平線下 → 升起（可見窗口開始）→ 最高點 → 降落（可見窗口結束）→ 地平線下
   * - 只在可見窗口內循環動畫，避免突然跳躍
   */
  private extractVisibleWindows(
    timeseries: TimeseriesPoint[],
    timeStep: number
  ): VisibleWindow[] {
    const windows: VisibleWindow[] = [];
    let currentWindow: VisibleWindow | null = null;

    timeseries.forEach((point, index) => {
      if (point.is_visible) {
        if (!currentWindow) {
          // 開始新窗口
          currentWindow = {
            startIndex: index,
            endIndex: index,
            duration: 0,
            durationSeconds: 0,
          };
        } else {
          // 延長當前窗口
          currentWindow.endIndex = index;
        }
      } else {
        if (currentWindow) {
          // 結束當前窗口
          currentWindow.duration = currentWindow.endIndex - currentWindow.startIndex + 1;
          currentWindow.durationSeconds = currentWindow.duration * timeStep;
          windows.push(currentWindow);
          currentWindow = null;
        }
      }
    });

    // 處理最後一個窗口（如果軌道末尾仍可見）
    if (currentWindow) {
      currentWindow.duration = currentWindow.endIndex - currentWindow.startIndex + 1;
      currentWindow.durationSeconds = currentWindow.duration * timeStep;
      windows.push(currentWindow);
    }

    return windows;
  }

  /**
   * 計算衛星在指定時間的位置
   *
   * @param satelliteId - 衛星 ID
   * @param elapsedSeconds - 經過的時間（秒，相對於動畫開始）
   * @param speedMultiplier - 時間速度倍數（預設 1.0）
   * @returns 3D 位置向量，如果不可見則返回 null
   */
  calculatePosition(
    satelliteId: string,
    elapsedSeconds: number,
    speedMultiplier: number = 1
  ): Vector3 | null {
    const data = this.satelliteData.get(satelliteId);
    if (!data) {
      return null;
    }

    const timeseries = data.position_timeseries;
    if (timeseries.length === 0) {
      return null;
    }

    // 計算加速後的時間
    const acceleratedTime = elapsedSeconds * speedMultiplier;

    // 獲取時間序列的總時長
    const totalDuration = timeseries[timeseries.length - 1].time_offset_seconds;

    // 循環播放時間序列
    const currentTime = acceleratedTime % totalDuration;

    // 查找當前時間對應的數據點（二分查找）
    let leftIndex = 0;
    let rightIndex = timeseries.length - 1;

    while (leftIndex < rightIndex - 1) {
      const midIndex = Math.floor((leftIndex + rightIndex) / 2);
      if (timeseries[midIndex].time_offset_seconds <= currentTime) {
        leftIndex = midIndex;
      } else {
        rightIndex = midIndex;
      }
    }

    const currentPoint = timeseries[leftIndex];
    const nextPoint = timeseries[Math.min(leftIndex + 1, timeseries.length - 1)];

    // ⚠️ 關鍵檢查：當前時間點是否可見
    if (!currentPoint.is_visible) {
      return null;
    }

    // 計算插值係數
    const timeDiff = nextPoint.time_offset_seconds - currentPoint.time_offset_seconds;
    const t = timeDiff > 0
      ? (currentTime - currentPoint.time_offset_seconds) / timeDiff
      : 0;

    // 如果下一個點不可見，檢查是否接近邊界
    if (!nextPoint.is_visible) {
      // 只在剛離開當前可見點時顯示（t < 0.1，約 3 秒）
      // 超過這個時間就消失，避免停頓感
      if (t > 0.1) {
        return null;
      }
      // 使用當前點（不插值到不可見區域）
      return this.sphericalToCartesian(
        currentPoint.elevation_deg,
        currentPoint.azimuth_deg,
        currentPoint.range_km
      );
    }

    // 兩個點都可見，檢查是否需要平滑插值
    let interpolatedPoint: TimeseriesPoint;

    // 檢查方位角變化幅度（即使經過環形插值調整）
    let azimuthDiff = nextPoint.azimuth_deg - currentPoint.azimuth_deg;
    if (azimuthDiff > 180) {
      azimuthDiff -= 360;
    } else if (azimuthDiff < -180) {
      azimuthDiff += 360;
    }
    const azimuthChange = Math.abs(azimuthDiff);

    // 如果方位角變化超過 60° 且仰角較高，減少插值強度避免飄移
    if (azimuthChange > 60 && currentPoint.elevation_deg > 45) {
      // 高仰角 + 大方位角變化 = 接近天頂，使用減弱的插值
      // 使用平方根函數減緩插值速度
      const smoothT = Math.sqrt(t);
      interpolatedPoint = this.interpolateTimeseriesPoint(currentPoint, nextPoint, smoothT);
    } else {
      // 正常插值
      interpolatedPoint = this.interpolateTimeseriesPoint(currentPoint, nextPoint, t);
    }

    // 球面座標 → 3D 直角座標
    return this.sphericalToCartesian(
      interpolatedPoint.elevation_deg,
      interpolatedPoint.azimuth_deg,
      interpolatedPoint.range_km
    );
  }

  /**
   * 線性插值兩個時間點
   */
  private interpolateTimeseriesPoint(
    p1: TimeseriesPoint,
    p2: TimeseriesPoint,
    t: number
  ): TimeseriesPoint {
    // 方位角環形插值（處理 0°/360° 邊界）
    let azimuthDiff = p2.azimuth_deg - p1.azimuth_deg;

    // 如果差值超過 180°，走另一個方向（最短路徑）
    if (azimuthDiff > 180) {
      azimuthDiff -= 360;
    } else if (azimuthDiff < -180) {
      azimuthDiff += 360;
    }

    // 插值並標準化到 [0, 360) 範圍
    let interpolatedAzimuth = p1.azimuth_deg + azimuthDiff * t;
    if (interpolatedAzimuth < 0) {
      interpolatedAzimuth += 360;
    } else if (interpolatedAzimuth >= 360) {
      interpolatedAzimuth -= 360;
    }

    return {
      time: p1.time,
      time_offset_seconds: p1.time_offset_seconds,
      elevation_deg: p1.elevation_deg + (p2.elevation_deg - p1.elevation_deg) * t,
      azimuth_deg: interpolatedAzimuth,
      range_km: p1.range_km + (p2.range_km - p1.range_km) * t,
      is_visible: p1.is_visible,
    };
  }

  /**
   * 球面座標轉 3D 直角座標
   *
   * 座標系統：
   * - X: 東（East）
   * - Y: 上（Up）
   * - Z: 北（North）
   *
   * 參數：
   * - elevation: 仰角（0° = 地平線，90° = 天頂）
   * - azimuth: 方位角（0° = 北，90° = 東，180° = 南，270° = 西）
   * - range: 距離（公里）
   */
  private sphericalToCartesian(
    elevationDeg: number,
    azimuthDeg: number,
    rangeKm: number
  ): Vector3 {
    // 轉換為弧度
    const elevationRad = (elevationDeg * Math.PI) / 180;
    const azimuthRad = (azimuthDeg * Math.PI) / 180;

    // 場景縮放參數
    const skyDomeRadius = 700;       // 天空圓頂半徑
    const minHeight = 80;            // 最低高度（確保衛星在場景上方）

    // 使用標準球面座標系統
    // 將仰角映射到球面：5° 在地平線附近，90° 在天頂
    // 為了避免低仰角時太靠近地面，使用非線性映射

    // 計算球面高度角（從地平線向上）
    const heightAngle = elevationRad;

    // 計算球面上的位置
    // horizontalRadius: 從天頂向下投影的水平半徑
    // height: 從地面向上的高度
    const horizontalRadius = skyDomeRadius * Math.cos(heightAngle);
    const height = minHeight + skyDomeRadius * Math.sin(heightAngle);

    // 轉換為直角座標
    // x: 東西方向（East-West）
    // z: 南北方向（North-South）
    // y: 高度（Up）
    const x = horizontalRadius * Math.sin(azimuthRad);
    const z = horizontalRadius * Math.cos(azimuthRad);
    const y = height;

    return new Vector3(x, y, z);
  }

  // ==================== 批量操作 ====================

  /**
   * 批量計算多顆衛星的位置
   */
  calculateBatch(
    satelliteIds: string[],
    elapsedSeconds: number,
    speedMultiplier: number = 1
  ): Map<string, Vector3> {
    const results = new Map<string, Vector3>();

    satelliteIds.forEach((id) => {
      const position = this.calculatePosition(id, elapsedSeconds, speedMultiplier);
      if (position) {
        results.set(id, position);
      }
    });

    return results;
  }

  /**
   * 獲取所有可見衛星（當前時刻）
   */
  getVisibleSatellites(
    elapsedSeconds: number,
    speedMultiplier: number = 1
  ): Map<string, Vector3> {
    return this.calculateBatch(
      this.getAllSatelliteIds(),
      elapsedSeconds,
      speedMultiplier
    );
  }

  // ==================== 查詢方法 ====================

  /**
   * 獲取所有衛星 ID
   */
  getAllSatelliteIds(): string[] {
    return Array.from(this.satelliteData.keys());
  }

  /**
   * 獲取衛星的完整數據
   */
  getSatelliteData(satelliteId: string): SatelliteData | undefined {
    return this.satelliteData.get(satelliteId);
  }

  /**
   * 獲取衛星的可見窗口
   */
  getVisibleWindows(satelliteId: string): VisibleWindow[] | undefined {
    return this.visibleWindows.get(satelliteId);
  }

  /**
   * 檢查是否已載入數據
   */
  isDataLoaded(): boolean {
    return this.isLoaded;
  }

  /**
   * 獲取載入錯誤（如果有）
   */
  getLoadError(): string | null {
    return this.loadError;
  }

  /**
   * 獲取統計信息
   */
  getStatistics(): { total: number; loaded: number; withWindows: number } {
    return {
      total: this.satelliteData.size,
      loaded: this.satelliteData.size,
      withWindows: this.visibleWindows.size,
    };
  }
}

// ==================== 使用示例 ====================

/**
 * 使用示例：
 *
 * ```typescript
 * // 1. 創建計算器實例
 * const calculator = new SatelliteOrbitCalculator();
 *
 * // 2. 載入數據
 * await calculator.loadTimeseries('/data/satellite-timeseries.json');
 *
 * // 3. 在動畫循環中計算位置
 * useFrame(({ clock }) => {
 *   const elapsedSeconds = clock.getElapsedTime();
 *   const positions = calculator.getVisibleSatellites(elapsedSeconds, 1.0);
 *
 *   // 更新渲染...
 * });
 * ```
 */
