import React from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

interface SatelliteLabelProps {
  position: THREE.Vector3;
  satelliteId: string;
  constellation?: string;
  isCurrentSatellite?: boolean;
  isTargetSatellite?: boolean;
}

/**
 * 衛星標籤組件
 * 顯示星座名稱和衛星編號
 */
export function SatelliteLabel({
  position,
  satelliteId,
  constellation = 'unknown',
  isCurrentSatellite = false,
  isTargetSatellite = false
}: SatelliteLabelProps) {
  // 標籤位置：衛星正上方偏移（OneWeb 衛星更大，需要更高的偏移）
  const labelOffset = constellation.toLowerCase() === 'oneweb' ? 75 : 25;
  const labelPosition = new THREE.Vector3(
    position.x,
    position.y + labelOffset,
    position.z
  );

  // 根據衛星狀態設置顏色
  let color = '#aaaaaa'; // 普通衛星：灰色
  if (isCurrentSatellite) {
    color = '#00ff88'; // 當前衛星：綠色
  } else if (isTargetSatellite) {
    color = '#0088ff'; // 目標衛星：藍色
  }

  // 格式化顯示文字：STARLINK-45061
  const constellationName = constellation.toUpperCase();
  const displayText = `${constellationName}-${satelliteId}`;

  // OneWeb 衛星更大，字體也相應調整
  const fontSize = constellation.toLowerCase() === 'oneweb' ? 24 : 8;

  return (
    <Text
      position={labelPosition}
      fontSize={fontSize}
      color={color}
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.5}
      outlineColor="#000000"
    >
      {displayText}
    </Text>
  );
}
