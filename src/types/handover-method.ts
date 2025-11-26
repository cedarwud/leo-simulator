/**
 * 換手方法類型定義
 *
 * 支援多種換手決策算法的學術研究對比
 */

export type HandoverMethodType = 'geometric' | 'rsrp' | 'dqn';

export interface HandoverMethodInfo {
  id: HandoverMethodType;
  name: string;
  description: string;
  academicReference?: string;
  color: string;
}

export const HANDOVER_METHODS: Record<HandoverMethodType, HandoverMethodInfo> = {
  geometric: {
    id: 'geometric',
    name: 'Geometric',
    description: '基於仰角和距離的幾何計算（70% 仰角 + 30% 距離）',
    color: '#00ff88',
  },
  rsrp: {
    id: 'rsrp',
    name: 'RSRP-Based (A4)',
    description: '3GPP A4 事件換手（絕對閾值：鄰居 RSRP > -85 dBm）',
    academicReference: 'Yu et al. 2022 - A4 Event in LEO',
    color: '#0088ff',
  },
  dqn: {
    id: 'dqn',
    name: 'DQN-Based',
    description: '深度 Q 網絡強化學習決策（70.6% 換手降低）',
    academicReference: 'handover-rl DQN Agent',
    color: '#ff8800',
  },
};

/**
 * 換手性能統計
 */
export interface HandoverStats {
  totalHandovers: number;        // 總換手次數
  pingPongEvents: number;        // Ping-pong 事件數
  averageRSRP: number;           // 平均 RSRP (dBm)
  averageRSRQ: number;           // 平均 RSRQ (dB)
  averageSINR: number;           // 平均 SINR (dB)
  connectionDuration: number;    // 平均連接持續時間 (秒)
  serviceInterruptions: number;  // 服務中斷次數
  elapsedTime: number;           // 已運行時間 (秒)

  // 擴展資訊（用於更豐富的UI顯示）
  visibleSatellites?: number;    // 可見衛星數量
  totalSatellites?: number;      // 總衛星數量
  currentSatelliteElevation?: number; // 當前衛星仰角 (度)
  currentSatelliteDistance?: number;  // 當前衛星距離 (km)
  candidateSatellites?: string[];     // 候選衛星列表

  // 目標衛星信號數據（僅在換手階段有值）
  targetSatelliteRSRP?: number;      // 目標衛星 RSRP (dBm)
  targetSatelliteRSRQ?: number;      // 目標衛星 RSRQ (dB)
  targetSatelliteSINR?: number;      // 目標衛星 SINR (dB)
  targetSatelliteElevation?: number; // 目標衛星仰角 (度)
  targetSatelliteDistance?: number;  // 目標衛星距離 (km)

  // 路徑損耗分量（基於論文模型，教育展示用）
  pathLoss?: {
    fspl: number;                    // 自由空間路徑損耗 (dB)
    sf: number;                      // Shadow Fading (dB)
    cl: number;                      // Clutter Loss (dB)
    total: number;                   // 總路徑損耗 (dB)
  };

  // A3/A4 事件狀態（用於 RSRP-based 換手方法）
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

/**
 * 衛星訊號品質
 */
export interface SignalQuality {
  rsrp_dbm: number | null;       // 參考信號接收功率
  rsrq_db: number | null;        // 參考信號接收質量
  rs_sinr_db: number | null;     // 信號對干擾加雜訊比
}

/**
 * 換手決策接口
 */
export interface HandoverDecision {
  recommendedSatelliteId: string | null;
  reason: string;
  metrics: {
    [satelliteId: string]: {
      signalQuality?: SignalQuality;
      geometricScore?: number;
      qValue?: number;
    };
  };
}
