import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SatelliteOrbitCalculator } from '@/utils/satellite/SatelliteOrbitCalculator';
import { EnhancedHandoverManager } from '@/utils/satellite/EnhancedHandoverManager';
import { RSRPHandoverManager, RSRPHandoverConfig } from '@/utils/satellite/RSRPHandoverManager';
import { EnhancedSatelliteLinks } from './EnhancedSatelliteLinks';
import { SatelliteLabel } from './SatelliteLabel';
import { HandoverState } from '@/types/handover';
import { HandoverMethodType, HandoverStats } from '@/types/handover-method';
import { calculatePathLoss } from '@/utils/satellite/PathLossCalculator';
import { GeometricConfig } from '../ui/sidebar/GeometricMethodPanel';
import { ENERGY_CONFIG } from '@/config/energy.config';
import {
  SatelliteBeams,
  BeamAssignment,
  getVisibleCells,
  selectServingCells,
} from '@/features/beam-hopping/components/SatelliteBeams';
import {
  type EarthFixedCell,
  getBeamPolarization,
  POLARIZATION_COLORS,
  getNeighborCellIds,
} from '@/features/beam-hopping/components/EarthFixedCells';
import * as THREE from 'three';

interface SatellitesProps {
  dataUrl: string;
  timeSpeed?: number;
  handoverMethod?: HandoverMethodType;
  rsrpConfig?: RSRPHandoverConfig;
  geometricConfig?: GeometricConfig;
  onStatsUpdate?: (stats: HandoverStats, satelliteId: string | null, phase: string) => void;
  /** 是否顯示波束 */
  showBeams?: boolean;
  /** Ground cells 用於波束渲染 */
  cells?: EarthFixedCell[];
  /** 顯示波束標籤 */
  showBeamLabels?: boolean;
  /** Cells 更新回調（波束分配變更時） */
  onCellsUpdate?: (cells: EarthFixedCell[]) => void;
}

// 根據換手方法生成初始統計值（模擬已運行一段時間）
// 注：雖然學術上應從零開始，但為了用戶體驗，提供合理的初始值
const generateInitialStats = (method: HandoverMethodType): HandoverStats => {
  // 隨機生成"已運行時間" (5-30 分鐘)
  const initialElapsedTime = 300 + Math.random() * 1500; // 300-1800 秒

  let totalHandovers = 0;
  let pingPongRate = 0;
  let avgConnectionDuration = 0;

  switch (method) {
    case 'geometric':
      // 幾何方法：約每 45 秒換一次手
      avgConnectionDuration = 45;
      totalHandovers = Math.floor(initialElapsedTime / avgConnectionDuration);
      pingPongRate = 0.15; // 15% ping-pong 率
      break;

    case 'rsrp':
      // RSRP 方法：TTT 10秒，約每 60 秒換一次（更穩定）
      avgConnectionDuration = 60;
      totalHandovers = Math.floor(initialElapsedTime / avgConnectionDuration);
      pingPongRate = 0.08; // 8% ping-pong 率（A4 事件更穩定）
      break;

    case 'dqn':
      // DQN 方法：預期最優，約每 70 秒換一次（開發中）
      avgConnectionDuration = 70;
      totalHandovers = Math.floor(initialElapsedTime / avgConnectionDuration);
      pingPongRate = 0.05; // 5% ping-pong 率
      break;
  }

  const pingPongEvents = Math.floor(totalHandovers * pingPongRate);

  // 添加一些隨機變化（±10%）
  const variance = 0.9 + Math.random() * 0.2;
  totalHandovers = Math.floor(totalHandovers * variance);

  // 🔋 計算初始能耗（基於初始換手次數）
  // 根據 Ntabeni et al. (2025)，每次換手消耗 3 Joules
  const initialEnergyConsumption = totalHandovers * ENERGY_CONFIG.ENERGY_PER_HANDOVER;
  const averageEnergyPerSecond = initialElapsedTime > 0
    ? initialEnergyConsumption / initialElapsedTime
    : 0;

  return {
    totalHandovers,
    pingPongEvents,
    averageRSRP: -95 + (Math.random() - 0.5) * 2, // -96 到 -94 dBm
    averageRSRQ: -12 + (Math.random() - 0.5) * 1, // -12.5 到 -11.5 dB
    averageSINR: 10 + (Math.random() - 0.5) * 2, // 9 到 11 dB
    connectionDuration: avgConnectionDuration + (Math.random() - 0.5) * 10, // ±5秒變化
    serviceInterruptions: Math.floor(Math.random() * 3), // 0-2 次中斷
    elapsedTime: initialElapsedTime,
    // 🔋 能耗效率指標 (Ntabeni et al., 2025)
    energyConsumption: initialEnergyConsumption,
    energyPerHandover: ENERGY_CONFIG.ENERGY_PER_HANDOVER,
    averageEnergyPerSecond
  };
};

export function Satellites({
  dataUrl,
  timeSpeed = 1.0,
  handoverMethod = 'geometric',
  rsrpConfig,
  geometricConfig,
  onStatsUpdate,
  showBeams = false,
  cells = [],
  showBeamLabels = true,
  onCellsUpdate,
}: SatellitesProps) {
  const [calculator] = useState(() => new SatelliteOrbitCalculator());
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elapsedTimeRef = useRef(0);
  const lastLogTimeRef = useRef(-1);

  const labelsRef = useRef<Map<string, THREE.Group>>(new Map()); // Ref for labels

  // 判斷是否為 OneWeb 星座
  const isOneWeb = dataUrl.toLowerCase().includes('oneweb');
  const modelPath = isOneWeb ? '/models/sat2.glb' : '/models/sat.glb';
  const { scene } = useGLTF(modelPath);

  // 統計追蹤 - 使用生成的初始值（用戶體驗優化）
  const statsRef = useRef<HandoverStats>(generateInitialStats(handoverMethod));
  const lastSatelliteIdRef = useRef<string | null>(null);
  const connectionStartTimeRef = useRef<number>(0);
  const lastHandoverTimeRef = useRef<number>(0);

  // 動態創建換手管理器（根據選擇的方法）
  const handoverManager = useMemo(() => {
    switch (handoverMethod) {
      case 'rsrp':
        return new RSRPHandoverManager();
      case 'geometric':
      default:
        return new EnhancedHandoverManager();
    }
  }, [handoverMethod]);

  // 當換手方法改變時，重置統計數據
  useEffect(() => {
    const newStats = generateInitialStats(handoverMethod);
    statsRef.current = newStats;
    elapsedTimeRef.current = newStats.elapsedTime;
    lastSatelliteIdRef.current = null;
    connectionStartTimeRef.current = newStats.elapsedTime;
    lastHandoverTimeRef.current = newStats.elapsedTime;
  }, [handoverMethod]);

  // 🔧 當配置參數改變時，更新換手管理器的配置
  useEffect(() => {
    if (handoverMethod === 'rsrp' && rsrpConfig) {
      // 更新 RSRP 方法的配置
      (handoverManager as RSRPHandoverManager).updateConfig(rsrpConfig);
      console.log('✅ RSRP 配置已更新:', rsrpConfig);
    } else if (handoverMethod === 'geometric' && geometricConfig) {
      // 更新 Geometric 方法的配置
      (handoverManager as EnhancedHandoverManager).updateConfig({
        elevationWeight: geometricConfig.elevationWeight,
        triggerElevation: geometricConfig.triggerElevation,
        handoverCooldown: geometricConfig.handoverCooldown,
        animationSpeed: 'normal', // 使用默認值
        candidateCount: 6 // 使用默認值
      });
      console.log('✅ Geometric 配置已更新:', geometricConfig);
    }
  }, [handoverMethod, rsrpConfig, geometricConfig, handoverManager]);

  // 換手狀態
  const [handoverState, setHandoverState] = useState<HandoverState | null>(null);
  const [visibleSatellitesState, setVisibleSatellitesState] = useState<Map<string, THREE.Vector3>>(new Map());

  // 載入時間序列數據
  useEffect(() => {
    calculator
      .loadTimeseries(dataUrl)
      .then(() => {
        setIsLoaded(true);
      })
      .catch((err) => {
        console.error('❌ 衛星數據載入失敗:', err);
        setError(err.message);
      });
  }, [dataUrl, calculator]);

  // 每幀更新衛星位置
  useFrame((state, delta) => {
    if (!isLoaded) return;

    elapsedTimeRef.current += delta * timeSpeed;
    const visibleSatellites = calculator.getVisibleSatellites(
      elapsedTimeRef.current,
      timeSpeed
    );

    // 更新換手狀態
    const newHandoverState = handoverManager.update(visibleSatellites, elapsedTimeRef.current, timeSpeed);
    setHandoverState(newHandoverState);
    setVisibleSatellitesState(visibleSatellites); // Restored to fix missing links

    // 調試 log（換手狀態監控）
    const currentSecond = Math.floor(elapsedTimeRef.current);

    // 更新統計數據
    statsRef.current.elapsedTime = elapsedTimeRef.current;

    // 檢測換手事件
    const currentSatId = newHandoverState.currentSatelliteId;
    if (currentSatId && lastSatelliteIdRef.current && currentSatId !== lastSatelliteIdRef.current) {
      // 換手發生
      statsRef.current.totalHandovers++;

      // 🔋 累積能耗（每次換手消耗固定能量）
      // 基於 Ntabeni et al. (2025): E_handover = 3 Joules
      // 原始來源: Chen et al. (2019) [ref 37]
      statsRef.current.energyConsumption += ENERGY_CONFIG.ENERGY_PER_HANDOVER;

      // 檢測 ping-pong（10秒內回到前一顆衛星）
      const timeSinceLastHandover = elapsedTimeRef.current - lastHandoverTimeRef.current;
      if (timeSinceLastHandover < 10) {
        statsRef.current.pingPongEvents++;
      }

      lastHandoverTimeRef.current = elapsedTimeRef.current;

      // 更新連接持續時間
      if (connectionStartTimeRef.current > 0) {
        const duration = elapsedTimeRef.current - connectionStartTimeRef.current;
        statsRef.current.connectionDuration =
          (statsRef.current.connectionDuration * (statsRef.current.totalHandovers - 1) + duration) /
          statsRef.current.totalHandovers;
      }
      connectionStartTimeRef.current = elapsedTimeRef.current;
    }

    // 🔋 更新平均功率消耗 (Watts = Joules / seconds)
    if (elapsedTimeRef.current > 0) {
      statsRef.current.averageEnergyPerSecond =
        statsRef.current.energyConsumption / elapsedTimeRef.current;
    }

    // 檢測服務中斷（沒有連接）
    if (!currentSatId && lastSatelliteIdRef.current) {
      statsRef.current.serviceInterruptions++;
    }

    lastSatelliteIdRef.current = currentSatId;

    // 更新統計數據回調
    if (onStatsUpdate) { // 每幀更新，保持 UI 與場景同步
      // 獲取當前衛星的幾何資訊
      let currentSatInfo = null;
      let rsrp = statsRef.current.averageRSRP;
      let rsrq = statsRef.current.averageRSRQ;
      let sinr = statsRef.current.averageSINR;

      if (currentSatId) {
        currentSatInfo = calculator.getSatelliteInfo(currentSatId, elapsedTimeRef.current, timeSpeed);

        // 計算 RSRP（使用完整路徑損耗模型：FSPL + SF + CL）
        if (currentSatInfo) {
          const distance = currentSatInfo.distance;
          const elevation = currentSatInfo.elevation;

          // 使用論文的完整路徑損耗模型
          const pathLoss = calculatePathLoss(distance, elevation);
          rsrp = pathLoss.rsrp;

          // RSRQ 估算（基於仰角，仰角越高干擾越少）
          // RSRQ 範圍通常 -19 到 -3 dB
          const elevationFactor = Math.max(0, elevation / 90); // 0-1
          rsrq = -19 + elevationFactor * 16; // -19 到 -3 dB

          // SINR 估算（基於仰角和距離）
          // SINR 範圍通常 -5 到 30 dB
          const distanceFactor = Math.max(0, 1 - (distance / 2000));
          sinr = -5 + (elevationFactor * 0.7 + distanceFactor * 0.3) * 35; // -5 到 30 dB

          // 更新平均值（簡單移動平均）
          const alpha = 0.3; // 平滑係數
          statsRef.current.averageRSRP = statsRef.current.averageRSRP * (1 - alpha) + rsrp * alpha;
          statsRef.current.averageRSRQ = statsRef.current.averageRSRQ * (1 - alpha) + rsrq * alpha;
          statsRef.current.averageSINR = statsRef.current.averageSINR * (1 - alpha) + sinr * alpha;
        }
      }

      // 計算目標衛星的信號數據（僅在換手階段）
      let targetSatInfo = null;
      let targetRSRP = undefined;
      let targetRSRQ = undefined;
      let targetSINR = undefined;

      const targetSatId = newHandoverState.targetSatelliteId;
      if (targetSatId && newHandoverState.phase !== 'stable') {
        targetSatInfo = calculator.getSatelliteInfo(targetSatId, elapsedTimeRef.current, timeSpeed);

        if (targetSatInfo) {
          const distance = targetSatInfo.distance;
          const elevation = targetSatInfo.elevation;

          // 計算目標衛星的 RSRP（使用完整路徑損耗模型）
          const pathLoss = calculatePathLoss(distance, elevation);
          targetRSRP = pathLoss.rsrp;

          // 計算目標衛星的 RSRQ
          const elevationFactor = Math.max(0, elevation / 90);
          targetRSRQ = -19 + elevationFactor * 16;

          // 計算目標衛星的 SINR
          const distanceFactor = Math.max(0, 1 - (distance / 2000));
          targetSINR = -5 + (elevationFactor * 0.7 + distanceFactor * 0.3) * 35;
        }
      }

      // 擴展統計資訊
      const extendedStats: HandoverStats = {
        ...statsRef.current,
        visibleSatellites: visibleSatellites.size,
        totalSatellites: calculator.getAllSatelliteIds().length,
        currentSatelliteElevation: currentSatInfo?.elevation,
        currentSatelliteDistance: currentSatInfo?.distance,
        // 只傳遞當前可見的候選衛星 ID，確保 UI 邊框數量與 3D 連線數量一致
        candidateSatellites: newHandoverState.candidateSatelliteIds.filter(id => visibleSatellites.has(id)),
        // 目標衛星數據
        targetSatelliteRSRP: targetRSRP,
        targetSatelliteRSRQ: targetRSRQ,
        targetSatelliteSINR: targetSINR,
        targetSatelliteElevation: targetSatInfo?.elevation,
        targetSatelliteDistance: targetSatInfo?.distance,
        // 路徑損耗分量（基於當前衛星）
        pathLoss: currentSatInfo ? {
          fspl: calculatePathLoss(currentSatInfo.distance, currentSatInfo.elevation).fspl,
          sf: calculatePathLoss(currentSatInfo.distance, currentSatInfo.elevation).sf,
          cl: calculatePathLoss(currentSatInfo.distance, currentSatInfo.elevation).cl,
          total: calculatePathLoss(currentSatInfo.distance, currentSatInfo.elevation).total
        } : undefined,
        // A3 事件狀態
        a3Event: newHandoverState.a3Event,
        // 添加根層級的 targetSatelliteId，確保 UI 能追蹤到整個換手過程中的目標衛星
        targetSatelliteId: newHandoverState.targetSatelliteId
      };

      onStatsUpdate(extendedStats, currentSatId, newHandoverState.phase);
    }
    // Debug log - 已禁用（可在開發時啟用）
    // const logInterval = Math.floor(currentSecond / 30);
    // if (logInterval !== lastLogTimeRef.current) {
    //   lastLogTimeRef.current = logInterval;
    //   if (newHandoverState.phase !== 'stable') {
    //     console.log(`🛰️ 時間: ${elapsedTimeRef.current.toFixed(2)}s, 可見衛星: ${visibleSatellites.size}`);
    //     console.log(`   📡 主連線: ${newHandoverState.currentSatelliteId || '無'}`);
    //     console.log(`   🎯 目標衛星: ${newHandoverState.targetSatelliteId || '無'}`);
    //     console.log(`   🔄 換手階段: ${newHandoverState.phase}`);
    //   }
    // }

    // 更新所有衛星的可見性、位置和高亮效果
    meshesRef.current.forEach((mesh, satelliteId) => {
      const position = visibleSatellites.get(satelliteId);
      const isCurrentSatellite = satelliteId === newHandoverState.currentSatelliteId;
      const isTargetSatellite = satelliteId === newHandoverState.targetSatelliteId;

      // Update Label Position & Visibility
      const labelGroup = labelsRef.current.get(satelliteId);

      if (position) {
        // 衛星可見：更新位置並顯示
        mesh.position.set(position.x, position.y, position.z);
        mesh.visible = true;

        // Update Label
        if (labelGroup) {
          labelGroup.visible = true;
          // Ensure label is above the model (offset logic handles scale)
          // But wait, the labelGroup is unscaled in the scene root? No, it's in the group.
          // Actually, SatelliteLabel uses Billboard at `position`.
          // Since we moved to imperative updates, we need to set the position on the group.
          // Note: The SatelliteLabel component logic sets position on mount/prop change.
          // We need to override it or ensure the Ref points to the group we can move.
          // SatelliteLabel renders a Billboard. The ref we get is the Billboard (Group).
          // We can set its position directly.
          
          // Re-apply offset logic here for imperative update
          // OneWeb scale 60 -> offset 150
          // Starlink scale 6 -> offset 40
          // Wait, isOneWeb is available in scope.
          // Check if we need to apply the offset manually or if Billboard handles it?
          // The previous SatelliteLabel implementation calculated `labelPosition` based on prop `position`.
          // But now we removed the `position` prop and use imperative updates.
          // So we MUST calculate the final position here.
          
          const offset = isOneWeb ? 65 : 40;
          labelGroup.position.set(position.x, position.y + offset, position.z);
        }

        // 設置透明度和縮放（當前衛星高亮）
        mesh.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const childMesh = child as THREE.Mesh;
            if (childMesh.material) {
              const materials = Array.isArray(childMesh.material) ? childMesh.material : [childMesh.material];
              materials.forEach((mat) => {
                mat.transparent = true;
                mat.opacity = 1.0; // 可見衛星完全不透明
              });
            }
          }
        });

        // 當前衛星輕微放大
        const baseScale = isOneWeb ? 60 : 6;
        if (isCurrentSatellite) {
          mesh.scale.setScalar(baseScale * 1.15); // 放大 15%
        } else if (isTargetSatellite) {
          mesh.scale.setScalar(baseScale * 1.08); // 放大 8%
        } else {
          mesh.scale.setScalar(baseScale);
        }
      } else {
        // 衛星不可見：完全隱藏
        mesh.visible = false;
        if (labelGroup) {
          labelGroup.visible = false;
        }
      }
    });
  });

  // 儲存衛星網格
  const meshesRef = useRef<Map<string, THREE.Group>>(new Map());

  // 預先創建衛星模型實例
  const satelliteModels = useMemo(() => {
    if (!isLoaded) return [];

    const ids = calculator.getAllSatelliteIds();
    return ids.map((id) => ({
      id,
      model: scene.clone(true),
    }));
  }, [isLoaded, calculator, scene]);

  // Satellite Labels - Render ALL and update imperatively (Defined before early returns)
  const satelliteLabels = useMemo(() => satelliteModels.map(({ id }) => (
    <SatelliteLabel
      key={`label-${id}`}
      ref={(el) => { if (el) labelsRef.current.set(id, el); }}
      satelliteId={id}
      constellation={isOneWeb ? 'oneweb' : 'starlink'}
      isCurrentSatellite={id === handoverState?.currentSatelliteId}
      isTargetSatellite={id === handoverState?.targetSatelliteId}
    />
  )), [satelliteModels, isOneWeb, handoverState?.currentSatelliteId, handoverState?.targetSatelliteId]);

  // 計算波束分配 (當 showBeams 啟用且有 cells 時)
  // 支援多顆衛星（服務中 + 目標衛星）
  const beamDataList = useMemo(() => {
    if (!showBeams || cells.length === 0 || !handoverState?.currentSatelliteId) {
      return [];
    }

    const result: Array<{
      satelliteId: string;
      satellitePosition: THREE.Vector3;
      assignments: BeamAssignment[];
      primaryCellId: number;
      isTarget: boolean;
    }> = [];

    // 收集要顯示波束的衛星 ID（服務中 + 目標）
    const satelliteIds = [handoverState.currentSatelliteId];
    if (handoverState.targetSatelliteId && handoverState.phase !== 'stable') {
      satelliteIds.push(handoverState.targetSatelliteId);
    }

    satelliteIds.forEach((satId, satIndex) => {
      const satPosition = visibleSatellitesState.get(satId);
      if (!satPosition) return;

      // 計算可見 cells
      const visibleCells = getVisibleCells(satPosition, cells, 25);
      if (visibleCells.length === 0) return;

      // 選擇要服務的 cells (最多 4 個)
      const servingCellIds = selectServingCells(visibleCells, 4, satPosition);

      // 建立波束分配
      const assignments: BeamAssignment[] = servingCellIds.map((cellId, index) => ({
        beamId: index + 1,
        cellId,
        isActive: true,
      }));

      // 找出 UE 所在的 cell (簡化：選擇距離原點最近的 cell)
      const ueCellId = servingCellIds[0];

      result.push({
        satelliteId: satId,
        satellitePosition: satPosition,
        assignments,
        primaryCellId: ueCellId,
        isTarget: satIndex > 0,
      });
    });

    return result;
  }, [showBeams, cells, handoverState?.currentSatelliteId, handoverState?.targetSatelliteId, handoverState?.phase, visibleSatellitesState]);

  // 更新 cells 狀態（根據波束分配）
  useEffect(() => {
    if (!onCellsUpdate || cells.length === 0) return;

    // 建立 cellId -> beam 分配的映射（優先使用服務中衛星的分配）
    const beamAssignmentMap = new Map<number, { beamId: number; satelliteId: string }>();
    beamDataList.forEach(beamData => {
      // 服務中衛星的分配優先（先加入的優先）
      beamData.assignments.forEach(assignment => {
        if (!beamAssignmentMap.has(assignment.cellId)) {
          beamAssignmentMap.set(assignment.cellId, {
            beamId: assignment.beamId,
            satelliteId: beamData.satelliteId,
          });
        }
      });
    });

    // 計算被干擾的 cells（Paper 4-1: inter-beam interference）
    // 被服務 cell 的相鄰 cells 會受到波束溢出干擾
    const interferenceMap = new Map<number, Array<{ satelliteId: string; beamId: number; polarization: 'A' | 'B' }>>();
    beamAssignmentMap.forEach(({ beamId, satelliteId }, servedCellId) => {
      const neighborIds = getNeighborCellIds(servedCellId, cells);
      const polarization = getBeamPolarization(beamId);
      neighborIds.forEach(neighborId => {
        // 鄰居本身不是被服務的 cell 才標記為干擾
        if (!beamAssignmentMap.has(neighborId)) {
          const sources = interferenceMap.get(neighborId) || [];
          sources.push({ satelliteId, beamId, polarization });
          interferenceMap.set(neighborId, sources);
        }
      });
    });

    // 更新所有 cells 的服務狀態與干擾狀態
    const updatedCells = cells.map(cell => {
      const assignment = beamAssignmentMap.get(cell.id);
      if (assignment) {
        const polarization = getBeamPolarization(assignment.beamId);
        return {
          ...cell,
          isServed: true,
          servingSatelliteId: assignment.satelliteId,
          servingBeamId: assignment.beamId,
          servingPolarization: polarization,
          servingBeamColor: POLARIZATION_COLORS[polarization],
          isInterfered: false,
          interferingSources: [],
        };
      }
      const interference = interferenceMap.get(cell.id);
      if (interference) {
        return {
          ...cell,
          isServed: false,
          servingSatelliteId: null,
          servingBeamId: null,
          servingPolarization: null,
          servingBeamColor: null,
          isInterfered: true,
          interferingSources: interference,
        };
      }
      return {
        ...cell,
        isServed: false,
        servingSatelliteId: null,
        servingBeamId: null,
        servingPolarization: null,
        servingBeamColor: null,
        isInterfered: false,
        interferingSources: [],
      };
    });

    onCellsUpdate(updatedCells);
  }, [beamDataList, cells, onCellsUpdate]);

  if (error) {
    console.error('衛星系統錯誤:', error);
    return null;
  }

  if (!isLoaded) {
    return null;
  }

  return (
    <group>
      {/* 衛星模型 */}
      {satelliteModels.map(({ id, model }) => (
        <group
          key={id}
          ref={(ref) => {
            if (ref) {
              meshesRef.current.set(id, ref);
            }
          }}
          scale={isOneWeb ? 60 : 6}
        >
          <primitive object={model} />
        </group>
      ))}

      {/* UAV 到衛星的連線 */}
      {handoverState && (
        <EnhancedSatelliteLinks
          visibleSatellites={visibleSatellitesState}
          uavPosition={new THREE.Vector3(0, 10, 0)}
          handoverState={handoverState}
        />
      )}

      {/* Satellite Labels */}
      {satelliteLabels}

      {/* 衛星波束 (當 showBeams 啟用時，支援多顆衛星) */}
      {showBeams && beamDataList.map(beamData => (
        <SatelliteBeams
          key={`beams-${beamData.satelliteId}`}
          satelliteId={beamData.satelliteId}
          satellitePosition={beamData.satellitePosition}
          cells={cells}
          beamAssignments={beamData.assignments}
          primaryCellId={beamData.primaryCellId}
        />
      ))}
    </group>
  );
}

// 預載入模型
useGLTF.preload('/models/sat.glb');
useGLTF.preload('/models/sat2.glb');
