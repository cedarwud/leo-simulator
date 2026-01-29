import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Html } from '@react-three/drei';
import * as THREE from 'three';
import { NTPUScene } from '@/components/scene/NTPUScene';
import { UAV } from '@/components/scene/UAV';
import { BeamHoppingDemo } from './BeamHoppingDemo';

// Loading indicator
function Loader() {
  return (
    <Html center>
      <div style={{
        color: 'white',
        fontSize: '18px',
        background: 'rgba(0, 0, 0, 0.7)',
        padding: '16px 32px',
        borderRadius: '8px',
      }}>
        Loading Beam Hopping Scene...
      </div>
    </Html>
  );
}

// 場景內容
function SceneContent() {
  // UAV 位置（場景中心）
  const uavPosition = new THREE.Vector3(0, 10, 0);

  return (
    <>
      {/* NTPU 場景 */}
      <NTPUScene />

      {/* UAV (作為 UE) */}
      <UAV position={[uavPosition.x, uavPosition.y, uavPosition.z]} scale={10} />

      {/* Beam Hopping 展示 */}
      <BeamHoppingDemo uavPosition={uavPosition} />
    </>
  );
}

export interface BeamHoppingSceneProps {
  onStateChange?: (state: {
    currentSlotIndex: number;
    isRunning: boolean;
    progress: number;
    activeBeams: number[];
  }) => void;
}

export function BeamHoppingScene({ onStateChange }: BeamHoppingSceneProps) {
  return (
    <Canvas
      shadows
      gl={{
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      }}
      style={{ background: 'transparent' }}
    >
      {/* 相機設置 - 適合觀看 beam hopping */}
      <PerspectiveCamera
        makeDefault
        position={[400, 400, 600]}
        fov={60}
        near={1}
        far={5000}
      />

      <OrbitControls
        target={[0, 100, 0]}
        enableDamping
        dampingFactor={0.05}
        zoomSpeed={0.5}
        minDistance={200}
        maxDistance={1500}
        maxPolarAngle={Math.PI / 2.1}
      />

      {/* 燈光 */}
      <hemisphereLight args={[0xffffff, 0x444444, 1.0]} />
      <ambientLight intensity={0.3} />
      <directionalLight
        castShadow
        position={[100, 500, 100]}
        intensity={1.5}
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-near={1}
        shadow-camera-far={1500}
        shadow-camera-top={500}
        shadow-camera-bottom={-500}
        shadow-camera-left={500}
        shadow-camera-right={-500}
      />

      <Suspense fallback={<Loader />}>
        <SceneContent />
      </Suspense>
    </Canvas>
  );
}
