/**
 * 多衛星星座配置
 *
 * 用於展示多衛星 beam hopping 和覆蓋重疊
 */

import { BeamConfig, DEFAULT_BEAM_CONFIG } from './beam';

/**
 * 單顆衛星配置
 */
export interface SatelliteConfig {
  id: string;
  /** 衛星位置 (場景座標) */
  position: {
    x: number;
    y: number;
    z: number;
  };
  /** 是否顯示完整波束 (false = 只顯示圖示) */
  showBeams: boolean;
  /** 波束配置 (可選，預設使用 DEFAULT_BEAM_CONFIG) */
  beamConfig?: BeamConfig;
  /** 時隙偏移 (用於不同衛星的 beam hopping 相位差) */
  slotOffset?: number;
}

/**
 * 星座配置
 */
export interface ConstellationConfig {
  /** 所有衛星 */
  satellites: SatelliteConfig[];
  /** 衛星間距 (場景單位) */
  satelliteSpacing: number;
  /** 顯示重疊區域 */
  showOverlap: boolean;
}

/**
 * 預設星座配置 - 3顆相鄰衛星
 *
 * 佈局:
 *   [Sat-L]     [Sat-C]     [Sat-R]
 *      ↘          ↓          ↙
 *       ○○○      ○○○      ○○○
 *        重疊區    重疊區
 */
export const DEFAULT_CONSTELLATION: ConstellationConfig = {
  satellites: [
    {
      id: 'sat-left',
      position: { x: -350, y: DEFAULT_BEAM_CONFIG.coneHeight, z: 0 },
      showBeams: true,
      slotOffset: 0,
    },
    {
      id: 'sat-center',
      position: { x: 0, y: DEFAULT_BEAM_CONFIG.coneHeight, z: 0 },
      showBeams: true,
      slotOffset: 1,
    },
    {
      id: 'sat-right',
      position: { x: 350, y: DEFAULT_BEAM_CONFIG.coneHeight, z: 0 },
      showBeams: true,
      slotOffset: 2,
    },
  ],
  satelliteSpacing: 350,
  showOverlap: true,
};

/**
 * 遠處衛星位置 (只顯示圖示)
 */
export const DISTANT_SATELLITES: SatelliteConfig[] = [
  {
    id: 'sat-far-1',
    position: { x: -700, y: DEFAULT_BEAM_CONFIG.coneHeight, z: -200 },
    showBeams: false,
  },
  {
    id: 'sat-far-2',
    position: { x: 700, y: DEFAULT_BEAM_CONFIG.coneHeight, z: -200 },
    showBeams: false,
  },
  {
    id: 'sat-far-3',
    position: { x: 0, y: DEFAULT_BEAM_CONFIG.coneHeight, z: -400 },
    showBeams: false,
  },
  {
    id: 'sat-far-4',
    position: { x: -350, y: DEFAULT_BEAM_CONFIG.coneHeight, z: 400 },
    showBeams: false,
  },
  {
    id: 'sat-far-5',
    position: { x: 350, y: DEFAULT_BEAM_CONFIG.coneHeight, z: 400 },
    showBeams: false,
  },
];
