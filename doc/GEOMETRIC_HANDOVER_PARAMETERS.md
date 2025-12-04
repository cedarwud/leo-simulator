# 幾何換手方法 - 完整參數分析

## 📋 目錄

1. [核心決策參數](#核心決策參數)
2. [觸發閾值參數](#觸發閾值參數)
3. [時間控制參數](#時間控制參數)
4. [候選選擇參數](#候選選擇參數)
5. [歸一化參數](#歸一化參數)
6. [視覺動畫參數](#視覺動畫參數)
7. [參數調優建議](#參數調優建議)

---

## 1. 核心決策參數

### 1.1 信號品質計算權重 ⭐⭐⭐⭐⭐

**位置**: `EnhancedHandoverManager.ts:358-360`

```typescript
const elevationFactor = Math.max(0, elevation / 90);
const distanceFactor = Math.max(0, 1 - (distance / 2000));
const signalQuality = elevationFactor * 0.7 + distanceFactor * 0.3;
```

**當前值**：
- `ELEVATION_WEIGHT = 0.7` (70%)
- `DISTANCE_WEIGHT = 0.3` (30%)

**影響**：
- ✅ **最關鍵參數**：直接決定候選衛星排序
- ✅ 影響換手頻率和穩定性
- ✅ 影響服務品質

**調整建議**：

| 場景 | 仰角權重 | 距離權重 | 特點 |
|-----|---------|---------|------|
| **城市環境** | 0.8 | 0.2 | 避免低仰角（多遮蔽） |
| **開闊環境** | 0.5 | 0.5 | 平衡考慮 |
| **快速移動用戶** | 0.7 | 0.3 | 當前值（平衡） |
| **靜態用戶** | 0.6 | 0.4 | 可考慮距離 |

---

## 2. 觸發閾值參數

### 2.1 仰角觸發閾值 ⭐⭐⭐⭐

**位置**: `EnhancedHandoverManager.ts:32-34`

```typescript
private readonly TRIGGER_ELEVATION = 45;      // 開始尋找候選（度）
private readonly PREPARING_ELEVATION = 30;    // 進入準備階段（度）
private readonly EXECUTE_ELEVATION = 20;      // 執行換手（度）
```

**當前值**：
- `TRIGGER_ELEVATION = 45°` - 開始準備
- `PREPARING_ELEVATION = 30°` - 顯示候選
- `EXECUTE_ELEVATION = 20°` - 強制執行

**影響**：
- ✅ 換手開始時機
- ✅ 用戶體驗（提早準備避免突然中斷）
- ✅ 換手頻率

**物理意義**：
```
90°（天頂）
│
├─ 60° ← 信號最佳區域
├─ 45° ← TRIGGER (當前設定：開始尋找)
├─ 30° ← PREPARING (當前設定：準備階段)
├─ 20° ← EXECUTE (當前設定：必須換手)
├─ 15° ← 一般認為的最低服務仰角
├─ 10° ← 最低可見仰角
│
0°（地平線）
```

**調整建議**：

| 場景 | TRIGGER | PREPARING | EXECUTE | 原因 |
|-----|---------|-----------|---------|------|
| **當前設定** | 45° | 30° | 20° | 平衡設定 |
| **保守策略** | 60° | 45° | 30° | 提早換手，減少風險 |
| **激進策略** | 30° | 20° | 15° | 減少換手次數 |
| **標準建議** | 50° | 35° | 25° | 符合一般經驗 |

**學術參考**：
- 3GPP 建議最低仰角：10-15°
- 多數論文使用：15-20° 作為換手觸發點
- 本實現提前到 45° 是為了**展示完整的多階段換手過程**

---

### 2.2 換手冷卻時間 ⭐⭐⭐

**位置**: `EnhancedHandoverManager.ts:35`

```typescript
private readonly HANDOVER_COOLDOWN = 5;  // 換手冷卻（秒）
```

**當前值**：5 秒

**影響**：
- ✅ 防止 Ping-Pong 換手（短時間來回切換）
- ✅ 減少信令開銷
- ✅ 提升穩定性

**調整建議**：

| 值 | 適用場景 | 優點 | 缺點 |
|----|---------|------|------|
| **3s** | 快速移動場景 | 反應靈敏 | 可能頻繁換手 |
| **5s** | 一般場景（當前） | 平衡 | - |
| **10s** | 穩定優先 | 減少換手次數 | 反應較慢 |
| **12s** | 與 RSRP 方法對齊 | 一致性 | 可能錯過最佳時機 |

**學術參考**：
- He et al. (2020): 未明確說明，但從結果推測約 5-10 秒
- 3GPP A4 事件：通常搭配 10 秒 TTT（Time-to-Trigger）

---

## 3. 時間控制參數

### 3.1 各階段持續時間 ⭐⭐⭐

**位置**: `EnhancedHandoverManager.ts:38-44`

```typescript
private readonly PHASE_DURATIONS = {
  preparing: 12,     // 準備階段 12 秒
  selecting: 10,     // 選擇階段 10 秒
  establishing: 12,  // 建立階段 12 秒
  switching: 12,     // 切換階段 12 秒
  completing: 4      // 完成階段 4 秒
};
```

**當前值**：總計 50 秒換手過程

**影響**：
- ✅ **主要用於視覺展示**
- ✅ 不影響換手決策邏輯
- ✅ 影響用戶體驗觀察

**調整建議**：

#### 場景 1: 快速展示模式
```typescript
PHASE_DURATIONS = {
  preparing: 3,      // 3 秒
  selecting: 2,      // 2 秒
  establishing: 3,   // 3 秒
  switching: 3,      // 3 秒
  completing: 1      // 1 秒
};
// 總計: 12 秒
```

#### 場景 2: 詳細展示模式（當前）
```typescript
PHASE_DURATIONS = {
  preparing: 12,     // 12 秒
  selecting: 10,     // 10 秒
  establishing: 12,  // 12 秒
  switching: 12,     // 12 秒
  completing: 4      // 4 秒
};
// 總計: 50 秒
```

#### 場景 3: 真實模擬模式
```typescript
PHASE_DURATIONS = {
  preparing: 1,      // 1 秒（測量）
  selecting: 0.5,    // 0.5 秒（決策）
  establishing: 2,   // 2 秒（建立連接）
  switching: 1,      // 1 秒（切換）
  completing: 0.5    // 0.5 秒（確認）
};
// 總計: 5 秒
```

**學術參考**：
- 真實 LEO 換手通常需要 **1-5 秒**
- 包含：測量報告、決策、執行、確認
- 本實現延長是為了**清楚展示視覺動畫**

---

## 4. 候選選擇參數

### 4.1 候選衛星數量 ⭐⭐

**位置**: `EnhancedHandoverManager.ts:127, 236`

```typescript
const candidates = metrics
  .filter(m => m.satelliteId !== this.currentState.currentSatelliteId)
  .sort((a, b) => b.signalQuality - a.signalQuality)
  .slice(0, 6)  // 前 6 名候選
  .map(m => m.satelliteId);
```

**當前值**：6 顆候選衛星

**影響**：
- ✅ 視覺豐富度（更多虛線）
- ✅ 計算開銷
- ⚠️ 對換手決策影響較小（只選最佳）

**調整建議**：

| 候選數 | 適用場景 | 優點 | 缺點 |
|-------|---------|------|------|
| **3** | 資源受限 | 計算快速 | 視覺較簡單 |
| **6** | 展示模式（當前） | 視覺豐富 | - |
| **10** | 詳細分析 | 完整資訊 | 可能雜亂 |

**實際意義**：
- 在實際 LEO 場景中，通常同時可見 **3-8 顆衛星**
- 過多候選意義不大（只會選最佳）
- 主要影響**右側 A4 面板的顯示豐富度**

---

## 5. 歸一化參數

### 5.1 最大距離參數 ⭐⭐⭐

**位置**: `EnhancedHandoverManager.ts:359`

```typescript
const distanceFactor = Math.max(0, 1 - (distance / 2000));
```

**當前值**：`MAX_DISTANCE = 2000 km`

**影響**：
- ✅ 距離因子的歸一化範圍
- ✅ 影響距離權重的實際效果

**物理意義**：

```
LEO 衛星高度：500-1500 km
地球半徑：6371 km

幾何關係：
- 最近距離（天頂）：~550 km（衛星高度）
- 最遠可見距離：~2000 km（低仰角 10°）
```

**調整建議**：

| 值 | 適用場景 | 說明 |
|----|---------|------|
| **1500** | 保守估計 | 僅考慮高仰角場景 |
| **2000** | 標準設定（當前） | 覆蓋大部分可見範圍 |
| **2500** | 寬鬆設定 | 考慮極低仰角 |

**計算公式**：
```typescript
// 給定衛星高度 h 和最低仰角 θ_min
const earthRadius = 6371; // km
const satelliteHeight = 550; // km
const minElevation = 10; // degrees

const maxDistance = Math.sqrt(
  Math.pow(earthRadius + satelliteHeight, 2) -
  Math.pow(earthRadius * Math.cos(minElevation * Math.PI / 180), 2)
) - earthRadius * Math.sin(minElevation * Math.PI / 180);

// 對於 h=550km, θ=10°: maxDistance ≈ 2015 km
```

---

### 5.2 最大仰角參數 ⭐⭐

**位置**: `EnhancedHandoverManager.ts:358`

```typescript
const elevationFactor = Math.max(0, elevation / 90);
```

**當前值**：`MAX_ELEVATION = 90°`（天頂）

**影響**：
- ✅ 仰角因子的歸一化範圍
- ⚠️ 通常不需要調整（90° 是物理上限）

**說明**：
- 90° 是天頂方向，物理上限
- 實際很少達到 90°（衛星運動）
- 此參數通常**不建議修改**

---

## 6. 視覺動畫參數

### 6.1 信號強度變化曲線 ⭐

**位置**: 各階段更新函數

```typescript
// Preparing 階段 (line 134)
this.currentState.signalStrength.current = 1.0 - (this.currentState.progress * 0.2);

// Selecting 階段 (lines 157, 160)
this.currentState.signalStrength.target = this.currentState.progress * 0.3;
this.currentState.signalStrength.current = 0.8 - (this.currentState.progress * 0.1);

// Establishing 階段 (lines 176, 179)
this.currentState.signalStrength.target = 0.3 + (this.currentState.progress * 0.3);
this.currentState.signalStrength.current = 0.7 - (this.currentState.progress * 0.3);

// Switching 階段 (lines 198-199)
this.currentState.signalStrength.current = 0.4 * (1 - this.currentState.progress);
this.currentState.signalStrength.target = 0.6 + (this.currentState.progress * 0.4);

// Completing 階段 (line 215)
this.currentState.signalStrength.target = 0.9 + (this.currentState.progress * 0.1);
```

**影響**：
- ✅ **純視覺效果**
- ✅ 線條的透明度和粗細
- ⚠️ 不影響換手決策

**調整說明**：
- 這些參數控制換手過程中連線的視覺變化
- 可根據美觀需求調整
- 不影響實際換手邏輯

---

## 7. 參數調優建議

### 7.1 參數重要性排序

| 優先級 | 參數 | 影響範圍 | 調整難度 |
|-------|------|---------|---------|
| ⭐⭐⭐⭐⭐ | **信號品質權重** (0.7/0.3) | 換手決策 | 簡單 |
| ⭐⭐⭐⭐ | **仰角觸發閾值** (45°/30°/20°) | 換手時機 | 中等 |
| ⭐⭐⭐ | **換手冷卻時間** (5s) | 穩定性 | 簡單 |
| ⭐⭐⭐ | **最大距離歸一化** (2000km) | 距離因子 | 簡單 |
| ⭐⭐ | **候選衛星數量** (6) | 視覺 | 簡單 |
| ⭐ | **階段持續時間** (50s total) | 視覺動畫 | 簡單 |
| ⭐ | **信號強度曲線** | 視覺動畫 | 複雜 |

---

### 7.2 場景化配置建議

#### 場景 1: 學術研究模式（符合論文）

```typescript
// 核心參數
ELEVATION_WEIGHT = 0.7;
DISTANCE_WEIGHT = 0.3;

// 觸發閾值（保守）
TRIGGER_ELEVATION = 50;
PREPARING_ELEVATION = 35;
EXECUTE_ELEVATION = 25;

// 冷卻時間（與 RSRP 對齊）
HANDOVER_COOLDOWN = 12;

// 階段時間（快速）
PHASE_DURATIONS = {
  preparing: 2,
  selecting: 1,
  establishing: 2,
  switching: 2,
  completing: 1
}; // Total: 8s

// 候選數量
MAX_CANDIDATES = 3;

// 歸一化
MAX_DISTANCE = 2000;
```

#### 場景 2: 教學展示模式（當前設定）

```typescript
// 核心參數
ELEVATION_WEIGHT = 0.7;
DISTANCE_WEIGHT = 0.3;

// 觸發閾值（提早觸發以展示）
TRIGGER_ELEVATION = 45;
PREPARING_ELEVATION = 30;
EXECUTE_ELEVATION = 20;

// 冷卻時間（適中）
HANDOVER_COOLDOWN = 5;

// 階段時間（延長以清楚展示）
PHASE_DURATIONS = {
  preparing: 12,
  selecting: 10,
  establishing: 12,
  switching: 12,
  completing: 4
}; // Total: 50s

// 候選數量（展示豐富）
MAX_CANDIDATES = 6;

// 歸一化
MAX_DISTANCE = 2000;
```

#### 場景 3: 實際應用模式

```typescript
// 核心參數（可根據環境調整）
ELEVATION_WEIGHT = 0.8;  // 城市環境
DISTANCE_WEIGHT = 0.2;

// 觸發閾值（標準）
TRIGGER_ELEVATION = 40;
PREPARING_ELEVATION = 30;
EXECUTE_ELEVATION = 20;

// 冷卻時間（防 Ping-Pong）
HANDOVER_COOLDOWN = 10;

// 階段時間（真實）
PHASE_DURATIONS = {
  preparing: 1,
  selecting: 0.5,
  establishing: 2,
  switching: 1,
  completing: 0.5
}; // Total: 5s

// 候選數量（實用）
MAX_CANDIDATES = 3;

// 歸一化
MAX_DISTANCE = 2000;
```

---

### 7.3 可配置化建議

建議將這些參數提取為配置對象：

```typescript
interface GeometricHandoverConfig {
  // 核心決策
  weights: {
    elevation: number;  // 0-1
    distance: number;   // 0-1
  };

  // 觸發閾值
  triggers: {
    trigger: number;    // 度
    preparing: number;  // 度
    execute: number;    // 度
  };

  // 時間控制
  timing: {
    cooldown: number;   // 秒
    phases: {
      preparing: number;
      selecting: number;
      establishing: number;
      switching: number;
      completing: number;
    };
  };

  // 候選選擇
  candidates: {
    maxCount: number;
  };

  // 歸一化
  normalization: {
    maxDistance: number;  // km
    maxElevation: number; // 度（通常固定 90）
  };
}

// 預設配置
const GEOMETRIC_CONFIG_PRESETS = {
  research: { /* 學術研究模式 */ },
  demo: { /* 教學展示模式 */ },
  production: { /* 實際應用模式 */ }
};
```

---

## 8. 參數調整的實驗建議

### 8.1 單因素實驗

**目標**：理解每個參數的獨立影響

| 實驗 | 調整參數 | 觀察指標 |
|-----|---------|---------|
| Exp 1 | elevation_weight: 0.5, 0.6, 0.7, 0.8, 0.9 | 換手次數、Ping-Pong 率 |
| Exp 2 | TRIGGER_ELEVATION: 30°, 40°, 50°, 60° | 換手時機、服務品質 |
| Exp 3 | HANDOVER_COOLDOWN: 3s, 5s, 10s, 15s | Ping-Pong 率、反應速度 |
| Exp 4 | MAX_DISTANCE: 1500, 2000, 2500 km | 距離因子影響 |

### 8.2 多因素實驗

**目標**：找到最佳參數組合

使用網格搜索（Grid Search）：

```python
# 偽代碼
for elevation_weight in [0.6, 0.7, 0.8]:
    for trigger_elevation in [40, 45, 50]:
        for cooldown in [5, 10, 12]:
            # 運行模擬
            # 記錄結果
            # 計算性能指標
```

**評估指標**：
1. 平均換手次數（越少越好）
2. Ping-Pong 率（越低越好）
3. 平均連接時長（越長越好）
4. 服務中斷次數（越少越好）

---

## 9. 與 RSRP-Based 方法的參數對比

| 參數類別 | Geometric 方法 | RSRP-Based (A4) 方法 |
|---------|---------------|---------------------|
| **決策依據** | 仰角 70% + 距離 30% | RSRP（基於路徑損耗模型） |
| **觸發機制** | 仰角閾值 (45°) | A4 絕對閾值 (-100 dBm) |
| **Time-to-Trigger** | 無（立即觸發） | 10 秒 TTT |
| **冷卻時間** | 5 秒 | 12 秒 |
| **候選選擇** | 信號品質排序 | RSRP 排序 + 衛星編號 |
| **階段數** | 6 個階段（視覺展示） | 6 個階段（相同） |
| **學術依據** | He et al. (2020) GBW | 3GPP TS 38.214 + Yu et al. (2022) |

---

## 總結

### 可調整參數總數：**14 個**

1. ⭐⭐⭐⭐⭐ **ELEVATION_WEIGHT** (0.7)
2. ⭐⭐⭐⭐⭐ **DISTANCE_WEIGHT** (0.3)
3. ⭐⭐⭐⭐ **TRIGGER_ELEVATION** (45°)
4. ⭐⭐⭐⭐ **PREPARING_ELEVATION** (30°)
5. ⭐⭐⭐⭐ **EXECUTE_ELEVATION** (20°)
6. ⭐⭐⭐ **HANDOVER_COOLDOWN** (5s)
7. ⭐⭐⭐ **MAX_DISTANCE** (2000km)
8. ⭐⭐ **MAX_CANDIDATES** (6)
9. ⭐⭐ **MAX_ELEVATION** (90°)
10. ⭐ **PHASE_DURATIONS.preparing** (12s)
11. ⭐ **PHASE_DURATIONS.selecting** (10s)
12. ⭐ **PHASE_DURATIONS.establishing** (12s)
13. ⭐ **PHASE_DURATIONS.switching** (12s)
14. ⭐ **PHASE_DURATIONS.completing** (4s)

### 核心參數（影響換手決策）：**7 個**

最值得調整的參數：
1. 信號品質權重 (0.7/0.3)
2. 三個仰角閾值 (45°/30°/20°)
3. 換手冷卻時間 (5s)
4. 最大距離歸一化 (2000km)
5. 候選衛星數量 (6)

### 視覺參數（不影響決策）：**7 個**

主要用於展示：
- 5 個階段持續時間
- 信號強度變化曲線參數（不計入總數，因為是多個小參數）

---

**建議**：
- 從**權重配比**開始調整（影響最大）
- 再調整**仰角閾值**（影響觸發時機）
- 最後微調**冷卻時間**和**候選數量**
- 視覺參數根據展示需求調整即可

---

**文檔版本**: 1.0.0
**最後更新**: 2025-12-04
**作者**: LEO Satellite Handover Research Team
