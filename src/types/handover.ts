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
  // A3/A4 事件狀態（用於 RSRP-based 換手）
  a3Event?: {
    active: boolean;                 // 事件是否啟動
    eventType: 'A3' | 'A4';          // 事件類型
    targetSatelliteId: string | null; // 事件的目標衛星
    elapsedTime: number;             // 已經持續的時間（秒）
    requiredTime: number;            // 需要持續的時間（秒）
    threshold?: number;              // A4 絕對閾值（僅 A4 使用）
    bestCandidateId?: string | null; // 最佳候選衛星 ID（RSRP 最高）
    candidatesAboveThreshold?: Array<{  // 超過閾值的候選衛星列表（A4）
      satelliteId: string;
      rsrp: number;
    }>;
  };
}

export interface SatelliteMetrics {
  satelliteId: string;
  elevation: number;    // 仰角
  distance: number;     // 距離
  signalQuality: number; // 訊號品質 (0-1)
  rsrp?: number;        // RSRP (dBm) - 用於 RSRP-based 換手
}
