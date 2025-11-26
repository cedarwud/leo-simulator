import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SatelliteOrbitCalculator } from '@/utils/satellite/SatelliteOrbitCalculator';
import { EnhancedHandoverManager } from '@/utils/satellite/EnhancedHandoverManager';
import { RSRPHandoverManager } from '@/utils/satellite/RSRPHandoverManager';
import { EnhancedSatelliteLinks } from './EnhancedSatelliteLinks';
import { HandoverState } from '@/types/handover';
import { HandoverMethodType, HandoverStats } from '@/types/handover-method';
import * as THREE from 'three';

interface SatellitesProps {
  dataUrl: string;
  timeSpeed?: number;
  handoverMethod?: HandoverMethodType;
  onStatsUpdate?: (stats: HandoverStats, satelliteId: string | null, phase: string) => void;
}

export function Satellites({ dataUrl, timeSpeed = 1.0, handoverMethod = 'geometric', onStatsUpdate }: SatellitesProps) {
  const [calculator] = useState(() => new SatelliteOrbitCalculator());
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elapsedTimeRef = useRef(0);
  const lastLogTimeRef = useRef(-1);
  const { scene } = useGLTF('/models/sat.glb');

  // 統計追蹤
  const statsRef = useRef<HandoverStats>({
    totalHandovers: 0,
    pingPongEvents: 0,
    averageRSRP: -95,
    averageRSRQ: -12,
    averageSINR: 10,
    connectionDuration: 0,
    serviceInterruptions: 0,
    elapsedTime: 0
  });
  const lastSatelliteIdRef = useRef<string | null>(null);
  const connectionStartTimeRef = useRef<number>(0);
  const lastHandoverTimeRef = useRef<number>(0);

  // 動態創建換手管理器（根據選擇的方法）
  const handoverManager = useMemo(() => {
    console.log(`🔄 切換換手方法: ${handoverMethod.toUpperCase()}`);
    switch (handoverMethod) {
      case 'rsrp':
        return new RSRPHandoverManager();
      case 'geometric':
      default:
        return new EnhancedHandoverManager();
    }
  }, [handoverMethod]);

  // 換手狀態
  const [handoverState, setHandoverState] = useState<HandoverState | null>(null);
  const [visibleSatellitesState, setVisibleSatellitesState] = useState<Map<string, THREE.Vector3>>(new Map());

  // 載入時間序列數據
  useEffect(() => {
    calculator
      .loadTimeseries(dataUrl)
      .then(() => {
        const ids = calculator.getAllSatelliteIds();
        console.log('✅ 衛星數據載入成功');
        console.log(`📡 衛星數量: ${ids.length}`);
        console.log('📡 衛星 IDs:', ids);
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
      onStatsUpdate({...statsRef.current}, currentSatId, newHandoverState.phase);
    }
    const logInterval = Math.floor(currentSecond / 5);  // 每 5 秒記錄一次

    if (logInterval !== lastLogTimeRef.current) {
      lastLogTimeRef.current = logInterval;
      console.log(`🛰️ 時間: ${elapsedTimeRef.current.toFixed(2)}s, 可見衛星: ${visibleSatellites.size}`);
      console.log(`   📡 主連線: ${newHandoverState.currentSatelliteId || '無'}`);
      console.log(`   🎯 目標衛星: ${newHandoverState.targetSatelliteId || '無'}`);
      console.log(`   🔄 換手階段: ${newHandoverState.phase}`);
      console.log(`   📊 進度: ${(newHandoverState.progress * 100).toFixed(1)}%`);
      console.log(`   📶 訊號: 當前=${newHandoverState.signalStrength.current.toFixed(2)}, 目標=${newHandoverState.signalStrength.target.toFixed(2)}`);

      // 顯示候選衛星
      if (newHandoverState.candidateSatelliteIds.length > 0) {
        console.log(`   🛰️  候選: ${newHandoverState.candidateSatelliteIds.join(', ')}`);
      }
    }

    // 更新所有衛星的可見性和位置
    meshesRef.current.forEach((mesh, satelliteId) => {
      const position = visibleSatellites.get(satelliteId);
      if (position) {
        // 衛星可見：更新位置並顯示
        mesh.position.set(position.x, position.y, position.z);
        mesh.visible = true;
      } else {
        // 衛星不可見：隱藏
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
          scale={6}
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
