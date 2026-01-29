import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

interface WideBeamProps {
  /** 衛星位置 */
  satellitePosition: [number, number, number];
  /** 地面覆蓋半徑 */
  radius?: number;
  /** 顏色 */
  color?: string;
  /** 錐形透明度 */
  coneOpacity?: number;
  /** 地面圓透明度 */
  groundOpacity?: number;
}

/**
 * Wide Beam - 控制訊號寬波束
 *
 * 持續覆蓋整個服務區域，用於：
 * - 廣播系統資訊 (SIB)
 * - Paging（尋呼）
 * - Initial Access / RACH
 * - 控制平面訊號
 */
export function WideBeam({
  satellitePosition,
  radius = 280,
  color = '#ffffff',
  coneOpacity = 0.02,
  groundOpacity = 0.08,
}: WideBeamProps) {
  // 地面中心位置 (衛星正下方)
  const groundCenter = useMemo(() => ({
    x: satellitePosition[0],
    z: satellitePosition[2],
  }), [satellitePosition]);

  // 地面圓形邊界
  const groundBorderPoints = useMemo(() => {
    const segments = 96;
    const points: [number, number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push([
        groundCenter.x + Math.cos(angle) * radius,
        0.2,
        groundCenter.z + Math.sin(angle) * radius,
      ]);
    }
    return points;
  }, [radius, groundCenter.x, groundCenter.z]);

  // 錐形幾何
  const { coneGeometry, conePosition, coneRotation } = useMemo(() => {
    const satPos = new THREE.Vector3(...satellitePosition);
    const groundTarget = new THREE.Vector3(groundCenter.x, 0, groundCenter.z);
    const length = satPos.distanceTo(groundTarget);

    const geometry = new THREE.ConeGeometry(
      radius,
      length,
      64,
      1,
      true
    );

    const direction = new THREE.Vector3()
      .subVectors(groundTarget, satPos)
      .normalize();

    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);

    const midpoint = new THREE.Vector3()
      .addVectors(satPos, groundTarget)
      .multiplyScalar(0.5);

    return {
      coneGeometry: geometry,
      conePosition: [midpoint.x, midpoint.y, midpoint.z] as [number, number, number],
      coneRotation: [euler.x, euler.y, euler.z] as [number, number, number],
    };
  }, [satellitePosition, radius]);

  // 地面圓形幾何
  const groundGeometry = useMemo(() => {
    const geometry = new THREE.CircleGeometry(radius, 96);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, [radius]);

  return (
    <group>
      {/* 錐形波束（非常淡） */}
      <mesh
        geometry={coneGeometry}
        position={conePosition}
        rotation={coneRotation}
      >
        <meshBasicMaterial
          color={color}
          transparent
          opacity={coneOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 地面覆蓋區 */}
      <mesh geometry={groundGeometry} position={[groundCenter.x, 0.1, groundCenter.z]}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={groundOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 地面邊界（虛線） */}
      <Line
        points={groundBorderPoints}
        color={color}
        lineWidth={1}
        transparent
        opacity={0.3}
        dashed
        dashSize={12}
        gapSize={8}
      />
    </group>
  );
}
