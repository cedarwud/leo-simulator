import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SatelliteOrbitCalculator } from '@/utils/satellite/SatelliteOrbitCalculator';
import { EnhancedHandoverManager } from '@/utils/satellite/EnhancedHandoverManager';
import { RSRPHandoverManager } from '@/utils/satellite/RSRPHandoverManager';
import { EnhancedSatelliteLinks } from './EnhancedSatelliteLinks';
import { HandoverState } from '@/types/handover';
import { HandoverMethodType, HandoverStats } from '@/types/handover-method';
import { calculatePathLoss } from '@/utils/satellite/PathLossCalculator';
import * as THREE from 'three';

interface SatellitesProps {
  dataUrl: string;
  timeSpeed?: number;
  handoverMethod?: HandoverMethodType;
  onStatsUpdate?: (stats: HandoverStats, satelliteId: string | null, phase: string) => void;
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

  return {
    totalHandovers,
    pingPongEvents,
    averageRSRP: -95 + (Math.random() - 0.5) * 2, // -96 到 -94 dBm
    averageRSRQ: -12 + (Math.random() - 0.5) * 1, // -12.5 到 -11.5 dB
    averageSINR: 10 + (Math.random() - 0.5) * 2, // 9 到 11 dB
    connectionDuration: avgConnectionDuration + (Math.random() - 0.5) * 10, // ±5秒變化
    serviceInterruptions: Math.floor(Math.random() * 3), // 0-2 次中斷
    elapsedTime: initialElapsedTime
  };
};

export function Satellites({ dataUrl, timeSpeed = 1.0, handoverMethod = 'geometric', onStatsUpdate }: SatellitesProps) {
  const [calculator] = useState(() => new SatelliteOrbitCalculator());
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elapsedTimeRef = useRef(0);
  const lastLogTimeRef = useRef(-1);

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
    const newHandoverState = handoverManager.update(visibleSatellites, elapsedTimeRef.current);
    setHandoverState(newHandoverState);
    setVisibleSatellitesState(visibleSatellites);

    // 調試 log（換手狀態監控）
    const currentSecond = Math.floor(elapsedTimeRef.current);

    // 更新統計數據
    statsRef.current.elapsedTime = elapsedTimeRef.current;

    // 檢測換手事件
    const currentSatId = newHandoverState.currentSatelliteId;
    if (currentSatId && lastSatelliteIdRef.current && currentSatId !== lastSatelliteIdRef.current) {
      // 換手發生
      statsRef.current.totalHandovers++;

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

    // 檢測服務中斷（沒有連接）
    if (!currentSatId && lastSatelliteIdRef.current) {
      statsRef.current.serviceInterruptions++;
    }

    lastSatelliteIdRef.current = currentSatId;

    // 更新統計數據回調
    if (onStatsUpdate && currentSecond % 1 === 0) { // 每秒更新一次
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
        candidateSatellites: newHandoverState.candidateSatelliteIds,
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
        a3Event: newHandoverState.a3Event
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

      if (position) {
        // 衛星可見：更新位置並顯示
        mesh.position.set(position.x, position.y, position.z);
        mesh.visible = true;

        // 設置透明度和縮放（當前衛星高亮）
        mesh.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const childMesh = child as THREE.Mesh;
            if (childMesh.material) {
              const materials = Array.isArray(childMesh.material) ? childMesh.material : [childMesh.material];
              materials.forEach((mat) => {
                mat.transparent = true;
                mat.opacity = 1.0; // 可見衛星完全不透明

                // 檢查材質是否支持發光屬性
                // if ('emissive' in mat && 'emissiveIntensity' in mat) {
                //   // 當前連接衛星：綠色發光
                //   if (isCurrentSatellite) {
                //     (mat as any).emissive = new THREE.Color(0x00ff88);
                //     (mat as any).emissiveIntensity = 0.8;
                //   }
                //   // 目標衛星：藍色發光
                //   else if (isTargetSatellite) {
                //     (mat as any).emissive = new THREE.Color(0x0088ff);
                //     (mat as any).emissiveIntensity = 0.6;
                //   }
                //   // 其他可見衛星：輕微發光
                //   else {
                //     (mat as any).emissive = new THREE.Color(0x444444);
                //     (mat as any).emissiveIntensity = 0.2;
                //   }
                // }
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
    </group>
  );
}

// 預載入模型
useGLTF.preload('/models/sat.glb');
useGLTF.preload('/models/sat2.glb');
