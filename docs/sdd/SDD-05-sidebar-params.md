# SDD-05: 側邊欄參數面板 + 論文指標呈現

## 1. 目的

將 Lyapunov 的所有可調參數整合到側邊欄，並即時顯示論文中的關鍵指標。

## 2. 設計內容

### 2.1 參數面板

**星座配置**:
- 衛星數量（預設 1200）
- 軌道數（預設 30）
- 軌道高度（預設 550 km）
- 軌道傾角（預設 53°）

**Beam 配置**:
- 每衛星波束數（4/8 切換）
- 極化數（固定 2）
- 目標 SNR（預設 12 dB）

**時間配置**:
- Slots per epoch（預設 200）
- Slot 時長（預設 200ms）
- 播放速度（1x/5x/10x/暫停/逐步）

**Lyapunov 參數**:
- V 值（預設 100，可調整觀察 trade-off）
- H̄ 門檻（預設 0.004）
- σ₀ 門檻（預設 0.6/0.9）

**流量設定**:
- 選擇 Table III 的需求分佈
- 或自訂每個 cell 的到達率

### 2.2 即時指標面板

| 指標 | 來源 | 更新頻率 |
|---|---|---|
| 平均 Queue 長度 | 所有 cells 的 Q_c 平均 | 每 epoch |
| 換手頻率 | 累計換手次數 / epoch 數 | 每 epoch |
| 平均延遲 | avg(Q_c) / 傳輸速率 | 每 epoch |
| 資源利用率 σ | 使用 beam 數 / 總 beam 數 | 每 slot |
| 當前 Epoch / Slot | SimulationClock | 即時 |

### 2.3 圖表

- Queue 長度隨時間變化（對比 Fig. 6b, 7b, 8b）
- 換手頻率隨時間變化（對比 Fig. 6c, 7c, 8c）
- 平均延遲（對比 Fig. 9）

## 3. 影響的檔案

| 檔案 | 變更 |
|---|---|
| `src/components/ui/sidebar/LyapunovParamsPanel.tsx` | 新建：參數面板 |
| `src/components/ui/sidebar/LyapunovMetricsPanel.tsx` | 新建：指標面板 |
| `src/components/ui/Sidebar.tsx` | 修改：整合新面板 |

## 4. 前置需求

- SDD-00 (基礎框架提供資料來源)

## 5. 驗證標準

- [ ] 所有參數可即時調整且生效
- [ ] 指標與論文 Fig. 6-9 趨勢一致
