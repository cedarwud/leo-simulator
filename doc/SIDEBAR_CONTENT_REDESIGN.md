# 側邊欄內容重新設計 - 依換手方法客製化

## 🚨 發現的問題

### 當前設計缺陷

目前側邊欄對**所有換手方法顯示相同的內容**，但這**不符合各方法的實際運作邏輯**：

```
當前側邊欄（368px）
├── 星座選擇
├── 換手方法選擇
└── 性能指標（統一顯示）
    ├── 可見衛星統計
    ├── 當前連接（衛星ID、階段、仰角、距離）
    ├── 📊 RSRP/RSRQ/SINR 儀表板 ← ⚠️ 問題所在！
    ├── 換手次數、Ping-pong等
    └── 運行時間
```

### 問題分析

#### ❌ **Geometric 方法不應顯示 RSRP 儀表板**

**Geometric 決策邏輯**（`EnhancedHandoverManager.ts:358-360`）：
```typescript
const elevationFactor = Math.max(0, elevation / 90);      // 0-1
const distanceFactor = Math.max(0, 1 - (distance / 2000)); // 0-1
const signalQuality = elevationFactor * 0.7 + distanceFactor * 0.3;
```

**核心決策參數**：
- ✅ **仰角**（70% 權重）
- ✅ **距離**（30% 權重）
- ✅ **信號品質分數**（0-1，計算結果）

**不使用的參數**：
- ❌ RSRP（dBm）
- ❌ RSRQ（dB）
- ❌ SINR（dB）

**用戶困惑**：
> 看到 RSRP 儀表板會誤以為 Geometric 方法依賴 RSRP 進行決策

---

#### ❌ **RSRP 方法缺少關鍵資訊**

**RSRP 決策邏輯**（`RSRPHandoverManager.ts`）：
```typescript
// A4 事件：Mn + Offset > Threshold
if (neighborRSRP + offset > threshold) {
  // TTT 計時器開始
  if (tttCounter >= TTT_DURATION) {
    // 觸發換手
  }
}
```

**核心決策參數**：
- ✅ **RSRP**（鄰居衛星 RSRP 值）
- ✅ **A4 閾值**（-100 dBm）
- ✅ **Offset**（0 dBm）
- ✅ **TTT 時間**（10 秒）

**當前缺少的顯示**：
- ⚠️ **A4 事件觸發狀態**（右側有，但左側沒有摘要）
- ⚠️ **TTT 倒數計時器**（10 秒等待期間）
- ⚠️ **候選衛星 RSRP 值**（符合 A4 條件的衛星）

---

## 🎯 重新設計方案

### 設計原則

1. **各換手方法顯示自己的核心決策參數**
2. **不顯示不相關的指標**（避免混淆）
3. **突出可調整的參數**（用於實驗）
4. **共用基礎資訊**（星座、連接狀態、統計）

---

## 📐 Geometric 方法專屬側邊欄

### 佈局結構

```
┌─────────────────────────────────┐
│  衛星換手控制台                   │
├─────────────────────────────────┤
│  [共用] 星座選擇                  │
│  ◀ Starlink ▶                   │
├─────────────────────────────────┤
│  [共用] 換手方法                  │
│  ⚫ Geometric 幾何換手            │
│  ⚪ RSRP-Based A4 事件            │
│  ⚪ DQN-Based (開發中)            │
├─────────────────────────────────┤
│  🎯 決策參數可視化                │
│                                 │
│  當前連接: STARLINK-45061        │
│  階段: [穩定連接]                 │
│                                 │
│  ┌─────────────────────┐         │
│  │  仰角 ⭐70% 權重     │         │
│  │  [━━━●━━━━] 52.3°   │         │
│  │  ▲ 決策主要因素       │         │
│  └─────────────────────┘         │
│                                 │
│  ┌─────────────────────┐         │
│  │  距離 30% 權重       │         │
│  │  [━━━━━●━━] 847 km  │         │
│  │  ▲ 輔助因素          │         │
│  └─────────────────────┘         │
│                                 │
│  ┌─────────────────────┐         │
│  │  信號品質分數         │         │
│  │  [━━━━━━●━] 78%     │         │
│  │  ▲ 綜合評分          │         │
│  └─────────────────────┘         │
│                                 │
├─────────────────────────────────┤
│  ⚙️ 參數調整                     │
│                                 │
│  仰角權重 (主要因素)              │
│  [━━━━━●━━━━] 70%              │
│  └─ 影響：優先選擇高仰角衛星      │
│                                 │
│  觸發仰角 (開始換手)              │
│  [━━━━━●━━━━] 45°              │
│  └─ 影響：越大越早換手            │
│                                 │
│  冷卻時間 (防止頻繁換手)          │
│  [━━━━●━━━━━━] 5秒             │
│                                 │
│  換手速度                        │
│  ⚪ 快速  ⚫ 正常  ⚪ 慢速      │
│                                 │
│  候選數量                        │
│  [━━━━━●━━━━] 6顆              │
│                                 │
│  🔽 高級設定（展開）              │
│                                 │
│  [重置] [套用預設配置 ▼]         │
├─────────────────────────────────┤
│  [共用] 性能統計                  │
│                                 │
│  可見: 8  總數: 72  候選: 6      │
│                                 │
│  換手次數: 12                    │
│  Ping-pong: 2 (16%)             │
│  連接時長: 47 秒                 │
│  服務中斷: 0 次                  │
│                                 │
│  運行時間: 5:34                  │
└─────────────────────────────────┘
```

### 關鍵特性

#### 1. 決策參數可視化
```typescript
// 顯示當前決策因素
<DecisionFactorCard
  label="仰角"
  value={elevation}
  weight={0.7}
  unit="°"
  max={90}
  color="#00ff88"
  impact="決策主要因素"
/>

<DecisionFactorCard
  label="距離"
  value={distance}
  weight={0.3}
  unit="km"
  max={2000}
  color="#0088ff"
  impact="輔助因素"
/>

<SignalQualityScore
  value={signalQuality * 100} // 0-100%
  label="信號品質分數"
  description="基於仰角和距離的綜合評分"
/>
```

#### 2. 可調參數控制器
```typescript
<ParameterSlider
  label="仰角權重"
  value={elevationWeight}
  min={0.5}
  max={0.9}
  step={0.05}
  onChange={setElevationWeight}
  tooltip="決定優先選擇高仰角還是近距離衛星"
  impact="優先選擇高仰角衛星"
/>
```

#### 3. 不顯示的內容
- ❌ RSRP/RSRQ/SINR 儀表板
- ❌ A4 事件狀態
- ❌ TTT 計時器

---

## 📐 RSRP 方法專屬側邊欄

### 佈局結構

```
┌─────────────────────────────────┐
│  衛星換手控制台                   │
├─────────────────────────────────┤
│  [共用] 星座選擇                  │
│  ◀ Starlink ▶                   │
├─────────────────────────────────┤
│  [共用] 換手方法                  │
│  ⚪ Geometric 幾何換手            │
│  ⚫ RSRP-Based A4 事件            │
│  ⚪ DQN-Based (開發中)            │
├─────────────────────────────────┤
│  📡 信號品質監測                  │
│                                 │
│  當前連接: STARLINK-45061        │
│  階段: [穩定連接]                 │
│                                 │
│  幾何資訊                        │
│  仰角: 52.3°  距離: 847 km       │
│                                 │
│  ┌─ RSRP 儀表板 ─────┐           │
│  │   Current  Target │           │
│  │   [🔵--●--]  [⚪●]│           │
│  │   -78 dBm  -72 dBm│           │
│  │   ▲ 優秀   ▲ 優秀 │           │
│  └─────────────────────┘         │
│                                 │
│  ┌─ RSRQ 儀表板 ─────┐           │
│  │   Current  Target │           │
│  │   [🔵━●--]  [⚪●] │           │
│  │   -12 dB   -9 dB  │           │
│  │   ▲ 良好   ▲ 優秀 │           │
│  └─────────────────────┘         │
│                                 │
│  ┌─ SINR 儀表板 ─────┐           │
│  │   Current  Target │           │
│  │   [🔵━━●-]  [⚪●] │           │
│  │   18 dB    23 dB  │           │
│  │   ▲ 良好   ▲ 優秀 │           │
│  └─────────────────────┘         │
│                                 │
├─────────────────────────────────┤
│  🚦 A4 事件監測                  │
│                                 │
│  ┌─ A4 條件 ──────────┐          │
│  │ Mn + Offset > Threshold│      │
│  │ -72 + 0 > -100 ✅     │      │
│  │                       │      │
│  │ TTT 倒數: ⏱️ 7.2秒   │      │
│  │ [━━━━━━━--] 72%      │      │
│  └──────────────────────┘       │
│                                 │
│  候選衛星 (符合 A4)              │
│  ┌──────────────────────┐       │
│  │ STARLINK-45063  -72 dBm│     │
│  │ STARLINK-45064  -75 dBm│     │
│  │ STARLINK-45062  -78 dBm│     │
│  └──────────────────────┘       │
│                                 │
├─────────────────────────────────┤
│  ⚙️ A4 參數 (可選)               │
│                                 │
│  閾值 (Threshold)                │
│  [━━━━━●━━━━] -100 dBm         │
│                                 │
│  偏移 (Offset)                   │
│  [━━●━━━━━━━] 0 dB             │
│                                 │
│  TTT 時間                        │
│  [━━━━━●━━━━] 10 秒            │
│                                 │
├─────────────────────────────────┤
│  [共用] 性能統計                  │
│                                 │
│  可見: 8  總數: 72  候選: 3      │
│                                 │
│  換手次數: 8                     │
│  Ping-pong: 1 (12%)             │
│  連接時長: 68 秒                 │
│  服務中斷: 0 次                  │
│                                 │
│  運行時間: 5:34                  │
└─────────────────────────────────┘
```

### 關鍵特性

#### 1. RSRP/RSRQ/SINR 儀表板（雙指針）
```typescript
<DualSemiCircleGauge
  label="RSRP"
  currentValue={stats.averageRSRP}
  targetValue={stats.targetSatelliteRSRP}
  min={-100}
  max={-40}
  unit="dBm"
  zones={[
    { threshold: -100, color: '#ff0000', label: '極差' },
    { threshold: -80, color: '#ffaa00', label: '中等' },
    { threshold: -65, color: '#88ff00', label: '良好' },
    { threshold: -50, color: '#00ff88', label: '優秀' }
  ]}
/>
```

#### 2. A4 事件監測
```typescript
<A4EventMonitor
  neighborRSRP={-72}
  offset={0}
  threshold={-100}
  tttProgress={0.72} // 7.2s / 10s
  isTriggered={true}
/>
```

#### 3. TTT 倒數計時器
```typescript
<TTTCountdown
  elapsed={7.2}
  total={10}
  status="counting" // 'idle' | 'counting' | 'triggered'
/>
```

#### 4. 候選衛星 RSRP 清單
```typescript
<CandidateList
  candidates={[
    { id: 'STARLINK-45063', rsrp: -72, meetsA4: true },
    { id: 'STARLINK-45064', rsrp: -75, meetsA4: true },
    { id: 'STARLINK-45062', rsrp: -78, meetsA4: false }
  ]}
  threshold={-100}
/>
```

#### 5. 不顯示的內容
- ❌ 信號品質分數（0-100%）
- ❌ 仰角/距離權重配比
- ❌ 可調參數滑桿（Geometric專屬）

---

## 📊 共用內容（兩種方法都顯示）

### 1. 星座選擇
```typescript
<ConstellationSelector
  current="starlink"
  options={['starlink', 'oneweb']}
  onChange={setConstellation}
/>
```

### 2. 換手方法選擇
```typescript
<MethodSelector
  current="geometric"
  methods={['geometric', 'rsrp', 'dqn']}
  onChange={setMethod}
/>
```

### 3. 當前連接基本資訊
```typescript
<CurrentConnection
  satelliteId="STARLINK-45061"
  phase="stable"
  phaseLabel="穩定連接"
  phaseColor="#00ff88"
/>
```

### 4. 幾何資訊（輔助參考）
```typescript
<GeometricInfo
  elevation={52.3}
  distance={847}
/>
```

### 5. 性能統計
```typescript
<PerformanceStats
  visibleSatellites={8}
  totalSatellites={72}
  candidateCount={6}
  totalHandovers={12}
  pingPongEvents={2}
  connectionDuration={47}
  serviceInterruptions={0}
  elapsedTime={334}
/>
```

---

## 🔄 實現建議

### 方案 A：條件渲染（推薦）

```typescript
// Sidebar.tsx
export function Sidebar({ currentMethod, stats, ... }) {
  return (
    <div className="sidebar">
      {/* 共用內容 */}
      <ConstellationSelector />
      <MethodSelector />
      <CurrentConnection />

      {/* 方法專屬內容 */}
      {currentMethod === 'geometric' && (
        <GeometricMethodPanel
          stats={stats}
          onParamChange={handleGeometricParamChange}
        />
      )}

      {currentMethod === 'rsrp' && (
        <RSRPMethodPanel
          stats={stats}
          a4Event={stats.a4Event}
          onParamChange={handleRSRPParamChange}
        />
      )}

      {currentMethod === 'dqn' && (
        <DQNMethodPanel stats={stats} />
      )}

      {/* 共用內容 */}
      <PerformanceStats stats={stats} />
    </div>
  );
}
```

### 方案 B：分離組件

```
src/components/ui/
├── Sidebar.tsx (主容器)
├── sidebar/
│   ├── GeometricMethodPanel.tsx
│   ├── RSRPMethodPanel.tsx
│   ├── DQNMethodPanel.tsx
│   ├── ConstellationSelector.tsx
│   ├── MethodSelector.tsx
│   ├── CurrentConnection.tsx
│   └── PerformanceStats.tsx
└── ...
```

---

## 📋 需要新增的組件

### Geometric 專屬組件

1. **DecisionFactorCard** - 決策因素卡片
   ```typescript
   interface DecisionFactorCardProps {
     label: string;
     value: number;
     weight: number;
     unit: string;
     max: number;
     color: string;
     impact: string;
   }
   ```

2. **SignalQualityScore** - 信號品質分數
   ```typescript
   interface SignalQualityScoreProps {
     value: number; // 0-100
     label: string;
     description: string;
   }
   ```

3. **ParameterSlider** - 參數滑桿
   ```typescript
   interface ParameterSliderProps {
     label: string;
     value: number;
     min: number;
     max: number;
     step: number;
     onChange: (value: number) => void;
     tooltip: string;
     impact: string;
   }
   ```

### RSRP 專屬組件

1. **A4EventMonitor** - A4 事件監測器
   ```typescript
   interface A4EventMonitorProps {
     neighborRSRP: number;
     offset: number;
     threshold: number;
     tttProgress: number; // 0-1
     isTriggered: boolean;
   }
   ```

2. **TTTCountdown** - TTT 倒數計時器
   ```typescript
   interface TTTCountdownProps {
     elapsed: number;
     total: number;
     status: 'idle' | 'counting' | 'triggered';
   }
   ```

3. **CandidateList** - 候選衛星清單
   ```typescript
   interface CandidateListProps {
     candidates: Array<{
       id: string;
       rsrp: number;
       meetsA4: boolean;
     }>;
     threshold: number;
   }
   ```

---

## 🎨 視覺設計原則

### 1. 顏色編碼

| 元素 | Geometric | RSRP |
|-----|-----------|------|
| 主題色 | `#00ff88` (綠) | `#0088ff` (藍) |
| 仰角 | `#00ff88` | `#cccccc` (輔助) |
| 距離 | `#0088ff` | `#cccccc` (輔助) |
| 分數 | `#ffaa00` (橙) | - |
| RSRP | - | `#0088ff` |

### 2. 視覺層級

```
高優先級（大字體、高對比）
  ↓ Geometric: 仰角、分數
  ↓ RSRP: RSRP 儀表板、A4 狀態

中優先級（中字體、中對比）
  ↓ 距離、候選衛星

低優先級（小字體、低對比）
  ↓ 統計資訊、運行時間
```

### 3. 空間配置

```
Geometric 側邊欄空間分配：
- 共用內容: 30%
- 決策參數可視化: 25%
- 參數調整: 30%
- 性能統計: 15%

RSRP 側邊欄空間分配：
- 共用內容: 25%
- RSRP/RSRQ/SINR 儀表板: 35%
- A4 事件監測: 20%
- 性能統計: 20%
```

---

## ✅ 實作檢查清單

### Phase 1: 分析與設計（當前）
- [x] 分析兩種方法的核心差異
- [x] 識別不應共用的內容
- [x] 設計各方法專屬的側邊欄佈局
- [ ] **用戶確認設計方案** ← 當前步驟

### Phase 2: 重構 Sidebar
- [ ] 拆分 Sidebar.tsx 為多個組件
- [ ] 實現條件渲染邏輯
- [ ] 創建 Geometric 專屬組件
- [ ] 創建 RSRP 專屬組件

### Phase 3: 新增 Geometric 功能
- [ ] 實現決策參數可視化
- [ ] 實現信號品質分數顯示
- [ ] 實現參數調整滑桿
- [ ] 連接參數到 EnhancedHandoverManager

### Phase 4: 增強 RSRP 功能
- [ ] 實現 A4 事件監測器
- [ ] 實現 TTT 倒數計時器
- [ ] 實現候選衛星 RSRP 清單
- [ ] 添加 A4 參數調整（可選）

### Phase 5: 測試與優化
- [ ] 測試兩種方法的側邊欄切換
- [ ] 驗證數據顯示的正確性
- [ ] 優化視覺效果和動畫
- [ ] 更新使用者文檔

---

## 📖 更新相關文檔

需要同步更新：
1. `/doc/USER_GUIDE.md` - 更新側邊欄介面說明
2. `/doc/ADJUSTABLE_PARAMETERS_RECOMMENDATION.md` - 明確指出 Geometric 專屬
3. 新增：`/doc/RSRP_METHOD_PARAMETERS.md` - RSRP 方法的參數說明

---

## 🎯 總結

### 核心改變

1. **Geometric 方法**：
   - ✅ 顯示仰角、距離、信號品質分數
   - ✅ 提供參數調整滑桿
   - ❌ 移除 RSRP/RSRQ/SINR 儀表板

2. **RSRP 方法**：
   - ✅ 保留 RSRP/RSRQ/SINR 儀表板
   - ✅ 新增 A4 事件監測和 TTT 倒數
   - ✅ 新增候選衛星 RSRP 清單
   - ❌ 不顯示參數調整滑桿（或僅顯示 A4 參數）

### 預期效果

- 🎯 **清晰的決策邏輯**：用戶看到的就是方法實際使用的參數
- 🎨 **更好的視覺層級**：重要參數突出顯示
- ⚙️ **更直觀的控制**：只顯示可調整的相關參數
- 📚 **更好的教學效果**：展示兩種方法的本質差異

---

**版本**: 1.0.0
**日期**: 2025-12-04
**狀態**: ⏸️ 待用戶確認設計方案
