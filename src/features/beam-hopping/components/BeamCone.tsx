import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Beam, DEFAULT_BEAM_CONFIG } from '../types';

interface BeamConeProps {
  beam: Beam;
  satelliteHeight: number;
  /** 衛星位置 (所有波束共同的發射源) */
  satellitePosition?: [number, number, number];
  /** 活躍時的透明度 */
  activeOpacity?: number;
  /** 非活躍時的透明度 */
  inactiveOpacity?: number;
}

/**
 * 單個波束錐形
 *
 * 所有波束都從同一個衛星位置發出，斜向指向各自的地面覆蓋區
 */
export function BeamCone({
  beam,
  satelliteHeight,
  satellitePosition = [0, satelliteHeight, 0],
  activeOpacity = 0.12,
  inactiveOpacity = 0.03,
}: BeamConeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  const targetOpacity = beam.isActive ? activeOpacity : inactiveOpacity;

  // 平滑透明度過渡
  useFrame((_, delta) => {
    if (materialRef.current) {
      const current = materialRef.current.opacity;
      const diff = targetOpacity - current;
      materialRef.current.opacity += diff * Math.min(delta * 5, 1);
    }
  });

  // 計算波束方向和長度
  const { coneLength, rotation } = useMemo(() => {
    // 衛星位置
    const satPos = new THREE.Vector3(...satellitePosition);
    // 地面目標位置
    const groundTarget = new THREE.Vector3(beam.position.x, 0, beam.position.z);

    // 計算波束長度 (衛星到地面的距離)
    const length = satPos.distanceTo(groundTarget);

    // 計算方向向量 (從衛星指向地面)
    const direction = new THREE.Vector3()
      .subVectors(groundTarget, satPos)
      .normalize();

    // 計算旋轉: ConeGeometry 預設尖端朝 +Y
    // 我們需要讓尖端指向衛星方向 (即 -direction)
    // 所以底部指向地面 (即 +direction)
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);

    // 旋轉使 -Y 軸對齊 direction (底部朝向地面)
    quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction);

    // 轉換為 Euler 角度
    const euler = new THREE.Euler().setFromQuaternion(quaternion);

    return {
      coneLength: length,
      rotation: [euler.x, euler.y, euler.z] as [number, number, number],
    };
  }, [beam.position.x, beam.position.z, satellitePosition]);

  // 錐形幾何
  const coneGeometry = useMemo(() => {
    return new THREE.ConeGeometry(
      DEFAULT_BEAM_CONFIG.coneRadiusBottom,  // 底部半徑 (地面覆蓋)
      coneLength,                             // 波束長度
      32,                                     // 分段數
      1,                                      // 高度分段
      true                                    // 開放底部
    );
  }, [coneLength]);

  // 錐形中心位置 (衛星和地面目標的中點)
  const position: [number, number, number] = useMemo(() => {
    const groundTarget = new THREE.Vector3(beam.position.x, 0, beam.position.z);
    const satPos = new THREE.Vector3(...satellitePosition);
    const midpoint = new THREE.Vector3().addVectors(satPos, groundTarget).multiplyScalar(0.5);
    return [midpoint.x, midpoint.y, midpoint.z];
  }, [beam.position.x, beam.position.z, satellitePosition]);

  return (
    <group ref={groupRef}>
      <mesh
        geometry={coneGeometry}
        position={position}
        rotation={rotation}
      >
        <meshStandardMaterial
          ref={materialRef}
          color={beam.color}
          transparent
          opacity={inactiveOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
          emissive={beam.color}
          emissiveIntensity={beam.isActive ? 0.08 : 0.02}
        />
      </mesh>
    </group>
  );
}

interface BeamConesProps {
  beams: Beam[];
  satelliteHeight: number;
  /** 衛星位置 */
  satellitePosition?: [number, number, number];
}

/**
 * 所有波束錐形的容器
 */
export function BeamCones({
  beams,
  satelliteHeight,
  satellitePosition = [0, satelliteHeight, 0],
}: BeamConesProps) {
  return (
    <group>
      {beams.map((beam) => (
        <BeamCone
          key={beam.id}
          beam={beam}
          satelliteHeight={satelliteHeight}
          satellitePosition={satellitePosition}
        />
      ))}
    </group>
  );
}
