# LEO Simulator 重構計劃

## 目標

將現有的單頁面應用重構為多頁面架構，為未來的 Beam Hopping 功能做準備。

## 重構前狀態

```
src/
├── App.tsx                 # 直接渲染 MainScene
├── main.tsx
├── components/
│   ├── scene/              # 3D 場景組件
│   ├── satellite/          # 衛星相關組件
│   ├── controls/           # 控制組件
│   └── ui/                 # UI 組件
├── utils/
├── types/
├── config/
└── styles/
```

## 重構後狀態

```
src/
├── App.tsx                 # React Router 設定
├── main.tsx
├── pages/                  # 新增：頁面組件
│   ├── LandingPage.tsx
│   └── SatelliteHandoverPage.tsx
├── features/               # 新增：功能模組
│   └── satellite-handover/
│       ├── components/
│       ├── utils/
│       └── types/
├── shared/                 # 新增：共用組件
│   ├── components/
│   └── hooks/
├── config/
└── styles/
```

## 重構步驟

按順序執行以下 SDD 文檔：

| 順序 | 文檔 | 說明 | 預估時間 |
|------|------|------|---------|
| 1 | `01-INSTALL-ROUTER.md` | 安裝 React Router 並設定基本路由 | 5 min |
| 2 | `02-CREATE-PAGES-STRUCTURE.md` | 建立 pages 目錄和頁面組件 | 10 min |
| 3 | `03-CREATE-LANDING-PAGE.md` | 建立 Landing Page | 15 min |
| 4 | `04-REFACTOR-SATELLITE-HANDOVER.md` | 重構現有功能為獨立頁面 | 20 min |
| 5 | `05-EXTRACT-SHARED-COMPONENTS.md` | 抽取共用組件 | 15 min |
| 6 | `06-FINAL-TESTING.md` | 最終測試與驗收 | 10 min |

## 使用方式

每個 SDD 文檔都可以直接作為 Claude 的提示詞使用：

```bash
# 方式 1：複製文檔內容作為提示詞
cat docs/refactoring/01-INSTALL-ROUTER.md

# 方式 2：使用 Claude Code 的 @ 引用
# 在對話中輸入 @docs/refactoring/01-INSTALL-ROUTER.md
```

## 驗收標準

- [ ] TypeScript 編譯通過 (`npm run typecheck`)
- [ ] 開發伺服器正常運行 (`npm run dev`)
- [ ] Landing Page 正確顯示
- [ ] Satellite Handover 頁面功能正常
- [ ] 路由切換正常工作

## 注意事項

1. **按順序執行**：每個步驟依賴前一個步驟的完成
2. **驗證每步**：完成每個步驟後執行 `npm run typecheck`
3. **保持功能**：重構過程中不應破壞現有功能
4. **Git 提交**：每個步驟完成後建議做一次提交

---

**最後更新**: 2025-01-29
**維護者**: Claude Code
