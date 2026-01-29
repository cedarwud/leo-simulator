# SDD 04: 實作波束錐形組件

## 任務說明

實作波束錐形（Beam Cone）3D 組件，從衛星延伸到地面。

## 前置條件

- 完成 `03-BEAM-SCENE.md`
- 3D 場景基礎已建立

## 執行步驟

### Step 1: 建立 BeamCone.tsx

建立 `src/features/beam-hopping/components/BeamCone.tsx`：

```tsx
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Beam, DEFAULT_BEAM_CONFIG } from '../types';

interface BeamConeProps {
  beam: Beam;
  satelliteHeight: number;
  /** 活躍時的透明度 */
  activeOpacity?: number;
  /** 非活躍時的透明度 */
  inactiveOpacity?: number;
}

/**
 * 單個波束錐形
 */
export function BeamCone({
  beam,
  satelliteHeight,
  activeOpacity = 0.6,
  inactiveOpacity = 0.15,
}: BeamConeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  // 目標透明度
  const targetOpacity = beam.isActive ? activeOpacity : inactiveOpacity;

  // 平滑透明度過渡
  useFrame((_, delta) => {
    if (materialRef.current) {
      const current = materialRef.current.opacity;
      const diff = targetOpacity - current;
      materialRef.current.opacity += diff * Math.min(delta * 5, 1);
    }
  });

  // 錐形幾何 - 頂部在衛星位置，底部在地面
  const coneGeometry = useMemo(() => {
    const geometry = new THREE.ConeGeometry(
      DEFAULT_BEAM_CONFIG.coneRadiusBottom,  // 底部半徑
      satelliteHeight,                        // 高度
      32,                                     // 分段數
      1,                                      // 高度分段
      true                                    // 開放底部
    );
    // 旋轉使錐形頂部朝上
    geometry.rotateX(Math.PI);
    return geometry;
  }, [satelliteHeight]);

  // 位置：底部在地面，頂部在衛星高度
  const position: [number, number, number] = [
    beam.position.x,
    satelliteHeight / 2,
    beam.position.z,
  ];

  return (
    <mesh
      ref={meshRef}
      geometry={coneGeometry}
      position={position}
    >
      <meshStandardMaterial
        ref={materialRef}
        color={beam.color}
        transparent
        opacity={inactiveOpacity}
        side={THREE.DoubleSide}
        depthWrite={false}
        emissive={beam.color}
        emissiveIntensity={beam.isActive ? 0.3 : 0.05}
      />
    </mesh>
  );
}

interface BeamConesProps {
  beams: Beam[];
  satelliteHeight: number;
}

/**
 * 所有波束錐形的容器
 */
export function BeamCones({ beams, satelliteHeight }: BeamConesProps) {
  return (
    <group>
      {beams.map((beam) => (
        <BeamCone
          key={beam.id}
          beam={beam}
          satelliteHeight={satelliteHeight}
        />
      ))}
    </group>
  );
}
```

### Step 2: 建立波束連線組件

建立 `src/features/beam-hopping/components/BeamConnection.tsx`：

```tsx
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
```

### Step 3: 更新組件導出

更新 `src/features/beam-hopping/components/index.ts`：

```typescript
export { BeamHoppingScene } from './BeamHoppingScene';
export { BeamCone, BeamCones } from './BeamCone';
export { BeamConnection, ActiveBeamConnection } from './BeamConnection';
```

### Step 4: 整合到 BeamHoppingScene

更新 `src/features/beam-hopping/components/BeamHoppingScene.tsx`，添加波束錐形：

在 imports 中添加：
```tsx
import { BeamCones } from './BeamCone';
import { ActiveBeamConnection } from './BeamConnection';
```

在 `<Suspense>` 內添加波束組件：
```tsx
{/* 波束錐形 */}
<BeamCones
  beams={state.beams}
  satelliteHeight={DEFAULT_BEAM_CONFIG.coneHeight}
/>

{/* UE 連線 */}
<ActiveBeamConnection
  beams={state.beams}
  userBeamId={state.userBeamId}
  uePosition={uePosition}
  satelliteHeight={DEFAULT_BEAM_CONFIG.coneHeight}
/>
```

### Step 5: 添加測試用的活躍波束

在 BeamHoppingScene 中，修改初始狀態讓部分波束活躍以便測試：

```tsx
const [state, setState] = useState<BeamHoppingState>(() => {
  const beams = generate7BeamLayout(DEFAULT_BEAM_CONFIG);
  // 測試：讓波束 0, 2, 4 活躍
  const activeBeamIds = [0, 2, 4];
  const updatedBeams = beams.map(b => ({
    ...b,
    isActive: activeBeamIds.includes(b.id),
  }));

  return {
    currentSlotIndex: 0,
    beams: updatedBeams,
    schedule: DEFAULT_SCHEDULE,
    userBeamId: 0,
    isRunning: false,
    speedMultiplier: 1,
  };
});
```

### Step 6: 驗證

```bash
npm run typecheck
npm run dev
```

訪問 `/beam-hopping` 確認：
- 7 個波束錐形從衛星延伸到地面
- 活躍波束（0, 2, 4）透明度較高
- 非活躍波束透明度較低
- 顏色符合 FRF3 配置
- UE 到當前波束有連線

## 驗收標準

- [ ] 7 個波束錐形正確渲染
- [ ] 活躍/非活躍透明度區分明顯
- [ ] 顏色正確 (FRF3)
- [ ] 連線顯示正確
- [ ] TypeScript 編譯通過

## 下一步

完成後繼續 `05-GROUND-CELLS.md`
