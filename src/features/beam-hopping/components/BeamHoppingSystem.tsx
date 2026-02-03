import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Text } from '@react-three/drei';
import * as THREE from 'three';
import { EarthFixedCell, FRF3_CELL_COLORS } from './EarthFixedCells';
import { SatelliteBeams, BeamAssignment, getVisibleCells } from './SatelliteBeams';
import { ENERGY_CONFIG } from '@/config/energy.config';
import type { UEHandoverState } from './MultiUEManager';

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
 * 編排的衛星軌跡
 */
interface ScriptedSatellite {
  id: string;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startTime: number;
  duration: number;
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
 * 生成編排的衛星軌跡
 * 
 * 單一衛星循環往返，專注展示波束內換手 (Intra-satellite Beam Handover)
 */
function generateScriptedSatellites(
  centerPosition: THREE.Vector3,
  count: number,
  interval: number,
  satelliteHeight: number
): ScriptedSatellite[] {
  // 只使用一顆衛星，循環往返
  return [{
    id: 'LEO-SAT-1',
    startPos: new THREE.Vector3(
      centerPosition.x - 350,
      satelliteHeight,
      centerPosition.z
    ),
    endPos: new THREE.Vector3(
      centerPosition.x + 350,
      satelliteHeight,
      centerPosition.z
    ),
    startTime: 0,
    duration: 30,  // 30 秒從左到右
  }];
}

/**
 * 計算衛星當前位置（支援往返循環）
 */
function getSatellitePosition(
  sat: ScriptedSatellite,
  currentTime: number
): THREE.Vector3 | null {
  // 循環往返：總週期 = 2 * duration（去程 + 回程）
  const totalCycle = sat.duration * 2;
  const cycleTime = currentTime % totalCycle;
  
  let progress: number;
  if (cycleTime <= sat.duration) {
    // 去程：從 start 到 end
    progress = cycleTime / sat.duration;
    return new THREE.Vector3().lerpVectors(sat.startPos, sat.endPos, progress);
  } else {
    // 回程：從 end 到 start
    progress = (cycleTime - sat.duration) / sat.duration;
    return new THREE.Vector3().lerpVectors(sat.endPos, sat.startPos, progress);
  }
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
  timeSpeed = 0.8,      // 加快衛星移動速度，換手更頻繁
  slotDuration = 0.5,
  maxBeamsPerSat = 4,
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
  
  // Handover 追蹤
  const beamHandoversRef = useRef(0);
  const satelliteHandoversRef = useRef(0);
  const lastServingSatRef = useRef<string | null>(null);
  const lastServingBeamIdRef = useRef<number | null>(null);  // 波束編號（僅顯示用）
  const lastServingCellIdRef = useRef<number | null>(null);  // UE 所在的 Cell ID（用於 Beam Handover 判斷）
  
  // 編排的衛星 - 間隔縮短為 10 秒，讓換手更頻繁
  const scriptedSatellites = useMemo(
    () => generateScriptedSatellites(
      new THREE.Vector3(0, 0, 0),
      4,
      10,  // 從 20 秒縮短為 10 秒
      satelliteHeight
    ),
    [satelliteHeight]
  );
  
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
    const totalHandovers = beamHandoversRef.current;  // 只計算波束換手
    const energyConsumption = totalHandovers * ENERGY_CONFIG.ENERGY_PER_HANDOVER;
    
    const ueCell = findUECell(uePosition, cells);
    const servingSat = activeSatellites.get(servingState.satelliteId || '');
    
    onStatsUpdate({
      currentSatelliteId: servingState.satelliteId,
      currentBeamId: servingState.primaryBeamId,
      currentRSRP: servingSat && ueCell 
        ? calculateRSRP(servingSat, ueCell.position, satelliteHeight)
        : null,
      beamHandovers: beamHandoversRef.current,
      satelliteHandovers: 0,  // 此場景不計算衛星換手
      totalHandovers,
      elapsedTime,
      energyConsumption,
      averageEnergyPerSecond: elapsedTime > 0 ? energyConsumption / elapsedTime : 0,
      activeBeams: servingState.beams.filter(b => b.isActive).map(b => b.beamId),
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
    elapsedTimeRef.current += delta * timeSpeed;
    const currentTime = elapsedTimeRef.current;
    
    // 計算當前時隙
    const currentSlot = Math.floor(currentTime / slotDuration);
    const isNewSlot = currentSlot !== lastSlotRef.current;
    lastSlotRef.current = currentSlot;
    
    // 循環時間 - 根據實際衛星配置計算
    // 最後一顆衛星的結束時間 = startTime + duration
    const lastSat = scriptedSatellites[scriptedSatellites.length - 1];
    const totalCycleDuration = lastSat ? lastSat.startTime + lastSat.duration : 40;
    const cycleTime = currentTime % totalCycleDuration;
    
    // 更新衛星位置
    const newActiveSats = new Map<string, THREE.Vector3>();
    for (const sat of scriptedSatellites) {
      const pos = getSatellitePosition(sat, cycleTime);
      if (pos) {
        newActiveSats.set(sat.id, pos);
      }
    }
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
    
    // ========== Beam Handover 檢測 ==========
    // 專注於波束內換手（Intra-satellite Beam Handover）
    const now = Date.now();
    
    // 更新當前服務衛星（不計數為換手）
    if (bestSatId !== lastServingSatRef.current && bestSatId !== null) {
      lastServingSatRef.current = bestSatId;
      setHandoverInfo(prev => ({
        ...prev,
        currentSatelliteId: bestSatId,
      }));
    }
    
    // Beam Handover：服務 UE 的波束編號改變
    if (primaryBeamId !== null && primaryBeamId !== lastServingBeamIdRef.current) {
      if (lastServingBeamIdRef.current !== null) {
        beamHandoversRef.current += 1;
        console.log(`📶 Beam Handover: Beam ${lastServingBeamIdRef.current} → Beam ${primaryBeamId}`);
        
        const handoverRecord = {
          time: now,
          type: 'beam' as const,
          from: `B${lastServingBeamIdRef.current}`,
          to: `B${primaryBeamId}`,
        };
        
        setHandoverAlert({ ...handoverRecord, timestamp: now });
        setHandoverInfo(prev => ({
          ...prev,
          currentBeamId: primaryBeamId,
          lastHandoverTime: now,
          handoverHistory: [...prev.handoverHistory, handoverRecord].slice(-10),
        }));
      }
      lastServingBeamIdRef.current = primaryBeamId;
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
    
    // 更新服務狀態
    setServingState({
      satelliteId: bestSatId,
      beams,
      primaryBeamId,
      primaryCellId: ueCell?.id || null,
      currentSlot,
    });
    
    // 更新 Cells 的服務狀態
    const updatedCells = cells.map(cell => ({
      ...cell,
      isServed: activeCellIds.includes(cell.id),
      servingSatelliteId: activeCellIds.includes(cell.id) ? bestSatId : null,
      servingBeamColor: activeCellIds.includes(cell.id) 
        ? FRF3_CELL_COLORS[cell.frequencyGroup]
        : null,
    }));
    
    setCells(updatedCells);
    if (onCellsUpdate) {
      onCellsUpdate(updatedCells);
    }
    
    // 更新統計
    updateStats();
  });
  
  // 獲取當前激活的 cell IDs
  const activeCellIds = servingState.beams.filter(b => b.isActive).map(b => b.targetCellId);
  
  // 建立 BeamAssignment 列表給 SatelliteBeams 使用
  const beamAssignments: BeamAssignment[] = servingState.beams.map(b => ({
    beamId: b.beamId,
    cellId: b.targetCellId,
    isActive: b.isActive,
  }));
  
  return (
    <group>
      {/* ========== 衛星模型 ========== */}
      {Array.from(activeSatellites.entries()).map(([satId, pos]) => (
        <group key={satId} position={[pos.x, pos.y, pos.z]}>
          <primitive object={scene.clone()} scale={6} />
          <Text
            position={[0, 50, 0]}
            fontSize={16}
            color={satId === servingState.satelliteId ? '#00ff00' : '#888888'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={1.5}
            outlineColor="#000000"
          >
            {satId}
          </Text>
          {/* 顯示服務的 Beam 數量 */}
          {satId === servingState.satelliteId && (
            <Text
              position={[0, 35, 0]}
              fontSize={10}
              color="#ffff00"
              anchorX="center"
              anchorY="middle"
              outlineWidth={1}
              outlineColor="#000000"
            >
              {`${beamAssignments.filter(b => b.isActive).length} beams | UE→B${servingState.primaryBeamId || '?'}`}
            </Text>
          )}
        </group>
      ))}
      
      {/* ========== Handover 提示 ========== */}
      {handoverAlert && (
        <group position={[0, satelliteHeight + 100, 0]}>
          <Text
            position={[0, 0, 0]}
            fontSize={24}
            color={handoverAlert.type === 'satellite' ? '#ff6600' : '#00ffff'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={2}
            outlineColor="#000000"
          >
            {handoverAlert.type === 'satellite' 
              ? `🛰️ SAT HANDOVER` 
              : `📶 BEAM HANDOVER`}
          </Text>
          <Text
            position={[0, -30, 0]}
            fontSize={18}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            outlineWidth={1.5}
            outlineColor="#000000"
          >
            {`${handoverAlert.from} → ${handoverAlert.to}`}
          </Text>
        </group>
      )}
      
      {/* ========== UE 位置標記（簡化版） ========== */}
      <group position={[uePosition.x, 10, uePosition.z]}>
        <mesh>
          <cylinderGeometry args={[15, 15, 5, 6]} />
          <meshBasicMaterial color="#ff00ff" transparent opacity={0.6} />
        </mesh>
        <Text
          position={[0, 15, 0]}
          fontSize={10}
          color="#ff00ff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={1}
          outlineColor="#000000"
        >
          UE
        </Text>
      </group>
      
      {/* ========== Beams（從衛星到服務的 Cells） ========== */}
      {servingState.satelliteId && activeSatellites.has(servingState.satelliteId) && (
        <SatelliteBeams
          satelliteId={servingState.satelliteId}
          satellitePosition={activeSatellites.get(servingState.satelliteId)!}
          cells={cells}
          beamAssignments={beamAssignments}
          primaryCellId={servingState.primaryCellId || undefined}
        />
      )}
    </group>
  );
}
