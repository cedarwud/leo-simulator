import React, { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Html } from '@react-three/drei';
import { NTPUScene } from './NTPUScene';
import { UAV } from './UAV';
import { Satellites } from '../satellite/Satellites';
import { ConstellationType } from '../controls/ConstellationSelector';
import { Sidebar } from '../ui/Sidebar';
import { HandoverMethodType, HandoverStats } from '@/types/handover-method';
import { NTPU_CONFIG } from '@/config/ntpu.config';
import Starfield from '../ui/Starfield';
import * as THREE from 'three';

// 3D 場景中的載入提示
function Loader() {
  return (
    <Html center>
      <div style={{
        color: 'white',
        fontSize: '20px',
        background: 'rgba(0, 0, 0, 0.7)',
        padding: '20px 40px',
        borderRadius: '8px',
      }}>
        Loading NTPU Scene...
      </div>
    </Html>
  );
}

export function MainScene() {
  const [showDebug] = useState(false); // 設為 true 可顯示調試網格
  const [constellation, setConstellation] = useState<ConstellationType>('starlink');
  const [handoverMethod, setHandoverMethod] = useState<HandoverMethodType>('geometric');
  const [handoverStats, setHandoverStats] = useState<HandoverStats>({
    totalHandovers: 0,
    pingPongEvents: 0,
    averageRSRP: -95,
    averageRSRQ: -12,
    averageSINR: 10,
    connectionDuration: 0,
    serviceInterruptions: 0,
    elapsedTime: 0
  });
  const [currentSatelliteId, setCurrentSatelliteId] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string>('stable');

  // 統計更新回調
  const handleStatsUpdate = (stats: HandoverStats, satelliteId: string | null, phase: string) => {
    setHandoverStats(stats);
    setCurrentSatelliteId(satelliteId);
    setCurrentPhase(phase);
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: 'radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%)',
        overflow: 'hidden',
      }}
    >
      <Starfield starCount={180} />

      {/* 統一控制側邊欄 */}
      <Sidebar
        currentConstellation={constellation}
        onConstellationChange={setConstellation}
        currentMethod={handoverMethod}
        onMethodChange={setHandoverMethod}
        stats={handoverStats}
        currentSatelliteId={currentSatelliteId}
        currentPhase={currentPhase}
      />

      <Canvas
        shadows
        gl={{
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
          alpha: true,
          preserveDrawingBuffer: false,
          powerPreference: 'high-performance',
          antialias: true,
        }}
      >
        {/* 相機 */}
        <PerspectiveCamera
          makeDefault
          position={NTPU_CONFIG.camera.initialPosition.toArray()}
          fov={NTPU_CONFIG.camera.fov}
          near={NTPU_CONFIG.camera.near}
          far={NTPU_CONFIG.camera.far}
        />

        {/* 軌道控制 */}
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={10}
          maxDistance={2000}
          maxPolarAngle={Math.PI / 2}
        />

        {/* 燈光 - 主光源位於正上方中央 */}
        <hemisphereLight args={[0xffffff, 0x444444, 1.0]} />
        <ambientLight intensity={0.2} />
        <directionalLight
          castShadow
          position={[0, 50, 0]}
          intensity={1.5}
          shadow-mapSize-width={4096}
          shadow-mapSize-height={4096}
          shadow-camera-near={1}
          shadow-camera-far={1000}
          shadow-camera-top={500}
          shadow-camera-bottom={-500}
          shadow-camera-left={500}
          shadow-camera-right={-500}
          shadow-bias={-0.0004}
          shadow-radius={8}
        />

        {/* 場景模型 */}
        <Suspense fallback={<Loader />}>
          <NTPUScene />
        </Suspense>

        {/* UAV 模型 */}
        <Suspense fallback={null}>
          <UAV position={[0, 10, 0]} scale={10} />
        </Suspense>

        {/* 衛星系統 */}
        <Suspense fallback={null}>
          <Satellites
            dataUrl={`/data/satellite-timeseries-${constellation}.json`}
            timeSpeed={3.0}
            handoverMethod={handoverMethod}
            onStatsUpdate={handleStatsUpdate}
            key={`${constellation}-${handoverMethod}`} // 強制重新載入當星座或換手方法改變時
          />
        </Suspense>

        {/* 網格輔助線（僅調試時顯示） */}
        {showDebug && (
          <>
            <gridHelper args={[1000, 50, '#888888', '#444444']} />
            <axesHelper args={[100]} />
          </>
        )}
      </Canvas>
    </div>
  );
}
