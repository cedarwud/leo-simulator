/**
 * Energy Analysis Types
 *
 * 能耗分析相關類型定義（基於 Paper 5-1: Ntabeni et al., 2025）
 */

/**
 * Paper 5-1 能耗對比數據
 */
export interface EnergyProjection {
  // 當前能耗速率 (J/min)
  currentRate: number;
  // 推算到 3000 秒的能耗 (J)
  projectedAt3000s: number;
  // 推算到 3000 秒的換手次數
  projectedHandoversAt3000s: number;
  // 與 Paper 5-1 各方法的比較
  comparison: {
    // 與 EA-QL (最佳方法) 比較
    vsEAQL: { energy: number; percentage: number };
    // 與 Traditional Q-Learning 比較
    vsTraditional: { energy: number; percentage: number };
    // 與 Predictive 方法比較
    vsPredictive: { energy: number; percentage: number };
  };
  // 效能評級
  rating: 'excellent' | 'good' | 'average' | 'poor';
}
