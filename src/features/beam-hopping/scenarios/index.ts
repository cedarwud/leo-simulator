/**
 * Beam Handover Scenarios
 * 
 * 匯出所有場景和類型定義
 */

// Types
export * from './types';

// Scenarios
export { rsrpHandoverScenario } from './rsrp-handover';

// 場景列表
import { rsrpHandoverScenario } from './rsrp-handover';
import type { HandoverScenario } from './types';

export const allScenarios: HandoverScenario[] = [
  rsrpHandoverScenario,
  // 後續階段加入：
  // dataQueueHandoverScenario,
  // interferenceHandoverScenario,
  // frequencyControlHandoverScenario,
];

/**
 * 根據 ID 取得場景
 */
export function getScenarioById(id: string): HandoverScenario | undefined {
  return allScenarios.find(s => s.id === id);
}
