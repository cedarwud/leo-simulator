import React, { useMemo, useRef } from 'react';
import { Line, Cone, Text } from '@react-three/drei';
import * as THREE from 'three';
import { EarthFixedCell, POLARIZATION_COLORS, getBeamPolarization, getBeamColor } from './EarthFixedCells';

/**
 * 衛星到 Cell 的 Beam 連線
 * Beam 顏色 = 目標 Cell 的頻率組顏色
 */
interface SatelliteToCellBeamProps {
  /** 衛星位置 */
  satellitePosition: THREE.Vector3;
  /** 目標 Cell */
  targetCell: EarthFixedCell;
  /** 波束編號 */
  beamId: number;
  /** 是否為主要連線（服務 UE 的連線） */
  isPrimary?: boolean;
  /** Beam 錐形的底部半徑（地面覆蓋範圍） */
  beamRadius?: number;
}

/**
 * 單個 Beam 連線（從衛星到 Cell）
 * 
 * 使用 lookAt 方法讓錐形自動指向 Cell
 */
export function SatelliteToCellBeam({
  satellitePosition,
  targetCell,
  beamId,
  isPrimary = false,
  beamRadius,
}: SatelliteToCellBeamProps) {
  // 論文 4-1 雙極化設計：波束顏色 = 波束的極化配置
  // Beam 1, 3, 5... → 極化 A (橙色)
  // Beam 2, 4, 6... → 極化 B (青色)
  const polarization = getBeamPolarization(beamId);
  const beamColor = POLARIZATION_COLORS[polarization];
  const groupRef = useRef<THREE.Group>(null);
  
  // 計算 beam 參數
  const beamParams = useMemo(() => {
    const cellPos = new THREE.Vector3(targetCell.position.x, 0, targetCell.position.z);
    const satPos = satellitePosition.clone();
    
    // 從衛星到 cell 的距離
    const distance = satPos.distanceTo(cellPos);
    
    // 計算方向向量（從 cell 指向衛星，這樣錐形尖端會在衛星端）
    const direction = satPos.clone().sub(cellPos).normalize();
    
    // 計算中點（錐形的位置）
    const midPoint = satPos.clone().add(cellPos).multiplyScalar(0.5);
    
    // 計算旋轉 - 讓錐形尖端指向衛星
    // ConeGeometry 預設沿 Y 軸，尖端朝上 (+Y)
    // 我們需要讓尖端指向 direction（從 cell 到衛星）
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    quaternion.setFromUnitVectors(up, direction);
    
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    
    return {
      distance,
      midPoint,
      rotation: euler,
      radius: beamRadius || targetCell.radius * 0.6,
    };
  }, [satellitePosition, targetCell, beamRadius]);
  
  return (
    <group ref={groupRef}>
      {/* Beam 錐形 - 從衛星指向 Cell */}
      <Cone
        args={[beamParams.radius, beamParams.distance, 8, 1, true]}
        position={[beamParams.midPoint.x, beamParams.midPoint.y, beamParams.midPoint.z]}
        rotation={[beamParams.rotation.x, beamParams.rotation.y, beamParams.rotation.z]}
      >
        <meshBasicMaterial
          color={beamColor}
          transparent
          opacity={isPrimary ? 0.35 : 0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </Cone>
      
      {/* Beam 中心線（從衛星到 Cell） */}
      <Line
        points={[
          [satellitePosition.x, satellitePosition.y, satellitePosition.z],
          [targetCell.position.x, 5, targetCell.position.z],
        ]}
        color={beamColor}
        lineWidth={isPrimary ? 4 : 2}
        transparent
        opacity={isPrimary ? 1.0 : 0.5}
        dashed={!isPrimary}
        dashSize={15}
        gapSize={10}
      />
      
      {/* 波束編號標籤（顯示在波束中段）- 使用 FRF3 顏色 */}
      <Text
        position={[
          beamParams.midPoint.x,
          beamParams.midPoint.y + 20,
          beamParams.midPoint.z,
        ]}
        fontSize={isPrimary ? 14 : 10}
        color={beamColor}
        anchorX="center"
        anchorY="middle"
        outlineWidth={isPrimary ? 2.5 : 1.5}
        outlineColor={isPrimary ? '#ffffff' : '#000000'}
      >
        {`B${beamId}${isPrimary ? ' ★' : ''}`}
      </Text>
    </group>
  );
}

/**
 * 波束分配資訊
 */
export interface BeamAssignment {
  beamId: number;
  cellId: number;
  isActive: boolean;
}

/**
 * 衛星的所有 Beam（指向多個 Cells）
 */
interface SatelliteBeamsProps {
  /** 衛星 ID */
  satelliteId: string;
  /** 衛星位置 */
  satellitePosition: THREE.Vector3;
  /** 所有 Earth-Fixed Cells */
  cells: EarthFixedCell[];
  /** 波束分配列表（包含波束編號） */
  beamAssignments: BeamAssignment[];
  /** 主要連線的 Cell ID（服務 UE） */
  primaryCellId?: number;
}

export function SatelliteBeams({
  satelliteId,
  satellitePosition,
  cells,
  beamAssignments,
  primaryCellId,
}: SatelliteBeamsProps) {
  // 建立 cellId -> cell 的映射
  const cellMap = useMemo(() => {
    const map = new Map<number, EarthFixedCell>();
    cells.forEach(cell => map.set(cell.id, cell));
    return map;
  }, [cells]);
  
  // 只顯示激活的波束
  const activeBeams = beamAssignments.filter(b => b.isActive);
  
  return (
    <group>
      {activeBeams.map(beam => {
        const cell = cellMap.get(beam.cellId);
        if (!cell) return null;
        
        return (
          <SatelliteToCellBeam
            key={`${satelliteId}-beam-${beam.beamId}`}
            satellitePosition={satellitePosition}
            targetCell={cell}
            beamId={beam.beamId}
            isPrimary={cell.id === primaryCellId}
          />
        );
      })}
    </group>
  );
}

/**
 * 根據衛星位置計算可見的 Cells（基於仰角）
 */
export function getVisibleCells(
  satellitePosition: THREE.Vector3,
  cells: EarthFixedCell[],
  minElevationAngle: number = 35 // 度
): EarthFixedCell[] {
  const minElevationRad = (minElevationAngle * Math.PI) / 180;
  
  return cells.filter(cell => {
    const dx = cell.position.x - satellitePosition.x;
    const dz = cell.position.z - satellitePosition.z;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
    const elevationAngle = Math.atan2(satellitePosition.y, horizontalDist);
    
    return elevationAngle >= minElevationRad;
  });
}

/**
 * 簡單的 Beam Hopping 調度：選擇要服務的 Cells
 * 
 * 根據 Paper 4-1 的 FRF3 Conflict Graph：
 * - 同頻率組的「相鄰」cells 不能同時服務（會干擾）
 * - 同頻率組但空間距離足夠的 cells 可以同時服務
 * 
 * 這裡簡化為：優先選擇離衛星正下方最近的連續 cells
 */
export function selectServingCells(
  visibleCells: EarthFixedCell[],
  maxBeams: number = 4,
  satellitePosition?: THREE.Vector3
): number[] {
  if (visibleCells.length === 0) return [];
  
  // 如果有衛星位置，按距離衛星正下方的距離排序（選擇最近的連續區域）
  if (satellitePosition) {
    const satGroundPos = new THREE.Vector2(satellitePosition.x, satellitePosition.z);
    
    const sortedCells = [...visibleCells].sort((a, b) => {
      const distA = satGroundPos.distanceTo(new THREE.Vector2(a.position.x, a.position.z));
      const distB = satGroundPos.distanceTo(new THREE.Vector2(b.position.x, b.position.z));
      return distA - distB;
    });
    
    // 選擇最近的 maxBeams 個 cells（形成連續覆蓋區域）
    return sortedCells.slice(0, maxBeams).map(cell => cell.id);
  }
  
  // 沒有衛星位置時，按 data queue 排序（優先服務高需求的 cells）
  const sortedCells = [...visibleCells].sort((a, b) => b.dataQueue - a.dataQueue);
  return sortedCells.slice(0, maxBeams).map(cell => cell.id);
}
