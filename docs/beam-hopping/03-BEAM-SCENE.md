# SDD 03: 建立 3D 場景基礎

## 任務說明

建立 Beam Hopping 的 3D 場景基礎結構，包含相機、燈光和基本場景設定。

## 前置條件

- 完成 `02-FEATURE-STRUCTURE.md`
- 類型定義已建立

## 執行步驟

### Step 1: 建立 BeamHoppingScene.tsx

建立 `src/features/beam-hopping/components/BeamHoppingScene.tsx`：

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

// 地面網格
function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[800, 800, 32, 32]} />
      <meshStandardMaterial
        color="#1a1a2e"
        transparent
        opacity={0.8}
        wireframe={false}
      />
    </mesh>
  );
}

// 網格輔助線
function GridHelper() {
  return (
    <gridHelper
      args={[600, 30, '#333355', '#222244']}
      position={[0, 0.1, 0]}
    />
  );
}

// 衛星模型 (簡化版)
function Satellite({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* 衛星本體 */}
      <mesh>
        <boxGeometry args={[20, 8, 20]} />
        <meshStandardMaterial color="#888899" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* 太陽能板 */}
      <mesh position={[-30, 0, 0]}>
        <boxGeometry args={[40, 2, 15]} />
        <meshStandardMaterial color="#2244aa" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[30, 0, 0]}>
        <boxGeometry args={[40, 2, 15]} />
        <meshStandardMaterial color="#2244aa" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* 標籤 */}
      <Html position={[0, 20, 0]} center>
        <div style={{
          color: '#88ccff',
          fontSize: '12px',
          fontWeight: 'bold',
          textShadow: '0 0 4px black'
        }}>
          LEO Satellite
        </div>
      </Html>
    </group>
  );
}

// UE (用戶設備)
function UserEquipment({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[3, 5, 10, 8]} />
        <meshStandardMaterial color="#00ff88" emissive="#00ff88" emissiveIntensity={0.3} />
      </mesh>
      {/* 發光效果 */}
      <pointLight color="#00ff88" intensity={0.5} distance={50} />
      {/* 標籤 */}
      <Html position={[0, 15, 0]} center>
        <div style={{
          color: '#00ff88',
          fontSize: '11px',
          fontWeight: 'bold',
          textShadow: '0 0 4px black'
        }}>
          UE
        </div>
      </Html>
    </group>
  );
}

interface BeamHoppingSceneProps {
  /** 狀態更新回調 */
  onStateChange?: (state: BeamHoppingState) => void;
}

export function BeamHoppingScene({ onStateChange }: BeamHoppingSceneProps) {
  const controlsRef = useRef<any>(null);

  // 初始化狀態
  const [state, setState] = useState<BeamHoppingState>(() => ({
    currentSlotIndex: 0,
    beams: generate7BeamLayout(DEFAULT_BEAM_CONFIG),
    schedule: DEFAULT_SCHEDULE,
    userBeamId: 0,
    isRunning: false,
    speedMultiplier: 1,
  }));

  // 衛星位置 (場景頂部)
  const satellitePosition: [number, number, number] = [0, DEFAULT_BEAM_CONFIG.coneHeight, 0];

  // UE 位置 (中心波束)
  const uePosition: [number, number, number] = [0, 5, 0];

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
      {/* 相機 */}
      <PerspectiveCamera
        makeDefault
        position={[300, 250, 300]}
        fov={60}
        near={1}
        far={2000}
      />

      {/* 軌道控制 */}
      <OrbitControls
        ref={controlsRef}
        target={[0, 100, 0]}
        enableDamping
        dampingFactor={0.05}
        minDistance={100}
        maxDistance={800}
        maxPolarAngle={Math.PI / 2.1}
      />

      {/* 燈光 */}
      <ambientLight intensity={0.3} />
      <hemisphereLight args={['#b1e1ff', '#444466', 0.6]} />
      <directionalLight
        position={[100, 300, 100]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />

      {/* 場景內容 */}
      <Suspense fallback={<Loader />}>
        {/* 地面 */}
        <Ground />
        <GridHelper />

        {/* 衛星 */}
        <Satellite position={satellitePosition} />

        {/* UE */}
        <UserEquipment position={uePosition} />

        {/* 波束錐形將在後續步驟添加 */}
        {/* <BeamCones beams={state.beams} satelliteHeight={DEFAULT_BEAM_CONFIG.coneHeight} /> */}

        {/* 地面覆蓋區將在後續步驟添加 */}
        {/* <GroundCells beams={state.beams} /> */}
      </Suspense>
    </Canvas>
  );
}
```

### Step 2: 建立組件導出入口

建立 `src/features/beam-hopping/components/index.ts`：

```typescript
export { BeamHoppingScene } from './BeamHoppingScene';
```

### Step 3: 更新功能模組主入口

更新 `src/features/beam-hopping/index.ts`：

```typescript
// Types
export * from './types';

// Utils
export * from './utils';

// Components
export * from './components';
```

### Step 4: 更新 BeamHoppingPage

更新 `src/pages/BeamHoppingPage.tsx` 使用新場景：

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { Starfield } from '../shared/components';
import { BeamHoppingScene } from '../features/beam-hopping';

/**
 * Beam Hopping 模擬頁面
 */
export function BeamHoppingPage() {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      background: 'radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%)',
      overflow: 'hidden'
    }}>
      {/* 背景星空 */}
      <Starfield starCount={180} />

      {/* 返回首頁按鈕 */}
      <Link
        to="/"
        style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 20px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '8px',
          color: 'rgba(255, 255, 255, 0.8)',
          textDecoration: 'none',
          fontSize: '14px',
          fontWeight: '500',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(0, 136, 255, 0.3)';
          e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.5)';
          e.currentTarget.style.color = '#ffffff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
        }}
      >
        <Home size={16} />
        <span>Back to Home</span>
      </Link>

      {/* 3D 場景 */}
      <div style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1
      }}>
        <BeamHoppingScene />
      </div>
    </div>
  );
}
```

### Step 5: 驗證

```bash
npm run typecheck
npm run dev
```

訪問 `/beam-hopping` 確認：
- 3D 場景正確渲染
- 可以用滑鼠旋轉視角
- 衛星模型顯示在頂部
- UE 顯示在地面中心
- 地面網格正確顯示

## 驗收標準

- [ ] BeamHoppingScene 組件建立成功
- [ ] 3D 場景正確渲染
- [ ] 相機和軌道控制正常
- [ ] 衛星和 UE 模型顯示正確
- [ ] TypeScript 編譯通過

## 下一步

完成後繼續 `04-BEAM-CONE.md`
