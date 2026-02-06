# SDD-00: 基礎框架 — Time Slot 系統 + Data Queue 動態

## 1. 目的

建立 Paper 4-1 的時間與資料基礎架構，為後續所有演算法提供運行環境。

## 2. 論文對應

- **Equation 1**: Q_c^{f+1} = max(Q_c^f - D_c^f, 0) + α_c^f （Data Queue 更新）
- **Section V-A**: 200 time slots per epoch, T_slot = 200ms
- **Table III**: 20 個 beam cell 的正規化傳輸需求

## 3. 設計內容

### 3.1 Time Slot 系統

```
Epoch f
├── Slot 1 (0ms - 200ms)
├── Slot 2 (200ms - 400ms)
├── ...
└── Slot 200 (39800ms - 40000ms)
Epoch f+1
├── ...
```

**新增資料結構**:

```typescript
// src/types/paper41.ts
interface SimulationClock {
  currentEpoch: number;        // 當前 epoch 編號
  currentSlot: number;         // 當前 slot (1-200)
  slotDurationMs: number;      // 200ms
  slotsPerEpoch: number;       // 200
  epochDurationMs: number;     // 40000ms (40s)
  totalElapsedMs: number;      // 總經過時間
}
```

**播放控制**:
- 即時模式：每 200ms 推進一個 slot（真實速度）
- 加速模式：可配置 2x/5x/10x 加速
- 逐步模式：手動點擊推進 slot/epoch

### 3.2 Data Queue 動態

每個 Cell 維護一個 data queue，依 Equation 1 更新：

```
Q_c^{f+1} = max(Q_c^f - D_c^f, 0) + α_c^f
```

其中：
- Q_c^f: Cell c 在 epoch f 的 queue 長度
- D_c^f: Cell c 在 epoch f 收到的資料量（取決於被服務的 slot 數和 SNR）
- α_c^f: Cell c 在 epoch f 新到達的資料量

**Cell 需求分佈**（Table III）:

| Cell | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| 需求 ×10⁻² | 2.21 | 6.36 | 6.36 | 3.25 | 7.40 | 3.25 | 2.09 |

| Cell | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|
| 需求 ×10⁻² | 4.28 | 4.29 | 5.32 | 8.44 | 4.28 | 3.25 | 2.21 |

| Cell | 15 | 16 | 17 | 18 | 19 | 20 |
|---|---|---|---|---|---|---|
| 需求 ×10⁻² | 6.36 | 7.40 | 3.12 | 8.44 | 4.28 | 7.40 |

### 3.3 服務資料量計算

D_c^f 由 Equation 2 計算（簡化版）：

```
D_c^f = Σ (slots served) × W_c × T_slot × log2(1 + SNR_c)
```

在 Phase 0 先使用簡化版：
- 被服務的 slot：每個 slot 如果被 beam 服務，累加傳輸量
- SNR 固定 12 dB（Table II）
- W_c = 200 MHz / (同時服務的 cell 數)

## 4. 影響的檔案

| 檔案 | 變更 |
|---|---|
| `src/types/paper41.ts` | 新建：SimulationClock, CellQueue, Paper41Config |
| `src/features/beam-hopping/components/EarthFixedCells.tsx` | 修改：queue 更新邏輯 |
| `src/components/ui/sidebar/` | 新增：epoch/slot 顯示、播放控制 |
| `src/components/scene/MainScene.tsx` | 修改：整合 SimulationClock |

## 5. 驗證標準

- [ ] Epoch/Slot 時間系統正常運作
- [ ] Data queue 每 epoch 正確更新（Q 增減符合 Eq.1）
- [ ] 高需求 cells (11, 18) 的 queue 增長快於低需求 cells (1, 7)
- [ ] 被服務的 cell queue 會下降
- [ ] 未被服務的 cell queue 持續累積
- [ ] 側邊欄正確顯示 epoch/slot 資訊

## 6. 前置需求

無（這是第一個 Phase）

## 7. 預計產出

完成後系統將具備：
1. 離散時間推進能力（epoch + slot）
2. 每個 cell 的 queue 動態變化
3. 為 Phase 1 (Beam Hopping) 提供「該優先服務哪個 cell」的依據
