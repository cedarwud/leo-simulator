# SDD 02: 建立 Pages 目錄結構

## 任務說明

建立 `pages/` 目錄並創建基本的頁面組件結構。

## 前置條件

- 完成 `01-INSTALL-ROUTER.md`
- React Router 已安裝並設定

## 執行步驟

### Step 1: 建立目錄結構

```bash
mkdir -p /home/sat/satellite/leo-simulator/src/pages
```

### Step 2: 建立 SatelliteHandoverPage.tsx

建立 `src/pages/SatelliteHandoverPage.tsx`：

```tsx
import React from 'react';
import { MainScene } from '../components/scene/MainScene';

/**
 * 衛星換手模擬頁面
 *
 * 包裝現有的 MainScene 組件，未來可以添加頁面級別的功能
 */
export function SatelliteHandoverPage() {
  return <MainScene />;
}
```

### Step 3: 建立 LandingPage.tsx (佔位)

建立 `src/pages/LandingPage.tsx`：

```tsx
import React from 'react';
import { Link } from 'react-router-dom';

/**
 * 首頁 - 模擬模式選擇
 *
 * 這是一個佔位組件，將在下一步驟完善
 */
export function LandingPage() {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%)',
      color: 'white'
    }}>
      <h1>LEO Satellite Simulator</h1>
      <p>Select a simulation mode:</p>
      <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
        <Link
          to="/satellite-handover"
          style={{
            padding: '20px 40px',
            backgroundColor: 'rgba(0, 136, 255, 0.2)',
            border: '2px solid #0088ff',
            borderRadius: '8px',
            color: '#0088ff',
            textDecoration: 'none',
            fontSize: '18px'
          }}
        >
          Satellite Handover
        </Link>
        <div
          style={{
            padding: '20px 40px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            color: 'rgba(255, 255, 255, 0.4)',
            fontSize: '18px',
            cursor: 'not-allowed'
          }}
        >
          Beam Hopping (Coming Soon)
        </div>
      </div>
    </div>
  );
}
```

### Step 4: 建立 pages/index.ts

建立 `src/pages/index.ts` 作為導出入口：

```tsx
export { LandingPage } from './LandingPage';
export { SatelliteHandoverPage } from './SatelliteHandoverPage';
```

### Step 5: 更新 App.tsx

更新 `src/App.tsx` 使用新的頁面組件：

```tsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LandingPage, SatelliteHandoverPage } from './pages';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/satellite-handover" element={<SatelliteHandoverPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

### Step 6: 驗證

```bash
npm run typecheck
npm run dev
```

## 驗收標準

- [ ] `src/pages/` 目錄已建立
- [ ] `LandingPage.tsx` 存在並導出
- [ ] `SatelliteHandoverPage.tsx` 存在並導出
- [ ] `pages/index.ts` 正確導出所有頁面
- [ ] TypeScript 編譯通過
- [ ] 訪問 `/` 顯示 Landing Page
- [ ] 訪問 `/satellite-handover` 顯示衛星模擬

## 預期結果

```
src/
├── App.tsx                 # 更新後的路由設定
├── pages/
│   ├── index.ts
│   ├── LandingPage.tsx
│   └── SatelliteHandoverPage.tsx
└── ...
```

## 下一步

完成後繼續 `03-CREATE-LANDING-PAGE.md`
