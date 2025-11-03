import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { SatelliteOrbitCalculator } from '@/utils/satellite/SatelliteOrbitCalculator';
import * as THREE from 'three';

interface SatellitesProps {
  dataUrl: string;
  timeSpeed?: number;
}

export function Satellites({ dataUrl, timeSpeed = 1.0 }: SatellitesProps) {
  const [calculator] = useState(() => new SatelliteOrbitCalculator());
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elapsedTimeRef = useRef(0);
  const lastLogTimeRef = useRef(-1);
  const { scene } = useGLTF('/models/sat.glb');

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

    // 調試 log（已禁用）
    // 如需啟用，取消註釋以下代碼
    /*
    const currentSecond = Math.floor(elapsedTimeRef.current);
    const logInterval = Math.floor(currentSecond / 10);

    if (logInterval !== lastLogTimeRef.current) {
      lastLogTimeRef.current = logInterval;
      console.log(`🛰️ 時間: ${elapsedTimeRef.current.toFixed(2)}s, 可見衛星: ${visibleSatellites.size}`);
      if (visibleSatellites.size > 0) {
        const [firstId, firstPos] = Array.from(visibleSatellites.entries())[0];
        console.log(`   第一顆衛星 ${firstId} 位置:`, firstPos);
      }
    }
    */

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
    </group>
  );
}

// 預載入模型
useGLTF.preload('/models/sat.glb');
