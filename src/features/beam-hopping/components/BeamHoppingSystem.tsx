import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { EarthFixedCell, POLARIZATION_COLORS, getBeamPolarization } from './EarthFixedCells';
import { SatelliteBeams, BeamAssignment, getVisibleCells } from './SatelliteBeams';
import { ENERGY_CONFIG } from '@/config/energy.config';
import { SatelliteOrbitCalculator } from '@/utils/satellite/SatelliteOrbitCalculator';
import type { UEHandoverState } from './MultiUEManager';

// 使用與 Satellite Handover 場景相同的數據源
const ORBIT_DATA_URL = '/data/satellite-timeseries-starlink.json';

const SATELLITE_MODEL_PATH = '/models/sat.glb';
useGLTF.preload(SATELLITE_MODEL_PATH);

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

/**
 * Beam Management 統計數據
 */
export interface BeamManagementStats {
  currentSatelliteId: string | null;
  currentBeamId: number | null;
  currentRSRP: number | null;
  beamHandovers: number;
  satelliteHandovers: number;
  totalHandovers: number;
  elapsedTime: number;
  energyConsumption: number;
  averageEnergyPerSecond: number;
  activeBeams: number[];

  // 論文 4-1：UE 所在 Cell 的 Data Queue（虛擬佇列 M_c）
  ueDataQueue: number;

  // Paper 5-1：能耗投影與對比
  energyProjection: EnergyProjection | null;

  // 新增：換手詳細資訊
  handoverDetails: {
    // UE 在哪個 Cell
    ueCellId: number | null;
    // 當前服務的波束
    servingBeamId: number | null;
    // 預測下一個波束（基於衛星移動方向）
    predictedNextBeam: number | null;
    // 距離換手邊界的估計（單位：場景距離）
    distanceToHandover: number | null;
    // 換手倒計時（秒）
    timeToHandover: number | null;
    // 最近的換手歷史
    recentHandovers: Array<{
      time: number;
      type: 'beam' | 'satellite';
      from: string;
      to: string;
    }>;
  };
}

/**
 * Beam 狀態：追蹤每個波束服務的 Cell
 */
interface BeamState {
  beamId: number;        // 波束編號 (1, 2, 3...)
  targetCellId: number;  // 目標 Cell ID
  isActive: boolean;     // 當前時隙是否激活
}

/**
 * 找到 UE 所在的 Cell
 */
function findUECell(
  uePosition: THREE.Vector3,
  cells: EarthFixedCell[]
): EarthFixedCell | null {
  for (const cell of cells) {
    const dx = cell.position.x - uePosition.x;
    const dz = cell.position.z - uePosition.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= cell.radius) {
      return cell;
    }
  }
  return null;
}

/**
 * 計算簡化的 RSRP
 */
function calculateRSRP(
  satellitePosition: THREE.Vector3,
  cellPosition: { x: number; z: number },
  satelliteHeight: number
): number {
  const dx = cellPosition.x - satellitePosition.x;
  const dz = cellPosition.z - satellitePosition.z;
  const horizontalDist = Math.sqrt(dx * dx + dz * dz);
  const dist3D = Math.sqrt(horizontalDist * horizontalDist + satelliteHeight * satelliteHeight);

  // 簡化的 RSRP 計算
  const pathLoss = 20 * Math.log10(dist3D / satelliteHeight);
  return -50 - pathLoss; // dBm
}

/**
 * Paper 5-1 基準數據 (3000 秒模擬結果)
 * Source: Ntabeni et al., "Adaptive Handover Optimization in LEO Satellite Networks
 * Using Energy-Aware Q-Learning," IEEE OJCOMS, 2025
 */
const PAPER_5_1_BASELINES = {
  // Energy-Aware Q-Learning (論文提出的方法 - 最佳)
  EAQL: { energyAt3000s: 4.5, handoversAt3000s: 750 },
  // Traditional Q-Learning
  Traditional: { energyAt3000s: 6.0, handoversAt3000s: 2200 },
  // Predictive Modeling
  Predictive: { energyAt3000s: 14.0, handoversAt3000s: 2800 },
  // Entropy-based Selection
  Entropy: { energyAt3000s: 14.0, handoversAt3000s: 2800 },
} as const;

/**
 * 計算能耗投影與 Paper 5-1 對比
 */
function calculateEnergyProjection(
  currentEnergy: number,
  totalHandovers: number,
  elapsedTime: number
): EnergyProjection | null {
  // 需要至少 10 秒的數據才能做有意義的投影
  if (elapsedTime < 10) return null;

  // 計算當前速率
  const energyRate = (currentEnergy / elapsedTime) * 60; // J/min
  const handoverRate = totalHandovers / elapsedTime; // handovers/sec

  // 投影到 3000 秒
  const projectedEnergy = (currentEnergy / elapsedTime) * 3000;
  const projectedHandovers = Math.round(handoverRate * 3000);

  // 與 Paper 5-1 各方法比較 (正值表示比 baseline 多消耗，負值表示節省)
  const vsEAQL = {
    energy: projectedEnergy - PAPER_5_1_BASELINES.EAQL.energyAt3000s,
    percentage: ((projectedEnergy - PAPER_5_1_BASELINES.EAQL.energyAt3000s) / PAPER_5_1_BASELINES.EAQL.energyAt3000s) * 100,
  };
  const vsTraditional = {
    energy: projectedEnergy - PAPER_5_1_BASELINES.Traditional.energyAt3000s,
    percentage: ((projectedEnergy - PAPER_5_1_BASELINES.Traditional.energyAt3000s) / PAPER_5_1_BASELINES.Traditional.energyAt3000s) * 100,
  };
  const vsPredictive = {
    energy: projectedEnergy - PAPER_5_1_BASELINES.Predictive.energyAt3000s,
    percentage: ((projectedEnergy - PAPER_5_1_BASELINES.Predictive.energyAt3000s) / PAPER_5_1_BASELINES.Predictive.energyAt3000s) * 100,
  };

  // 評級：基於與 Traditional 方法的比較
  let rating: EnergyProjection['rating'];
  if (projectedEnergy <= PAPER_5_1_BASELINES.EAQL.energyAt3000s * 1.1) {
    rating = 'excellent'; // 接近或優於 EA-QL
  } else if (projectedEnergy <= PAPER_5_1_BASELINES.Traditional.energyAt3000s) {
    rating = 'good'; // 優於 Traditional
  } else if (projectedEnergy <= PAPER_5_1_BASELINES.Predictive.energyAt3000s * 0.7) {
    rating = 'average'; // 比 Predictive 好但比 Traditional 差
  } else {
    rating = 'poor'; // 接近或差於 Predictive
  }

  return {
    currentRate: energyRate,
    projectedAt3000s: projectedEnergy,
    projectedHandoversAt3000s: projectedHandovers,
    comparison: { vsEAQL, vsTraditional, vsPredictive },
    rating,
  };
}

interface BeamHoppingSystemProps {
  cells: EarthFixedCell[];
  /** 多 UE 位置資訊 */
  uePositions: Array<{ id: string; cellId: number; position: THREE.Vector3 }>;
  /** 當前選中的 UE ID（用於統計顯示） */
  selectedUEId?: string;
  satelliteHeight?: number;
  timeSpeed?: number;
  /** Beam Hopping 時隙持續時間（秒） */
  slotDuration?: number;
  /** 每顆衛星最大波束數 */
  maxBeamsPerSat?: number;
  onStatsUpdate?: (stats: BeamManagementStats) => void;
  onCellsUpdate?: (cells: EarthFixedCell[]) => void;
  /** UE 狀態更新回調 */
  onUEStatesUpdate?: (states: Map<string, UEHandoverState>) => void;
}

/**
 * 新的 Beam Hopping 系統
 * 
 * 核心概念：
 * 1. 衛星有固定數量的波束 (如 4 個)
 * 2. 波束在時隙 (slot) 間「跳躍」服務不同的 Cells
 * 3. Beam Handover：當服務 UE 的波束編號改變時發生
 * 4. Satellite Handover：當服務 UE 的衛星改變時發生
 * 5. 支援多 UE 追蹤
 */
export function BeamHoppingSystem({
  cells: initialCells,
  uePositions,
  selectedUEId,
  satelliteHeight = 400,
  timeSpeed = 3,        // 衛星移動速度（1.5x 加速）
  slotDuration = 0.5,
  maxBeamsPerSat = 4,   // 論文 4-1：每顆衛星最大波束數 B
  onStatsUpdate,
  onCellsUpdate,
  onUEStatesUpdate,
}: BeamHoppingSystemProps) {
  const { scene } = useGLTF(SATELLITE_MODEL_PATH);
  
  // 為了向後兼容，找到選中的 UE 或第一個 UE 的位置
  const selectedUE = uePositions.find(ue => ue.id === selectedUEId) || uePositions[0];
  const uePosition = selectedUE?.position || new THREE.Vector3(0, 10, 0);
  
  // 狀態
  const [cells, setCells] = useState<EarthFixedCell[]>(initialCells);
  const elapsedTimeRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  
  // 多 UE 狀態追蹤（每個 UE 的換手狀態）
  const ueStatesRef = useRef<Map<string, {
    lastBeamId: number | null;
    lastSatelliteId: string | null;
    handoverCount: number;
  }>>(new Map());
  
  // 初始化 UE 狀態追蹤
  useMemo(() => {
    for (const ue of uePositions) {
      if (!ueStatesRef.current.has(ue.id)) {
        ueStatesRef.current.set(ue.id, {
          lastBeamId: null,
          lastSatelliteId: null,
          handoverCount: 0,
        });
      }
    }
  }, [uePositions]);
  
  // Beam Handover 詳細資訊（用於側邊欄）
  const [handoverInfo, setHandoverInfo] = useState<{
    // 當前狀態
    currentBeamId: number | null;
    currentSatelliteId: string | null;
    // 預測資訊
    predictedNextBeam: number | null;
    distanceToHandover: number | null;  // 距離換手的估計距離
    // 歷史記錄
    lastHandoverTime: number | null;
    handoverHistory: Array<{
      time: number;
      type: 'beam' | 'satellite';
      from: string;
      to: string;
    }>;
  }>({
    currentBeamId: null,
    currentSatelliteId: null,
    predictedNextBeam: null,
    distanceToHandover: null,
    lastHandoverTime: null,
    handoverHistory: [],
  });
  
  // Beam Handover 視覺提示
  const [handoverAlert, setHandoverAlert] = useState<{
    type: 'beam' | 'satellite';
    from: string;
    to: string;
    timestamp: number;
  } | null>(null);
  
  // Beam Hopping 時隙追蹤
  const currentSlotRef = useRef(0);
  const lastSlotRef = useRef(-1);
  
  // Inter-satellite Handover 追蹤
  // 論文 4-1：追蹤每個 cell 的服務衛星，當服務衛星改變時計為換手
  const cellServingSatRef = useRef<Map<number, string>>(new Map()); // cell ID → 服務衛星 ID
  const interSatelliteHandoversRef = useRef(0);
  const lastServingSatRef = useRef<string | null>(null);
  const lastServingBeamIdRef = useRef<number | null>(null);
  const lastServingCellIdRef = useRef<number | null>(null);
  
  // ========== 使用真實軌道數據（與 Satellite Handover 場景相同） ==========
  const calculator = useMemo(() => new SatelliteOrbitCalculator(), []);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // 載入衛星軌道數據
  useEffect(() => {
    calculator
      .loadTimeseries(ORBIT_DATA_URL)
      .then(() => {
        setIsLoaded(true);
        console.log('✅ BeamHopping: 載入真實軌道數據成功');
      })
      .catch((err) => {
        console.error('❌ BeamHopping: 軌道數據載入失敗:', err);
      });
  }, [calculator]);
  
  // 當前活躍的衛星和位置
  const [activeSatellites, setActiveSatellites] = useState<Map<string, THREE.Vector3>>(new Map());
  
  // 當前服務狀態（包含波束分配）
  const [servingState, setServingState] = useState<{
    satelliteId: string | null;
    beams: BeamState[];           // 所有波束狀態
    primaryBeamId: number | null; // 服務 UE 的波束編號
    primaryCellId: number | null; // UE 所在的 Cell
    currentSlot: number;          // 當前時隙
  }>({
    satelliteId: null,
    beams: [],
    primaryBeamId: null,
    primaryCellId: null,
    currentSlot: 0,
  });
  
  // 更新統計（接收最新的 cells 數據）
  const updateStats = useCallback((currentCells: EarthFixedCell[]) => {
    if (!onStatsUpdate) return;

    const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
    const totalHandovers = interSatelliteHandoversRef.current;
    const energyConsumption = totalHandovers * ENERGY_CONFIG.ENERGY_PER_HANDOVER;

    const ueCell = findUECell(uePosition, currentCells);
    const servingSat = activeSatellites.get(servingState.satelliteId || '');

    // 獲取 UE 所在 Cell 的 Data Queue（使用傳入的最新 cells）
    const ueCellData = currentCells.find(c => c.id === ueCell?.id);
    const ueDataQueue = ueCellData?.dataQueue ?? 0;

    // 計算 Paper 5-1 能耗投影
    const energyProjection = calculateEnergyProjection(energyConsumption, totalHandovers, elapsedTime);

    onStatsUpdate({
      currentSatelliteId: servingState.satelliteId,
      currentBeamId: servingState.primaryBeamId,
      currentRSRP: servingSat && ueCell
        ? calculateRSRP(servingSat, ueCell.position, satelliteHeight)
        : null,
      beamHandovers: 0,
      satelliteHandovers: interSatelliteHandoversRef.current,
      totalHandovers,
      elapsedTime,
      energyConsumption,
      averageEnergyPerSecond: elapsedTime > 0 ? energyConsumption / elapsedTime : 0,
      activeBeams: servingState.beams.filter(b => b.isActive).map(b => b.beamId),
      ueDataQueue,
      energyProjection,
      handoverDetails: {
        ueCellId: ueCell?.id ?? null,
        servingBeamId: servingState.primaryBeamId,
        predictedNextBeam: handoverInfo.predictedNextBeam,
        distanceToHandover: handoverInfo.distanceToHandover,
        timeToHandover: handoverInfo.distanceToHandover !== null
          ? handoverInfo.distanceToHandover / 50
          : null,
        recentHandovers: handoverInfo.handoverHistory.slice(-5),
      },
    });
  }, [onStatsUpdate, uePosition, activeSatellites, servingState, satelliteHeight, handoverInfo]);
  
  // 每幀更新
  useFrame((_, delta) => {
    // 等待數據載入完成
    if (!isLoaded) return;
    
    elapsedTimeRef.current += delta * timeSpeed;
    const currentTime = elapsedTimeRef.current;
    
    // 計算當前時隙
    const currentSlot = Math.floor(currentTime / slotDuration);
    const isNewSlot = currentSlot !== lastSlotRef.current;
    lastSlotRef.current = currentSlot;
    
    // ========== 使用 SatelliteOrbitCalculator 取得可見衛星 ==========
    const visibleSatellites = calculator.getVisibleSatellites(currentTime, timeSpeed);
    
    // 更新衛星位置（轉換格式）
    const newActiveSats = new Map<string, THREE.Vector3>();
    visibleSatellites.forEach((pos, satId) => {
      newActiveSats.set(satId, pos);
    });
    setActiveSatellites(newActiveSats);
    
    // 找到 UE 所在的 Cell
    const ueCell = findUECell(uePosition, cells);
    
    // 選擇最佳服務衛星（最近且可見 UE 的 cell）
    let bestSatId: string | null = null;
    let bestDistance = Infinity;
    let bestSatPosition: THREE.Vector3 | null = null;
    let visibleCellsForBestSat: EarthFixedCell[] = [];
    
    newActiveSats.forEach((pos, satId) => {
      const visibleCells = getVisibleCells(pos, cells, 25);
      
      if (ueCell && visibleCells.some(c => c.id === ueCell.id)) {
        const dx = pos.x - uePosition.x;
        const dz = pos.z - uePosition.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        
        if (dist < bestDistance) {
          bestDistance = dist;
          bestSatId = satId;
          bestSatPosition = pos.clone();
          visibleCellsForBestSat = visibleCells;
        }
      }
    });
    
    // ========== Beam Hopping 調度 ==========
    // 為每個波束分配目標 Cell
    // 核心原則：UE 必須始終被服務（論文 4-1）
    let beams: BeamState[] = [];
    let primaryBeamId: number | null = null;

    if (bestSatId && bestSatPosition !== null && visibleCellsForBestSat.length > 0) {
      // 按距離衛星排序可見的 cells
      const satPos = bestSatPosition as THREE.Vector3;
      const satGroundPos = new THREE.Vector2(satPos.x, satPos.z);
      const sortedCells = [...visibleCellsForBestSat].sort((a, b) => {
        const distA = satGroundPos.distanceTo(new THREE.Vector2(a.position.x, a.position.z));
        const distB = satGroundPos.distanceTo(new THREE.Vector2(b.position.x, b.position.z));
        return distA - distB;
      });

      // 【關鍵修改】確保 UE cell 始終被服務
      // 如果 UE cell 不在最近的 cells 中，強制加入
      let servingCells: EarthFixedCell[] = [];
      const ueCellInVisible = ueCell && visibleCellsForBestSat.some(c => c.id === ueCell.id);

      if (ueCell && ueCellInVisible) {
        // 找到 UE cell 在排序中的位置
        const ueCellIndex = sortedCells.findIndex(c => c.id === ueCell.id);

        if (ueCellIndex < maxBeamsPerSat) {
          // UE cell 已經在最近的 cells 中
          servingCells = sortedCells.slice(0, maxBeamsPerSat);
        } else {
          // UE cell 不在最近的 cells 中，強制包含它
          // 取最近的 (maxBeamsPerSat - 1) 個 + UE cell
          const otherCells = sortedCells.filter(c => c.id !== ueCell.id).slice(0, maxBeamsPerSat - 1);
          servingCells = [...otherCells, ueCell];
        }
      } else {
        // 沒有 UE cell，正常選擇最近的
        servingCells = sortedCells.slice(0, maxBeamsPerSat);
      }

      // 重新按距離排序（用於確定波束編號）
      servingCells.sort((a, b) => {
        const distA = satGroundPos.distanceTo(new THREE.Vector2(a.position.x, a.position.z));
        const distB = satGroundPos.distanceTo(new THREE.Vector2(b.position.x, b.position.z));
        return distA - distB;
      });

      for (let i = 0; i < servingCells.length; i++) {
        const cell = servingCells[i];
        const beamId = i + 1; // 波束編號從 1 開始（Beam 1 = 最近的 cell）

        beams.push({
          beamId,
          targetCellId: cell.id,
          isActive: true, // 所有分配的波束都顯示
        });

        // 找到服務 UE 的波束
        if (cell.id === ueCell?.id) {
          primaryBeamId = beamId;
        }
      }
    }
    
    // ========== 計算換手預測資訊 ==========
    let predictedNextBeam: number | null = null;
    let distanceToHandover: number | null = null;
    
    if (bestSatPosition && ueCell && primaryBeamId !== null) {
      const satPos = bestSatPosition as THREE.Vector3;
      const ueCellPos = new THREE.Vector2(ueCell.position.x, ueCell.position.z);
      const satGroundPos = new THREE.Vector2(satPos.x, satPos.z);
      
      // 目前 UE Cell 距離衛星的距離
      const currentDist = satGroundPos.distanceTo(ueCellPos);
      
      // 預測：如果當前是 Beam N，下一個可能是 Beam N+1（衛星遠離）或 Beam N-1（衛星接近）
      // 簡化：假設衛星遠離，下一個會是更大的編號
      if (primaryBeamId < maxBeamsPerSat) {
        predictedNextBeam = primaryBeamId + 1;
        
        // 估算距離換手的距離：假設每個 beam 覆蓋約 cellRadius 的範圍
        const cellRadius = ueCell.radius || 80;
        distanceToHandover = Math.max(0, cellRadius - (currentDist % cellRadius));
      }
    }
    
    // ========== Inter-satellite Handover 檢測 ==========
    // 論文 4-1 核心：當某個 cell 的服務衛星改變時，發生換手
    const now = Date.now();
    
    // 更新當前選中 UE 的服務衛星（用於 UI 顯示）
    if (bestSatId !== lastServingSatRef.current && bestSatId !== null) {
      // 檢查是否為衛星間換手
      if (lastServingSatRef.current !== null && ueCell) {
        interSatelliteHandoversRef.current += 1;
        console.log(`🛰️ Inter-satellite Handover [Cell ${ueCell.id}]: ${lastServingSatRef.current} → ${bestSatId}`);
        
        const handoverRecord = {
          time: now,
          type: 'satellite' as const,
          from: lastServingSatRef.current,
          to: bestSatId,
        };
        
        setHandoverAlert({ ...handoverRecord, timestamp: now });
        setHandoverInfo(prev => ({
          ...prev,
          currentSatelliteId: bestSatId,
          lastHandoverTime: now,
          handoverHistory: [...prev.handoverHistory, handoverRecord].slice(-10),
        }));
      } else {
        setHandoverInfo(prev => ({
          ...prev,
          currentSatelliteId: bestSatId,
        }));
      }
      lastServingSatRef.current = bestSatId;
    }
    
    // 更新波束編號（用於 UI 顯示，不計為換手）
    if (primaryBeamId !== null && primaryBeamId !== lastServingBeamIdRef.current) {
      lastServingBeamIdRef.current = primaryBeamId;
      setHandoverInfo(prev => ({
        ...prev,
        currentBeamId: primaryBeamId,
      }));
    }
    
    // 更新預測資訊
    setHandoverInfo(prev => ({
      ...prev,
      predictedNextBeam,
      distanceToHandover,
    }));
    
    // 清除過期的 handover 提示（5秒後，給更多時間觀察）
    if (handoverAlert && Date.now() - handoverAlert.timestamp > 5000) {
      setHandoverAlert(null);
    }
    
    // 更新 Cell ID 追蹤
    lastServingCellIdRef.current = ueCell?.id ?? null;
    
    // ========== 多 UE 換手追蹤 ==========
    const newUEStates = new Map<string, UEHandoverState>();
    
    for (const ue of uePositions) {
      // 找到此 UE 所在的 Cell
      const thisUECell = findUECell(ue.position, cells);
      if (!thisUECell) continue;
      
      // 找到服務此 UE Cell 的波束
      const servingBeam = beams.find(b => b.targetCellId === thisUECell.id);
      const servingBeamId = servingBeam?.beamId ?? null;
      
      // 計算 RSRP
      let rsrp: number | null = null;
      if (bestSatPosition) {
        rsrp = calculateRSRP(bestSatPosition, thisUECell.position, satelliteHeight);
      }
      
      // 檢查是否發生換手
      const prevState = ueStatesRef.current.get(ue.id);
      let handoverCount = prevState?.handoverCount ?? 0;
      
      if (prevState && servingBeamId !== null) {
        if (prevState.lastBeamId !== null && prevState.lastBeamId !== servingBeamId) {
          handoverCount += 1;
          console.log(`📶 [${ue.id}] Beam Handover: B${prevState.lastBeamId} → B${servingBeamId}`);
        }
      }
      
      // 更新追蹤狀態
      ueStatesRef.current.set(ue.id, {
        lastBeamId: servingBeamId,
        lastSatelliteId: bestSatId,
        handoverCount,
      });
      
      // 建立輸出狀態
      newUEStates.set(ue.id, {
        ueId: ue.id,
        currentCellId: thisUECell.id,
        servingBeamId,
        servingSatelliteId: bestSatId,
        rsrp,
        lastHandoverTime: prevState?.lastBeamId !== servingBeamId ? now : null,
        handoverCount,
      });
    }
    
    // 回調更新 UE 狀態
    if (onUEStatesUpdate) {
      onUEStatesUpdate(newUEStates);
    }
    
    // 獲取當前激活的 cell IDs（用於渲染）
    const activeCellIds = beams.filter(b => b.isActive).map(b => b.targetCellId);
    
    // ========== Per-Cell 衛星分配和換手追蹤 ==========
    // 論文 4-1 核心：每個 cell 可以被不同衛星服務，追蹤每個 cell 的服務衛星變化
    const cellServingMap = new Map<number, string>(); // cell ID → serving satellite ID
    
    for (const cell of cells) {
      // 找到能看到此 cell 的所有衛星
      let bestSatForCell: string | null = null;
      let bestDistForCell = Infinity;
      
      newActiveSats.forEach((satPos, satId) => {
        const visibleCells = getVisibleCells(satPos, cells, 25);
        if (visibleCells.some(c => c.id === cell.id)) {
          // 計算衛星到 cell 的距離
          const dx = satPos.x - cell.position.x;
          const dz = satPos.z - cell.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          
          if (dist < bestDistForCell) {
            bestDistForCell = dist;
            bestSatForCell = satId;
          }
        }
      });
      
      if (bestSatForCell) {
        cellServingMap.set(cell.id, bestSatForCell);
        // 注意：不在這裡計數換手，只在 UE 的服務衛星改變時計數（Line 438）
      }
    }
    
    // 更新 cellServingSatRef
    cellServingSatRef.current = cellServingMap;
    
    // 計算每個 Cell 的覆蓋衛星數量（用於顯示重疊區域）
    const cellCoveringCountMap = new Map<number, number>();
    for (const cell of cells) {
      let coverCount = 0;
      newActiveSats.forEach((satPos) => {
        const visibleCells = getVisibleCells(satPos, cells, 25);
        if (visibleCells.some(c => c.id === cell.id)) {
          coverCount++;
        }
      });
      cellCoveringCountMap.set(cell.id, coverCount);
    }
    
    // 計算「實際有波束照射」的 cells
    // 【關鍵修改】只有服務衛星和目標衛星的波束才會照射 cells
    // 論文 4-1：追蹤每個 cell 被哪個 beam 服務（用於設置極化顏色）
    const beamTargetCellIds = new Set<number>();
    const cellBeamMap = new Map<number, number>(); // cell ID → beam ID

    // 找到目標衛星（下一個最可能接手的衛星）
    let targetSatIdForBeams: string | null = null;
    if (bestSatId && ueCell) {
      const candidateSats: { id: string; distance: number }[] = [];
      newActiveSats.forEach((satPos, satId) => {
        if (satId === bestSatId) return;
        const visibleCells = getVisibleCells(satPos, cells, 25);
        if (visibleCells.some(c => c.id === ueCell.id)) {
          const dx = satPos.x - ueCell.position.x;
          const dz = satPos.z - ueCell.position.z;
          candidateSats.push({ id: satId, distance: Math.sqrt(dx * dx + dz * dz) });
        }
      });
      candidateSats.sort((a, b) => a.distance - b.distance);
      targetSatIdForBeams = candidateSats.length > 0 ? candidateSats[0].id : null;
    }

    // 只處理服務衛星和目標衛星
    const relevantSatIds = [bestSatId, targetSatIdForBeams].filter(Boolean) as string[];

    for (const satId of relevantSatIds) {
      const satPos = newActiveSats.get(satId);
      if (!satPos) continue;

      const visibleCells = getVisibleCells(satPos, cells, 25);
      const satGroundPos = new THREE.Vector2(satPos.x, satPos.z);
      const sortedCells = [...visibleCells].sort((a, b) => {
        const distA = satGroundPos.distanceTo(new THREE.Vector2(a.position.x, a.position.z));
        const distB = satGroundPos.distanceTo(new THREE.Vector2(b.position.x, b.position.z));
        return distA - distB;
      });

      const isServingUESat = satId === bestSatId;
      // 論文 4-1：每顆衛星最大波束數 B（服務/目標衛星相同）
      const beamLimit = maxBeamsPerSat;

      // 選擇要服務的 cells
      let selectedCells: EarthFixedCell[] = [];

      // 服務衛星必須包含 UE cell
      if (isServingUESat && ueCell && visibleCells.some(c => c.id === ueCell.id)) {
        const ueCellIndex = sortedCells.findIndex(c => c.id === ueCell.id);
        if (ueCellIndex >= beamLimit) {
          // UE cell 不在最近的 cells 中，強制包含
          const otherCells = sortedCells.filter(c => c.id !== ueCell.id).slice(0, beamLimit - 1);
          selectedCells = [...otherCells, ueCell];
        } else {
          selectedCells = sortedCells.slice(0, beamLimit);
        }
      } else {
        selectedCells = sortedCells.slice(0, beamLimit);
      }

      // 為每個 cell 分配 beam ID 並記錄
      selectedCells.forEach((cell, idx) => {
        const beamId = idx + 1; // Beam ID 從 1 開始
        beamTargetCellIds.add(cell.id);
        cellBeamMap.set(cell.id, beamId);
      });
    }
    
    // 更新服務狀態
    // 【關鍵修改】只要有服務衛星且 UE cell 在可見範圍內，UE 就是被服務的
    // 這符合論文 4-1 的設計：服務衛星必須始終服務 UE
    const ueCellInVisibleRange = ueCell && bestSatId && visibleCellsForBestSat.some(c => c.id === ueCell.id);
    const ueIsServed = ueCellInVisibleRange && primaryBeamId !== null;

    // 確保 UE cell 加入 beamTargetCellIds（如果還沒有的話）
    if (ueIsServed && ueCell) {
      beamTargetCellIds.add(ueCell.id);
    }

    setServingState({
      satelliteId: bestSatId,
      beams,
      primaryBeamId: ueIsServed ? primaryBeamId : null,
      primaryCellId: ueIsServed ? (ueCell?.id || null) : null,
      currentSlot,
    });
    
    // 更新 Cells 的服務狀態
    // 論文 4-1：isServed = 有波束照射到，顏色由波束極化決定
    const updatedCells = cells.map(cell => {
      const servingSatId = cellServingMap.get(cell.id);
      const coveringCount = cellCoveringCountMap.get(cell.id) || 0;
      const isServed = beamTargetCellIds.has(cell.id);
      const servingBeamId = cellBeamMap.get(cell.id) || null;

      // 論文 4-1：波束極化由 beam ID 決定（奇數=A，偶數=B）
      const servingPolarization = servingBeamId
        ? getBeamPolarization(servingBeamId)
        : null;
      const servingBeamColor = servingPolarization
        ? POLARIZATION_COLORS[servingPolarization]
        : null;

      // Data Queue 動態更新（論文 4-1 虛擬佇列 M_c）
      // 流量到達有隨機波動，讓 queue 在合理範圍內波動
      const randomFactor = 0.7 + Math.random() * 0.6;  // 0.7 ~ 1.3 隨機係數
      const arrivalThisFrame = cell.arrivalRate * delta * 2 * randomFactor;

      // 服務能力也有波動（取決於信號品質等因素）
      const serviceFactor = 0.8 + Math.random() * 0.4;  // 0.8 ~ 1.2
      const serviceRate = isServed ? cell.arrivalRate * delta * 2 * serviceFactor : 0;

      // 平均而言 arrival ≈ service，但隨機波動造成 queue 變化
      const newDataQueue = Math.max(50, Math.min(950,  // 限制在 50-950 避免極端值
        cell.dataQueue + arrivalThisFrame - serviceRate
      ));

      return {
        ...cell,
        isServed,
        servingSatelliteId: isServed ? servingSatId || null : null,
        servingBeamId,
        servingPolarization,
        servingBeamColor,
        coveringSatelliteCount: coveringCount,
        dataQueue: newDataQueue,
      };
    });
    
    setCells(updatedCells);
    if (onCellsUpdate) {
      onCellsUpdate(updatedCells);
    }

    // 更新統計（傳入最新的 cells 數據）
    updateStats(updatedCells);
  });
  
  // 獲取當前激活的 cell IDs
  const activeCellIds = servingState.beams.filter(b => b.isActive).map(b => b.targetCellId);
  
  // ========== 計算服務衛星和目標衛星 ==========
  // 論文 4-1：只需要顯示 2 顆衛星的波束
  // 1. 服務衛星（Serving Satellite）：當前服務 UE 的衛星
  // 2. 目標衛星（Target Satellite）：下一個最可能接手的衛星
  const { servingSatelliteId, targetSatelliteId } = useMemo(() => {
    const servingSatId = servingState.satelliteId;
    
    // 找 UE 所在的 Cell
    const ueCell = cells.find(c => {
      if (!uePositions[0]) return false;
      const dx = c.position.x - uePositions[0].position.x;
      const dz = c.position.z - uePositions[0].position.z;
      return Math.sqrt(dx * dx + dz * dz) <= c.radius;
    });
    
    if (!ueCell || !servingSatId) {
      return { servingSatelliteId: servingSatId, targetSatelliteId: null };
    }
    
    // 找到所有能覆蓋 UE cell 的衛星（排除當前服務衛星）
    const candidateSatellites: { id: string; distance: number; position: THREE.Vector3 }[] = [];
    
    activeSatellites.forEach((satPos, satId) => {
      if (satId === servingSatId) return; // 排除當前服務衛星
      
      const visibleCells = getVisibleCells(satPos, cells, 25);
      if (visibleCells.some(c => c.id === ueCell.id)) {
        const dx = satPos.x - ueCell.position.x;
        const dz = satPos.z - ueCell.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        candidateSatellites.push({ id: satId, distance: dist, position: satPos });
      }
    });
    
    // 選擇距離第二近的衛星作為目標衛星（最近的是服務衛星）
    candidateSatellites.sort((a, b) => a.distance - b.distance);
    const targetSatId = candidateSatellites.length > 0 ? candidateSatellites[0].id : null;
    
    return { servingSatelliteId: servingSatId, targetSatelliteId: targetSatId };
  }, [servingState.satelliteId, activeSatellites, cells, uePositions]);
  
  // 建立 **只有服務衛星和目標衛星** 的 beam assignments
  // 論文 4-1：只顯示這 2 顆衛星的波束，讓換手更清晰可見
  const perSatelliteBeams = useMemo(() => {
    const result = new Map<string, { cellIds: number[], position: THREE.Vector3, isTarget: boolean }>();

    // 只處理服務衛星和目標衛星
    const relevantSatIds = [servingSatelliteId, targetSatelliteId].filter(Boolean) as string[];

    // 找到 UE 所在的 Cell（用於確保服務衛星的波束包含它）
    const ueCell = cells.find(c => {
      if (!uePositions[0]) return false;
      const dx = c.position.x - uePositions[0].position.x;
      const dz = c.position.z - uePositions[0].position.z;
      return Math.sqrt(dx * dx + dz * dz) <= c.radius;
    });

    for (const satId of relevantSatIds) {
      const satPos = activeSatellites.get(satId);
      if (!satPos) continue;

      // 找出此衛星覆蓋的 cells
      const visibleCells = getVisibleCells(satPos, cells, 25);

      // 按距離衛星排序
      const satGroundPos = new THREE.Vector2(satPos.x, satPos.z);
      const sortedCells = [...visibleCells].sort((a, b) => {
        const distA = satGroundPos.distanceTo(new THREE.Vector2(a.position.x, a.position.z));
        const distB = satGroundPos.distanceTo(new THREE.Vector2(b.position.x, b.position.z));
        return distA - distB;
      });

      const isServingSat = satId === servingSatelliteId;
      const isTargetSat = satId === targetSatelliteId;
      // 論文 4-1：每顆衛星最大波束數 B（服務/目標衛星相同）
      const beamLimit = maxBeamsPerSat;

      let selectedCells: EarthFixedCell[] = [];

      // 【服務衛星】必須包含 UE cell
      if (isServingSat && ueCell && visibleCells.some(c => c.id === ueCell.id)) {
        const ueCellIndex = sortedCells.findIndex(c => c.id === ueCell.id);
        if (ueCellIndex < beamLimit) {
          // UE cell 已在選擇範圍內
          selectedCells = sortedCells.slice(0, beamLimit);
        } else {
          // 強制包含 UE cell
          const otherCells = sortedCells.filter(c => c.id !== ueCell.id).slice(0, beamLimit - 1);
          selectedCells = [...otherCells, ueCell];
        }
      } else {
        // 【目標衛星】或無 UE cell 時正常選擇
        selectedCells = sortedCells.slice(0, beamLimit);
      }

      const limitedCellIds = selectedCells.map(c => c.id);

      if (limitedCellIds.length > 0) {
        result.set(satId, {
          cellIds: limitedCellIds,
          position: satPos.clone(),
          isTarget: isTargetSat,
        });
      }
    }

    return result;
  }, [activeSatellites, cells, maxBeamsPerSat, servingSatelliteId, targetSatelliteId, uePositions]);
  
  // 舊的 beamAssignments 保留給統計使用
  const beamAssignments: BeamAssignment[] = servingState.beams.map(b => ({
    beamId: b.beamId,
    cellId: b.targetCellId,
    isActive: b.isActive,
  }));
  
  return (
    <group>
      {/* ========== 衛星模型 ========== */}
      {Array.from(activeSatellites.entries()).map(([satId, pos]) => {
        const satBeamInfo = perSatelliteBeams.get(satId);
        const hasBeams = satBeamInfo && satBeamInfo.cellIds.length > 0;
        const isServing = satId === servingSatelliteId;
        const isTarget = satId === targetSatelliteId;
        
        // 決定衛星顏色和標籤
        let satColor = '#666666';  // 預設灰色（無波束）
        let roleLabel = '';
        
        if (isServing) {
          satColor = '#00ff00';  // 綠色 = 服務衛星
          roleLabel = '📡 SERVING';
        } else if (isTarget) {
          satColor = '#ffaa00';  // 橙色 = 目標衛星
          roleLabel = '🎯 TARGET';
        }
        
        return (
          <group key={satId} position={[pos.x, pos.y, pos.z]}>
            <primitive object={scene.clone()} scale={6} />
            {/* 衛星 ID */}
            <Text
              position={[0, 50, 0]}
              fontSize={16}
              color={satColor}
              anchorX="center"
              anchorY="middle"
              outlineWidth={1.5}
              outlineColor="#000000"
            >
              {satId}
            </Text>
            {/* 角色標籤（只顯示給服務/目標衛星） */}
            {roleLabel && (
              <Text
                position={[0, 35, 0]}
                fontSize={12}
                color={satColor}
                anchorX="center"
                anchorY="middle"
                outlineWidth={1.5}
                outlineColor="#000000"
              >
                {roleLabel}
              </Text>
            )}
            {/* 波束數量（只顯示給有波束的衛星） */}
            {hasBeams && (
              <Text
                position={[0, 20, 0]}
                fontSize={10}
                color={satColor}
                anchorX="center"
                anchorY="middle"
                outlineWidth={1}
                outlineColor="#000000"
              >
                {`${satBeamInfo.cellIds.length} beams`}
              </Text>
            )}
          </group>
        );
      })}
      
      {/* ========== UE 到服務衛星的連線 ========== */}
      {/* 只有當 UE 所在的 Cell 被波束照射時才顯示連線 */}
      {servingState.satelliteId && 
       servingState.primaryCellId !== null &&
       activeSatellites.has(servingState.satelliteId) && (
        <group>
          {/* 主連線 - 從 UE 到衛星 */}
          <Line
            points={[
              [uePosition.x, 15, uePosition.z],
              [
                activeSatellites.get(servingState.satelliteId)!.x,
                activeSatellites.get(servingState.satelliteId)!.y,
                activeSatellites.get(servingState.satelliteId)!.z,
              ],
            ]}
            color={handoverAlert ? '#ff6600' : '#00ff00'}
            lineWidth={handoverAlert ? 5 : 3}
            dashed={!!handoverAlert}
            dashSize={15}
            gapSize={8}
          />
          {/* 換手時顯示標籤 */}
          {handoverAlert && (
            <Text
              position={[
                (uePosition.x + activeSatellites.get(servingState.satelliteId)!.x) / 2,
                (15 + activeSatellites.get(servingState.satelliteId)!.y) / 2 + 30,
                (uePosition.z + activeSatellites.get(servingState.satelliteId)!.z) / 2,
              ]}
              fontSize={16}
              color="#ff6600"
              anchorX="center"
              anchorY="middle"
              outlineWidth={2}
              outlineColor="#000000"
            >
              {`${handoverAlert.from} → ${handoverAlert.to}`}
            </Text>
          )}
        </group>
      )}

      {/* ========== UE 位置標記 ========== */}
      <group position={[uePosition.x, 10, uePosition.z]}>
        <mesh>
          <cylinderGeometry args={[15, 15, 5, 6]} />
          <meshBasicMaterial color="#00ffff" transparent opacity={0.7} />
        </mesh>
        <Text
          position={[0, 20, 0]}
          fontSize={12}
          color="#00ffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={1.5}
          outlineColor="#000000"
        >
          UE
        </Text>
      </group>
      
      {/* ========== Beams（每顆衛星到其服務的 Cells） ========== */}
      {/* 論文 4-1：多衛星同時服務不同 Cells，展示衛星間換手 */}
      {Array.from(perSatelliteBeams.entries()).map(([satId, { cellIds, position }]) => (
        <SatelliteBeams
          key={satId}
          satelliteId={satId}
          satellitePosition={position}
          cells={cells}
          beamAssignments={cellIds.map((cellId, idx) => ({
            beamId: idx + 1,
            cellId,
            isActive: true,
          }))}
          primaryCellId={servingState.primaryCellId || undefined}
        />
      ))}
    </group>
  );
}
