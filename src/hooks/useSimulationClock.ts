import { useState, useCallback, useRef, useEffect } from 'react';
import {
  SimulationClock,
  CellQueueState,
  LyapunovConfig,
  CELL_DEMAND_TABLE,
  INITIAL_CLOCK,
  DEFAULT_LYAPUNOV_CONFIG,
} from '@/types/lyapunov';
import { EarthFixedCell } from '@/features/beam-hopping/components/EarthFixedCells';

/**
 * Lyapunov 模擬時鐘 Hook
 *
 * 管理 epoch/slot 時間推進與 Data Queue 動態更新
 * Equation 1: Q_c^{f+1} = max(Q_c^f - D_c^f, 0) + α_c^f
 */
export function useSimulationClock(
  cells: EarthFixedCell[],
  config: LyapunovConfig = DEFAULT_LYAPUNOV_CONFIG,
) {
  const [clock, setClock] = useState<SimulationClock>(INITIAL_CLOCK);
  const [queueStates, setQueueStates] = useState<CellQueueState[]>(() =>
    initQueueStates(cells, config)
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 計算每個 cell 在當前 slot 是否被服務（基於 cells 的 isServed 狀態）
  const tickSlot = useCallback(() => {
    setClock(prev => {
      const nextSlot = prev.currentSlot + 1;

      if (nextSlot > prev.slotsPerEpoch) {
        // Epoch 結束 → 更新 queue，進入下一個 epoch
        setQueueStates(prevQueues => updateQueuesEndOfEpoch(prevQueues, cells, config));

        return {
          ...prev,
          currentEpoch: prev.currentEpoch + 1,
          currentSlot: 1,
        };
      }

      // Slot 推進 → 累加被服務的 slot 數
      setQueueStates(prevQueues => updateQueuesPerSlot(prevQueues, cells, config));

      return { ...prev, currentSlot: nextSlot };
    });
  }, [cells, config]);

  // 播放/暫停控制
  useEffect(() => {
    if (clock.isPlaying) {
      const intervalMs = clock.slotDurationMs / clock.speedMultiplier;
      intervalRef.current = setInterval(tickSlot, intervalMs);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [clock.isPlaying, clock.slotDurationMs, clock.speedMultiplier, tickSlot]);

  const togglePlay = useCallback(() => {
    setClock(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const stepSlot = useCallback(() => {
    tickSlot();
  }, [tickSlot]);

  const stepEpoch = useCallback(() => {
    // 跳到當前 epoch 結束
    setClock(prev => {
      setQueueStates(prevQueues => {
        // 累加剩餘 slots
        let updated = prevQueues;
        for (let s = prev.currentSlot; s <= prev.slotsPerEpoch; s++) {
          updated = updateQueuesPerSlot(updated, cells, config);
        }
        return updateQueuesEndOfEpoch(updated, cells, config);
      });

      return {
        ...prev,
        currentEpoch: prev.currentEpoch + 1,
        currentSlot: 1,
      };
    });
  }, [cells, config]);

  const setSpeed = useCallback((multiplier: number) => {
    setClock(prev => ({ ...prev, speedMultiplier: multiplier }));
  }, []);

  const reset = useCallback(() => {
    setClock(INITIAL_CLOCK);
    setQueueStates(initQueueStates(cells, config));
  }, [cells, config]);

  // 計算統計
  const avgQueueLength = queueStates.length > 0
    ? queueStates.reduce((sum, q) => sum + q.queueLength, 0) / queueStates.length
    : 0;

  const maxQueueLength = queueStates.length > 0
    ? Math.max(...queueStates.map(q => q.queueLength))
    : 0;

  return {
    clock,
    queueStates,
    avgQueueLength,
    maxQueueLength,
    togglePlay,
    stepSlot,
    stepEpoch,
    setSpeed,
    reset,
  };
}

// --- Helper Functions ---

function initQueueStates(
  cells: EarthFixedCell[],
  config: LyapunovConfig,
): CellQueueState[] {
  return cells.map((cell, index) => ({
    cellId: cell.id,
    queueLength: 0,
    arrivalData: computeArrivalRate(index, config),
    servedData: 0,
    slotsServed: 0,
  }));
}

/**
 * 計算每個 cell 的到達資料量 (Mbits/epoch)
 * 基於 Table III 的正規化需求分佈
 */
function computeArrivalRate(cellIndex: number, config: LyapunovConfig): number {
  const demand = CELL_DEMAND_TABLE[cellIndex] ?? 0.05;
  // 總到達率 × 正規化需求 × epoch 時長
  // totalArrivalRateGbps 是所有 cells 的總和
  const arrivalMbitsPerEpoch = config.totalArrivalRateGbps * 1000 * demand
    * (config.slotsPerEpoch * config.slotDurationMs / 1000);
  return arrivalMbitsPerEpoch;
}

/**
 * 每個 slot 更新：累加被服務的 slot 計數
 */
function updateQueuesPerSlot(
  queues: CellQueueState[],
  cells: EarthFixedCell[],
  config: LyapunovConfig,
): CellQueueState[] {
  return queues.map(q => {
    const cell = cells.find(c => c.id === q.cellId);
    const isServed = cell?.isServed ?? false;

    if (isServed) {
      // 計算此 slot 的傳輸量 (Mbits)
      // D = W × T_slot × log2(1 + SNR)
      const snrLinear = Math.pow(10, config.targetSnrDb / 10);
      const capacityPerSlot =
        (config.satelliteBandwidthMhz / config.beamsPerSatellite) *
        (config.slotDurationMs / 1000) *
        Math.log2(1 + snrLinear);

      return {
        ...q,
        slotsServed: q.slotsServed + 1,
        servedData: q.servedData + capacityPerSlot,
      };
    }
    return q;
  });
}

/**
 * Epoch 結束：更新 queue 長度 (Equation 1)
 * Q_c^{f+1} = max(Q_c^f - D_c^f, 0) + α_c^f
 */
function updateQueuesEndOfEpoch(
  queues: CellQueueState[],
  cells: EarthFixedCell[],
  config: LyapunovConfig,
): CellQueueState[] {
  return queues.map((q, index) => {
    const newQueueLength = Math.max(q.queueLength - q.servedData, 0) + q.arrivalData;

    return {
      ...q,
      queueLength: newQueueLength,
      servedData: 0,      // 下一 epoch 重新計算
      slotsServed: 0,     // 重置
      arrivalData: computeArrivalRate(index, config), // 可加入隨機性
    };
  });
}
