# SDD 07: 實作波束動畫效果

## 任務說明

將調度器整合到 3D 場景，實現波束跳躍動畫效果。

## 前置條件

- 完成 `06-BEAM-SCHEDULER.md`
- 調度器和 Hook 已實作

## 執行步驟

### Step 1: 重構 BeamHoppingScene

完整更新 `src/features/beam-hopping/components/BeamHoppingScene.tsx`：

```tsx
import React, { Suspense, useRef, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  BeamHoppingState,
  DEFAULT_BEAM_CONFIG,
  DEFAULT_SCHEDULE,
} from '../types';
import { generate7BeamLayout } from '../utils';
import { useBeamScheduler } from '../hooks';
import { BeamCones } from './BeamCone';
import { GroundCells } from './GroundCells';
import { ActiveBeamConnection } from './BeamConnection';

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

// 地面
function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[800, 800]} />
      <meshStandardMaterial color="#1a1a2e" transparent opacity={0.8} />
    </mesh>
  );
}

// 網格
function GridHelper() {
  return <gridHelper args={[600, 30, '#333355', '#222244']} position={[0, 0.1, 0]} />;
}

// 衛星
function Satellite({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[20, 8, 20]} />
        <meshStandardMaterial color="#888899" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[-30, 0, 0]}>
        <boxGeometry args={[40, 2, 15]} />
        <meshStandardMaterial color="#2244aa" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[30, 0, 0]}>
        <boxGeometry args={[40, 2, 15]} />
        <meshStandardMaterial color="#2244aa" metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  );
}

// UE
function UserEquipment({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[3, 5, 10, 8]} />
        <meshStandardMaterial color="#00ff88" emissive="#00ff88" emissiveIntensity={0.3} />
      </mesh>
      <pointLight color="#00ff88" intensity={0.5} distance={50} />
    </group>
  );
}

// 內部場景組件 (使用 Hook)
function SceneContent({
  onStateChange,
}: {
  onStateChange?: (state: {
    currentSlotIndex: number;
    isRunning: boolean;
    progress: number;
    activeBeams: number[];
  }) => void;
}) {
  const initialBeams = generate7BeamLayout(DEFAULT_BEAM_CONFIG);

  const {
    beams,
    currentSlotIndex,
    progress,
    isRunning,
    start,
    pause,
    toggle,
    reset,
    nextSlot,
    prevSlot,
    setSpeed,
  } = useBeamScheduler(initialBeams, {
    schedule: DEFAULT_SCHEDULE,
    autoStart: true,
    speedMultiplier: 1,
  });

  // 回調狀態更新
  React.useEffect(() => {
    if (onStateChange) {
      onStateChange({
        currentSlotIndex,
        isRunning,
        progress,
        activeBeams: beams.filter(b => b.isActive).map(b => b.id),
      });
    }
  }, [currentSlotIndex, isRunning, progress, beams, onStateChange]);

  const satellitePosition: [number, number, number] = [0, DEFAULT_BEAM_CONFIG.coneHeight, 0];
  const uePosition: [number, number, number] = [0, 5, 0];

  return (
    <>
      <Ground />
      <GridHelper />
      <Satellite position={satellitePosition} />
      <UserEquipment position={uePosition} />

      <BeamCones beams={beams} satelliteHeight={DEFAULT_BEAM_CONFIG.coneHeight} />
      <GroundCells beams={beams} showLabels={true} />
      <ActiveBeamConnection
        beams={beams}
        userBeamId={0}
        uePosition={uePosition}
        satelliteHeight={DEFAULT_BEAM_CONFIG.coneHeight}
      />
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
        toneMappingExposure: 1.0,
        alpha: true,
        antialias: true,
      }}
      style={{ background: 'transparent' }}
    >
      <PerspectiveCamera
        makeDefault
        position={[300, 250, 300]}
        fov={60}
        near={1}
        far={2000}
      />

      <OrbitControls
        target={[0, 100, 0]}
        enableDamping
        dampingFactor={0.05}
        minDistance={100}
        maxDistance={800}
        maxPolarAngle={Math.PI / 2.1}
      />

      <ambientLight intensity={0.3} />
      <hemisphereLight args={['#b1e1ff', '#444466', 0.6]} />
      <directionalLight
        position={[100, 300, 100]}
        intensity={1}
        castShadow
      />

      <Suspense fallback={<Loader />}>
        <SceneContent onStateChange={onStateChange} />
      </Suspense>
    </Canvas>
  );
}
```

### Step 2: 創建 hooks 目錄

```bash
mkdir -p src/features/beam-hopping/hooks
```

### Step 3: 驗證

```bash
npm run typecheck
npm run dev
```

訪問 `/beam-hopping` 確認：
- 波束自動在時隙間切換
- 活躍波束亮度變化明顯
- 動畫流暢無卡頓
- 約每 2 秒切換一次時隙

## 驗收標準

- [ ] 波束自動切換動畫正常
- [ ] 透明度過渡平滑
- [ ] 時隙切換間隔正確
- [ ] 狀態回調正常工作
- [ ] TypeScript 編譯通過

## 下一步

完成後繼續 `08-SIDEBAR-CONTROLS.md`
