import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { Beam } from '../types';

interface GroundCellProps {
  beam: Beam;
  showLabel?: boolean;
}

/**
 * 單個地面覆蓋區
 *
 * Active: 明亮填充 + 粗邊框
 * Inactive: 淡色填充 + 細邊框（清晰可見）
 */
export function GroundCell({
  beam,
  showLabel = true,
}: GroundCellProps) {
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Active 更亮，Inactive 較暗（Additive blending 會讓重疊區域更亮）
  const targetOpacity = beam.isActive ? 0.6 : 0.3;

  useFrame((_, delta) => {
    if (materialRef.current) {
      const current = materialRef.current.opacity;
      const diff = targetOpacity - current;
      materialRef.current.opacity += diff * Math.min(delta * 8, 1);
    }
  });

  const circleGeometry = useMemo(() => {
    const geometry = new THREE.CircleGeometry(beam.radius, 64);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, [beam.radius]);

  const borderPoints = useMemo(() => {
    const segments = 64;
    const points: [number, number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push([
        Math.cos(angle) * beam.radius,
        0,
        Math.sin(angle) * beam.radius,
      ]);
    }
    return points;
  }, [beam.radius]);

  return (
    <group position={[beam.position.x, 2, beam.position.z]}>
      {/* 填充區域 - 使用 Additive Blending 實現重疊混色效果 */}
      <mesh geometry={circleGeometry}>
        <meshBasicMaterial
          ref={materialRef}
          color={beam.color}
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>

      {/* 邊框: Active 實線, Inactive 虛線 */}
      <Line
        points={borderPoints}
        color={beam.color}
        lineWidth={beam.isActive ? 2.5 : 1.5}
        transparent
        opacity={beam.isActive ? 1 : 0.7}
        dashed={!beam.isActive}
        dashSize={8}
        gapSize={6}
        depthWrite={false}
      />

      {/* 標籤 */}
      {showLabel && (
        <Text
          position={[0, 5, 0]}
          fontSize={12}
          color={beam.isActive ? '#ffffff' : '#aaaaaa'}
          anchorX="center"
          anchorY="middle"
        >
          {`B${beam.id}`}
        </Text>
      )}
    </group>
  );
}

interface GroundCellsProps {
  beams: Beam[];
  showLabels?: boolean;
}

export function GroundCells({ beams, showLabels = true }: GroundCellsProps) {
  return (
    <group>
      {beams.map((beam) => (
        <GroundCell
          key={beam.id}
          beam={beam}
          showLabel={showLabels}
        />
      ))}
    </group>
  );
}
