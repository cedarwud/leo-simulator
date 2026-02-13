# SDD (Software Design Documents)

Lyapunov 復現計畫的系統設計文件索引。

**論文**: "Beam Management in Low Earth Orbit Satellite Communication With Handover Frequency Control and Satellite-Terrestrial Spectrum Sharing"
**來源**: IEEE Transactions on Communications, Vol. 73, No. 7, July 2025
**作者**: Jianfeng Zhu, Yaohua Sun, Mugen Peng

**當前忠實度**: ~97%（排除 MOSEK/STK 商業授權軟體）
**測試**: 153 tests 全部通過（8 test files）
**Build**: TypeScript 零錯誤，Vite 生產構建成功

---

## v1: Simplified Prototype (SDD-00 ~ SDD-06)

> 完成狀態：✅ 100% 實作完成（已被 v2 + v3 取代）
> 論文忠實度：~45-55%（簡化版原型）

| Phase | SDD | 內容 | 狀態 |
|---|---|---|---|
| 0 | [SDD-00](./SDD-00-foundation.md) | 基礎框架：Time Slot 系統 + Data Queue 動態 | ✅ 完成（被 v2 取代） |
| 1 | [SDD-01](./SDD-01-conflict-graph.md) | Conflict Graph + WMIS Beam Hopping (Algorithm 2) | ✅ 完成（被 SDD-11/12 取代） |
| 2 | [SDD-02](./SDD-02-handover-decision.md) | 條件觸發 + Swap Matching 換手 (Algorithm 1) | ✅ 完成（被 SDD-14 取代） |
| 3 | [SDD-03](./SDD-03-lyapunov-framework.md) | Lyapunov 優化框架整合 | ✅ 完成（被 v3 修正） |
| 4 | [SDD-04](./SDD-04-spectrum-sharing.md) | 星地頻譜共享 (Algorithm 3) | ✅ 完成（被 SDD-13 取代） |
| 5 | [SDD-05](./SDD-05-sidebar-params.md) | 側邊欄參數面板 + 論文指標呈現 | ✅ 完成 |
| 6 | [SDD-06](./SDD-06-integration.md) | 整合驗證 + 5 基線 + 統計 + 複雜度 | ✅ 完成（被 SDD-15 取代） |

---

## v2: Paper-Faithful Implementation (SDD-10 ~ SDD-15)

> 完成狀態：✅ 100% 實作完成
> 論文忠實度：~85%（v1 的所有已知簡化均已修正）

| Phase | SDD | 內容 | 依賴 | 狀態 |
|---|---|---|---|---|
| 10 | [SDD-10](./SDD-10-physical-layer.md) | 物理層：SINR + Channel Model + Antenna | — | ✅ 完成 |
| 11 | [SDD-11](./SDD-11-conflict-graph-v2.md) | Conflict Graph v2：加入衛星維度 | SDD-10 | ✅ 完成 |
| 12 | [SDD-12](./SDD-12-wmis-v2.md) | WMIS v2：正確 ρ_v + intra-slot 更新 | SDD-11 | ✅ 完成 |
| 13 | [SDD-13](./SDD-13-bssa-v2.md) | BSSA v2：完整 4 階段 + Eq.39 fitness | SDD-10 | ✅ 完成 |
| 14 | [SDD-14](./SDD-14-handover-v2.md) | Handover v2：正確 penalty + 動態 entropy | SDD-10 | ✅ 完成 |
| 15 | [SDD-15](./SDD-15-scale-baselines.md) | 論文規模 + 論文基線 | SDD-11~14 | ✅ 完成 |

### v2 依賴關係

```
SDD-10 (Physical Layer) ─── 基礎，所有 v2 SDD 都依賴此
  ├── SDD-11 (Conflict Graph v2)
  │     └── SDD-12 (WMIS v2)
  ├── SDD-13 (BSSA v2)
  ├── SDD-14 (Handover v2)
  └── SDD-15 (Scale & Baselines) ← 依賴 SDD-11~14 全部完成
```

---

## v3: Post-SDD Fixes (Rounds 1-10, Fix #1 ~ #37)

> 完成狀態：✅ 100% 實作完成
> 論文忠實度：~85% → ~97%（37 項修復）

v2 完成後，經過 10 輪 audit-verify-fix 循環，共修復 37 項問題。

### Physical Layer Fidelity (Phases A-F)

| Fix | 內容 | 檔案 |
|-----|------|------|
| Phase A | 雨衰 (ITU-R P.618) + 大氣吸收 (ITU-R P.676) + shadow fading + `computeCellCapacityMap()` | `channelModel.ts` |
| Phase B | J2 RAAN 攝動 + 仰角率剩餘服務時間 | `constellation.ts` |
| Phase C | Per-cell 動態 SINR 取代固定 SNR=12dB | `wmisScheduler.ts`, `lyapunovOptimizer.ts`, `useLyapunovOptimizer.ts`, `baselineRunner.ts` |
| Phase D | 真實衛星間 3D 距離 off-axis angle + `computeChannelGain` ratio | `conflictGraph.ts` |
| Phase E | 物理 Eq.9 干擾模型取代 `I = -20 + load × 20` | `spectrumSharing.ts`, `baselineRunner.ts` |
| Phase F | MC WMIS trials 20 → 50 | `baselineRunner.ts` |

### Formula & Algorithm Fixes (Rounds 1-3, Fix #1 ~ #16)

| Fix | 內容 |
|-----|------|
| #1 | Proposed baselines 使用真實 Algorithm 1 & Algorithm 3 (BSSA) |
| #2 | v2 conflict graph (per-satellite vertices) 整合到主 pipeline |
| #3 | LyapunovHandoverManager Eq.32 handover penalty fallback `?? 0` |
| #4 | Fig.12 V parameter sweep 實作 (`vSweep.ts`) |
| #5 | Eq.26 drift: `Σ(D-Q)²` before queue update, V on drift not penalty |
| #6 | Eq.32 centering: `(x_{s,c} - 1/2) × Q_c/ΣQ` exact formula |
| #7 | Eq.35 vertex weight: `qEff = max(Q - servedData, 0)`, w = 2×cap×qEff |
| #8 | WMIS selection limit: removed hard B cap, uses `\|V_f\|` (multi-satellite K×B) |
| #9 | Baseline drift: `(D-Q)²` before update + V multiplier + virtual queue penalty |
| #10 | Fig.9 delay chart: `avgQueueLength / perCellRate` (Little's law) |
| #11 | Fig.10 SINR/INR CDF: Monte Carlo `runFig10CDFAnalysis()` |
| #12 | Fig.11 arrival rates: `[10.219, 10.608, 10.996, 11.385, 11.871]` + objective value chart |
| #13 | Group 1/3 baselines 使用 Algorithm 1 (per-group managers) |
| #14 | 3D visualization uses v2 conflict graph via `currentBeamDecision` |
| #15 | Satellites.tsx multi-satellite WMIS (filters by `satId` for v2 graph) |
| #16 | Sweep defaults 30 → 200 epochs |

### Architectural & Integration Fixes (Rounds 4-6, Fix #17 ~ #27)

| Fix | 內容 |
|-----|------|
| #17 | physConfig 傳入所有 `buildConflictGraph` calls (Eq.8 interference-based edges) |
| #18 | Eq.36 `W₂ - W_center` 取代 `bandwidth*(1-load)` |
| #19 | SS UI toggle wired: `spectrumSharingEnabled` → useLyapunovOptimizer |
| #20 | Constraint (16) time-proportion: `maxInterferenceRatio=0.1` |
| #21 | Group 3 (SS) conflict graph physConfig 補漏 |
| #22 | "Top 2 by service time" pre-filter in `entropyAssignment()` |
| #23 | Visual handover `update()`: highest-elevation satellite selection |
| #24 | Epoch handover → visual layer integration |
| #25 | Sweep epochs 200 → 2000, history limit 1000 → 10000 |
| #26 | Terrestrial model density: `terrestrialCellsPerBeam=100`, `checkConstraint16()` Monte Carlo |
| #27 | handoverCount per-epoch bug: object-reference tracking |

### Full Paper-Scale Fixes (Rounds 7-9, Fix #28 ~ #33)

| Fix | 內容 |
|-----|------|
| #28 | Group 2 `decide()` missing virtualQueues 4th arg |
| #29 | lyapunov 3D handover bypasses frame-based `update()` entirely |
| #29b | Epoch-driven satellite selection via `epochPrimarySatPosition` (3D position matching) |
| #30 | Sweep epochs 2000 → 20000 |
| #31 | `terrestrialCellsPerBeam` 100 → 1620 (paper: 32400/20) |
| #32 | UI labels "200 epochs" → "20000 epochs" |
| #33 | History limit 10000 → 20000 |

### Round 10 (Fix #34 ~ #37)

| Fix | 內容 |
|-----|------|
| #34 | Swap matching random adjust step (escape local optima) |
| #35 | Fig.7 baselines topology-change trigger (only re-assign on satellite visibility change) |
| #36 | vSweep Algorithm 3 (BSSA spectrum sharing) + Fig.12 full-buffer traffic model |
| #37 | `sceneToKmScale = 34.6 / (√3 × 80) ≈ 0.2497` (paper cell spacing 34.6 km) |

### Round 11 (Fix #38 ~ #41)

| Fix | 內容 |
|-----|------|
| #38 | Algorithm 1 Line 15: `detectTopologyChanges()` + `checkLine15Condition()` 完整實作 |
| #39 | Swap matching gated by Line 15 global condition |
| #40 | `checkLine15Condition` minLoad 只計算有分配的衛星（排除 unassigned satellites） |
| #41 | SS 移除 per-cell hard threshold，信任 BSSA `checkConstraint16()` proportional constraint |

### Round 12 (Fix #42 ~ #52)

| Fix | 內容 |
|-----|------|
| #42 | Fig.12 V sweep 關閉 spectrum sharing (`enableSpectrumSharing: false`) |
| #43 | Fig.10 CDF samples 5000 → 32400 |
| #44 | `selectGlobalTop2()` — 全域選 2 顆最長服務時間衛星（取代 per-cell top-2） |
| #45 | 資源利用率 Eq.(11) σ = numAssignedCells / (K×B)（取代 usedBeamSlots/(B×T)） |
| #46 | `checkLine15Condition` σ 使用所有可見衛星 K（非只服務的 top-2） |
| #47 | Constraint (16) per-cluster violation ≤ l_j（取代全域 α=0.1） |
| #48 | Fig.10 `terrUserDistKm` 0.5 → 1.0 |
| #49 | Fig.10 FSPL 修正 `32.4`(MHz) → `computeFSPL()` (92.45+, GHz)，修復 60 dB 誤差 |
| #50 | 移除 `maxInterferenceRatio` 死碼 |
| #51 | UI 文字 `5,000` → `32,400` Monte Carlo samples |
| #52 | `useEffect` 依賴擴展至所有 LyapunovConfig 欄位（參數熱更新） |

---

## Architecture

### Core Algorithm Files

```
src/features/beam-hopping/algorithms/
  ├── channelModel.ts      — Physical layer: path loss, rain/gas attenuation, antenna gain
  ├── constellation.ts     — Walker-Delta 30/40/1 with J2 RAAN perturbation
  ├── conflictGraph.ts     — v2 (satellite, cell, beam) conflict graph
  ├── wmisScheduler.ts     — WMIS beam hopping with per-cell capacity
  ├── lyapunovOptimizer.ts — Drift-plus-penalty framework (Eq. 26)
  ├── spectrumSharing.ts   — 4-stage BSSA (Eq. 38-39, Constraint 16)
  ├── baselineRunner.ts    — 3 groups × 4 baselines (Fig. 6-8)
  ├── vSweep.ts            — Fig. 10/11/12 parameter sweeps
  └── index.ts             — Exports
```

### Integration

```
useLyapunovOptimizer (hook)
  ├── Algorithm 1: LyapunovHandoverManager.decide()
  ├── Algorithm 2: solveWMIS() via conflictGraph
  ├── Algorithm 3: decideSpectrumSharing() + applySpectrumSharingGain()
  ├── Baselines: runBaselineEpoch() (3 groups × 4 each)
  └── Output → MainScene → Satellites (3D visualization)
```

### 3 Comparison Groups (Fig. 6-8)

| Group | B | Baselines | Config |
|-------|---|-----------|--------|
| 1: Beam Hopping (Fig.6) | 4 | Greedy BH, MOSEK+Greedy, Swap Match BH | σ₀=0.9, 6.52 Gbps |
| 2: Handover (Fig.7) | 8 | Load Balance, Entropy, Cell Clustering | σ₀=0.6, 10.57 Gbps |
| 3: Spectrum Sharing (Fig.8) | 8 | Greedy SS, GA, BWO | σ₀=0.6, 11.871 Gbps |

---

## Commercial Software Substitutions

| 論文工具 | 替代方案 | 說明 |
|---------|---------|------|
| **MOSEK** (convex solver) | Monte Carlo WMIS heuristic (50 trials) | MOSEK 需商業授權；MC heuristic 為啟發式近似，非 LP rounding |
| **STK** (satellite toolkit) | Walker-Delta 30/40/1 + J2 RAAN 產生器 | 使用論文 Table II 相同參數，物理近似一致（未逐點對位驗證 STK 輸出） |

## Remaining Trade-offs (not bugs)

1. **3D satellite matching**: Visual constellation (timeseries JSON) uses position-based matching to algorithmic constellation (Walker-Delta), not direct ID mapping
2. **`LyapunovHandoverManager.update()`**: Marked `@deprecated` — dead code for lyapunov mode, retained for other handover method interfaces
3. **32400 terrestrial cells**: Monte Carlo sampling (1620/beam), validated via stability analysis (`spectrumSharing.test.ts: sampling sensitivity`)
4. **z 決策缺 slot 維度**: BSSA 每 epoch 決策一次（非 per-slot），干擾條件在 epoch 內近似不變
5. **Terrestrial cluster 靜態**: 一次生成不逐 epoch 更新負載（論文描述逐 epoch 預測但細節不足以完整實作）
6. **Fig.10 幾何**: MC 抽樣近似，非顯式 32400 六邊形佈局

---

## 論文關鍵參數 (Table II)

| 參數 | 值 |
|---|---|
| 衛星軌道數 | 30 |
| 每軌道衛星數 | 40 |
| Cell 數量 | 20 (4x5) |
| Cell 間距 | 34.6 km |
| 極化數 | 2 |
| 軌道高度 | 550 km |
| 軌道傾角 | 53° |
| 最小仰角 | 35° |
| 每衛星波束數 | 4 (基礎) / 8 (進階) |
| Slot 數/epoch | 200 |
| Slot 時長 | 200 ms |
| 操作頻率 | 20 GHz (Ka band) |
| 衛星頻寬 | 200 MHz |
| 目標 SNR | 12 dB |
| 最大換手頻率 H̄ | 0.004 |
| Lyapunov V | 100 (default) |
| 地面 cell/beam | 1620 (=32400/20) |
| Simulation epochs | 20000 |

## Tests

153 tests across 8 files:

| File | Tests |
|------|-------|
| channelModel | 57 |
| conflictGraph | 21 |
| baselineRunner | 15 |
| lyapunovOptimizer | 14 |
| handoverManager | 12 |
| constellation | 12 |
| spectrumSharing | 12 |
| wmisScheduler | 10 |
