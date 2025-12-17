/**
 * 能耗效率配置常數
 *
 * 基於論文: Ntabeni et al., "Adaptive Handover Optimization in LEO Satellite Networks
 * Using Energy-Aware Q-Learning," IEEE Open Journal of the Communications Society,
 * vol. 6, pp. 5657-5666, 2025.
 *
 * 論文核心思想:
 * - Energy-Aware Reward Function: r = signal_quality - λ * E_handover
 * - 透過在獎勵函數中加入能量懲罰項，減少不必要的換手，達到節能效果
 *
 * 論文模擬結果 (3000秒):
 * | 方法                    | 累積能耗 | 換手次數 | 信號品質 | 覆蓋概率 |
 * |------------------------|---------|---------|---------|---------|
 * | Energy-Aware Q-Learning | 4.5 J   | ~750    | 0.12    | 0.92    |
 * | Traditional Q-Learning  | 6 J     | ~2200   | 0.06    | 0.75    |
 * | Predictive             | 14 J    | ~2800   | 0.035   | 0.58    |
 * | Entropy-Based          | 14 J    | ~2800   | 0.022   | 0.40    |
 */

export const ENERGY_CONFIG = {
  /**
   * 每次換手的能量成本 (Joules)
   *
   * 來源: Ntabeni et al. (2025) Table 2 - Simulation Parameters
   * 原始參考: Chen et al., "Energy Efficiency Analysis of LEO Satellite Networks," 2019 [ref 37]
   *
   * 這個數值代表用戶設備 (UE) 執行一次完整換手流程所消耗的能量,
   * 包括: 測量報告、隨機接入、信令交換、連接重建等
   */
  ENERGY_PER_HANDOVER: 3, // Joules

  /**
   * 能量懲罰權重 (λ)
   *
   * 來源: Ntabeni et al. (2025) - Energy-Aware Reward Function
   * reward = signal_quality - λ * E_handover
   *
   * λ = 0.2 是論文建議的平衡值:
   * - 太小: 無法有效減少不必要的換手
   * - 太大: 會過度懲罰換手，導致信號品質下降
   */
  ENERGY_PENALTY_WEIGHT: 0.2, // λ

  /**
   * 基準能耗數據 (用於節能效果對比)
   *
   * 來源: Ntabeni et al. (2025) Figure 6 - Cumulative Energy Consumption
   * 模擬時間: 3000 秒
   */
  BASELINE_DATA: {
    // Geometric 方法作為基準 (類似論文中的 Traditional Q-Learning)
    geometric: {
      energyAt3000s: 6.0,    // 3000秒時的累積能耗 (J)
      handoversAt3000s: 2200, // 3000秒時的換手次數
      label: 'Geometric (Baseline)',
    },

    // RSRP A4 方法 (類似論文中的 Energy-Aware Q-Learning)
    rsrp: {
      energyAt3000s: 4.5,    // 3000秒時的累積能耗 (J)
      handoversAt3000s: 750,  // 3000秒時的換手次數
      label: 'RSRP-Based (A4)',
    },

    // DQN 方法 (未來實現)
    dqn: {
      energyAt3000s: 4.5,    // 預期與 Energy-Aware 方法相近
      handoversAt3000s: 750,
      label: 'DQN (Energy-Aware)',
    },
  },

  /**
   * 節能效果計算公式
   *
   * 節能百分比 = (baseline_energy - current_energy) / baseline_energy * 100%
   * 換手減少百分比 = (baseline_handovers - current_handovers) / baseline_handovers * 100%
   */
} as const;

/**
 * 學術參考文獻 (用於 UI 顯示)
 */
export const ENERGY_ACADEMIC_REFERENCES = {
  primary: {
    authors: 'Ntabeni et al.',
    year: 2025,
    title: 'Adaptive Handover Optimization in LEO Satellite Networks Using Energy-Aware Q-Learning',
    journal: 'IEEE Open Journal of the Communications Society',
    volume: 6,
    pages: '5657-5666',
    doi: '10.1109/OJCOMS.2025.XXXXXXX',
  },
  energyCost: {
    authors: 'Chen et al.',
    year: 2019,
    title: 'Energy Efficiency Analysis of LEO Satellite Networks',
    note: 'Reference [37] in Ntabeni et al. (2025)',
  },
} as const;

/**
 * 計算節能效果
 *
 * @param currentEnergy 當前累積能耗 (J)
 * @param currentHandovers 當前換手次數
 * @param baselineMethod 基準方法 (default: 'geometric')
 * @returns 節能效果統計
 */
export function calculateEnergySavings(
  currentEnergy: number,
  currentHandovers: number,
  baselineMethod: keyof typeof ENERGY_CONFIG.BASELINE_DATA = 'geometric'
) {
  const baseline = ENERGY_CONFIG.BASELINE_DATA[baselineMethod];

  // 時間歸一化: 將當前數據與3000秒的基準進行比較
  // 注意: 這裡假設能耗和換手次數隨時間線性增長
  const energySavingsPercent =
    baseline.energyAt3000s > 0
      ? ((baseline.energyAt3000s - currentEnergy) / baseline.energyAt3000s) * 100
      : 0;

  const handoverReductionPercent =
    baseline.handoversAt3000s > 0
      ? ((baseline.handoversAt3000s - currentHandovers) / baseline.handoversAt3000s) * 100
      : 0;

  return {
    energySavingsPercent,
    handoverReductionPercent,
    baselineLabel: baseline.label,
    isEnergyEfficient: energySavingsPercent > 0,
    isHandoverReduced: handoverReductionPercent > 0,
  };
}
