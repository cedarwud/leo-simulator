/**
 * Beam Handover Scenario Types
 * 
 * 定義腳本化場景的資料結構，用於展示不同的換手情境
 */

/**
 * 波束狀態（某一時刻的快照）
 */
export interface BeamSnapshot {
  beamId: number;
  /** 目標 Cell ID */
  cellId: number;
  /** RSRP 值 (dBm) */
  rsrp: number;
  /** 仰角 (degrees) */
  elevation: number;
  /** 距離 UE 的距離 (km) */
  distance: number;
  /** 是否為當前服務波束 */
  isServing: boolean;
  /** 是否為候選波束 */
  isCandidate: boolean;
}

/**
 * Cell 狀態（某一時刻的快照）
 */
export interface CellSnapshot {
  cellId: number;
  /** Data Queue 長度 (packets) */
  dataQueue: number;
  /** 是否有干擾 */
  hasInterference: boolean;
  /** 干擾來源 Cell IDs */
  interferingCells: number[];
}

/**
 * 換手觸發條件
 */
export interface HandoverTrigger {
  /** 觸發類型 */
  type: 'rsrp' | 'data_queue' | 'interference' | 'frequency_control';
  /** 是否滿足 */
  satisfied: boolean;
  /** 當前值 */
  currentValue: number;
  /** 門檻值 */
  threshold: number;
  /** 描述 */
  description: string;
}

/**
 * 場景中的一個關鍵幀
 */
export interface ScenarioKeyframe {
  /** 時間點 (秒) */
  time: number;
  /** 衛星位置 (相對於中心的偏移) */
  satelliteOffset: { x: number; z: number };
  /** 所有波束狀態 */
  beams: BeamSnapshot[];
  /** 所有 Cell 狀態 */
  cells: CellSnapshot[];
  /** 換手觸發條件 */
  triggers: HandoverTrigger[];
  /** 換手狀態 */
  handoverStatus: 'none' | 'preparing' | 'executing' | 'completed';
  /** 此時刻的說明文字 */
  annotation?: string;
}

/**
 * 完整的場景定義
 */
export interface HandoverScenario {
  /** 場景 ID */
  id: string;
  /** 場景名稱 */
  name: string;
  /** 場景描述 */
  description: string;
  /** 換手類型 */
  handoverType: 'rsrp' | 'data_queue' | 'interference' | 'frequency_control';
  /** 總時長 (秒) */
  duration: number;
  /** 關鍵幀列表 */
  keyframes: ScenarioKeyframe[];
  /** 關鍵參數說明 */
  keyParameters: {
    name: string;
    value: string;
    description: string;
  }[];
}

/**
 * 場景播放器狀態
 */
export interface ScenarioPlayerState {
  /** 當前選擇的場景 */
  currentScenario: HandoverScenario | null;
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 當前時間 (秒) */
  currentTime: number;
  /** 播放速度倍率 */
  playbackSpeed: number;
  /** 當前插值後的狀態 */
  interpolatedState: {
    satelliteOffset: { x: number; z: number };
    beams: BeamSnapshot[];
    cells: CellSnapshot[];
    triggers: HandoverTrigger[];
    handoverStatus: 'none' | 'preparing' | 'executing' | 'completed';
    annotation?: string;
  } | null;
}
