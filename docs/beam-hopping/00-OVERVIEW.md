# Beam Hopping 功能開發計劃

## 目標

實現 LEO 衛星多波束跳躍（Beam Hopping）視覺化，基於 3GPP TR 38.821 NTN 標準。

## 學術參考

| 來源 | 設定 |
|------|------|
| 3GPP TR 38.821 | 19 beams (標準)，7 beams (簡化) |
| PMC - Adaptive Beam | 16 beams，大/中/小三種尺寸 |
| arXiv - System-Level | Imax = 40 同時照亮 |

## 設計決策

### 採用 7-Beam 簡化模型

```
        [2]
    [1]     [3]
        [0]         ← 中心波束 (UE 所在)
    [6]     [4]
        [5]
```

**理由**：
1. 符合 3GPP 六角形排列基本單位
2. 視覺上清晰可辨識
3. 可展示頻率複用 (FRF3: 3 種顏色)
4. 可展示 beam handover

### 視覺化元素

1. **波束錐形** - 從衛星延伸到地面的錐形
2. **地面覆蓋區** - 六角形 cells
3. **時隙動畫** - 波束亮滅切換
4. **連線** - UE 到當前波束的連線

## 開發步驟

| 順序 | 文檔 | 說明 | 預估複雜度 |
|------|------|------|-----------|
| 1 | `01-PAGE-SETUP.md` | 建立 BeamHoppingPage 基礎結構 | ⭐ |
| 2 | `02-FEATURE-STRUCTURE.md` | 建立 features/beam-hopping 目錄 | ⭐ |
| 3 | `03-BEAM-SCENE.md` | 建立 3D 場景基礎 | ⭐⭐ |
| 4 | `04-BEAM-CONE.md` | 實作波束錐形組件 | ⭐⭐⭐ |
| 5 | `05-GROUND-CELLS.md` | 實作地面覆蓋區 | ⭐⭐ |
| 6 | `06-BEAM-SCHEDULER.md` | 實作時隙調度邏輯 | ⭐⭐⭐ |
| 7 | `07-BEAM-ANIMATION.md` | 實作波束動畫效果 | ⭐⭐ |
| 8 | `08-SIDEBAR-CONTROLS.md` | 建立控制面板 | ⭐⭐ |
| 9 | `09-INTEGRATION.md` | 整合與最終測試 | ⭐⭐ |

## 技術架構

### 目錄結構

```
src/
├── pages/
│   └── BeamHoppingPage.tsx
├── features/
│   └── beam-hopping/
│       ├── components/
│       │   ├── BeamHoppingScene.tsx      # 主場景
│       │   ├── BeamCone.tsx              # 波束錐形
│       │   ├── GroundCells.tsx           # 地面覆蓋區
│       │   ├── BeamConnection.tsx        # UE-Beam 連線
│       │   └── BeamLabel.tsx             # 波束標籤
│       ├── utils/
│       │   ├── BeamScheduler.ts          # 時隙調度
│       │   ├── BeamGeometry.ts           # 幾何計算
│       │   └── BeamConfig.ts             # 配置常數
│       ├── ui/
│       │   ├── BeamHoppingSidebar.tsx    # 左側控制面板
│       │   └── BeamInfoPanel.tsx         # 右側資訊面板
│       └── types/
│           └── beam.ts                   # 類型定義
└── shared/
    └── components/
        └── Starfield.tsx                 # 共用星空背景
```

### 核心類型定義

```typescript
// types/beam.ts
interface Beam {
  id: number;
  position: { x: number; z: number };  // 地面中心位置
  radius: number;                       // 覆蓋半徑
  color: string;                        // 頻率複用顏色
  isActive: boolean;                    // 當前時隙是否活躍
}

interface TimeSlot {
  id: number;
  activeBeams: number[];  // 活躍的波束 ID
  duration: number;       // 時隙長度 (ms)
}

interface BeamHoppingState {
  currentSlot: number;
  beams: Beam[];
  schedule: TimeSlot[];
  userBeam: number;       // UE 所在波束
}
```

### 3D 座標系統

```
Y (上)
│
│     🛰️ 衛星 (0, 500, 0)
│    /│\
│   / │ \ 波束錐形
│  /  │  \
│ ────┼────  地面 (Y=0)
│    [cells]
│      📱 UE
└──────────────── X (東)
       /
      Z (北)
```

## 配置參數

### 波束配置

```typescript
const BEAM_CONFIG = {
  count: 7,                    // 波束數量
  coneHeight: 500,             // 錐形高度 (對應衛星高度)
  coneRadiusTop: 10,           // 頂部半徑
  coneRadiusBottom: 80,        // 底部半徑 (地面覆蓋)
  cellSpacing: 160,            // 相鄰波束間距
  colors: {
    frf3: ['#0088ff', '#00ff88', '#ff8800'],  // 3 色頻率複用
    active: 1.0,               // 活躍透明度
    inactive: 0.2              // 非活躍透明度
  }
};
```

### 時隙配置

```typescript
const TIMESLOT_CONFIG = {
  duration: 2000,              // 每個時隙 2 秒 (視覺化用)
  patterns: [
    [0, 2, 4],                 // 時隙 1: 波束 0, 2, 4 活躍
    [1, 3, 5],                 // 時隙 2: 波束 1, 3, 5 活躍
    [0, 3, 6],                 // 時隙 3: 波束 0, 3, 6 活躍
  ]
};
```

## 使用方式

每個 SDD 文檔可直接作為 Claude 提示詞：

```bash
# 查看總覽
cat docs/beam-hopping/00-OVERVIEW.md

# 按順序執行
cat docs/beam-hopping/01-PAGE-SETUP.md
# 執行步驟 1...
```

## 驗收標準

### 功能驗收
- [ ] Landing Page 的 Beam Hopping 卡片可點擊
- [ ] BeamHoppingPage 正確顯示
- [ ] 7 個波束錐形正確渲染
- [ ] 地面覆蓋區正確顯示
- [ ] 時隙動畫正常運作
- [ ] 控制面板功能正常

### 視覺驗收
- [ ] 波束錐形從衛星延伸到地面
- [ ] 活躍/非活躍波束透明度區分明顯
- [ ] 頻率複用顏色正確 (FRF3)
- [ ] UE 到波束連線顯示正確

---

**最後更新**: 2025-01-29
**維護者**: Claude Code
