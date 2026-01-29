# SDD 02: 建立 features/beam-hopping 目錄結構

## 任務說明

建立 Beam Hopping 功能的完整目錄結構和核心類型定義。

## 前置條件

- 完成 `01-PAGE-SETUP.md`
- BeamHoppingPage 已建立

## 執行步驟

### Step 1: 建立目錄結構

```bash
mkdir -p src/features/beam-hopping/components
mkdir -p src/features/beam-hopping/utils
mkdir -p src/features/beam-hopping/ui
mkdir -p src/features/beam-hopping/types
```

### Step 2: 建立類型定義

建立 `src/features/beam-hopping/types/beam.ts`：

```typescript
/**
 * Beam Hopping 類型定義
 *
 * 基於 3GPP TR 38.821 NTN 標準
 */

/**
 * 單個波束定義
 */
export interface Beam {
  id: number;
  /** 地面中心位置 (相對於場景中心) */
  position: {
    x: number;
    z: number;
  };
  /** 覆蓋半徑 (場景單位) */
  radius: number;
  /** 頻率複用顏色 */
  color: string;
  /** 當前時隙是否活躍 */
  isActive: boolean;
  /** 頻率複用組 (0, 1, 2 for FRF3) */
  frequencyGroup: number;
}

/**
 * 時隙定義
 */
export interface TimeSlot {
  id: number;
  /** 此時隙活躍的波束 ID 列表 */
  activeBeams: number[];
  /** 時隙持續時間 (ms) */
  duration: number;
}

/**
 * Beam Hopping 狀態
 */
export interface BeamHoppingState {
  /** 當前時隙索引 */
  currentSlotIndex: number;
  /** 所有波束 */
  beams: Beam[];
  /** 時隙調度表 */
  schedule: TimeSlot[];
  /** UE 當前所在波束 ID */
  userBeamId: number;
  /** 是否正在運行動畫 */
  isRunning: boolean;
  /** 動畫速度倍率 */
  speedMultiplier: number;
}

/**
 * 波束配置
 */
export interface BeamConfig {
  /** 波束數量 */
  count: number;
  /** 錐形高度 (衛星高度) */
  coneHeight: number;
  /** 頂部半徑 */
  coneRadiusTop: number;
  /** 底部半徑 (地面覆蓋) */
  coneRadiusBottom: number;
  /** 相鄰波束間距 */
  cellSpacing: number;
  /** 頻率複用因子 (1 或 3) */
  frequencyReuseFactor: 1 | 3;
}

/**
 * 頻率複用顏色配置
 */
export const FRF3_COLORS = {
  group0: '#0088ff',  // 藍色
  group1: '#00ff88',  // 綠色
  group2: '#ff8800',  // 橙色
} as const;

/**
 * 預設波束配置
 */
export const DEFAULT_BEAM_CONFIG: BeamConfig = {
  count: 7,
  coneHeight: 400,
  coneRadiusTop: 5,
  coneRadiusBottom: 60,
  cellSpacing: 120,
  frequencyReuseFactor: 3,
};

/**
 * 預設時隙調度 (FRF3 相容)
 */
export const DEFAULT_SCHEDULE: TimeSlot[] = [
  { id: 0, activeBeams: [0, 2, 4], duration: 2000 },
  { id: 1, activeBeams: [1, 3, 5], duration: 2000 },
  { id: 2, activeBeams: [0, 3, 6], duration: 2000 },
  { id: 3, activeBeams: [1, 4, 6], duration: 2000 },
  { id: 4, activeBeams: [2, 5, 6], duration: 2000 },
];
```

### Step 3: 建立類型導出入口

建立 `src/features/beam-hopping/types/index.ts`：

```typescript
export * from './beam';
```

### Step 4: 建立配置常數

建立 `src/features/beam-hopping/utils/BeamConfig.ts`：

```typescript
import { BeamConfig, Beam, FRF3_COLORS } from '../types';

/**
 * 生成 7-beam 六角形排列的波束配置
 *
 * 排列方式:
 *         [2]
 *     [1]     [3]
 *         [0]
 *     [6]     [4]
 *         [5]
 */
export function generate7BeamLayout(config: BeamConfig): Beam[] {
  const { cellSpacing, coneRadiusBottom, frequencyReuseFactor } = config;

  // 六角形排列的偏移量
  const hexOffsets = [
    { x: 0, z: 0 },                                    // 中心 [0]
    { x: -cellSpacing * 0.866, z: cellSpacing * 0.5 }, // 左上 [1]
    { x: 0, z: cellSpacing },                          // 上   [2]
    { x: cellSpacing * 0.866, z: cellSpacing * 0.5 },  // 右上 [3]
    { x: cellSpacing * 0.866, z: -cellSpacing * 0.5 }, // 右下 [4]
    { x: 0, z: -cellSpacing },                         // 下   [5]
    { x: -cellSpacing * 0.866, z: -cellSpacing * 0.5 },// 左下 [6]
  ];

  // FRF3 頻率分組 (確保相鄰波束不同頻率)
  const frequencyGroups = [0, 1, 2, 1, 2, 0, 0];

  const colors = Object.values(FRF3_COLORS);

  return hexOffsets.map((offset, index) => ({
    id: index,
    position: { x: offset.x, z: offset.z },
    radius: coneRadiusBottom,
    color: frequencyReuseFactor === 3 ? colors[frequencyGroups[index]] : colors[0],
    isActive: false,
    frequencyGroup: frequencyGroups[index],
  }));
}

/**
 * 根據時隙更新波束活躍狀態
 */
export function updateBeamActiveStates(
  beams: Beam[],
  activeBeamIds: number[]
): Beam[] {
  return beams.map(beam => ({
    ...beam,
    isActive: activeBeamIds.includes(beam.id),
  }));
}
```

### Step 5: 建立工具函數導出入口

建立 `src/features/beam-hopping/utils/index.ts`：

```typescript
export * from './BeamConfig';
```

### Step 6: 建立功能模組主入口

建立 `src/features/beam-hopping/index.ts`：

```typescript
// Types
export * from './types';

// Utils
export * from './utils';

// Components will be added in subsequent steps
// export * from './components';

// UI will be added in subsequent steps
// export * from './ui';
```

### Step 7: 驗證

```bash
npm run typecheck
```

## 驗收標準

- [ ] 目錄結構正確建立
- [ ] `types/beam.ts` 類型定義完整
- [ ] `utils/BeamConfig.ts` 工具函數正常
- [ ] 所有導出入口正確設定
- [ ] TypeScript 編譯通過

## 預期結果

```
src/features/beam-hopping/
├── index.ts
├── components/     (空，後續填充)
├── ui/             (空，後續填充)
├── utils/
│   ├── index.ts
│   └── BeamConfig.ts
└── types/
    ├── index.ts
    └── beam.ts
```

## 下一步

完成後繼續 `03-BEAM-SCENE.md`
