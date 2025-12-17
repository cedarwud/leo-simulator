# 🔋 LEO Satellite Handover 節能效果展示方案

## 📋 現狀分析

### ❌ **目前缺失的功能**

1. **無能耗追踪機制**
   - `HandoverStats` 接口中沒有能耗相關欄位
   - 沒有計算換手能量成本的邏輯
   - UI 沒有顯示能耗指標

2. **無節能對比功能**
   - 三種換手方法（Geometric、RSRP、DQN）沒有能耗對比
   - 無法直觀展示節能效果

3. **DQN 方法未實現能量感知**
   - 目前標記為 "under development"
   - 缺少 Energy-Aware Reward Function

---

## 📚 **論文核心思想**（Ntabeni et al., 2025）

### **Energy-Aware Q-Learning 方法**

#### **Reward Function**：
```python
r = signal_quality - λ * E_handover
```

其中：
- `signal_quality`：當前衛星的信號品質（RSRP、仰角等）
- `E_handover`：每次換手的能量成本（論文設定為 **3 Joules**）
- `λ`：能量懲罰權重（論文建議 **0.2**）

#### **關鍵洞察**：
- **傳統方法**：只追求信號品質，導致頻繁換手
- **節能方法**：在 Reward 中加入能量懲罰，減少不必要的換手

---

## 📊 **論文的節能效果**（模擬 3000 秒）

| 指標 | Energy-Aware Q-Learning | 傳統 Q-Learning | Predictive | Entropy-Based |
|------|-------------------------|----------------|-----------|--------------|
| **累積能耗** | **4.5 J** | 6 J | 14 J | 14 J |
| **換手次數** | **~750** | ~2200 | ~2800 | ~2800 |
| **節能效果** | **基準** | -25% | -68% | -68% |
| **信號品質** | **0.12** | 0.06 | 0.035 | 0.022 |
| **覆蓋概率** | **0.92** | 0.75 | 0.58 | 0.40 |

**結論**：Energy-Aware 方法在保持最高信號品質的同時，能耗最低！

---

## 🎯 **實現方案**

### **階段一：添加能耗追踪（基礎功能）**

#### 1.1 修改 `HandoverStats` 接口

```typescript
// src/types/handover-method.ts
export interface HandoverStats {
  // ... 現有欄位 ...

  // 🔋 新增：能耗追踪
  energyConsumption: number;         // 累積能耗 (Joules)
  energyPerHandover: number;         // 每次換手的能量成本 (Joules)
  averageEnergyPerSecond?: number;   // 平均每秒能耗 (W)
}
```

#### 1.2 在 `Satellites.tsx` 中計算能耗

```typescript
// src/components/satellite/Satellites.tsx

// 定義換手能量成本（基於論文）
const ENERGY_PER_HANDOVER = 3; // Joules

// 在檢測到換手事件時累加能耗
if (currentSatId && lastSatelliteIdRef.current && currentSatId !== lastSatelliteIdRef.current) {
  // 換手發生
  statsRef.current.totalHandovers++;

  // ✅ 新增：累積能耗
  statsRef.current.energyConsumption += ENERGY_PER_HANDOVER;
  statsRef.current.energyPerHandover = ENERGY_PER_HANDOVER;
  statsRef.current.averageEnergyPerSecond =
    statsRef.current.energyConsumption / elapsedTimeRef.current;
}
```

#### 1.3 在 Sidebar 顯示能耗指標

```typescript
// src/components/ui/Sidebar.tsx

<div style={{ marginTop: '16px' }}>
  <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>
    🔋 Energy Efficiency
  </div>

  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
    <span>Total Energy:</span>
    <span style={{ color: '#00ff88', fontWeight: 'bold' }}>
      {stats.energyConsumption.toFixed(2)} J
    </span>
  </div>

  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
    <span>Avg Power:</span>
    <span style={{ color: '#00ff88' }}>
      {(stats.averageEnergyPerSecond ?? 0).toFixed(3)} W
    </span>
  </div>

  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
    <span>Energy/Handover:</span>
    <span>{stats.energyPerHandover.toFixed(1)} J</span>
  </div>
</div>
```

---

### **階段二：創建節能效果對比面板（進階功能）**

#### 2.1 新增能耗對比組件

```typescript
// src/components/ui/EnergyComparisonPanel.tsx

interface EnergyComparisonPanelProps {
  currentMethod: HandoverMethodType;
  stats: HandoverStats;
}

export function EnergyComparisonPanel({ currentMethod, stats }: EnergyComparisonPanelProps) {
  // 基於論文的基準數據（3000秒）
  const baselines = {
    'rsrp': { energy: 4.5, handovers: 750, label: 'RSRP (A4)' },
    'geometric': { energy: 6.0, handovers: 2200, label: 'Geometric' },
    'dqn': { energy: 4.5, handovers: 750, label: 'DQN (EA-QL)' }  // 未來實現
  };

  const current = baselines[currentMethod];
  const baseline = baselines['geometric']; // 以 Geometric 為基準

  const energySavings = ((baseline.energy - stats.energyConsumption) / baseline.energy) * 100;
  const handoverReduction = ((baseline.handovers - stats.totalHandovers) / baseline.handovers) * 100;

  return (
    <div style={{
      padding: '16px',
      backgroundColor: 'rgba(0, 255, 136, 0.1)',
      borderRadius: '8px',
      border: '1px solid rgba(0, 255, 136, 0.3)'
    }}>
      <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>
        📊 Energy Savings vs Baseline
      </div>

      <div style={{ marginBottom: '8px' }}>
        <div style={{ fontSize: '12px', color: '#999' }}>Energy Reduction</div>
        <div style={{ fontSize: '20px', color: energySavings > 0 ? '#00ff88' : '#ff8888' }}>
          {energySavings > 0 ? '↓' : '↑'} {Math.abs(energySavings).toFixed(1)}%
        </div>
      </div>

      <div>
        <div style={{ fontSize: '12px', color: '#999' }}>Handover Reduction</div>
        <div style={{ fontSize: '20px', color: handoverReduction > 0 ? '#00ff88' : '#ff8888' }}>
          {handoverReduction > 0 ? '↓' : '↑'} {Math.abs(handoverReduction).toFixed(1)}%
        </div>
      </div>
    </div>
  );
}
```

---

### **階段三：實現 Energy-Aware DQN 方法（研究級功能）**

#### 3.1 創建 Energy-Aware Handover Manager

```typescript
// src/utils/satellite/EnergyAwareHandoverManager.ts

export class EnergyAwareHandoverManager {
  private config = {
    energyPenalty: 0.2,          // λ 參數（論文建議值）
    energyPerHandover: 3,        // 每次換手的能量成本（Joules）
    signalQualityWeight: 1.0     // 信號品質權重
  };

  /**
   * 計算 Energy-Aware Reward
   *
   * reward = signal_quality - λ * E_handover
   */
  private calculateReward(
    signalQuality: number,
    isHandover: boolean
  ): number {
    const energyCost = isHandover ? this.config.energyPerHandover : 0;

    return (
      this.config.signalQualityWeight * signalQuality -
      this.config.energyPenalty * energyCost
    );
  }

  /**
   * 決定是否換手
   *
   * 基於 reward 比較：保持當前衛星 vs 換手到目標衛星
   */
  shouldHandover(
    currentSatelliteQuality: number,
    targetSatelliteQuality: number
  ): boolean {
    // 保持當前連接的 reward（無換手成本）
    const stayReward = this.calculateReward(currentSatelliteQuality, false);

    // 換手到目標衛星的 reward（有換手成本）
    const handoverReward = this.calculateReward(targetSatelliteQuality, true);

    // 只有當換手 reward 顯著高於保持時，才執行換手
    const threshold = 0.1; // 防止頻繁抖動
    return handoverReward > stayReward + threshold;
  }
}
```

#### 3.2 整合到換手決策流程

```typescript
// 在 Satellites.tsx 的 useFrame 中使用

// 計算當前衛星和候選衛星的信號品質
const currentQuality = calculateSignalQuality(currentSatellite);
const targetQuality = calculateSignalQuality(bestCandidate);

// 使用 Energy-Aware 邏輯決定是否換手
if (energyAwareManager.shouldHandover(currentQuality, targetQuality)) {
  // 執行換手
  performHandover(bestCandidate);
}
```

---

## 📈 **預期效果展示**

### **UI 顯示示意**

```
┌─────────────────────────────────────┐
│ 🔋 Energy Efficiency                │
├─────────────────────────────────────┤
│ Total Energy:     4.5 J             │
│ Avg Power:        0.0015 W          │
│ Energy/Handover:  3.0 J             │
│                                     │
│ 📊 Energy Savings vs Baseline       │
│ ┌─────────────────────────────────┐ │
│ │ Energy Reduction:   ↓ 25.0%     │ │
│ │ Handover Reduction: ↓ 65.9%     │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### **對比效果圖表**（建議使用 Chart.js）

```
能耗對比圖：
  Energy (J)
    15│                      ┌──── Predictive (14J)
       │                      │
    10│         ┌──── Q-Learning (6J)
       │         │
     5│  ┌──── EA-QL (4.5J)  │
       │  │      │            │
     0└──┴──────┴────────────┴─────────> Time (s)
        0      1000         2000      3000
```

---

## 🎯 **實現優先級建議**

### **Phase 1：基礎能耗追踪（立即實現）**
- ✅ 修改 `HandoverStats` 添加能耗欄位
- ✅ 在 `Satellites.tsx` 計算累積能耗
- ✅ 在 Sidebar 顯示能耗指標

**預估工作量**：2-3 小時

---

### **Phase 2：節能對比功能（短期實現）**
- ⏳ 創建 `EnergyComparisonPanel` 組件
- ⏳ 添加基準數據對比
- ⏳ 顯示節能百分比

**預估工作量**：3-4 小時

---

### **Phase 3：Energy-Aware DQN（研究級功能）**
- 🔮 實現 `EnergyAwareHandoverManager`
- 🔮 整合到 DQN 方法
- 🔮 完整的三方法對比

**預估工作量**：1-2 天

---

## 📚 **學術貢獻價值**

實現這些功能後，你的模擬器將能夠：

1. ✅ **量化節能效果**：直觀展示不同換手策略的能耗差異
2. ✅ **驗證論文結果**：可以重現 Ntabeni et al. (2025) 的實驗結果
3. ✅ **教育演示**：清晰展示能量感知換手的優勢
4. ✅ **研究對比**：為未來的節能算法研究提供基準

---

## 🚀 **下一步行動**

### **立即可做**：
```bash
# 1. 修改類型定義
vim src/types/handover-method.ts

# 2. 更新能耗計算
vim src/components/satellite/Satellites.tsx

# 3. 更新 UI 顯示
vim src/components/ui/Sidebar.tsx

# 4. 測試效果
npm run dev
```

### **驗證方法**：
1. 運行 3000 秒模擬
2. 記錄三種方法的能耗數據
3. 對比是否接近論文結果：
   - RSRP (A4): ~4.5 J
   - Geometric: ~6 J
   - 換手次數減少 65%

---

## 📖 **參考文獻**

- Ntabeni et al., "Adaptive Handover Optimization in LEO Satellite Networks Using Energy-Aware Q-Learning," IEEE Open Journal of the Communications Society, vol. 6, pp. 5657-5666, 2025.

---

**最後更新**：2025-12-11
