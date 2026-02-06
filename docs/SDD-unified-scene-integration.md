# SDD: Unified Scene Integration Plan

## 概述

將 `/satellite-handover` 和 `/beam-hopping` 兩個場景整合為統一場景，支援 Ground Cells 和 Beams 的可選顯示。

## 目標

1. 建立統一的場景配置介面
2. Ground Cells 和 Beams 作為可切換功能
3. 側邊欄根據功能開關動態顯示
4. 保持現有功能完整性

---

## Phase 1: 建立統一配置介面

### 1.1 建立共用類型定義

**檔案**: `src/types/unified-scene.ts` (新建)

```typescript
export interface UnifiedSceneConfig {
  // 可選視覺化功能
  showGroundCells: boolean;
  showBeams: boolean;
  showCellLabels: boolean;
  showBeamLabels: boolean;

  // 換手方法
  handoverMethod: 'geometric' | 'rsrp';
}

export interface UnifiedSceneStats {
  // 連線狀態
  currentSatelliteId: string | null;
  currentBeamId: number | null;

  // 換手統計
  satelliteHandovers: number;
  elapsedTime: number;

  // 能耗 (共用)
  energyConsumption: number;
  energyProjection: EnergyProjection | null;

  // Beam Hopping 專用 (當 showBeams=true)
  ueDataQueue?: number;
  ueCellId?: number;
}
```

---

## Phase 2: 重構 MainScene 支援 Toggle

### 2.1 修改 MainScene.tsx

**檔案**: `src/components/scene/MainScene.tsx`

- 新增 `showGroundCells` 和 `showBeams` state
- 條件渲染 EarthFixedCells 和 SatelliteBeams 元件
- 傳遞 toggle 狀態到 Sidebar

### 2.2 匯入 Beam Hopping 元件到主場景

從 `src/features/beam-hopping/components/` 匯入：
- EarthFixedCells
- SatelliteBeams (需修改為可獨立使用)

---

## Phase 3: 新增 Toggle 控制面板

### 3.1 建立 VisualizationTogglePanel

**檔案**: `src/components/ui/sidebar/VisualizationTogglePanel.tsx` (新建)

```typescript
interface Props {
  showGroundCells: boolean;
  showBeams: boolean;
  onToggleGroundCells: (value: boolean) => void;
  onToggleBeams: (value: boolean) => void;
}
```

### 3.2 整合到 Sidebar

**檔案**: `src/components/ui/Sidebar.tsx`

- 新增 VisualizationTogglePanel
- 當 showGroundCells=true 時顯示 Data Queue 面板
- 當 showBeams=true 時顯示 Beam 相關資訊

---

## Phase 4: 整合 Beam 系統到主場景

### 4.1 抽取 BeamHoppingSystem 核心邏輯

**檔案**: `src/utils/satellite/BeamManager.ts` (新建)

- 從 BeamHoppingSystem.tsx 抽取波束分配邏輯
- 提供獨立的 beam assignment 計算函數
- 不依賴 React 狀態

### 4.2 修改 Satellites.tsx 支援 Beams

**檔案**: `src/components/satellite/Satellites.tsx`

- 新增 `showBeams` prop
- 當啟用時渲染每個衛星的 beams
- 整合 BeamManager 計算

---

## Phase 5: 整合 Ground Cells 到主場景

### 5.1 修改 EarthFixedCells 為可重用元件

**檔案**: `src/features/beam-hopping/components/EarthFixedCells.tsx`

- 確保可在主場景獨立使用
- 新增 `simplified` mode (只顯示 cells，不需要完整的 beam hopping 狀態)

### 5.2 在 MainScene 條件渲染

當 `showGroundCells=true` 時：
- 渲染 EarthFixedCells
- 追蹤 UE 所在的 cell
- 更新 Data Queue 顯示

---

## Phase 6: 整合能耗分析

### 6.1 統一能耗計算

兩個場景已使用相同的 `ENERGY_CONFIG`，確保：
- 能耗投影邏輯共用
- 側邊欄 Energy Analysis 面板通用

### 6.2 移動 Energy Analysis 到共用位置

**檔案**: `src/components/ui/sidebar/EnergyAnalysisPanel.tsx` (新建或移動)

- 從 BeamHoppingSidebar 抽取
- 作為獨立元件在 Sidebar 中使用

---

## Phase 7: 清理和測試

### 7.1 保留原始頁面作為備份

- `/beam-hopping` 頁面暫時保留
- 待整合穩定後再決定是否移除

### 7.2 測試矩陣

| Toggle 組合 | 預期行為 |
|------------|---------|
| Cells=OFF, Beams=OFF | 基本衛星換手場景 |
| Cells=ON, Beams=OFF | 顯示地面 cells，追蹤 UE 位置 |
| Cells=OFF, Beams=ON | 顯示波束，無 cell 網格 |
| Cells=ON, Beams=ON | 完整 beam hopping 視覺化 |

---

## 執行順序

1. **Phase 1** - 建立類型定義 ✅ 完成
2. **Phase 3.1** - 建立 Toggle 面板 ✅ 完成
3. **Phase 5.1** - 確保 EarthFixedCells 可重用 ✅ 完成 (已是可重用)
4. **Phase 2** - 修改 MainScene 加入 Toggle 和 Cells ✅ 完成
5. **Phase 3.2** - 整合 Toggle 到 Sidebar ✅ 完成
6. **Phase 6** - 整合能耗分析 ✅ 完成 (先前已整合)
7. **Phase 4** - 整合 Beams ✅ 完成
8. **Phase 7** - 測試 (待手動驗證)

---

## 風險控制

1. **漸進式整合** - 先整合 Cells，確認穩定後再整合 Beams
2. **保留原始碼** - 不刪除 beam-hopping feature，只是共用元件
3. **Feature Flag** - Toggle 預設 OFF，不影響現有使用者

---

## 檔案變更清單

### 新建
- `src/types/unified-scene.ts`
- `src/components/ui/sidebar/VisualizationTogglePanel.tsx`

### 修改
- `src/components/scene/MainScene.tsx`
- `src/components/ui/Sidebar.tsx`
- `src/features/beam-hopping/components/EarthFixedCells.tsx` (minor)

### 可選 (Phase 4)
- `src/components/satellite/Satellites.tsx`
- `src/utils/satellite/BeamManager.ts` (新建)
