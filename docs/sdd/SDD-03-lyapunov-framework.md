# SDD-03: Lyapunov 優化框架整合

## 1. 目的

將 Algorithm 1 (換手) 和 Algorithm 2 (beam hopping) 整合到 Lyapunov 框架下，實現長期最佳化。

## 2. 論文對應

- **Section III**: Problem Formulation and Transformation
- **Equation 17-28**: Virtual queue, Lyapunov drift-plus-penalty
- **Equation 29-30**: 問題轉換與最優性保證

## 3. 設計內容

### 3.1 Virtual Queue

每個 cell c 維護一個 virtual queue M_c：

```
M_{c,f+1} = max(M_{c,f} + m_{c,f} - H̄, 0)
```

其中 m_{c,f} 是 cell c 在 epoch f 的換手指標（0 或 1），H̄ = 0.004 是最大換手頻率門檻。

### 3.2 Lyapunov Drift-Plus-Penalty

每個 epoch 最小化：
```
δ_f = Σ_c (D^f_c - Q^f_c)² + Σ_c M_{c,f} × m_{c,f}
```

- 第一項：最大化服務滿足度（讓 D_c 接近 Q_c）
- 第二項：控制換手頻率（M_c 大時懲罰換手）

**V 參數**（論文設 V=100）：控制性能與換手頻率的權衡。

### 3.3 Per-Epoch 決策流程

```
Epoch f:
1. 讀取上一 epoch 結果：σ_{f-1}, M_f
2. Algorithm 1: 決定每個 cell 的服務衛星 {x^f_{s,c}}
3. Algorithm 2: 決定每個 slot 的 beam hopping {y^{f,t}_{s,c,b}}
4. [Phase 4] Algorithm 3: 決定頻譜共享 {z^{f,t}_{s,c}}
5. 更新 Q_c, M_c, σ_f
6. 輸出指標
```

### 3.4 參數配置

| 參數 | 預設值 | 說明 |
|---|---|---|
| V | 100 | Lyapunov trade-off 參數 |
| H̄ | 0.004 | 最大換手頻率門檻 |
| σ₀ | 0.6-0.9 | 資源利用率門檻 |
| N' | 100 | Swap matching 最大迭代 |

## 4. 影響的檔案

| 檔案 | 變更 |
|---|---|
| `src/features/beam-hopping/algorithms/lyapunovOptimizer.ts` | 新建：Lyapunov 框架 |
| `src/types/lyapunov.ts` | 修改：VirtualQueue, LyapunovState |
| `src/components/scene/MainScene.tsx` | 修改：per-epoch 決策循環 |

## 5. 前置需求

- SDD-00, SDD-01, SDD-02

## 6. 驗證標準

- [ ] Virtual queue M_c 收斂（Theorem 1: lim M_{c,F}/F → 0）
- [ ] 增大 V 提升性能但增加換手（trade-off 符合 Eq. 30）
- [ ] 整合後結果介於 Algorithm 1 和 Algorithm 2 單獨運行之間
