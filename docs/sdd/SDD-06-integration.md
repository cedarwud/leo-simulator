# SDD-06: 三專案整合 + 大規模驗證

## 1. 目的

整合 leo-simulator、orbit-engine、handover-rl 三個專案，用真實軌道數據執行完整的 Lyapunov 模擬，並與 RL baseline 對比。

## 2. 設計內容

### 2.1 orbit-engine 整合

**需要 orbit-engine 提供**:
- 1200 顆衛星 (30 orbits × 40 sats) 的 TLE 數據或星曆
- 每個 epoch 每顆衛星對 20 個 cell 的仰角、距離、可見性
- 信號品質（RSRP, SNR, path loss）

**整合方式**:
- orbit-engine 預算算好所有衛星在模擬時段內的軌道數據
- 輸出 JSON 格式供 leo-simulator 載入
- 或透過 API 即時查詢

### 2.2 handover-rl 整合

**角色**: 作為 baseline 對照組

| 方法 | 來源 | 決策方式 |
|---|---|---|
| Lyapunov | 本專案 | Lyapunov + 條件觸發 + swap matching |
| DQN | handover-rl | 深度 Q 學習 |
| Max RSRP | handover-rl baselines | 選最強信號 |
| Max Elevation | handover-rl baselines | 選最高仰角 |
| Load Balance | 論文 baseline | 選最低負載衛星 |

**對比指標**:
- 平均 queue 長度
- 換手頻率
- 平均延遲
- 連線穩定性

### 2.3 大規模模擬

- 模擬時長：66.67 分鐘（論文設定，20000 epochs）
- 記錄所有 epoch 的指標
- 輸出結果供後續分析

### 2.4 資料庫整合（未來）

完成驗證後，將參數和結果存入 PostgreSQL：
- 模擬配置（constellation, params）
- 模擬結果（metrics per epoch）
- 對比報告

## 3. 影響的檔案

| 檔案 | 變更 | 專案 |
|---|---|---|
| 軌道數據生成 script | 新建：生成 1200 顆衛星數據 | orbit-engine |
| API adapter | 新建/修改：查詢介面 | orbit-engine |
| 對比評估器 | 新建：多方法對比 | leo-simulator |
| 結果視覺化 | 新建：圖表對比 | leo-simulator |

## 4. 前置需求

- SDD-00 ~ SDD-05 全部完成

## 5. 驗證標準

- [ ] 1200 顆衛星數據正確載入
- [ ] 20000 epochs 模擬完成無崩潰
- [ ] Lyapunov 結果與論文 Fig. 6-9 趨勢一致
- [ ] DQN baseline 可正常運行並對比
- [ ] 結果可匯出為報告格式
