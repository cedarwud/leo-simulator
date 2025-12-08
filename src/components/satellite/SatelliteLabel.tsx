import React, { forwardRef } from 'react';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';

interface SatelliteLabelProps {
  satelliteId: string;
  constellation?: string;
  isCurrentSatellite?: boolean;
  isTargetSatellite?: boolean;
}

/**
 * 衛星標籤組件
 * 顯示星座名稱和衛星編號
 */
export const SatelliteLabel = React.memo(forwardRef<THREE.Group, SatelliteLabelProps>(({
  satelliteId,
  constellation = 'unknown',
  isCurrentSatellite = false,
  isTargetSatellite = false
}, ref) => {
  // 根據衛星狀態設置顏色
  let color = '#aaaaaa'; // 普通衛星：灰色
  if (isCurrentSatellite) {
    color = '#00ff88'; // 當前衛星：綠色
  } else if (isTargetSatellite) {
    color = '#0088ff'; // 目標衛星：藍色
  }

  // Format display text: STARLINK-45061
  const constellationName = constellation.toUpperCase();
  const satelliteNumber = satelliteId.replace(/^sat-/, '');
  const displayText = `${constellationName}-${satelliteNumber}`;

  // OneWeb 衛星更大，字體也相應調整
  const fontSize = constellation.toLowerCase() === 'oneweb' ? 24 : 12;

  return (
    <Billboard
      ref={ref}
      follow={true}
      lockX={false}
      lockY={false}
      lockZ={false}
    >
      <Text
        fontSize={fontSize}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={constellation.toLowerCase() === 'oneweb' ? 2 : 0.5}
        outlineColor="#000000"
      >
        {displayText}
      </Text>
    </Billboard>
  );
}));
