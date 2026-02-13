# SDD-01: Conflict Graph + WMIS Beam Hopping (Algorithm 2)

## 1. 目的

實作 Lyapunov 的核心 beam hopping 排程演算法，基於 conflict graph 和加權最大獨立集 (WMIS) 貪婪求解。

## 2. 論文對應

- **Section IV-C**: Beam Hopping Design Problem and Algorithm Design
- **Algorithm 2**: Beam Hopping Design Algorithm
- **Equation 33-35**: 傳輸資料量、queue 更新、頂點權重
- **Figure 5**: Conflict graph 範例

## 3. 設計內容

### 3.1 Conflict Graph 建構

每個 epoch 建構一個 conflict graph G = (V, E)：

**頂點 V**: 每個 (cell, beam) 組合是一個頂點
- 每個 cell 對應 B 個頂點（B = 每衛星波束數）
- 20 cells × 2 polarization = 最多 40 個頂點

**邊 E**: 兩個頂點間有邊 = 不能同時啟用，原因：
1. **同一 cell**: 一個 cell 同時只能被一個 beam 服務（約束 10）
2. **同一 beam**: 一個 beam 同時只能服務一個 cell（約束 12）
3. **干擾過大**: 同極化的相鄰 cells 同時服務會產生嚴重干擾（約束 14, Equation 8）

### 3.2 干擾判斷 (Equation 8)

兩個 cells 能否同時被同極化的 beam 服務：

```
G_th(c,c') = I_s^th - 10log(S_c × B) - SNR_c' - 10log(h_sc',c / (δ × h_sc,c))
```

簡化判斷：
- 同極化 + 相鄰 cell → 邊（不能同時）
- 同極化 + 非相鄰但距離近 → 計算 off-axis angle 判斷
- 不同極化 → 可以同時（無邊）

### 3.3 WMIS 貪婪求解 (Algorithm 2)

每個 time slot t：

1. 設定所有空 queue 的頂點為不可選
2. 計算每個頂點的權重 w_v（Eq. 35）和權重比 ρ_v
3. 按 ρ_v 降序排列，依次選擇不衝突的頂點
4. 選中的頂點 = 該 slot 的 beam hopping 決策
5. 更新 queue 長度

**權重計算** (Eq. 35):
```
w_v = (W₁ × T_slot × log₂(1 + SNR_c))² + (Q_c^{f,t})² - (D_c^{f,t} - Q_c^{f,t})²
```

### 3.4 視覺化

- 每個 slot 切換 beam → cell 的服務關係（動畫）
- 被選中的 cell 亮起（極化色）
- 衝突的 cell 組合以虛線連接標示
- Queue 長度以進度條顯示在 cell 上方

## 4. 影響的檔案

| 檔案 | 變更 |
|---|---|
| `src/features/beam-hopping/algorithms/conflictGraph.ts` | 新建：Conflict Graph 建構 |
| `src/features/beam-hopping/algorithms/wmisScheduler.ts` | 新建：WMIS 貪婪求解 |
| `src/features/beam-hopping/components/SatelliteBeams.tsx` | 修改：使用 WMIS 結果分配 beam |
| `src/features/beam-hopping/components/EarthFixedCells.tsx` | 修改：queue 進度條顯示 |

## 5. 前置需求

- SDD-00 (Time Slot 系統 + Data Queue)

## 6. 驗證標準

- [ ] Conflict graph 正確建構（同極化相鄰 cells 有邊）
- [ ] WMIS 求解結果不違反任何約束
- [ ] 高 queue 的 cells 優先被服務
- [ ] Beam hopping 動畫每 slot 正確切換
- [ ] 對比 greedy baseline：queue 長度降低 >13%（論文 Fig. 6b）
