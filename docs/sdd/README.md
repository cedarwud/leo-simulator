# SDD (Software Design Documents)

Paper 4-1 復現計畫的系統設計文件索引。

**論文**: "Beam Management in Low Earth Orbit Satellite Communication With Handover Frequency Control and Satellite-Terrestrial Spectrum Sharing"
**來源**: IEEE Transactions on Communications, Vol. 73, No. 7, July 2025
**作者**: Jianfeng Zhu, Yaohua Sun, Mugen Peng

---

## Phase 總覽

| Phase | SDD | 內容 | 影響專案 | 狀態 |
|---|---|---|---|---|
| 0 | [SDD-00](./SDD-00-foundation.md) | 基礎框架：Time Slot 系統 + Data Queue 動態 | leo-simulator | 已撰寫 |
| 1 | [SDD-01](./SDD-01-conflict-graph.md) | Conflict Graph + WMIS Beam Hopping (Algorithm 2) | leo-simulator | 已撰寫 |
| 2 | [SDD-02](./SDD-02-handover-decision.md) | 條件觸發 + Swap Matching 換手 (Algorithm 1) | leo-simulator, orbit-engine | 已撰寫 |
| 3 | [SDD-03](./SDD-03-lyapunov-framework.md) | Lyapunov 優化框架整合 | leo-simulator | 已撰寫 |
| 4 | [SDD-04](./SDD-04-spectrum-sharing.md) | 星地頻譜共享 (Algorithm 3) | leo-simulator | 已撰寫 |
| 5 | [SDD-05](./SDD-05-sidebar-params.md) | 側邊欄參數面板 + 論文指標呈現 | leo-simulator | 已撰寫 |
| 6 | [SDD-06](./SDD-06-integration.md) | 三專案整合 + 大規模驗證 | 全部 | 已撰寫 |

## 依賴關係

```
Phase 0 (基礎框架)
  ├── Phase 1 (Beam Hopping)
  │     └── Phase 3 (Lyapunov 整合)
  ├── Phase 2 (換手決策)
  │     └── Phase 3 (Lyapunov 整合)
  └── Phase 5 (側邊欄)

Phase 3 (Lyapunov)
  └── Phase 4 (頻譜共享)

Phase 4 + Phase 5
  └── Phase 6 (整合驗證)
```

## 三專案角色

| 專案 | 角色 | 主要貢獻 |
|---|---|---|
| **leo-simulator** | 前端視覺化 + 演算法邏輯 | 所有 Phase 的主要實作 |
| **orbit-engine** | 軌道計算 + 信號數據 | 提供 1200 顆衛星的真實軌道數據 |
| **handover-rl** | 強化學習對照組 | Phase 6 中作為 baseline 對比 |

## 已完成的前置工作

- [x] 20 個六邊形 Earth-Fixed Cells (4x5)
- [x] 雙極化 A/B 視覺化
- [x] Beam → Cell 服務關係視覺化
- [x] Inter-beam interference 鄰近 Cell 干擾顯示
- [x] 統一場景整合 (beam-hopping + satellite-handover)
- [x] 三專案程式碼清理

## 論文關鍵參數 (Table II)

| 參數 | 值 |
|---|---|
| 衛星軌道數 | 30 |
| 每軌道衛星數 | 40 |
| Cell 數量 | 20 (4x5) |
| Cell 半徑 | 34.6 km |
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
