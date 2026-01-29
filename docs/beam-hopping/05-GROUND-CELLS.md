# SDD 05: 實作地面覆蓋區

## 任務說明

實作地面覆蓋區（Ground Cells）組件，顯示波束在地面的覆蓋範圍。

## 前置條件

- 完成 `04-BEAM-CONE.md`
- 波束錐形已實作

## 執行步驟

### Step 1: 建立 GroundCells.tsx

建立 `src/features/beam-hopping/components/GroundCells.tsx`：

```tsx
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { Beam } from '../types';

interface GroundCellProps {
  beam: Beam;
  /** 活躍時的透明度 */
  activeOpacity?: number;
  /** 非活躍時的透明度 */
  inactiveOpacity?: number;
  /** 是否顯示標籤 */
  showLabel?: boolean;
}

/**
 * 單個地面覆蓋區 (六角形)
 */
export function GroundCell({
  beam,
  activeOpacity = 0.4,
  inactiveOpacity = 0.1,
  showLabel = true,
}: GroundCellProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  const targetOpacity = beam.isActive ? activeOpacity : inactiveOpacity;

  // 平滑透明度過渡
  useFrame((_, delta) => {
    if (materialRef.current) {
      const current = materialRef.current.opacity;
      const diff = targetOpacity - current;
      materialRef.current.opacity += diff * Math.min(delta * 5, 1);
    }
  });

  // 六角形幾何
  const hexGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    const sides = 6;
    const radius = beam.radius;

    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / 6; // 旋轉 30 度使平邊朝上
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }

    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2); // 平放在地面
    return geometry;
  }, [beam.radius]);

  return (
    <group position={[beam.position.x, 0.5, beam.position.z]}>
      {/* 填充 */}
      <mesh ref={meshRef} geometry={hexGeometry}>
        <meshStandardMaterial
          ref={materialRef}
          color={beam.color}
          transparent
          opacity={inactiveOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 邊框 */}
      <lineLoop>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={7}
            array={(() => {
              const positions = new Float32Array(21);
              for (let i = 0; i <= 6; i++) {
                const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
                positions[i * 3] = Math.cos(angle) * beam.radius;
                positions[i * 3 + 1] = 0;
                positions[i * 3 + 2] = Math.sin(angle) * beam.radius;
              }
              return positions;
            })()}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={beam.color}
          transparent
          opacity={beam.isActive ? 0.8 : 0.3}
        />
      </lineLoop>

      {/* 標籤 */}
      {showLabel && (
        <Text
          position={[0, 1, 0]}
          fontSize={12}
          color={beam.isActive ? '#ffffff' : '#888888'}
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

/**
 * 所有地面覆蓋區的容器
 */
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
```

### Step 2: 建立波束標籤組件

建立 `src/features/beam-hopping/components/BeamLabel.tsx`：

```tsx
import React from 'react';
import { Html } from '@react-three/drei';
import { Beam } from '../types';

interface BeamLabelProps {
  beam: Beam;
  satelliteHeight: number;
}

/**
 * 波束頂部標籤 (在衛星位置)
 */
export function BeamLabel({ beam, satelliteHeight }: BeamLabelProps) {
  return (
    <Html
      position={[beam.position.x, satelliteHeight + 20, beam.position.z]}
      center
      style={{ pointerEvents: 'none' }}
    >
      <div style={{
        padding: '4px 8px',
        backgroundColor: beam.isActive ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)',
        borderRadius: '4px',
        border: `1px solid ${beam.color}`,
        color: beam.isActive ? '#ffffff' : '#888888',
        fontSize: '11px',
        fontWeight: beam.isActive ? 'bold' : 'normal',
        whiteSpace: 'nowrap',
        transition: 'all 0.3s ease',
      }}>
        Beam {beam.id}
        {beam.isActive && (
          <span style={{ color: beam.color, marginLeft: '4px' }}>●</span>
        )}
      </div>
    </Html>
  );
}

interface BeamLabelsProps {
  beams: Beam[];
  satelliteHeight: number;
}

/**
 * 所有波束標籤
 */
export function BeamLabels({ beams, satelliteHeight }: BeamLabelsProps) {
  return (
    <group>
      {beams.map((beam) => (
        <BeamLabel
          key={beam.id}
          beam={beam}
          satelliteHeight={satelliteHeight}
        />
      ))}
    </group>
  );
}
```

### Step 3: 更新組件導出

更新 `src/features/beam-hopping/components/index.ts`：

```typescript
export { BeamHoppingScene } from './BeamHoppingScene';
export { BeamCone, BeamCones } from './BeamCone';
export { BeamConnection, ActiveBeamConnection } from './BeamConnection';
export { GroundCell, GroundCells } from './GroundCells';
export { BeamLabel, BeamLabels } from './BeamLabel';
```

### Step 4: 整合到 BeamHoppingScene

更新 `src/features/beam-hopping/components/BeamHoppingScene.tsx`：

添加 imports：
```tsx
import { GroundCells } from './GroundCells';
import { BeamLabels } from './BeamLabel';
```

在 `<Suspense>` 內添加：
```tsx
{/* 地面覆蓋區 */}
<GroundCells beams={state.beams} showLabels={true} />

{/* 波束標籤 (可選) */}
{/* <BeamLabels beams={state.beams} satelliteHeight={DEFAULT_BEAM_CONFIG.coneHeight} /> */}
```

### Step 5: 驗證

```bash
npm run typecheck
npm run dev
```

訪問 `/beam-hopping` 確認：
- 7 個六角形覆蓋區正確顯示在地面
- 活躍波束的覆蓋區較亮
- 每個覆蓋區有 "B0" - "B6" 標籤
- 覆蓋區邊框清晰可見
- 顏色與波束錐形一致

## 驗收標準

- [ ] 六角形覆蓋區正確渲染
- [ ] 活躍/非活躍狀態區分明顯
- [ ] 標籤顯示正確
- [ ] 邊框顯示正確
- [ ] TypeScript 編譯通過

## 下一步

完成後繼續 `06-BEAM-SCHEDULER.md`
