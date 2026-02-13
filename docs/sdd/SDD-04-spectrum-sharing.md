# SDD-04: 星地頻譜共享 (Algorithm 3)

## 1. 目的

實作 Lyapunov 的動態星地頻譜共享，讓衛星 spot beam 可以借用地面網路頻譜來提升容量。

## 2. 論文對應

- **Section II-B.3**: Dynamic Satellite-Terrestrial Interference Mitigation Strategy
- **Section IV-D**: Satellite-Terrestrial Dynamic Spectrum Sharing
- **Algorithm 3**: Satellite-Terrestrial Spectrum Sharing Algorithm
- **Equation 36-39**: 傳輸量計算、適應度函數
- **Figure 2, 3**: 頻譜共享策略流程

## 3. 設計內容

### 3.1 地面基站模型

- 32400 個地面 cells（論文設定）
- 基站分群（cluster），每群中心對齊 beam cell 中心
- 基站負載 l^f_g ∈ [0.4, 0.6]

### 3.2 決策變數

z^{f,t}_{s,c} ∈ {0, 1}: 衛星 s 是否在 slot t 借用地面頻譜服務 cell c

### 3.3 干擾約束 (Equation 9)

衛星借用地面頻譜時，對地面基站的干擾不能超過 I^th_g = -10 dB

### 3.4 演算法：Binary Sparrow Search + Greedy

1. 初始化麻雀群（tent chaotic strategy）
2. 迭代搜尋最佳頻譜共享方案
3. 最後用 greedy search 微調

### 3.5 視覺化

- 地面基站群用小圓點表示
- 借用頻譜的 cell 用特殊標記
- 干擾等級用顏色漸層

## 4. 複雜度評估

這是最複雜的 Phase：
- 需要建模地面網路
- 麻雀搜尋是 metaheuristic 演算法
- 可考慮先做簡化版（固定頻譜分配），再迭代完善

## 5. 前置需求

- SDD-00, SDD-01, SDD-02, SDD-03

## 6. 驗證標準

- [ ] 頻譜共享後 queue 長度降低 >20%（論文 Fig. 8b）
- [ ] 地面基站干擾不超過 I^th_g
- [ ] 低負載時不啟用頻譜共享（論文 Fig. 10）
