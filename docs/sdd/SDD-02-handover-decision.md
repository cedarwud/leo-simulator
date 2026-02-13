# SDD-02: 條件觸發 + Swap Matching 換手決策 (Algorithm 1)

## 1. 目的

實作 Lyapunov 的 inter-satellite handover 決策演算法，在 leo-simulator 中新增為一種 handover method。

## 2. 論文對應

- **Section IV-B**: Inter-Satellite Handover Decision Problem and Algorithm Design
- **Algorithm 1**: Inter-Satellite Handover Decision Algorithm
- **Equation 31-32**: 目標函數（負載均衡 + 換手頻率控制）

## 3. 設計內容

### 3.1 條件觸發機制 (Conditional Triggering)

換手只在以下條件之一成立時觸發：
1. **衛星離開覆蓋範圍**: 服務衛星的仰角 < 35° → 必須換手
2. **資源利用率不足**: σ_f < σ₀ 且最小負載衛星的容量 > C_s → 重新分配

不觸發時不進行任何換手（降低換手頻率）。

### 3.2 初始分配 (Multi-attribute Entropy)

新 cell 或需要換手的 cell：
- 使用多屬性決策（衛星負載、剩餘服務時間、仰角）
- 權重由 entropy 方法自動計算

### 3.3 Swap Matching 優化

目標函數 (Eq. 32):
```
δ'_f = Σ_s V × (Σ_c (x^f_{s,c} - 1/2) × Q^f_c / Σ_c Q^f_c)² + Σ_c M_{c,f} × m_{c,f}
```

兩種 swap 操作：
1. **First kind**: 兩顆衛星交換各自一個 cell
2. **Second kind**: 一顆衛星的 cell 轉移給另一顆衛星

迭代直到無法改善或達到最大迭代次數 N'。

### 3.4 新增 Handover Method

在 `HandoverMethodType` 中新增：

```typescript
type HandoverMethodType = 'geometric' | 'rsrp' | 'dqn' | 'lyapunov';
```

### 3.5 與 orbit-engine 整合

需要從 orbit-engine 取得：
- 每顆衛星在未來 epoch 的覆蓋範圍（仰角預測）
- 衛星負載狀態（使用 satellite_load_simulator）

## 4. 影響的檔案

| 檔案 | 變更 | 專案 |
|---|---|---|
| `src/types/handover-method.ts` | 修改：新增 'lyapunov' 類型 | leo-simulator |
| `src/utils/satellite/LyapunovHandoverManager.ts` | 新建：Algorithm 1 實作 | leo-simulator |
| `src/components/ui/sidebar/` | 修改：新增 Lyapunov 方法面板 | leo-simulator |
| `stage6_research_optimization/` | 修改：整合負載模擬 | orbit-engine |

## 5. 前置需求

- SDD-00 (Time Slot 系統 + Data Queue)
- SDD-01 (Conflict Graph — 提供 beam 分配結果)

## 6. 驗證標準

- [ ] 換手僅在條件觸發時發生（非每個 epoch 都換手）
- [ ] Swap matching 後負載更均衡
- [ ] 換手頻率 < H̄ = 0.004
- [ ] 對比 load balance baseline：queue 長度降低 >49%（論文 Fig. 7b）
