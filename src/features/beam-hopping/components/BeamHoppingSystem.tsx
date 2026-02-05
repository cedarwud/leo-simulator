import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { EarthFixedCell, FRF3_CELL_COLORS } from './EarthFixedCells';
import { SatelliteBeams, BeamAssignment, getVisibleCells } from './SatelliteBeams';
import { ENERGY_CONFIG } from '@/config/energy.config';
import { SatelliteOrbitCalculator } from '@/utils/satellite/SatelliteOrbitCalculator';
import type { UEHandoverState } from './MultiUEManager';

// 使用與 Satellite Handover 場景相同的數據源
const ORBIT_DATA_URL = '/data/satellite-timeseries-starlink.json';

const SATELLITE_MODEL_PATH = '/models/sat.glb';
useGLTF.preload(SATELLITE_MODEL_PATH);

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
  maxBeamsPerSat = 4,   // 服務 UE 的衛星波束數，其他衛星會顯示較少（2個）
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
  
  // 更新統計
  const updateStats = useCallback(() => {
    if (!onStatsUpdate) return;
    
    const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
    const totalHandovers = interSatelliteHandoversRef.current;  // 只計算衛星間換手
    const energyConsumption = totalHandovers * ENERGY_CONFIG.ENERGY_PER_HANDOVER;
    
    const ueCell = findUECell(uePosition, cells);
    const servingSat = activeSatellites.get(servingState.satelliteId || '');
    
    // 獲取 UE 所在 Cell 的 Data Queue
    const ueCellData = cells.find(c => c.id === ueCell?.id);
    const ueDataQueue = ueCellData?.dataQueue ?? 0;
    
    onStatsUpdate({
      currentSatelliteId: servingState.satelliteId,
      currentBeamId: servingState.primaryBeamId,
      currentRSRP: servingSat && ueCell 
        ? calculateRSRP(servingSat, ueCell.position, satelliteHeight)
        : null,
      beamHandovers: 0,  // 此場景不計算波束換手（波束會隨衛星改變）
      satelliteHandovers: interSatelliteHandoversRef.current,  // 計算衛星間換手
      totalHandovers,
      elapsedTime,
      energyConsumption,
      averageEnergyPerSecond: elapsedTime > 0 ? energyConsumption / elapsedTime : 0,
      activeBeams: servingState.beams.filter(b => b.isActive).map(b => b.beamId),
      ueDataQueue,  // 論文 4-1 虛擬佇列
      handoverDetails: {
        ueCellId: ueCell?.id ?? null,
        servingBeamId: servingState.primaryBeamId,
        predictedNextBeam: handoverInfo.predictedNextBeam,
        distanceToHandover: handoverInfo.distanceToHandover,
        timeToHandover: handoverInfo.distanceToHandover !== null 
          ? handoverInfo.distanceToHandover / 50  // 假設衛星速度約 50 單位/秒
          : null,
        recentHandovers: handoverInfo.handoverHistory.slice(-5),  // 最近 5 次
      },
    });
  }, [onStatsUpdate, cells, uePosition, activeSatellites, servingState, satelliteHeight, handoverInfo]);
  
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
    // 視覺上：同時顯示所有活躍波束（Beam Hopping 是內部調度，不需要視覺切換）
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
      
      // 建立波束分配：取最近的 maxBeamsPerSat 個 cells
      const servingCells = sortedCells.slice(0, maxBeamsPerSat);
      
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
        
        // 檢查此 cell 是否發生衛星間換手
        const prevServingSat = cellServingSatRef.current.get(cell.id);
        if (prevServingSat && prevServingSat !== bestSatForCell) {
          interSatelliteHandoversRef.current += 1;
          console.log(`🔄 Cell ${cell.id} Inter-satellite Handover: ${prevServingSat} → ${bestSatForCell}`);
        }
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
    // 只有這些 cells 才標記為 isServed（實線邊框）
    // 其他 cells 即使在衛星覆蓋範圍內也是 inactive（虛線邊框）
    const beamTargetCellIds = new Set<number>();
    
    // 收集所有衛星的有限波束目標
    newActiveSats.forEach((satPos, satId) => {
      const visibleCells = getVisibleCells(satPos, cells, 25);
      const servingCells = visibleCells
        .filter(cell => cellServingMap.get(cell.id) === satId);
      
      const satGroundPos = new THREE.Vector2(satPos.x, satPos.z);
      const sortedCells = [...servingCells].sort((a, b) => {
        const distA = satGroundPos.distanceTo(new THREE.Vector2(a.position.x, a.position.z));
        const distB = satGroundPos.distanceTo(new THREE.Vector2(b.position.x, b.position.z));
        return distA - distB;
      });
      
      const isServingUESat = satId === bestSatId;
      const beamLimit = isServingUESat ? maxBeamsPerSat : Math.min(2, maxBeamsPerSat);
      sortedCells.slice(0, beamLimit).forEach(c => beamTargetCellIds.add(c.id));
    });
    
    // 更新服務狀態
    // 只有當 UE 所在的 cell 被波束照射時，才設置 primaryCellId
    const ueIsServed = ueCell ? beamTargetCellIds.has(ueCell.id) : false;
    
    setServingState({
      satelliteId: bestSatId,
      beams,
      primaryBeamId: ueIsServed ? primaryBeamId : null,
      primaryCellId: ueIsServed ? (ueCell?.id || null) : null,
      currentSlot,
    });
    
    // 更新 Cells 的服務狀態
    // isServed = 有波束照射到（在 beamTargetCellIds 中）
    const updatedCells = cells.map(cell => {
      const servingSatId = cellServingMap.get(cell.id);
      const coveringCount = cellCoveringCountMap.get(cell.id) || 0;
      const isServed = beamTargetCellIds.has(cell.id);  // 只有被波束照射才是 served
      
      // Data Queue 動態更新（論文 4-1 虛擬佇列 M_c）
      // - 每幀流量到達：arrivalRate * delta
      // - 被服務時消耗流量（消耗速率 > 到達速率），未被服務時累積
      const arrivalThisFrame = cell.arrivalRate * delta * 0.5; // 流量到達（降低係數）
      const serviceRate = isServed ? cell.arrivalRate * delta * 2 : 0; // 服務速率 = 2倍到達速率
      const newDataQueue = Math.max(0, Math.min(1000, 
        cell.dataQueue + arrivalThisFrame - serviceRate
      ));
      
      return {
        ...cell,
        isServed,
        servingSatelliteId: isServed ? servingSatId || null : null,
        servingBeamColor: isServed 
          ? FRF3_CELL_COLORS[cell.frequencyGroup]
          : null,
        coveringSatelliteCount: coveringCount,
        dataQueue: newDataQueue,
      };
    });
    
    setCells(updatedCells);
    if (onCellsUpdate) {
      onCellsUpdate(updatedCells);
    }
    
    // 更新統計
    updateStats();
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
    
    for (const satId of relevantSatIds) {
      const satPos = activeSatellites.get(satId);
      if (!satPos) continue;
      
      // 找出此衛星覆蓋的 cells
      const visibleCells = getVisibleCells(satPos, cells, 25);
      
      // 找出此衛星 **服務** 的 cells（根據 cellServingSatRef）
      const servingCells = visibleCells
        .filter(cell => cellServingSatRef.current.get(cell.id) === satId);
      
      // 按距離衛星排序
      const satGroundPos = new THREE.Vector2(satPos.x, satPos.z);
      const sortedCells = [...servingCells].sort((a, b) => {
        const distA = satGroundPos.distanceTo(new THREE.Vector2(a.position.x, a.position.z));
        const distB = satGroundPos.distanceTo(new THREE.Vector2(b.position.x, b.position.z));
        return distA - distB;
      });
      
      // 服務衛星：顯示較多波束（maxBeamsPerSat）
      // 目標衛星：也顯示波束，但標記為 target
      const isServingSat = satId === servingSatelliteId;
      const isTargetSat = satId === targetSatelliteId;
      const beamLimit = isServingSat ? maxBeamsPerSat : Math.min(3, maxBeamsPerSat);
      const limitedCellIds = sortedCells.slice(0, beamLimit).map(c => c.id);
      
      if (limitedCellIds.length > 0) {
        result.set(satId, { 
          cellIds: limitedCellIds, 
          position: satPos.clone(),
          isTarget: isTargetSat,
        });
      }
    }
    
    return result;
  }, [activeSatellites, cells, maxBeamsPerSat, servingSatelliteId, targetSatelliteId]);
  
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
