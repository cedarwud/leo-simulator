/**
 * Beam Hopping 類型定義
 *
 * 基於 3GPP TR 38.821 NTN 標準
 */

/**
 * 單個波束定義
 */
export interface Beam {
  id: number;
  /** 地面中心位置 (相對於場景中心) */
  position: {
    x: number;
    z: number;
  };
  /** 覆蓋半徑 (場景單位) */
  radius: number;
  /** 頻率複用顏色 */
  color: string;
  /** 當前時隙是否活躍 */
  isActive: boolean;
  /** 頻率複用組 (0, 1, 2 for FRF3) */
  frequencyGroup: number;
}

/**
 * 時隙定義
 */
export interface TimeSlot {
  id: number;
  /** 此時隙活躍的波束 ID 列表 */
  activeBeams: number[];
  /** 時隙持續時間 (ms) */
  duration: number;
}

/**
 * Beam Hopping 狀態
 */
export interface BeamHoppingState {
  /** 當前時隙索引 */
  currentSlotIndex: number;
  /** 所有波束 */
  beams: Beam[];
  /** 時隙調度表 */
  schedule: TimeSlot[];
  /** UE 當前所在波束 ID */
  userBeamId: number;
  /** 是否正在運行動畫 */
  isRunning: boolean;
  /** 動畫速度倍率 */
  speedMultiplier: number;
}

/**
 * 波束配置
 */
export interface BeamConfig {
  /** 波束數量 */
  count: number;
  /** 錐形高度 (衛星高度) */
  coneHeight: number;
  /** 頂部半徑 */
  coneRadiusTop: number;
  /** 底部半徑 (地面覆蓋) */
  coneRadiusBottom: number;
  /** 相鄰波束間距 */
  cellSpacing: number;
  /** 頻率複用因子 (1 或 3) */
  frequencyReuseFactor: 1 | 3;
}

/**
 * 頻率複用顏色配置
 * 使用高飽和度 RGB 原色，讓 Additive Blending 效果更明顯：
 * - R + G = 黃色
 * - G + B = 青色
 * - R + B = 洋紅色
 * - R + G + B = 白色
 */
export const FRF3_COLORS = {
  group0: '#ff3333',  // 紅色
  group1: '#33ff33',  // 綠色
  group2: '#3333ff',  // 藍色
} as const;

/**
 * 預設波束配置
 *
 * 重疊率計算：
 * - 相鄰波束中心距離 = cellSpacing = 100
 * - 兩波束半徑和 = 2 × coneRadiusBottom = 120
 * - 重疊距離 = 120 - 100 = 20
 * - 重疊率 ≈ 20/120 ≈ 17%（符合 3GPP 建議的 15-30%）
 */
export const DEFAULT_BEAM_CONFIG: BeamConfig = {
  count: 7,
  coneHeight: 400,
  coneRadiusTop: 5,
  coneRadiusBottom: 60,
  cellSpacing: 100,  // 縮小間距以產生波束重疊
  frequencyReuseFactor: 3,
};

/**
 * 預設時隙調度 (FRF3 相容)
 */
export const DEFAULT_SCHEDULE: TimeSlot[] = [
  { id: 0, activeBeams: [0, 2, 4], duration: 2000 },
  { id: 1, activeBeams: [1, 3, 5], duration: 2000 },
  { id: 2, activeBeams: [0, 3, 6], duration: 2000 },
  { id: 3, activeBeams: [1, 4, 6], duration: 2000 },
  { id: 4, activeBeams: [2, 5, 6], duration: 2000 },
];
