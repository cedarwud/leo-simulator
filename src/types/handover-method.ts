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
    name: 'RSRP-Based',
    description: '3GPP 標準 RSRP 貪心算法（總是選擇訊號最強衛星）',
    academicReference: '3GPP TS 38.214 § 5.1.1',
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
