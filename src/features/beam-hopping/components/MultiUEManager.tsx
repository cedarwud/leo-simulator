/**
 * Multi-UE Manager
 * 
 * 管理多個 UE 的位置和狀態追蹤
 */

import React, { useMemo, useRef } from 'react';
import { Text, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
// @ts-ignore - SkeletonUtils has no TypeScript definitions
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

// 預載 UAV 模型
const UAV_MODEL_PATH = '/models/uav.glb';
useGLTF.preload(UAV_MODEL_PATH);

/**
 * UE 定義
 */
export interface UEConfig {
  id: string;
  name: string;
  /** 所在 Cell ID */
  cellId: number;
  /** 顏色標識 */
  color: string;
  /** 位置（將根據 cellId 自動計算） */
  position?: THREE.Vector3;
}

/**
 * UE 換手狀態
 */
export interface UEHandoverState {
  ueId: string;
  currentCellId: number;
  servingBeamId: number | null;
  servingSatelliteId: string | null;
  rsrp: number | null;
  lastHandoverTime: number | null;
  handoverCount: number;
}

/**
 * 預設的 UE 配置
 * 論文 4-1 場景：使用單一 UE 更易聚焦觀察 inter-satellite handover
 * 
 * 4x5 網格的 Cell ID 分佈：
 *   1  2  3  4  5
 *   6  7  8  9  10
 *  11 12 13 14 15
 *  16 17 18 19 20
 */
export const DEFAULT_UE_CONFIGS: UEConfig[] = [
  {
    id: 'ue-1',
    name: 'UE-1',
    cellId: 8,      // 中央位置，便於觀察多衛星覆蓋區域的換手
    color: '#00ffff', // 青色，醒目
  },
];

/**
 * 單個 UE 視覺化組件（使用 UAV 模型）
 */
interface UEMarkerProps {
  config: UEConfig;
  position: THREE.Vector3;
  isSelected?: boolean;
  showLabel?: boolean;
  state?: UEHandoverState;
}

function UEMarker({
  config,
  position,
  isSelected = false,
  showLabel = true,
  state,
}: UEMarkerProps) {
  const { scene } = useGLTF(UAV_MODEL_PATH);
  const groupRef = useRef<THREE.Group>(null);
  
  // Clone scene for each UE
  const clonedScene = useMemo(() => {
    const cloned = SkeletonUtils.clone(scene);
    
    cloned.traverse((obj: THREE.Object3D) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    
    return cloned;
  }, [scene]);
  
  const uavScale = isSelected ? 12 : 10;
  const labelOffset = 30;

  return (
    <group position={[position.x, position.y, position.z]}>
      {/* UAV 模型 */}
      <group ref={groupRef} scale={uavScale}>
        <primitive object={clonedScene} />
      </group>

      {/* 選中時的外環 */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -5, 0]}>
          <ringGeometry args={[15, 20, 32]} />
          <meshBasicMaterial
            color={config.color}
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* 名稱標籤 */}
      {showLabel && (
        <Text
          position={[0, labelOffset, 0]}
          fontSize={isSelected ? 14 : 11}
          color={config.color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={2}
          outlineColor="#000000"
        >
          {config.name}
        </Text>
      )}

      {/* 服務波束資訊（選中時顯示） */}
      {isSelected && state && state.servingBeamId !== null && (
        <Text
          position={[0, labelOffset + 16, 0]}
          fontSize={10}
          color="#aaffaa"
          anchorX="center"
          anchorY="middle"
          outlineWidth={1}
          outlineColor="#000000"
        >
          {`B${state.servingBeamId} | ${state.rsrp?.toFixed(0) ?? '--'} dBm`}
        </Text>
      )}
    </group>
  );
}

/**
 * 多 UE 管理組件 Props
 */
interface MultiUEManagerProps {
  /** UE 配置列表 */
  ueConfigs?: UEConfig[];
  /** 根據 Cell ID 獲取位置的函數 */
  getCellPosition: (cellId: number) => { x: number; z: number } | null;
  /** UE 高度 */
  ueHeight?: number;
  /** 當前選中的 UE ID */
  selectedUEId?: string;
  /** UE 狀態（換手追蹤） */
  ueStates?: Map<string, UEHandoverState>;
  /** 是否顯示所有標籤 */
  showAllLabels?: boolean;
}

/**
 * 多 UE 管理組件
 * 
 * 在地面上顯示多個 UE 標記
 */
export function MultiUEManager({
  ueConfigs = DEFAULT_UE_CONFIGS,
  getCellPosition,
  ueHeight = 15,
  selectedUEId,
  ueStates,
  showAllLabels = true,
}: MultiUEManagerProps) {
  // 計算每個 UE 的位置
  const uePositions = useMemo(() => {
    const positions = new Map<string, THREE.Vector3>();

    for (const ue of ueConfigs) {
      const cellPos = getCellPosition(ue.cellId);
      if (cellPos) {
        positions.set(
          ue.id,
          new THREE.Vector3(cellPos.x, ueHeight, cellPos.z)
        );
      }
    }

    return positions;
  }, [ueConfigs, getCellPosition, ueHeight]);

  return (
    <group name="multi-ue-manager">
      {ueConfigs.map((ue) => {
        const position = uePositions.get(ue.id);
        if (!position) return null;

        const isSelected = selectedUEId === ue.id;
        const state = ueStates?.get(ue.id);

        return (
          <UEMarker
            key={ue.id}
            config={ue}
            position={position}
            isSelected={isSelected}
            showLabel={showAllLabels || isSelected}
            state={state}
          />
        );
      })}
    </group>
  );
}

/**
 * 獲取 UE 位置的輔助函數
 */
export function getUEPositions(
  ueConfigs: UEConfig[],
  getCellPosition: (cellId: number) => { x: number; z: number } | null,
  ueHeight: number = 15
): Map<string, THREE.Vector3> {
  const positions = new Map<string, THREE.Vector3>();

  for (const ue of ueConfigs) {
    const cellPos = getCellPosition(ue.cellId);
    if (cellPos) {
      positions.set(
        ue.id,
        new THREE.Vector3(cellPos.x, ueHeight, cellPos.z)
      );
    }
  }

  return positions;
}
