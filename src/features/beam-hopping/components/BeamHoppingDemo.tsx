import React, { useState, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import { Beam, DEFAULT_BEAM_CONFIG, FRF3_COLORS } from '../types';
import { BeamCones } from './BeamCone';
import { GroundCells } from './GroundCells';
import { WideBeam } from './WideBeam';

const SATELLITE_MODEL_PATH = '/models/sat.glb';
useGLTF.preload(SATELLITE_MODEL_PATH);

/**
 * 衛星配置（相對於 UAV 的初始位置和移動方向）
 */
interface SatelliteConfig {
  id: string;
  /** 相對於 UAV 的初始偏移 */
  offset: { x: number; z: number };
  /** 移動方向（會正規化） */
  direction: { x: number; z: number };
  /** 速度倍率 */
  speed: number;
}

/**
 * 預設衛星配置 - 2 顆衛星從不同方向移動
 */
const SATELLITE_CONFIGS: SatelliteConfig[] = [
  {
    id: 'SAT-A',
    offset: { x: -30, z: 20 },      // 靠近 UAV，一開始就有服務
    direction: { x: 1, z: 0.15 },   // 緩慢向右移動
    speed: 1.0,
  },
  {
    id: 'SAT-B',
    offset: { x: 280, z: 120 },     // 從右前方開始，較遠
    direction: { x: -0.7, z: -0.4 },// 向左後方移動（朝 UAV 方向）
    speed: 0.8,
  },
];

const SATELLITE_HEIGHT = 500;
const BASE_SPEED = 12; // 基礎移動速度（場景單位/秒）
const RESET_DISTANCE = 400; // 超過此距離重置

/**
 * Beam Hopping 時隙排程（視覺化用，實際系統為毫秒級）
 * 每個時隙激活特定的波束組合（考慮 FRF3 避免干擾）
 */
const BEAM_HOPPING_SCHEDULE = [
  { activeBeams: [0], duration: 3000 },           // 中心波束
  { activeBeams: [1, 4], duration: 3000 },        // 對角波束
  { activeBeams: [2, 5], duration: 3000 },        // 對角波束
  { activeBeams: [3, 6], duration: 3000 },        // 對角波束
  { activeBeams: [0, 2, 4], duration: 3000 },     // 交錯組合
  { activeBeams: [1, 3, 5], duration: 3000 },     // 交錯組合
];

/**
 * 生成以指定中心為基準的 7-beam 佈局
 */
function generate7BeamLayoutAt(
  centerX: number,
  centerZ: number,
  config: typeof DEFAULT_BEAM_CONFIG
): Beam[] {
  const { cellSpacing, coneRadiusBottom, frequencyReuseFactor } = config;
  const colors = [FRF3_COLORS.group0, FRF3_COLORS.group1, FRF3_COLORS.group2];

  const beams: Beam[] = [
    {
      id: 0,
      position: { x: centerX, z: centerZ },
      radius: coneRadiusBottom,
      color: colors[0],
      isActive: false,
      frequencyGroup: 0,
    },
  ];

  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const x = centerX + Math.cos(angle) * cellSpacing;
    const z = centerZ + Math.sin(angle) * cellSpacing;
    const freqGroup = frequencyReuseFactor === 3 ? (i % 3) : 0;

    beams.push({
      id: i + 1,
      position: { x, z },
      radius: coneRadiusBottom,
      color: colors[freqGroup],
      isActive: false,
      frequencyGroup: freqGroup,
    });
  }

  return beams;
}

/**
 * 找出 UAV 所在的波束
 */
function findUAVBeam(
  beams: Beam[],
  uavPosition: THREE.Vector3
): { beamId: number | null; isInCoverage: boolean } {
  let closestBeamId: number | null = null;
  let closestDistance = Infinity;
  let isInCoverage = false;

  for (const beam of beams) {
    const distance = Math.sqrt(
      Math.pow(beam.position.x - uavPosition.x, 2) +
      Math.pow(beam.position.z - uavPosition.z, 2)
    );

    if (distance < closestDistance) {
      closestDistance = distance;
      closestBeamId = beam.id;
    }

    if (distance <= beam.radius * 1.2) {
      isInCoverage = true;
    }
  }

  return { beamId: closestBeamId, isInCoverage };
}

type HandoverPhase = 'stable' | 'preparation' | 'switching' | 'completion';

const HANDOVER_TIMING = {
  preparation: 500,
  switching: 250,
  completion: 350,
};

interface MovingSatelliteProps {
  config: SatelliteConfig;
  uavPosition: THREE.Vector3;
  wideBeamRadius: number;
  isServingSatellite: boolean;
  onHandoverState?: (satelliteId: string, phase: HandoverPhase) => void;
}

/**
 * 移動中的衛星（帶波束和換手動畫）
 */
function MovingSatellite({
  config,
  uavPosition,
  wideBeamRadius,
  isServingSatellite,
  onHandoverState,
}: MovingSatelliteProps) {
  const { scene } = useGLTF(SATELLITE_MODEL_PATH);

  // 正規化移動方向
  const normalizedDir = useMemo(() => {
    const len = Math.sqrt(config.direction.x ** 2 + config.direction.z ** 2);
    return { x: config.direction.x / len, z: config.direction.z / len };
  }, [config.direction.x, config.direction.z]);

  // 衛星位置狀態
  const [position, setPosition] = useState({
    x: uavPosition.x + config.offset.x,
    y: SATELLITE_HEIGHT,
    z: uavPosition.z + config.offset.z,
  });

  // 換手狀態
  const [handoverPhase, setHandoverPhase] = useState<HandoverPhase>('stable');
  const [connectionOpacity, setConnectionOpacity] = useState(0.8);
  const [previousBeamId, setPreviousBeamId] = useState<number | null>(null);
  const [displayBeamId, setDisplayBeamId] = useState<number | null>(null);

  const handoverTimerRef = useRef(0);
  const lastBeamIdRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);

  // Beam hopping 排程狀態
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0);
  const slotTimerRef = useRef(0);

  // 生成波束佈局
  const beamLayout = useMemo(
    () => generate7BeamLayoutAt(position.x, position.z, DEFAULT_BEAM_CONFIG),
    [position.x, position.z]
  );

  // 當前時隙激活的波束
  const activeBeamIds = BEAM_HOPPING_SCHEDULE[currentSlotIndex].activeBeams;

  // 找出 UAV 所在波束
  const { beamId: uavBeamId, isInCoverage } = useMemo(
    () => findUAVBeam(beamLayout, uavPosition),
    [beamLayout, uavPosition]
  );

  // UAV 是否在當前激活的波束中（必須實際在覆蓋範圍內）
  const isUAVInActiveBeam = isInCoverage && uavBeamId !== null && activeBeamIds.includes(uavBeamId);

  // 衛星移動 + Beam Hopping 排程 + 換手動畫
  useFrame((_, delta) => {
    elapsedRef.current += delta;
    const t = elapsedRef.current;
    const deltaMs = delta * 1000;

    // === Beam Hopping 時隙切換 ===
    slotTimerRef.current += deltaMs;
    const currentSlotDuration = BEAM_HOPPING_SCHEDULE[currentSlotIndex].duration;
    if (slotTimerRef.current >= currentSlotDuration) {
      slotTimerRef.current = 0;
      setCurrentSlotIndex((prev) => (prev + 1) % BEAM_HOPPING_SCHEDULE.length);
    }

    // === 衛星移動 ===
    const speedVariation = 1 + 0.1 * Math.sin(t * 0.4);
    const speed = BASE_SPEED * config.speed * speedVariation * delta;

    let newX = position.x + normalizedDir.x * speed;
    let newZ = position.z + normalizedDir.z * speed;

    const distFromUAV = Math.sqrt(
      Math.pow(newX - uavPosition.x, 2) + Math.pow(newZ - uavPosition.z, 2)
    );

    if (distFromUAV > RESET_DISTANCE) {
      newX = uavPosition.x - normalizedDir.x * RESET_DISTANCE * 0.9;
      newZ = uavPosition.z - normalizedDir.z * RESET_DISTANCE * 0.9;
    }

    const newY = SATELLITE_HEIGHT + 8 * Math.sin(t * 0.2);
    setPosition({ x: newX, y: newY, z: newZ });

    // === 換手動畫邏輯（基於 UAV 所在波束是否在當前激活列表中）===
    if (!isServingSatellite) {
      return;
    }

    // 追蹤 UAV 實際連接的波束（必須是激活的波束）
    const effectiveBeamId = isUAVInActiveBeam ? uavBeamId : null;

    // 檢測服務波束切換（UAV 從一個激活波束移到另一個，或波束排程變化）
    if (
      lastBeamIdRef.current !== null &&
      effectiveBeamId !== null &&
      lastBeamIdRef.current !== effectiveBeamId &&
      handoverPhase === 'stable'
    ) {
      setPreviousBeamId(lastBeamIdRef.current);
      setHandoverPhase('preparation');
      handoverTimerRef.current = 0;
      onHandoverState?.(config.id, 'preparation');
    }

    // 換手動畫
    if (handoverPhase !== 'stable') {
      handoverTimerRef.current += deltaMs;

      if (handoverPhase === 'preparation') {
        const blinkSpeed = 15;
        setConnectionOpacity(0.3 + Math.sin(handoverTimerRef.current * blinkSpeed / 1000 * Math.PI) * 0.5);

        if (handoverTimerRef.current >= HANDOVER_TIMING.preparation) {
          setHandoverPhase('switching');
          handoverTimerRef.current = 0;
          onHandoverState?.(config.id, 'switching');
        }
      } else if (handoverPhase === 'switching') {
        const progress = handoverTimerRef.current / HANDOVER_TIMING.switching;
        setConnectionOpacity(Math.max(0, 0.8 * (1 - progress)));

        if (handoverTimerRef.current >= HANDOVER_TIMING.switching) {
          setHandoverPhase('completion');
          setDisplayBeamId(effectiveBeamId);
          handoverTimerRef.current = 0;
          onHandoverState?.(config.id, 'completion');
        }
      } else if (handoverPhase === 'completion') {
        const progress = handoverTimerRef.current / HANDOVER_TIMING.completion;
        setConnectionOpacity(0.8 * progress);

        if (handoverTimerRef.current >= HANDOVER_TIMING.completion) {
          setHandoverPhase('stable');
          setPreviousBeamId(null);
          setConnectionOpacity(0.8);
          lastBeamIdRef.current = effectiveBeamId;
          onHandoverState?.(config.id, 'stable');
        }
      }
    } else {
      lastBeamIdRef.current = effectiveBeamId;
      setDisplayBeamId(effectiveBeamId);
    }
  });

  // 波束狀態（根據 beam hopping 排程決定 active）
  const beamsWithState = useMemo(() => {
    return beamLayout.map((beam) => ({
      ...beam,
      // 波束 active 取決於排程，不取決於 UAV 位置
      isActive: activeBeamIds.includes(beam.id),
    }));
  }, [beamLayout, activeBeamIds]);

  // 連線顏色
  const connectionColor = useMemo(() => {
    switch (handoverPhase) {
      case 'preparation': return '#ffaa00';
      case 'switching': return '#ff6600';
      case 'completion': return '#88ff88';
      default: return '#00ff00';
    }
  }, [handoverPhase]);

  // 服務波束位置（UAV 所在的激活波束）
  const servingBeamPosition = useMemo(() => {
    if (!isServingSatellite || !isUAVInActiveBeam || displayBeamId === null) return null;
    const beam = beamLayout.find(b => b.id === displayBeamId);
    return beam ? beam.position : null;
  }, [isServingSatellite, isUAVInActiveBeam, displayBeamId, beamLayout]);

  // 克隆模型
  const clonedScene = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((obj: THREE.Object3D) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).castShadow = true;
      }
    });
    return cloned;
  }, [scene]);

  const satPos: [number, number, number] = [position.x, position.y, position.z];

  return (
    <group>
      {/* 衛星模型 */}
      <group position={satPos} scale={isServingSatellite ? 8 : 6}>
        <primitive object={clonedScene} />
      </group>

      {/* 衛星標籤 */}
      <Text
        position={[position.x, position.y + 35, position.z]}
        fontSize={14}
        color={isServingSatellite ? '#00ff00' : '#888888'}
        anchorX="center"
        anchorY="middle"
        outlineWidth={1}
        outlineColor="#000000"
      >
        {config.id}
      </Text>

      {/* Wide Beam */}
      <WideBeam
        satellitePosition={satPos}
        radius={wideBeamRadius}
        color="#ffffff"
        coneOpacity={0.008}
        groundOpacity={0.03}
      />

      {/* Spot Beams */}
      <BeamCones
        beams={beamsWithState}
        satelliteHeight={position.y}
        satellitePosition={satPos}
      />
      <GroundCells beams={beamsWithState} showLabels={isServingSatellite} />

      {/* 服務連線（只有 UAV 在激活波束內才顯示）*/}
      {isServingSatellite && isUAVInActiveBeam && servingBeamPosition && connectionOpacity > 0 && (
        <Line
          points={[
            satPos,
            [servingBeamPosition.x, 0, servingBeamPosition.z],
            [uavPosition.x, uavPosition.y, uavPosition.z],
          ]}
          color={connectionColor}
          lineWidth={handoverPhase === 'stable' ? 3 : 4}
          transparent
          opacity={connectionOpacity}
        />
      )}

      {/* 換手狀態 */}
      {isServingSatellite && handoverPhase !== 'stable' && (
        <Text
          position={[position.x, position.y + 55, position.z]}
          fontSize={12}
          color={connectionColor}
          anchorX="center"
          anchorY="middle"
          outlineWidth={1}
          outlineColor="#000000"
        >
          {handoverPhase === 'preparation' ? `B${previousBeamId} → B${uavBeamId}` :
           handoverPhase === 'switching' ? 'Switching...' :
           `Connected B${uavBeamId}`}
        </Text>
      )}
    </group>
  );
}

export interface BeamHoppingDemoProps {
  uavPosition: THREE.Vector3;
  /** Wide beam 半徑 */
  wideBeamRadius?: number;
}

/**
 * Beam Hopping 展示場景
 *
 * 多顆衛星緩慢移動，展示 intra-satellite beam handover
 */
export function BeamHoppingDemo({
  uavPosition,
  wideBeamRadius = 180,
}: BeamHoppingDemoProps) {
  const [handoverPhase, setHandoverPhase] = useState<HandoverPhase>('stable');

  const handleHandoverState = React.useCallback((satelliteId: string, phase: HandoverPhase) => {
    setHandoverPhase(phase);
  }, []);

  // 計算每顆衛星到 UAV 的距離，決定誰是服務衛星
  const [satelliteDistances, setSatelliteDistances] = useState<Map<string, number>>(new Map());

  // 更新距離（由子組件觸發或定期更新）
  const updateDistances = React.useCallback(() => {
    // 這裡簡化處理，第一顆衛星為服務衛星
  }, []);

  // 狀態顏色
  const hasHandoverInProgress = handoverPhase !== 'stable';
  const statusColor = hasHandoverInProgress ? '#ffaa00' : '#00ff00';
  const statusText = hasHandoverInProgress
    ? 'Beam Handover in Progress...'
    : 'Connected';

  return (
    <group>
      {/* 多顆移動衛星 */}
      {SATELLITE_CONFIGS.map((config, index) => (
        <MovingSatellite
          key={config.id}
          config={config}
          uavPosition={uavPosition}
          wideBeamRadius={wideBeamRadius}
          isServingSatellite={index === 0} // 第一顆為服務衛星
          onHandoverState={index === 0 ? handleHandoverState : undefined}
        />
      ))}

      {/* UAV 狀態指示環 */}
      <mesh
        position={[uavPosition.x, 1, uavPosition.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[15, 20, 32]} />
        <meshBasicMaterial
          color={statusColor}
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 換手中外圈 */}
      {hasHandoverInProgress && (
        <mesh
          position={[uavPosition.x, 1, uavPosition.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[22, 26, 32]} />
          <meshBasicMaterial
            color="#ffaa00"
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* 狀態文字 */}
      <Text
        position={[uavPosition.x, 55, uavPosition.z]}
        fontSize={12}
        color={statusColor}
        anchorX="center"
        anchorY="middle"
        outlineWidth={1.5}
        outlineColor="#000000"
      >
        {statusText}
      </Text>

      {/* UE 標籤 */}
      <Text
        position={[uavPosition.x, 35, uavPosition.z]}
        fontSize={10}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={1}
        outlineColor="#000000"
      >
        UE (UAV)
      </Text>
    </group>
  );
}
