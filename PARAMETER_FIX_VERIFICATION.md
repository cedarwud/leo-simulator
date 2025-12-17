# 參數傳遞修復驗證指南

## 📋 修復摘要

**問題**：側邊欄的參數調整未真正影響換手決策（僅 UI 展示）

**修復內容**：
1. ✅ 修改 `Satellites.tsx` 接口，添加 `rsrpConfig` 和 `geometricConfig` 參數
2. ✅ 添加 `useEffect` 監聽配置變化，調用 `HandoverManager.updateConfig()`
3. ✅ 修改 `MainScene.tsx`，將配置參數傳遞給 `Satellites` 組件
4. ✅ 添加 console 日誌追蹤配置更新

---

## 🧪 驗證步驟

### **方法一：查看瀏覽器控制台日誌**

1. **啟動開發服務器**：
   ```bash
   cd /home/sat/satellite/leo-simulator
   npm run dev
   ```

2. **打開瀏覽器控制台**（F12 → Console）

3. **測試 RSRP 方法**：
   - 在 UI 上選擇「RSRP-Based (A4)」方法
   - 調整右側邊欄的參數（例如：A4 Threshold、Time-to-Trigger）
   - **預期結果**：控制台會顯示：
     ```
     ✅ RSRP 配置已更新: {
       a4Threshold: -100,
       timeToTrigger: 10,
       handoverCooldown: 12
     }
     ```

4. **測試 Geometric 方法**：
   - 切換到「Geometric」方法
   - 調整右側邊欄的參數（例如：Elevation Weight、Trigger Elevation）
   - **預期結果**：控制台會顯示：
     ```
     ✅ Geometric 配置已更新: {
       elevationWeight: 0.7,
       triggerElevation: 45,
       handoverCooldown: 5
     }
     ```

---

### **方法二：觀察換手行為變化**

#### **RSRP 方法驗證**

**測試場景**：調整 A4 Threshold

1. **基線場景**（默認值）：
   - A4 Threshold = -100 dBm
   - 觀察換手頻率和 A4 事件觸發次數

2. **嚴格場景**（提高門檻）：
   - 將 A4 Threshold 調整為 **-90 dBm**（更嚴格）
   - **預期效果**：
     - ✅ 換手次數**減少**（因為需要更高的 RSRP 才能觸發）
     - ✅ A4 候選列表中的衛星**減少**（只顯示 RSRP > -90 dBm 的衛星）

3. **寬鬆場景**（降低門檻）：
   - 將 A4 Threshold 調整為 **-110 dBm**（更寬鬆）
   - **預期效果**：
     - ✅ 換手次數**增加**（更多衛星符合條件）
     - ✅ A4 候選列表中的衛星**增加**

**測試場景**：調整 Time-to-Trigger (TTT)

1. **快速響應**：
   - TTT = 5 秒
   - **預期效果**：換手觸發更快，但可能增加 ping-pong 率

2. **穩定響應**：
   - TTT = 20 秒
   - **預期效果**：換手觸發較慢，但更穩定

---

#### **Geometric 方法驗證**

**測試場景**：調整 Trigger Elevation

1. **低仰角觸發**：
   - Trigger Elevation = 35°
   - **預期效果**：
     - ✅ 換手次數**增加**（更早開始準備換手）
     - ✅ 換手準備階段（黃色虛線）出現時，衛星仰角較低

2. **高仰角觸發**：
   - Trigger Elevation = 60°
   - **預期效果**：
     - ✅ 換手次數**減少**（更晚才開始換手）
     - ✅ 換手準備階段出現時，衛星仰角較高

**測試場景**：調整 Elevation Weight

1. **高權重**（優先仰角）：
   - Elevation Weight = 0.9
   - **預期效果**：
     - ✅ 系統優先選擇**仰角高**的衛星
     - ✅ 距離因素影響較小

2. **低權重**（平衡距離）：
   - Elevation Weight = 0.5
   - **預期效果**：
     - ✅ 仰角和距離因素平衡考慮
     - ✅ 可能選擇距離較近但仰角略低的衛星

---

## 📊 驗證檢查清單

- [ ] 瀏覽器控制台顯示「✅ RSRP 配置已更新」或「✅ Geometric 配置已更新」
- [ ] 調整參數後，換手行為發生可觀察的變化
- [ ] RSRP 方法：調整 A4 Threshold 會影響候選衛星數量
- [ ] RSRP 方法：調整 TTT 會影響換手觸發速度
- [ ] Geometric 方法：調整 Trigger Elevation 會影響換手時機
- [ ] Geometric 方法：調整 Elevation Weight 會影響衛星選擇策略

---

## 🔍 技術細節

### **修改的文件**

1. **`src/components/satellite/Satellites.tsx`**
   - Line 6: 添加 `RSRPHandoverConfig` 導入
   - Line 12: 添加 `GeometricConfig` 導入
   - Line 19-20: 添加 `rsrpConfig` 和 `geometricConfig` 到接口
   - Line 75-82: 修改組件簽名，接收新參數
   - Line 123-140: 添加 `useEffect` 監聽配置變化並更新 HandoverManager

2. **`src/components/scene/MainScene.tsx`**
   - Line 197-198: 傳遞 `rsrpConfig` 和 `geometricConfig` 給 `Satellites` 組件

### **數據流向**

```
RightPanel (RSRPMethodPanel / GeometricMethodPanel)
  ↓ onConfigChange 回調
MainScene (setRsrpConfig / setGeometricConfig)
  ↓ props 傳遞
Satellites (接收 rsrpConfig / geometricConfig)
  ↓ useEffect 監聽
HandoverManager.updateConfig()
  ↓ 更新內部配置
影響換手決策邏輯 ✅
```

---

## ✅ 預期結果

修復完成後，**所有參數調整都會真實影響換手決策**，不再只是 UI 展示。

- ✅ **RSRP 方法**：A4 Threshold、TTT、Handover Cooldown 真實生效
- ✅ **Geometric 方法**：Elevation Weight、Trigger Elevation、Handover Cooldown 真實生效
- ✅ **控制台日誌**：每次調整參數都會記錄更新訊息
- ✅ **換手行為**：參數調整導致可觀察的行為變化

---

## 🐛 已知限制

1. **既存的 TypeScript 錯誤**：
   - `MainScene.tsx:141` - OrbitControls ref 類型問題（與本次修復無關）

2. **配置初始化**：
   - HandoverManager 在首次創建時使用硬編碼的默認值
   - 第一次參數更新會在 `useEffect` 中覆蓋這些默認值
   - 這是正常行為，不影響功能

---

## 📝 後續建議

1. **移除 console.log**：
   - 驗證完成後，可以移除 `Satellites.tsx:128` 和 `138` 的 console 日誌
   - 或將其改為僅在開發模式下輸出

2. **添加參數範圍驗證**：
   - 在 `HandoverManager.updateConfig()` 中添加參數範圍檢查
   - 避免用戶輸入無效值（例如：負數的 TTT）

3. **性能優化**：
   - 考慮使用 `useMemo` 緩存配置對象，減少不必要的 `useEffect` 觸發

---

**修復完成日期**：2025-12-11
**驗證狀態**：✅ TypeScript 類型檢查通過（僅有既存錯誤）
**部署狀態**：⏳ 待啟動 dev server 進行運行時驗證
