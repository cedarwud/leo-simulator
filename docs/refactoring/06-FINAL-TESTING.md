# SDD 06: 最終測試與驗收

## 任務說明

完成所有重構後的最終測試，確保應用功能正常。

## 前置條件

- 完成所有前面的 SDD 步驟 (01-05)

## 測試清單

### 1. 編譯測試

```bash
cd /home/sat/satellite/leo-simulator
npm run typecheck
npm run build
```

- [ ] TypeScript 編譯無錯誤
- [ ] Vite build 成功

### 2. 路由測試

啟動開發伺服器：
```bash
npm run dev
```

測試以下路由：

| 路由 | 預期結果 |
|------|---------|
| `/` | 顯示 Landing Page |
| `/satellite-handover` | 顯示 Satellite Handover 頁面 |
| `/invalid-route` | 顯示 Landing Page (fallback) |

### 3. Landing Page 測試

- [ ] 星空背景動畫正常
- [ ] 標題和說明文字正確顯示
- [ ] "Satellite Handover" 卡片可點擊
- [ ] "Beam Hopping" 卡片顯示 "Coming Soon"
- [ ] 卡片 hover 效果正常
- [ ] 點擊 Satellite Handover 跳轉正確

### 4. Satellite Handover 頁面測試

- [ ] 3D 場景正常渲染
- [ ] 星空背景正常
- [ ] 左側 Sidebar 正常顯示
- [ ] 右側 Panel 正常顯示
- [ ] "Back to Home" 按鈕顯示正確
- [ ] 點擊返回按鈕可回到首頁

### 5. 功能測試

- [ ] 星座切換 (Starlink/OneWeb) 正常
- [ ] 換手方法切換 (RSRP/Geometric) 正常
- [ ] 時間速度調整正常
- [ ] 統計數據更新正常
- [ ] 衛星模型渲染正常
- [ ] 連線動畫正常

### 6. 響應式測試 (可選)

在不同視窗大小測試：
- [ ] 1920x1080 (標準桌面)
- [ ] 1440x900 (筆電)
- [ ] 1280x720 (小螢幕)

## 驗收總結

### 必須通過項目

| 項目 | 狀態 |
|------|------|
| TypeScript 編譯 | ☐ |
| Vite build | ☐ |
| 路由正常 | ☐ |
| Landing Page 顯示 | ☐ |
| Satellite Handover 功能 | ☐ |
| 頁面導航 | ☐ |

### 重構完成確認

```bash
# 確認目錄結構
tree -L 3 /home/sat/satellite/leo-simulator/src

# 預期輸出
src/
├── App.tsx
├── main.tsx
├── pages/
│   ├── index.ts
│   ├── LandingPage.tsx
│   └── SatelliteHandoverPage.tsx
├── shared/
│   └── components/
│       ├── index.ts
│       └── Starfield.tsx
├── components/
│   ├── scene/
│   ├── satellite/
│   ├── controls/
│   └── ui/
├── utils/
├── types/
├── config/
└── styles/
```

## Git 提交 (可選)

如果所有測試通過，建議提交：

```bash
cd /home/sat/satellite/leo-simulator
git add .
git commit -m "refactor: add React Router and page structure

- Add react-router-dom for navigation
- Create LandingPage with mode selection
- Create SatelliteHandoverPage with back navigation
- Extract Starfield to shared components
- Remove 7 unused files

Prepares for future Beam Hopping feature."
```

## 重構完成

恭喜！重構已完成。現在可以開始開發 Beam Hopping 功能。

### 下一步建議

1. 建立 `src/pages/BeamHoppingPage.tsx`
2. 建立 `src/features/beam-hopping/` 目錄
3. 實作 7-beam 簡化版 Beam Hopping 視覺化
4. 更新 Landing Page 啟用 Beam Hopping 卡片

### 相關文檔

- `docs/refactoring/00-OVERVIEW.md` - 重構總覽
- `../beam-hopping/` - Beam Hopping 設計文檔 (待建立)
