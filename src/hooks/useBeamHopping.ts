/**
 * Beam Hopping Hook — 連接 SimulationClock 與 WMIS Scheduler
 *
 * 每個 time slot 執行 WMIS 排程決策，決定 beam → cell 分配。
 * 結果用於覆蓋 Satellites 組件的預設 beam 分配邏輯。
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { EarthFixedCell } from '@/features/beam-hopping/components/EarthFixedCells';
import { buildConflictGraph, ConflictGraph } from '@/features/beam-hopping/algorithms/conflictGraph';
import { solveWMIS, BeamHoppingDecision } from '@/features/beam-hopping/algorithms/wmisScheduler';
import { SimulationClock, CellQueueState, LyapunovConfig, DEFAULT_LYAPUNOV_CONFIG } from '@/types/lyapunov';

export interface BeamHoppingState {
  /** 當前 slot 的 beam → cell 分配 */
  currentDecision: BeamHoppingDecision;
  /** Conflict Graph（可用於視覺化） */
  conflictGraph: ConflictGraph | null;
  /** 是否啟用 beam hopping */
  enabled: boolean;
}

/**
 * 管理 WMIS beam hopping 排程
 *
 * @param cells Earth-Fixed Cells
 * @param clock 模擬時鐘狀態
 * @param queueStates Cell queue 狀態
 * @param config Lyapunov 配置
 * @param enabled 是否啟用
 */
export function useBeamHopping(
  cells: EarthFixedCell[],
  clock: SimulationClock,
  queueStates: CellQueueState[],
  config: LyapunovConfig = DEFAULT_LYAPUNOV_CONFIG,
  enabled: boolean = true,
): BeamHoppingState {
  // 建構 Conflict Graph（只在 cells 或 beam 數量改變時重建）
  const conflictGraph = useMemo(() => {
    if (!enabled || cells.length === 0) return null;
    return buildConflictGraph(cells, config.beamsPerSatellite);
  }, [cells.length, config.beamsPerSatellite, enabled]);

  // 當前 slot 的決策
  const [currentDecision, setCurrentDecision] = useState<BeamHoppingDecision>({
    assignments: [],
  });

  // 追蹤上一次的 slot，避免重複計算
  const prevSlotRef = useRef({ epoch: 0, slot: 0 });

  // 每個 slot 執行 WMIS 排程
  useEffect(() => {
    if (!enabled || !conflictGraph || queueStates.length === 0) return;

    const { currentEpoch, currentSlot } = clock;
    const prev = prevSlotRef.current;

    // 只在 slot 變化時重新計算
    if (prev.epoch === currentEpoch && prev.slot === currentSlot) return;
    prevSlotRef.current = { epoch: currentEpoch, slot: currentSlot };

    const decision = solveWMIS(conflictGraph, queueStates, config);
    setCurrentDecision(decision);
  }, [clock.currentEpoch, clock.currentSlot, conflictGraph, queueStates, config, enabled]);

  return {
    currentDecision,
    conflictGraph,
    enabled,
  };
}
