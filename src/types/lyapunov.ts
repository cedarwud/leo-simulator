/**
 * Lyapunov 核心類型定義
 *
 * Beam Management in LEO Satellite Communication
 * Lyapunov Drift-Plus-Penalty Framework
 */

/**
 * 模擬時鐘 — Epoch/Slot 離散時間系統
 * 每個 Epoch 包含 T 個 time slots
 */
export interface SimulationClock {
  /** 當前 epoch 編號 (from 1) */
  currentEpoch: number;
  /** 當前 slot (1 ~ slotsPerEpoch) */
  currentSlot: number;
  /** 每個 slot 的時長 (ms)，預設 200ms */
  slotDurationMs: number;
  /** 每個 epoch 的 slot 數，預設 200 */
  slotsPerEpoch: number;
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 播放速度倍率 */
  speedMultiplier: number;
}

/**
 * Cell Queue 狀態
 * Equation 1: Q_c^{f+1} = max(Q_c^f - D_c^f, 0) + α_c^f
 */
export interface CellQueueState {
  /** Cell ID */
  cellId: number;
  /** 當前 queue 長度 (Mbits) */
  queueLength: number;
  /** 本 epoch 到達的資料量 α_c^f (Mbits) */
  arrivalData: number;
  /** 本 epoch 被服務傳輸的資料量 D_c^f (Mbits) */
  servedData: number;
  /** 本 epoch 被服務的 slot 數 */
  slotsServed: number;
}

/**
 * 正規化傳輸需求 (Table III)
 * 索引 0~19 對應 Cell 1~20
 */
export const CELL_DEMAND_TABLE: number[] = [
  0.0221, 0.0636, 0.0636, 0.0325, 0.0740, 0.0325, 0.0209,  // Cell 1-7
  0.0428, 0.0429, 0.0532, 0.0844, 0.0428, 0.0325, 0.0221,  // Cell 8-14
  0.0636, 0.0740, 0.0312, 0.0844, 0.0428, 0.0740,           // Cell 15-20
];

/**
 * Lyapunov 模擬配置
 */
export interface LyapunovConfig {
  /** 每個 epoch 的 slot 數 (T)，預設 200 */
  slotsPerEpoch: number;
  /** 每個 slot 的時長 (ms)，預設 200 */
  slotDurationMs: number;
  /** 每衛星波束數 (B)，預設 4 */
  beamsPerSatellite: number;
  /** 目標 SNR (dB)，預設 12 */
  targetSnrDb: number;
  /** 衛星頻寬 W₁ (MHz)，預設 200 */
  satelliteBandwidthMhz: number;
  /** 最大換手頻率門檻 H̄，預設 0.004 */
  maxHandoverFrequency: number;
  /** Lyapunov V 參數，預設 100 */
  lyapunovV: number;
  /** 資源利用率門檻 σ₀，預設 0.6 */
  resourceUtilizationThreshold: number;
  /** 總到達資料率 (Gbps)，預設 6.52 (4 beams) 或 10.57 (8 beams) */
  totalArrivalRateGbps: number;
  /** 雨衰率 (mm/h)，預設 10 */
  rainRateMmPerH?: number;
  /** 是否啟用陰影衰落，預設 true */
  enableShadowFading?: boolean;
  /** 是否啟用大氣效應，預設 true */
  enableAtmosphericEffects?: boolean;
}

/** 預設配置 (Table II) */
export const DEFAULT_LYAPUNOV_CONFIG: LyapunovConfig = {
  slotsPerEpoch: 200,
  slotDurationMs: 200,
  beamsPerSatellite: 4,
  targetSnrDb: 12,
  satelliteBandwidthMhz: 200,
  maxHandoverFrequency: 0.004,
  lyapunovV: 100,
  resourceUtilizationThreshold: 0.9,
  totalArrivalRateGbps: 6.52,
  rainRateMmPerH: 10,
  enableShadowFading: true,
  enableAtmosphericEffects: true,
};

/** 預設時鐘初始狀態 */
export const INITIAL_CLOCK: SimulationClock = {
  currentEpoch: 1,
  currentSlot: 1,
  slotDurationMs: 200,
  slotsPerEpoch: 200,
  isPlaying: false,
  speedMultiplier: 10,
};

/**
 * 基線算法的指標快照
 * 用於 Fig. 6-8 多線對比
 */
export interface BaselineMetrics {
  avgQueueLength: number;
  handoverFrequency: number;
  resourceUtilization: number;
  driftPlusPenalty: number;
}

/**
 * 3 comparison groups matching paper Fig. 6-8
 */
export interface BaselineGroups {
  /** Fig. 6: Beam Hopping comparison (B=4, σ₀=0.9, 6.52 Gbps) */
  beamHopping: {
    proposed: BaselineMetrics;
    greedyBH: BaselineMetrics;
    mosekGreedy: BaselineMetrics;
    swapMatchBH: BaselineMetrics;
  };
  /** Fig. 7: Handover comparison (B=8, σ₀=0.6, 10.57 Gbps) */
  handover: {
    proposed: BaselineMetrics;
    loadBalance: BaselineMetrics;
    entropy: BaselineMetrics;
    cellClustering: BaselineMetrics;
  };
  /** Fig. 8: Spectrum Sharing comparison (B=8, σ₀=0.6, 11.871 Gbps) */
  spectrumSharing: {
    proposed: BaselineMetrics;
    greedySS: BaselineMetrics;
    ga: BaselineMetrics;
    bwo: BaselineMetrics;
  };
}

/** Group-specific configs from paper Table II */
export const BH_GROUP_CONFIG: Partial<LyapunovConfig> = {
  beamsPerSatellite: 4,
  resourceUtilizationThreshold: 0.9,
  totalArrivalRateGbps: 6.52,
};

export const HO_GROUP_CONFIG: Partial<LyapunovConfig> = {
  beamsPerSatellite: 8,
  resourceUtilizationThreshold: 0.6,
  totalArrivalRateGbps: 10.57,
};

export const SS_GROUP_CONFIG: Partial<LyapunovConfig> = {
  beamsPerSatellite: 8,
  resourceUtilizationThreshold: 0.6,
  totalArrivalRateGbps: 11.871,
};

/**
 * 模擬狀態快照（每 epoch 更新）
 */
export interface EpochSnapshot {
  epoch: number;
  /** 各 cell 的 queue 長度 */
  queueLengths: number[];
  /** 平均 queue 長度 */
  avgQueueLength: number;
  /** 累計換手次數 */
  totalHandovers: number;
  /** 當前 epoch 換手頻率 */
  handoverFrequency: number;
  /** 資源利用率 */
  resourceUtilization: number;
  /** Drift-plus-penalty 目標值 */
  driftPlusPenalty: number;
  /** Paper-faithful baseline groups (Fig. 6-8) */
  baselineGroups?: BaselineGroups;
  /** Algorithm execution times (ms) for complexity verification */
  executionTimesMs?: {
    algorithm1: number;
    algorithm2: number;
    algorithm3: number;
    total: number;
  };
}

/**
 * Virtual Queue (Lyapunov 框架)
 *
 * 每個 cell 維護一個虛擬佇列 M_c，用於控制換手頻率。
 * Equation 17: M_{c,f+1} = max(M_{c,f} + m_{c,f} - H̄, 0)
 *
 * 其中 m_{c,f} 是 cell c 在 epoch f 的換手指標（0 或 1），
 * H̄ 是最大換手頻率門檻。
 */
export interface VirtualQueue {
  /** Cell ID */
  cellId: number;
  /** 虛擬佇列長度 M_c */
  value: number;
}

/**
 * Lyapunov 框架狀態
 *
 * 整合 data queues Q_c, virtual queues M_c, 和資源利用率 σ
 * 用於 per-epoch 的 drift-plus-penalty 最佳化
 */
export interface LyapunovState {
  /** 當前 epoch */
  epoch: number;
  /** Data queues (Eq. 1) */
  dataQueues: CellQueueState[];
  /** Virtual queues (Eq. 17) */
  virtualQueues: VirtualQueue[];
  /** 資源利用率 σ_f */
  resourceUtilization: number;
  /** Lyapunov drift value (Eq. 29) */
  driftValue: number;
  /** Penalty value (Eq. 30) */
  penaltyValue: number;
  /** Drift-plus-penalty 目標值 */
  driftPlusPenalty: number;
  /** 累計換手次數 */
  totalHandovers: number;
  /** 時間平均換手頻率 */
  avgHandoverFrequency: number;
  /** 歷史記錄（用於圖表） */
  history: EpochSnapshot[];
}

/**
 * 地面基站群配置
 * Section II-B.3: 32400 terrestrial cells
 * 每個 beam cell 包含 N 個 terrestrial cells (terrestrialCellsPerBeam, default 100)
 * 干擾檢查時 Monte Carlo 採樣 N 個位置的 off-axis angle
 */
export interface TerrestrialCluster {
  /** 對應的 beam cell ID */
  cellId: number;
  /** 基站負載 l^f_g ∈ [0.4, 0.6] */
  load: number;
  /** 地面網路頻寬 W₂ (MHz) */
  bandwidthMhz: number;
}

/**
 * 頻譜共享決策
 * z^{f,t}_{s,c} ∈ {0, 1}: 是否借用地面頻譜
 */
export interface SpectrumSharingDecision {
  /** Cell ID */
  cellId: number;
  /** 是否借用地面頻譜 */
  useSharedSpectrum: boolean;
  /** 借用後的額外容量增益 (Mbits/slot) */
  capacityGain: number;
  /** 對地面基站的干擾 (dB) */
  interferenceToTerrestrial: number;
}

/** 頻譜共享配置 */
export interface SpectrumSharingConfig {
  /** 地面網路頻寬 W₂ (MHz)，預設 100 */
  terrestrialBandwidthMhz: number;
  /** 干擾門檻 I^th_g (dB)，預設 -10 */
  interferenceThresholdDb: number;
  /** 地面基站負載範圍 [min, max] */
  loadRange: [number, number];
  /** 是否啟用頻譜共享 */
  enabled: boolean;
  /** Terrestrial cells per beam for interference sampling (paper: 32400/20=1620) */
  terrestrialCellsPerBeam?: number;
}

/** 預設頻譜共享配置 */
export const DEFAULT_SPECTRUM_SHARING_CONFIG: SpectrumSharingConfig = {
  terrestrialBandwidthMhz: 100,
  interferenceThresholdDb: -10,
  loadRange: [0.4, 0.6],
  enabled: true,
  terrestrialCellsPerBeam: 1620,
};

/**
 * Per-cell capacity map: cellId → capacity per slot (Mbits)
 * Computed from full physical-layer link budget (SINR-based Shannon capacity)
 */
export type CellCapacityMap = Map<number, number>;

/**
 * 物理層配置引用
 * 完整定義在 channelModel.ts 的 PhysicalLayerConfig
 * 此處提供 LyapunovConfig 的擴展欄位
 */
export interface LyapunovPhysicalLayer {
  /** 操作頻率 (GHz)，預設 20 (Ka band) */
  frequencyGhz: number;
  /** Inter-beam INR threshold I_s^th (dB)，預設 -5 */
  interBeamINRThresholdDb: number;
  /** Terrestrial cell center bandwidth (MHz)，Eq. 36 中的 W_center */
  terrestrialCenterBandwidthMhz: number;
}

/** 預設物理層配置 */
export const DEFAULT_LYAPUNOV_PHYSICAL_LAYER: LyapunovPhysicalLayer = {
  frequencyGhz: 20,
  interBeamINRThresholdDb: -5,
  terrestrialCenterBandwidthMhz: 20,
};
