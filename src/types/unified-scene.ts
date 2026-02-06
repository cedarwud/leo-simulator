/**
 * Unified Scene Configuration
 *
 * 統一場景配置，支援 Ground Cells 和 Beams 的可選顯示
 */

import type { EnergyProjection } from './energy';

/**
 * 視覺化功能開關
 */
export interface VisualizationToggles {
  /** 顯示地面 Cells (六邊形網格) */
  showGroundCells: boolean;
  /** 顯示波束 (從衛星到 Cells 的錐形) */
  showBeams: boolean;
  /** 顯示 Cell 標籤 (C1, C2...) */
  showCellLabels: boolean;
  /** 顯示 Beam 標籤 (B1, B2...) */
  showBeamLabels: boolean;
}

/**
 * 預設視覺化配置
 */
export const DEFAULT_VISUALIZATION_TOGGLES: VisualizationToggles = {
  showGroundCells: true,
  showBeams: true,
  showCellLabels: true,
  showBeamLabels: true,
};

/**
 * 統一場景統計數據
 *
 * 合併 HandoverStats 和 BeamManagementStats 的共用欄位
 */
export interface UnifiedSceneStats {
  // ========== 連線狀態 ==========
  /** 當前服務的衛星 ID */
  currentSatelliteId: string | null;
  /** 當前服務的波束 ID (當 showBeams=true) */
  currentBeamId: number | null;

  // ========== 換手統計 ==========
  /** 衛星換手次數 */
  satelliteHandovers: number;
  /** 運行時間 (秒) */
  elapsedTime: number;

  // ========== 能耗分析 ==========
  /** 累積能耗 (Joules) */
  energyConsumption: number;
  /** 能耗投影 (與論文 baseline 比較) */
  energyProjection: EnergyProjection | null;

  // ========== Beam Hopping 專用 (當 showGroundCells=true) ==========
  /** UE 所在 Cell 的 Data Queue */
  ueDataQueue?: number;
  /** UE 所在的 Cell ID */
  ueCellId?: number;

  // ========== 信號品質 (選用) ==========
  /** RSRP (dBm) */
  currentRSRP?: number;
  /** 當前衛星仰角 (度) */
  currentElevation?: number;
}

/**
 * 統一場景配置
 */
export interface UnifiedSceneConfig {
  /** 視覺化開關 */
  visualization: VisualizationToggles;

  /** 換手方法 */
  handoverMethod: 'geometric' | 'rsrp';

  /** 時間加速倍率 */
  timeSpeed: number;

  /** 候選衛星數量 */
  candidateCount: number;
}

/**
 * 預設場景配置
 */
export const DEFAULT_SCENE_CONFIG: UnifiedSceneConfig = {
  visualization: DEFAULT_VISUALIZATION_TOGGLES,
  handoverMethod: 'rsrp',
  timeSpeed: 3,
  candidateCount: 6,
};
