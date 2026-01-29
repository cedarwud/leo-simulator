# SDD 01: 安裝 React Router 並設定基本路由

## 任務說明

安裝 `react-router-dom` 並設定基本的路由結構。

## 前置條件

- TypeScript 編譯通過
- 未使用的檔案已刪除

## 執行步驟

### Step 1: 安裝 react-router-dom

```bash
cd /home/sat/satellite/leo-simulator
npm install react-router-dom
npm install -D @types/react-router-dom
```

### Step 2: 更新 App.tsx

將 `src/App.tsx` 改為使用 React Router：

```tsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MainScene } from './components/scene/MainScene';

// 暫時使用 MainScene 作為首頁，後續步驟會替換
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainScene />} />
        <Route path="/satellite-handover" element={<MainScene />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

### Step 3: 驗證

```bash
npm run typecheck
npm run dev
```

## 驗收標準

- [ ] `react-router-dom` 安裝成功
- [ ] TypeScript 編譯通過
- [ ] 訪問 `/` 顯示現有場景
- [ ] 訪問 `/satellite-handover` 顯示現有場景

## 預期結果

- 路由系統已設定
- 應用功能不受影響
- 為後續頁面分離做好準備

## 下一步

完成後繼續 `02-CREATE-PAGES-STRUCTURE.md`
