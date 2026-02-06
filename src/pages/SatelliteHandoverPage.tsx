import React from 'react';
import { MainScene } from '../components/scene/MainScene';

/**
 * 衛星換手模擬頁面
 *
 * 包含 3D 衛星模擬場景，支援可切換的 Ground Cells 和 Beams 視覺化
 */
export function SatelliteHandoverPage() {
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <MainScene />
    </div>
  );
}
