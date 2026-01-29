import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { Beam } from '../types';

interface BeamConnectionProps {
  beam: Beam;
  uePosition: [number, number, number];
  satelliteHeight: number;
  /** 是否顯示連線 */
  visible?: boolean;
}

/**
 * UE 到波束中心的連線
 */
export function BeamConnection({
  beam,
  uePosition,
  satelliteHeight,
  visible = true,
}: BeamConnectionProps) {
  const points = useMemo(() => {
    if (!visible || !beam.isActive) return [];

    // 從 UE 到衛星位置（通過波束中心）
    return [
      uePosition,
      [beam.position.x, satelliteHeight, beam.position.z] as [number, number, number],
    ];
  }, [beam, uePosition, satelliteHeight, visible]);

  if (points.length === 0) return null;

  return (
    <Line
      points={points}
      color={beam.color}
      lineWidth={3}
      transparent
      opacity={0.8}
      dashed
      dashSize={10}
      gapSize={5}
    />
  );
}

interface ActiveBeamConnectionsProps {
  beams: Beam[];
  userBeamId: number;
  uePosition: [number, number, number];
  satelliteHeight: number;
}

/**
 * 顯示 UE 當前連接的波束連線
 */
export function ActiveBeamConnection({
  beams,
  userBeamId,
  uePosition,
  satelliteHeight,
}: ActiveBeamConnectionsProps) {
  const userBeam = beams.find(b => b.id === userBeamId);

  if (!userBeam) return null;

  return (
    <BeamConnection
      beam={{ ...userBeam, isActive: true }}
      uePosition={uePosition}
      satelliteHeight={satelliteHeight}
    />
  );
}
