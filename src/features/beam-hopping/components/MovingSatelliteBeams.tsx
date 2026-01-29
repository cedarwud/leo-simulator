import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SatelliteOrbitCalculator } from '@/utils/satellite/SatelliteOrbitCalculator';
import { DEFAULT_BEAM_CONFIG } from '../types';
import { generate7BeamLayout } from '../utils';
import { BeamCones } from './BeamCone';
import { GroundCells } from './GroundCells';
import { WideBeam } from './WideBeam';

const SATELLITE_MODEL_PATH = '/models/sat.glb';

// 預載模型
useGLTF.preload(SATELLITE_MODEL_PATH);

interface MovingSatelliteBeamsProps {
  /** 衛星數據 URL */
  dataUrl: string;
  /** 時間速度倍率 */
  timeSpeed?: number;
  /** UAV 位置 */
  uavPosition: THREE.Vector3;
  /** 顯示波束的最大衛星數量 */
  maxBeamSatellites?: number;
  /** 顯示波束的最大距離 */
  maxBeamDistance?: number;
  /** Wide beam 半徑 */
  wideBeamRadius?: number;
}

/**
 * 計算 UAV 位於哪個波束內
 */
function findBeamContainingUAV(
  beams: { id: number; position: { x: number; z: number }; radius: number }[],
  uavPosition: THREE.Vector3
): number | null {
  let closestBeamId: number | null = null;
  let closestDistance = Infinity;

  for (const beam of beams) {
    const distance = Math.sqrt(
      Math.pow(beam.position.x - uavPosition.x, 2) +
      Math.pow(beam.position.z - uavPosition.z, 2)
    );

    // UAV 在波束覆蓋範圍內
    if (distance <= beam.radius && distance < closestDistance) {
      closestDistance = distance;
      closestBeamId = beam.id;
    }
  }

  // 如果不在任何波束內，找最近的波束
  if (closestBeamId === null) {
    for (const beam of beams) {
      const distance = Math.sqrt(
        Math.pow(beam.position.x - uavPosition.x, 2) +
        Math.pow(beam.position.z - uavPosition.z, 2)
      );
      if (distance < closestDistance) {
        closestDistance = distance;
        closestBeamId = beam.id;
      }
    }
  }

  return closestBeamId;
}

/**
 * 單顆衛星的波束系統
 */
function SatelliteBeamSystem({
  satelliteId,
  satellitePosition,
  groundPosition,
  uavPosition,
  wideBeamRadius,
  showBeams,
  isServingSatellite,
}: {
  satelliteId: string;
  satellitePosition: THREE.Vector3;
  groundPosition: { x: number; z: number };
  uavPosition: THREE.Vector3;
  wideBeamRadius: number;
  showBeams: boolean;
  isServingSatellite: boolean;
}) {
  const satPos: [number, number, number] = [
    satellitePosition.x,
    satellitePosition.y,
    satellitePosition.z,
  ];

  // 生成波束佈局（以衛星地面投影為中心）
  const initialBeams = useMemo(() => {
    const beams = generate7BeamLayout(DEFAULT_BEAM_CONFIG);
    return beams.map(beam => ({
      ...beam,
      position: {
        x: beam.position.x + groundPosition.x,
        z: beam.position.z + groundPosition.z,
      },
    }));
  }, [groundPosition.x, groundPosition.z]);

  // 找出覆蓋 UAV 的波束
  const uavBeamId = useMemo(() => {
    return findBeamContainingUAV(initialBeams, uavPosition);
  }, [initialBeams, uavPosition]);

  // 根據 UAV 位置決定哪些波束 active
  // 主服務衛星：UAV 所在波束 active
  // 其他衛星：顯示所有波束但都是 inactive（準備中）
  const beamsWithUAVAwareness = useMemo(() => {
    return initialBeams.map(beam => ({
      ...beam,
      isActive: isServingSatellite && beam.id === uavBeamId,
    }));
  }, [initialBeams, uavBeamId, isServingSatellite]);

  if (!showBeams) {
    return null;
  }

  return (
    <group>
      {/* Wide Beam */}
      <WideBeam
        satellitePosition={satPos}
        radius={wideBeamRadius}
        color="#ffffff"
        coneOpacity={0.01}
        groundOpacity={0.04}
      />

      {/* Spot Beams */}
      <BeamCones
        beams={beamsWithUAVAwareness}
        satelliteHeight={satellitePosition.y}
        satellitePosition={satPos}
      />
      <GroundCells beams={beamsWithUAVAwareness} showLabels={false} />
    </group>
  );
}

/**
 * 移動衛星 + 波束系統
 */
export function MovingSatelliteBeams({
  dataUrl,
  timeSpeed = 1.0,
  uavPosition,
  maxBeamSatellites = 3,
  maxBeamDistance = 800,
  wideBeamRadius = 180,
}: MovingSatelliteBeamsProps) {
  const [calculator] = useState(() => new SatelliteOrbitCalculator());
  const [isLoaded, setIsLoaded] = useState(false);
  const elapsedTimeRef = useRef(0);

  // 載入衛星模型
  const { scene } = useGLTF(SATELLITE_MODEL_PATH);

  // 可見衛星位置（每幀更新）
  const [visibleSatellites, setVisibleSatellites] = useState<Map<string, THREE.Vector3>>(new Map());

  // 顯示波束的衛星列表
  const [beamSatellites, setBeamSatellites] = useState<string[]>([]);

  // 載入時間序列數據
  useEffect(() => {
    calculator
      .loadTimeseries(dataUrl)
      .then(() => {
        setIsLoaded(true);
        console.log('✅ Beam Hopping 衛星數據載入完成');
      })
      .catch((err) => {
        console.error('❌ 衛星數據載入失敗:', err);
      });
  }, [dataUrl, calculator]);

  // 每幀更新
  useFrame((_, delta) => {
    if (!isLoaded) return;

    elapsedTimeRef.current += delta * timeSpeed;
    const satellites = calculator.getVisibleSatellites(
      elapsedTimeRef.current,
      timeSpeed
    );

    setVisibleSatellites(satellites);

    // 計算哪些衛星應該顯示波束（基於與 UAV 的距離）
    const satelliteDistances: { id: string; distance: number }[] = [];

    satellites.forEach((pos, id) => {
      // 計算衛星地面投影到 UAV 的水平距離
      const groundDistance = Math.sqrt(
        Math.pow(pos.x - uavPosition.x, 2) +
        Math.pow(pos.z - uavPosition.z, 2)
      );
      satelliteDistances.push({ id, distance: groundDistance });
    });

    // 排序並選擇最近的衛星
    satelliteDistances.sort((a, b) => a.distance - b.distance);
    const nearestSatellites = satelliteDistances
      .filter(s => s.distance <= maxBeamDistance)
      .slice(0, maxBeamSatellites)
      .map(s => s.id);

    setBeamSatellites(nearestSatellites);
  });

  // 預先創建衛星模型實例
  const satelliteModels = useMemo(() => {
    if (!isLoaded) return [];

    const ids = calculator.getAllSatelliteIds();
    return ids.map((id) => ({
      id,
      model: scene.clone(true),
    }));
  }, [isLoaded, calculator, scene]);

  // 衛星網格參考
  const meshesRef = useRef<Map<string, THREE.Group>>(new Map());

  // 更新衛星位置
  useFrame(() => {
    meshesRef.current.forEach((mesh, satelliteId) => {
      const position = visibleSatellites.get(satelliteId);
      const showBeams = beamSatellites.includes(satelliteId);

      if (position) {
        mesh.position.set(position.x, position.y, position.z);
        mesh.visible = true;

        // 顯示波束的衛星稍微放大
        if (showBeams) {
          mesh.scale.setScalar(8);
        } else {
          mesh.scale.setScalar(6);
        }
      } else {
        mesh.visible = false;
      }
    });
  });

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
          visible={false}
        >
          <primitive object={model} />
        </group>
      ))}

      {/* 衛星波束系統（只為最近的衛星渲染） */}
      {beamSatellites.map((satelliteId, index) => {
        const position = visibleSatellites.get(satelliteId);
        if (!position) return null;

        // 第一顆（最近的）是主服務衛星
        const isServingSatellite = index === 0;

        return (
          <SatelliteBeamSystem
            key={satelliteId}
            satelliteId={satelliteId}
            satellitePosition={position}
            groundPosition={{ x: position.x, z: position.z }}
            uavPosition={uavPosition}
            wideBeamRadius={wideBeamRadius}
            showBeams={true}
            isServingSatellite={isServingSatellite}
          />
        );
      })}
    </group>
  );
}
