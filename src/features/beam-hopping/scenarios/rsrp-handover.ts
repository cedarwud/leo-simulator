/**
 * Scenario 1: RSRP-based Handover
 * 
 * 展示衛星移動導致 RSRP 變化，觸發波束換手的過程
 * 
 * 情境：
 * - UE 位於 Cell 7
 * - 初始由 Beam 1 服務
 * - 衛星向東移動，Beam 1 的 RSRP 下降
 * - 當 Beam 2 的 RSRP 超過 Beam 1 達到門檻值時觸發換手
 */

import { HandoverScenario, ScenarioKeyframe } from './types';

// UE 所在的 Cell
const UE_CELL_ID = 7;

// 建立關鍵幀
const keyframes: ScenarioKeyframe[] = [
  // 0s - 初始狀態
  {
    time: 0,
    satelliteOffset: { x: -100, z: 0 },
    beams: [
      {
        beamId: 1,
        cellId: UE_CELL_ID,
        rsrp: -85,
        elevation: 65,
        distance: 550,
        isServing: true,
        isCandidate: false,
      },
      {
        beamId: 2,
        cellId: 8,
        rsrp: -92,
        elevation: 55,
        distance: 620,
        isServing: false,
        isCandidate: false,
      },
      {
        beamId: 3,
        cellId: 12,
        rsrp: -95,
        elevation: 50,
        distance: 680,
        isServing: false,
        isCandidate: false,
      },
    ],
    cells: [
      { cellId: UE_CELL_ID, dataQueue: 45, hasInterference: false, interferingCells: [] },
      { cellId: 8, dataQueue: 30, hasInterference: false, interferingCells: [] },
      { cellId: 12, dataQueue: 20, hasInterference: false, interferingCells: [] },
    ],
    triggers: [
      {
        type: 'rsrp',
        satisfied: false,
        currentValue: -7, // Beam2 - Beam1 = -92 - (-85) = -7
        threshold: 3,
        description: 'RSRP差值未達門檻 (Δ = -7 dB < 3 dB)',
      },
    ],
    handoverStatus: 'none',
    annotation: '衛星正常服務中，Beam 1 提供穩定覆蓋',
  },

  // 3s - 衛星開始移動，RSRP 開始變化
  {
    time: 3,
    satelliteOffset: { x: -50, z: 0 },
    beams: [
      {
        beamId: 1,
        cellId: UE_CELL_ID,
        rsrp: -88,
        elevation: 58,
        distance: 590,
        isServing: true,
        isCandidate: false,
      },
      {
        beamId: 2,
        cellId: 8,
        rsrp: -89,
        elevation: 60,
        distance: 580,
        isServing: false,
        isCandidate: true,
      },
      {
        beamId: 3,
        cellId: 12,
        rsrp: -93,
        elevation: 52,
        distance: 650,
        isServing: false,
        isCandidate: false,
      },
    ],
    cells: [
      { cellId: UE_CELL_ID, dataQueue: 52, hasInterference: false, interferingCells: [] },
      { cellId: 8, dataQueue: 35, hasInterference: false, interferingCells: [] },
      { cellId: 12, dataQueue: 22, hasInterference: false, interferingCells: [] },
    ],
    triggers: [
      {
        type: 'rsrp',
        satisfied: false,
        currentValue: -1, // -89 - (-88) = -1
        threshold: 3,
        description: 'RSRP差值接近中 (Δ = -1 dB < 3 dB)',
      },
    ],
    handoverStatus: 'none',
    annotation: '衛星移動中，Beam 2 訊號逐漸增強',
  },

  // 5s - RSRP 差值即將達標，準備換手
  {
    time: 5,
    satelliteOffset: { x: 0, z: 0 },
    beams: [
      {
        beamId: 1,
        cellId: UE_CELL_ID,
        rsrp: -91,
        elevation: 52,
        distance: 640,
        isServing: true,
        isCandidate: false,
      },
      {
        beamId: 2,
        cellId: UE_CELL_ID, // Beam 2 現在也指向 UE 的 Cell
        rsrp: -88,
        elevation: 63,
        distance: 560,
        isServing: false,
        isCandidate: true,
      },
      {
        beamId: 3,
        cellId: 12,
        rsrp: -90,
        elevation: 55,
        distance: 610,
        isServing: false,
        isCandidate: false,
      },
    ],
    cells: [
      { cellId: UE_CELL_ID, dataQueue: 58, hasInterference: false, interferingCells: [] },
      { cellId: 8, dataQueue: 40, hasInterference: false, interferingCells: [] },
      { cellId: 12, dataQueue: 25, hasInterference: false, interferingCells: [] },
    ],
    triggers: [
      {
        type: 'rsrp',
        satisfied: true,
        currentValue: 3, // -88 - (-91) = 3
        threshold: 3,
        description: '✓ RSRP差值達到門檻 (Δ = +3 dB ≥ 3 dB)',
      },
    ],
    handoverStatus: 'preparing',
    annotation: '⚠️ 觸發條件滿足！準備執行換手...',
  },

  // 6s - 執行換手
  {
    time: 6,
    satelliteOffset: { x: 20, z: 0 },
    beams: [
      {
        beamId: 1,
        cellId: 6, // Beam 1 移往其他 Cell
        rsrp: -93,
        elevation: 48,
        distance: 680,
        isServing: false,
        isCandidate: false,
      },
      {
        beamId: 2,
        cellId: UE_CELL_ID,
        rsrp: -86,
        elevation: 66,
        distance: 540,
        isServing: true, // 現在是服務波束
        isCandidate: false,
      },
      {
        beamId: 3,
        cellId: 12,
        rsrp: -88,
        elevation: 58,
        distance: 590,
        isServing: false,
        isCandidate: false,
      },
    ],
    cells: [
      { cellId: UE_CELL_ID, dataQueue: 42, hasInterference: false, interferingCells: [] },
      { cellId: 6, dataQueue: 35, hasInterference: false, interferingCells: [] },
      { cellId: 12, dataQueue: 28, hasInterference: false, interferingCells: [] },
    ],
    triggers: [
      {
        type: 'rsrp',
        satisfied: false,
        currentValue: 0,
        threshold: 3,
        description: '換手完成，重新監測中',
      },
    ],
    handoverStatus: 'executing',
    annotation: '🔄 執行換手：Beam 1 → Beam 2',
  },

  // 8s - 換手完成，穩定狀態
  {
    time: 8,
    satelliteOffset: { x: 60, z: 0 },
    beams: [
      {
        beamId: 1,
        cellId: 6,
        rsrp: -95,
        elevation: 45,
        distance: 720,
        isServing: false,
        isCandidate: false,
      },
      {
        beamId: 2,
        cellId: UE_CELL_ID,
        rsrp: -84,
        elevation: 68,
        distance: 530,
        isServing: true,
        isCandidate: false,
      },
      {
        beamId: 3,
        cellId: 12,
        rsrp: -86,
        elevation: 62,
        distance: 560,
        isServing: false,
        isCandidate: false,
      },
    ],
    cells: [
      { cellId: UE_CELL_ID, dataQueue: 38, hasInterference: false, interferingCells: [] },
      { cellId: 6, dataQueue: 32, hasInterference: false, interferingCells: [] },
      { cellId: 12, dataQueue: 30, hasInterference: false, interferingCells: [] },
    ],
    triggers: [
      {
        type: 'rsrp',
        satisfied: false,
        currentValue: 0,
        threshold: 3,
        description: '穩定狀態，無需換手',
      },
    ],
    handoverStatus: 'completed',
    annotation: '✅ 換手完成！Beam 2 現在提供最佳覆蓋',
  },
];

export const rsrpHandoverScenario: HandoverScenario = {
  id: 'rsrp-handover',
  name: 'RSRP 訊號強度換手',
  description:
    '展示衛星移動導致不同波束的 RSRP（Reference Signal Received Power）變化，' +
    '當候選波束的 RSRP 超過服務波束達到門檻值時觸發換手。' +
    '這是最基本的換手觸發機制。',
  handoverType: 'rsrp',
  duration: 8,
  keyframes,
  keyParameters: [
    {
      name: 'RSRP 門檻',
      value: '3 dB',
      description: '候選波束需超過服務波束 3 dB 才觸發換手',
    },
    {
      name: 'UE Cell',
      value: `Cell ${UE_CELL_ID}`,
      description: '使用者設備所在的固定 Cell',
    },
    {
      name: '初始服務波束',
      value: 'Beam 1',
      description: '場景開始時提供服務的波束',
    },
  ],
};
