import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { Beam, DEFAULT_BEAM_CONFIG, DEFAULT_SCHEDULE } from '../types';
import { SatelliteConfig } from '../types/constellation';
import { generate7BeamLayout } from '../utils';
import { useBeamScheduler } from '../hooks';
import { BeamCones } from './BeamCone';
import { GroundCells } from './GroundCells';
import { WideBeam } from './WideBeam';

const SATELLITE_MODEL_PATH = '/models/sat.glb';

interface SatelliteModelProps {
  position: [number, number, number];
  scale?: number;
}

/**
 * 衛星 3D 模型 (載入 GLB)
 */
function SatelliteModel({ position, scale = 6 }: SatelliteModelProps) {
  const { scene } = useGLTF(SATELLITE_MODEL_PATH);

  const clonedScene = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((obj: THREE.Object3D) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return cloned;
  }, [scene]);

  return (
    <group position={position}>
      <primitive object={clonedScene} scale={scale} />
    </group>
  );
}

// 預載模型
useGLTF.preload(SATELLITE_MODEL_PATH);

/**
 * 遠處衛星圖示 (簡化版)
 */
function DistantSatelliteMarker({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* 簡單的十字標記 */}
      <mesh>
        <boxGeometry args={[15, 4, 4]} />
        <meshStandardMaterial color="#666677" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh>
        <boxGeometry args={[4, 4, 15]} />
        <meshStandardMaterial color="#666677" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* 發光點 */}
      <pointLight color="#aaaaff" intensity={0.3} distance={100} />
    </group>
  );
}

interface SatelliteUnitProps {
  config: SatelliteConfig;
  /** 是否自動運行 beam hopping */
  autoStart?: boolean;
  /** 速度倍率 */
  speedMultiplier?: number;
  /** Wide beam 半徑 */
  wideBeamRadius?: number;
}

/**
 * 完整衛星單元 - 包含衛星模型、波束、地面覆蓋
 */
export function SatelliteUnit({
  config,
  autoStart = true,
  speedMultiplier = 1,
  wideBeamRadius = 180,
}: SatelliteUnitProps) {
  const satellitePosition: [number, number, number] = [
    config.position.x,
    config.position.y,
    config.position.z,
  ];

  // 地面中心位置 (衛星正下方)
  const groundCenter = { x: config.position.x, z: config.position.z };

  // 生成該衛星的波束佈局
  const beamConfig = config.beamConfig || DEFAULT_BEAM_CONFIG;
  const initialBeams = useMemo(() => {
    const beams = generate7BeamLayout(beamConfig);
    // 偏移到該衛星的地面位置
    return beams.map(beam => ({
      ...beam,
      position: {
        x: beam.position.x + groundCenter.x,
        z: beam.position.z + groundCenter.z,
      },
    }));
  }, [beamConfig, groundCenter.x, groundCenter.z]);

  // 調整 schedule 的 slot offset
  const adjustedSchedule = useMemo(() => {
    const offset = config.slotOffset || 0;
    return DEFAULT_SCHEDULE.map((slot, idx) => ({
      ...slot,
      id: (slot.id + offset) % DEFAULT_SCHEDULE.length,
    }));
  }, [config.slotOffset]);

  const { beams } = useBeamScheduler(initialBeams, {
    schedule: DEFAULT_SCHEDULE,
    autoStart,
    speedMultiplier,
    slotOffset: config.slotOffset || 0,
  });

  // 如果不顯示波束，只顯示遠處衛星標記
  if (!config.showBeams) {
    return <DistantSatelliteMarker position={satellitePosition} />;
  }

  return (
    <group>
      {/* 衛星模型 */}
      <SatelliteModel position={satellitePosition} />

      {/* Wide Beam - 控制訊號 */}
      <WideBeam
        satellitePosition={satellitePosition}
        radius={wideBeamRadius}
        color="#ffffff"
        coneOpacity={0.012}
        groundOpacity={0.05}
      />

      {/* Spot Beams - 資料傳輸 */}
      <BeamCones
        beams={beams}
        satelliteHeight={beamConfig.coneHeight}
        satellitePosition={satellitePosition}
      />
      <GroundCells beams={beams} showLabels={false} />
    </group>
  );
}

export { DistantSatelliteMarker };
