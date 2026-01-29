# SDD 06: 實作時隙調度邏輯

## 任務說明

實作 Beam Hopping 的時隙調度器，控制波束在不同時隙的活躍狀態。

## 前置條件

- 完成 `05-GROUND-CELLS.md`
- 地面覆蓋區已實作

## 執行步驟

### Step 1: 建立 BeamScheduler.ts

建立 `src/features/beam-hopping/utils/BeamScheduler.ts`：

```typescript
import { Beam, TimeSlot, BeamHoppingState, DEFAULT_SCHEDULE } from '../types';
import { updateBeamActiveStates } from './BeamConfig';

/**
 * Beam Hopping 調度器
 *
 * 管理時隙切換和波束活躍狀態
 */
export class BeamScheduler {
  private schedule: TimeSlot[];
  private currentSlotIndex: number = 0;
  private elapsedTime: number = 0;
  private isRunning: boolean = false;
  private speedMultiplier: number = 1;

  constructor(schedule: TimeSlot[] = DEFAULT_SCHEDULE) {
    this.schedule = schedule;
  }

  /**
   * 獲取當前時隙
   */
  getCurrentSlot(): TimeSlot {
    return this.schedule[this.currentSlotIndex];
  }

  /**
   * 獲取當前時隙的活躍波束 IDs
   */
  getActiveBeamIds(): number[] {
    return this.getCurrentSlot().activeBeams;
  }

  /**
   * 更新調度器狀態
   *
   * @param deltaTime - 經過的時間 (ms)
   * @returns 是否發生時隙切換
   */
  update(deltaTime: number): boolean {
    if (!this.isRunning) return false;

    this.elapsedTime += deltaTime * this.speedMultiplier;

    const currentSlot = this.getCurrentSlot();
    if (this.elapsedTime >= currentSlot.duration) {
      this.elapsedTime = 0;
      this.currentSlotIndex = (this.currentSlotIndex + 1) % this.schedule.length;
      return true; // 發生切換
    }

    return false;
  }

  /**
   * 開始調度
   */
  start(): void {
    this.isRunning = true;
  }

  /**
   * 暫停調度
   */
  pause(): void {
    this.isRunning = false;
  }

  /**
   * 重置調度器
   */
  reset(): void {
    this.currentSlotIndex = 0;
    this.elapsedTime = 0;
    this.isRunning = false;
  }

  /**
   * 設置速度倍率
   */
  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = Math.max(0.1, Math.min(5, multiplier));
  }

  /**
   * 手動切換到下一時隙
   */
  nextSlot(): void {
    this.currentSlotIndex = (this.currentSlotIndex + 1) % this.schedule.length;
    this.elapsedTime = 0;
  }

  /**
   * 手動切換到上一時隙
   */
  prevSlot(): void {
    this.currentSlotIndex =
      (this.currentSlotIndex - 1 + this.schedule.length) % this.schedule.length;
    this.elapsedTime = 0;
  }

  /**
   * 獲取當前狀態
   */
  getState(): {
    currentSlotIndex: number;
    activeBeams: number[];
    isRunning: boolean;
    progress: number;
  } {
    const currentSlot = this.getCurrentSlot();
    return {
      currentSlotIndex: this.currentSlotIndex,
      activeBeams: currentSlot.activeBeams,
      isRunning: this.isRunning,
      progress: this.elapsedTime / currentSlot.duration,
    };
  }
}

/**
 * 創建調度器實例的工廠函數
 */
export function createBeamScheduler(schedule?: TimeSlot[]): BeamScheduler {
  return new BeamScheduler(schedule);
}

/**
 * 根據調度器狀態更新波束
 */
export function applySchedulerToBeams(
  beams: Beam[],
  scheduler: BeamScheduler
): Beam[] {
  return updateBeamActiveStates(beams, scheduler.getActiveBeamIds());
}
```

### Step 2: 建立 React Hook

建立 `src/features/beam-hopping/hooks/useBeamScheduler.ts`：

```typescript
import { useState, useRef, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Beam, TimeSlot, DEFAULT_SCHEDULE } from '../types';
import { BeamScheduler, applySchedulerToBeams } from '../utils/BeamScheduler';

interface UseBeamSchedulerOptions {
  schedule?: TimeSlot[];
  autoStart?: boolean;
  speedMultiplier?: number;
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
  } = options;

  const schedulerRef = useRef<BeamScheduler>(new BeamScheduler(schedule));
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
```

### Step 3: 建立 hooks 目錄導出

建立 `src/features/beam-hopping/hooks/index.ts`：

```typescript
export { useBeamScheduler } from './useBeamScheduler';
```

### Step 4: 更新工具函數導出

更新 `src/features/beam-hopping/utils/index.ts`：

```typescript
export * from './BeamConfig';
export * from './BeamScheduler';
```

### Step 5: 更新功能模組主入口

更新 `src/features/beam-hopping/index.ts`：

```typescript
// Types
export * from './types';

// Utils
export * from './utils';

// Hooks
export * from './hooks';

// Components
export * from './components';
```

### Step 6: 驗證

```bash
npm run typecheck
```

## 驗收標準

- [ ] BeamScheduler 類正確實作
- [ ] useBeamScheduler hook 正確實作
- [ ] 時隙切換邏輯正常
- [ ] 所有導出正確
- [ ] TypeScript 編譯通過

## 下一步

完成後繼續 `07-BEAM-ANIMATION.md`
