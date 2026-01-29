import { useState, useRef, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Beam, TimeSlot, DEFAULT_SCHEDULE } from '../types';
import { BeamScheduler, applySchedulerToBeams } from '../utils/BeamScheduler';

interface UseBeamSchedulerOptions {
  schedule?: TimeSlot[];
  autoStart?: boolean;
  speedMultiplier?: number;
  /** 初始時隙偏移 (用於多衛星不同步) */
  slotOffset?: number;
}

interface UseBeamSchedulerReturn {
  /** 當前波束狀態 (已更新活躍狀態) */
  beams: Beam[];
  /** 當前時隙索引 */
  currentSlotIndex: number;
  /** 當前時隙進度 (0-1) */
  progress: number;
  /** 是否正在運行 */
  isRunning: boolean;
  /** 開始動畫 */
  start: () => void;
  /** 暫停動畫 */
  pause: () => void;
  /** 切換運行狀態 */
  toggle: () => void;
  /** 重置 */
  reset: () => void;
  /** 下一時隙 */
  nextSlot: () => void;
  /** 上一時隙 */
  prevSlot: () => void;
  /** 設置速度 */
  setSpeed: (speed: number) => void;
}

/**
 * Beam Hopping 調度器 Hook
 */
export function useBeamScheduler(
  initialBeams: Beam[],
  options: UseBeamSchedulerOptions = {}
): UseBeamSchedulerReturn {
  const {
    schedule = DEFAULT_SCHEDULE,
    autoStart = false,
    speedMultiplier = 1,
    slotOffset = 0,
  } = options;

  const schedulerRef = useRef<BeamScheduler>(new BeamScheduler(schedule, slotOffset));
  const [beams, setBeams] = useState<Beam[]>(initialBeams);
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(autoStart);

  // 初始化
  useEffect(() => {
    schedulerRef.current.setSpeedMultiplier(speedMultiplier);
    if (autoStart) {
      schedulerRef.current.start();
    }
  }, []);

  // 每幀更新
  useFrame((_, delta) => {
    const scheduler = schedulerRef.current;
    const slotChanged = scheduler.update(delta * 1000); // 轉換為 ms

    if (slotChanged) {
      setBeams(applySchedulerToBeams(initialBeams, scheduler));
    }

    const state = scheduler.getState();
    setCurrentSlotIndex(state.currentSlotIndex);
    setProgress(state.progress);
    setIsRunning(state.isRunning);
  });

  const start = useCallback(() => {
    schedulerRef.current.start();
    setIsRunning(true);
  }, []);

  const pause = useCallback(() => {
    schedulerRef.current.pause();
    setIsRunning(false);
  }, []);

  const toggle = useCallback(() => {
    if (schedulerRef.current.getState().isRunning) {
      pause();
    } else {
      start();
    }
  }, [start, pause]);

  const reset = useCallback(() => {
    schedulerRef.current.reset();
    setBeams(applySchedulerToBeams(initialBeams, schedulerRef.current));
    setCurrentSlotIndex(0);
    setProgress(0);
    setIsRunning(false);
  }, [initialBeams]);

  const nextSlot = useCallback(() => {
    schedulerRef.current.nextSlot();
    setBeams(applySchedulerToBeams(initialBeams, schedulerRef.current));
    setCurrentSlotIndex(schedulerRef.current.getState().currentSlotIndex);
  }, [initialBeams]);

  const prevSlot = useCallback(() => {
    schedulerRef.current.prevSlot();
    setBeams(applySchedulerToBeams(initialBeams, schedulerRef.current));
    setCurrentSlotIndex(schedulerRef.current.getState().currentSlotIndex);
  }, [initialBeams]);

  const setSpeed = useCallback((speed: number) => {
    schedulerRef.current.setSpeedMultiplier(speed);
  }, []);

  return {
    beams,
    currentSlotIndex,
    progress,
    isRunning,
    start,
    pause,
    toggle,
    reset,
    nextSlot,
    prevSlot,
    setSpeed,
  };
}
