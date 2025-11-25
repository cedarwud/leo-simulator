/**
 * 換手狀態類型定義
 * 基於 ntn-stack 的多階段換手設計
 */

export type HandoverPhase =
  | 'stable'        // 穩定連接
  | 'preparing'     // 準備換手（顯示多個候選衛星）
  | 'selecting'     // 選擇目標（高亮最佳候選）
  | 'establishing'  // 建立新連接
  | 'switching'     // 切換中（舊連接減弱，新連接增強）
  | 'completing';   // 完成換手

export interface HandoverState {
  phase: HandoverPhase;
  currentSatelliteId: string | null;
  targetSatelliteId: string | null;
  candidateSatelliteIds: string[];  // 候選衛星列表
  progress: number;                  // 換手進度 (0-1)
  signalStrength: {                  // 訊號強度
    current: number;                 // 當前衛星 (0-1)
    target: number;                  // 目標衛星 (0-1)
  };
}

export interface SatelliteMetrics {
  satelliteId: string;
  elevation: number;    // 仰角
  distance: number;     // 距離
  signalQuality: number; // 訊號品質 (0-1)
}
