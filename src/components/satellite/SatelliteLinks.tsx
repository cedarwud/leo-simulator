import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

interface SatelliteLinkProps {
  /**
   * 衛星位置集合：Map<satelliteId, position>
   */
  visibleSatellites: Map<string, THREE.Vector3>;

  /**
   * UAV 位置
   */
  uavPosition: THREE.Vector3;

  /**
   * 當前連接的衛星 ID（主連線）
   */
  activeSatelliteId: string | null;

  /**
   * 換手目標衛星 ID（換手線條）
   */
  handoverTargetId: string | null;
}

/**
 * 衛星連線組件
 *
 * 功能：
 * 1. UAV 到當前衛星的主連線（綠色實線）
 * 2. UAV 到換手目標的換手線條（黃色虛線）
 */
export function SatelliteLinks({
  visibleSatellites,
  uavPosition,
  activeSatelliteId,
  handoverTargetId
}: SatelliteLinkProps) {

  // 計算主連線點
  const activeLinkPoints = useMemo(() => {
    if (!activeSatelliteId) return null;

    const satellitePos = visibleSatellites.get(activeSatelliteId);
    if (!satellitePos) return null;

    return [
      [uavPosition.x, uavPosition.y, uavPosition.z],
      [satellitePos.x, satellitePos.y, satellitePos.z]
    ];
  }, [activeSatelliteId, visibleSatellites, uavPosition]);

  // 計算換手線條點
  const handoverLinkPoints = useMemo(() => {
    if (!handoverTargetId) return null;

    const satellitePos = visibleSatellites.get(handoverTargetId);
    if (!satellitePos) return null;

    return [
      [uavPosition.x, uavPosition.y, uavPosition.z],
      [satellitePos.x, satellitePos.y, satellitePos.z]
    ];
  }, [handoverTargetId, visibleSatellites, uavPosition]);

  return (
    <>
      {/* 主連線：UAV → 當前衛星（綠色實線）*/}
      {activeLinkPoints && (
        <Line
          points={activeLinkPoints}
          color="#00ff88"           // 青綠色（與 ntn-stack satellite link 一致）
          lineWidth={3}             // 較粗的線條
          transparent
          opacity={0.9}
        />
      )}

      {/* 換手連線：UAV → 換手目標（黃色虛線）*/}
      {handoverLinkPoints && (
        <Line
          points={handoverLinkPoints}
          color="#ffaa00"           // 橘黃色（警告色）
          lineWidth={2}             // 較細的線條
          dashed                    // 虛線表示換手中
          dashSize={10}             // 虛線段長度
          gapSize={5}               // 虛線間隔
          transparent
          opacity={0.7}
        />
      )}
    </>
  );
}
