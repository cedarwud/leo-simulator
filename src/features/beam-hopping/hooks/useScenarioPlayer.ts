/**
 * useScenarioPlayer Hook
 * 
 * 管理場景播放狀態和插值邏輯
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  HandoverScenario,
  ScenarioPlayerState,
  ScenarioKeyframe,
  BeamSnapshot,
  CellSnapshot,
  HandoverTrigger,
} from '../scenarios/types';

/**
 * 線性插值
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 插值兩個關鍵幀之間的狀態
 */
function interpolateKeyframes(
  prev: ScenarioKeyframe,
  next: ScenarioKeyframe,
  t: number
): ScenarioPlayerState['interpolatedState'] {
  // 衛星位置插值
  const satelliteOffset = {
    x: lerp(prev.satelliteOffset.x, next.satelliteOffset.x, t),
    z: lerp(prev.satelliteOffset.z, next.satelliteOffset.z, t),
  };

  // 波束狀態插值 (只插值數值，其他屬性取 prev 或根據 t 決定)
  const beams: BeamSnapshot[] = prev.beams.map((prevBeam, index) => {
    const nextBeam = next.beams[index];
    if (!nextBeam) return prevBeam;

    return {
      beamId: prevBeam.beamId,
      cellId: t < 0.5 ? prevBeam.cellId : nextBeam.cellId,
      rsrp: lerp(prevBeam.rsrp, nextBeam.rsrp, t),
      elevation: lerp(prevBeam.elevation, nextBeam.elevation, t),
      distance: lerp(prevBeam.distance, nextBeam.distance, t),
      isServing: t < 0.5 ? prevBeam.isServing : nextBeam.isServing,
      isCandidate: t < 0.5 ? prevBeam.isCandidate : nextBeam.isCandidate,
    };
  });

  // Cell 狀態插值
  const cells: CellSnapshot[] = prev.cells.map((prevCell, index) => {
    const nextCell = next.cells[index];
    if (!nextCell) return prevCell;

    return {
      cellId: prevCell.cellId,
      dataQueue: Math.round(lerp(prevCell.dataQueue, nextCell.dataQueue, t)),
      hasInterference: t < 0.5 ? prevCell.hasInterference : nextCell.hasInterference,
      interferingCells: t < 0.5 ? prevCell.interferingCells : nextCell.interferingCells,
    };
  });

  // 觸發條件插值
  const triggers: HandoverTrigger[] = prev.triggers.map((prevTrigger, index) => {
    const nextTrigger = next.triggers[index];
    if (!nextTrigger) return prevTrigger;

    return {
      type: prevTrigger.type,
      satisfied: t < 0.5 ? prevTrigger.satisfied : nextTrigger.satisfied,
      currentValue: lerp(prevTrigger.currentValue, nextTrigger.currentValue, t),
      threshold: prevTrigger.threshold,
      description: t < 0.5 ? prevTrigger.description : nextTrigger.description,
    };
  });

  // 換手狀態和註解（不插值，使用前一個關鍵幀）
  const handoverStatus = t < 0.5 ? prev.handoverStatus : next.handoverStatus;
  const annotation = t < 0.5 ? prev.annotation : next.annotation;

  return {
    satelliteOffset,
    beams,
    cells,
    triggers,
    handoverStatus,
    annotation,
  };
}

/**
 * 找到當前時間對應的關鍵幀區間
 */
function findKeyframeInterval(
  keyframes: ScenarioKeyframe[],
  currentTime: number
): { prev: ScenarioKeyframe; next: ScenarioKeyframe; t: number } | null {
  if (keyframes.length === 0) return null;

  // 找到 currentTime 所在的區間
  for (let i = 0; i < keyframes.length - 1; i++) {
    const prev = keyframes[i];
    const next = keyframes[i + 1];

    if (currentTime >= prev.time && currentTime <= next.time) {
      const duration = next.time - prev.time;
      const t = duration > 0 ? (currentTime - prev.time) / duration : 0;
      return { prev, next, t };
    }
  }

  // 超過最後一個關鍵幀，返回最後一個
  if (currentTime >= keyframes[keyframes.length - 1].time) {
    const last = keyframes[keyframes.length - 1];
    return { prev: last, next: last, t: 0 };
  }

  // 早於第一個關鍵幀，返回第一個
  const first = keyframes[0];
  return { prev: first, next: first, t: 0 };
}

export interface UseScenarioPlayerOptions {
  /** 自動開始播放 */
  autoPlay?: boolean;
  /** 初始速度 */
  initialSpeed?: number;
}

export function useScenarioPlayer(options: UseScenarioPlayerOptions = {}) {
  const { autoPlay = false, initialSpeed = 1 } = options;

  const [state, setState] = useState<ScenarioPlayerState>({
    currentScenario: null,
    isPlaying: false,
    currentTime: 0,
    playbackSpeed: initialSpeed,
    interpolatedState: null,
  });

  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // 選擇場景
  const selectScenario = useCallback((scenario: HandoverScenario) => {
    setState(prev => ({
      ...prev,
      currentScenario: scenario,
      currentTime: 0,
      isPlaying: autoPlay,
      interpolatedState: null,
    }));
  }, [autoPlay]);

  // 播放
  const play = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: true }));
  }, []);

  // 暫停
  const pause = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: false }));
  }, []);

  // 切換播放/暫停
  const togglePlay = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  // 設定時間
  const setTime = useCallback((time: number) => {
    setState(prev => {
      const clampedTime = prev.currentScenario
        ? Math.max(0, Math.min(time, prev.currentScenario.duration))
        : time;
      return { ...prev, currentTime: clampedTime };
    });
  }, []);

  // 設定速度
  const setSpeed = useCallback((speed: number) => {
    setState(prev => ({ ...prev, playbackSpeed: speed }));
  }, []);

  // 重置
  const reset = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentTime: 0,
      isPlaying: false,
    }));
  }, []);

  // 跳到下一個關鍵幀
  const nextKeyframe = useCallback(() => {
    setState(prev => {
      if (!prev.currentScenario) return prev;

      const keyframes = prev.currentScenario.keyframes;
      const nextKf = keyframes.find(kf => kf.time > prev.currentTime);
      
      return {
        ...prev,
        currentTime: nextKf ? nextKf.time : prev.currentScenario.duration,
      };
    });
  }, []);

  // 跳到上一個關鍵幀
  const prevKeyframe = useCallback(() => {
    setState(prev => {
      if (!prev.currentScenario) return prev;

      const keyframes = prev.currentScenario.keyframes;
      const prevKf = [...keyframes].reverse().find(kf => kf.time < prev.currentTime - 0.1);
      
      return {
        ...prev,
        currentTime: prevKf ? prevKf.time : 0,
      };
    });
  }, []);

  // 更新插值狀態
  useEffect(() => {
    if (!state.currentScenario) {
      setState(prev => ({ ...prev, interpolatedState: null }));
      return;
    }

    const interval = findKeyframeInterval(
      state.currentScenario.keyframes,
      state.currentTime
    );

    if (interval) {
      const interpolated = interpolateKeyframes(interval.prev, interval.next, interval.t);
      setState(prev => ({ ...prev, interpolatedState: interpolated }));
    }
  }, [state.currentScenario, state.currentTime]);

  // 播放動畫循環
  useEffect(() => {
    if (!state.isPlaying || !state.currentScenario) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    lastTimeRef.current = performance.now();

    const animate = (timestamp: number) => {
      const delta = (timestamp - lastTimeRef.current) / 1000; // 轉換為秒
      lastTimeRef.current = timestamp;

      setState(prev => {
        if (!prev.currentScenario || !prev.isPlaying) return prev;

        const newTime = prev.currentTime + delta * prev.playbackSpeed;
        
        // 檢查是否到達結尾
        if (newTime >= prev.currentScenario.duration) {
          return {
            ...prev,
            currentTime: prev.currentScenario.duration,
            isPlaying: false, // 自動暫停
          };
        }

        return { ...prev, currentTime: newTime };
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state.isPlaying, state.currentScenario]);

  return {
    // 狀態
    currentScenario: state.currentScenario,
    isPlaying: state.isPlaying,
    currentTime: state.currentTime,
    playbackSpeed: state.playbackSpeed,
    interpolatedState: state.interpolatedState,
    progress: state.currentScenario
      ? (state.currentTime / state.currentScenario.duration) * 100
      : 0,

    // 操作
    selectScenario,
    play,
    pause,
    togglePlay,
    setTime,
    setSpeed,
    reset,
    nextKeyframe,
    prevKeyframe,
  };
}
