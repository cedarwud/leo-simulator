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

  constructor(schedule: TimeSlot[] = DEFAULT_SCHEDULE, initialSlotIndex: number = 0) {
    this.schedule = schedule;
    this.currentSlotIndex = initialSlotIndex % schedule.length;
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
