# SDD 01: 建立 BeamHoppingPage 基礎結構

## 任務說明

建立 Beam Hopping 頁面的基礎結構，並啟用 Landing Page 的卡片連結。

## 前置條件

- 完成 `docs/refactoring/` 的所有步驟
- 路由系統已設定

## 執行步驟

### Step 1: 建立 BeamHoppingPage.tsx

建立 `src/pages/BeamHoppingPage.tsx`：

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { Starfield } from '../shared/components';

/**
 * Beam Hopping 模擬頁面
 *
 * 展示 LEO 衛星多波束跳躍機制
 */
export function BeamHoppingPage() {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      background: 'radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%)',
      overflow: 'hidden'
    }}>
      {/* 背景星空 */}
      <Starfield starCount={180} />

      {/* 返回首頁按鈕 */}
      <Link
        to="/"
        style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 20px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '8px',
          color: 'rgba(255, 255, 255, 0.8)',
          textDecoration: 'none',
          fontSize: '14px',
          fontWeight: '500',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(0, 136, 255, 0.3)';
          e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.5)';
          e.currentTarget.style.color = '#ffffff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
        }}
      >
        <Home size={16} />
        <span>Back to Home</span>
      </Link>

      {/* 佔位內容 - 將在後續步驟替換為 3D 場景 */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <div style={{
          fontSize: '64px',
          marginBottom: '20px'
        }}>
          📡
        </div>
        <h1 style={{
          fontSize: '36px',
          color: '#ffffff',
          margin: '0 0 16px 0'
        }}>
          Beam Hopping Simulation
        </h1>
        <p style={{
          fontSize: '16px',
          color: 'rgba(255, 255, 255, 0.6)',
          margin: 0
        }}>
          Multi-beam time-division hopping visualization
        </p>
        <p style={{
          fontSize: '14px',
          color: 'rgba(255, 255, 255, 0.4)',
          margin: '20px 0 0 0',
          padding: '10px 20px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px'
        }}>
          3D Scene will be implemented in next steps
        </p>
      </div>
    </div>
  );
}
```

### Step 2: 更新 pages/index.ts

更新 `src/pages/index.ts`：

```tsx
export { LandingPage } from './LandingPage';
export { SatelliteHandoverPage } from './SatelliteHandoverPage';
export { BeamHoppingPage } from './BeamHoppingPage';
```

### Step 3: 更新 App.tsx 路由

更新 `src/App.tsx`：

```tsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LandingPage, SatelliteHandoverPage, BeamHoppingPage } from './pages';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/satellite-handover" element={<SatelliteHandoverPage />} />
        <Route path="/beam-hopping" element={<BeamHoppingPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

### Step 4: 啟用 Landing Page 的 Beam Hopping 卡片

更新 `src/pages/LandingPage.tsx` 中的 Beam Hopping 卡片：

找到 Beam Hopping 卡片部分（約第 143 行），將 `<div>` 改為 `<Link>`：

```tsx
{/* Beam Hopping 卡片 - 改為可點擊 */}
<Link
  to="/beam-hopping"
  style={{
    width: '320px',
    padding: '40px 30px',
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    border: '2px solid rgba(0, 255, 136, 0.5)',
    borderRadius: '16px',
    textDecoration: 'none',
    transition: 'all 0.3s ease',
    cursor: 'pointer'
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.backgroundColor = 'rgba(0, 255, 136, 0.2)';
    e.currentTarget.style.borderColor = '#00ff88';
    e.currentTarget.style.transform = 'translateY(-4px)';
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.backgroundColor = 'rgba(0, 255, 136, 0.1)';
    e.currentTarget.style.borderColor = 'rgba(0, 255, 136, 0.5)';
    e.currentTarget.style.transform = 'translateY(0)';
  }}
>
  <div style={{
    fontSize: '48px',
    marginBottom: '20px',
    textAlign: 'center'
  }}>
    📡
  </div>
  <h2 style={{
    fontSize: '24px',
    fontWeight: '600',
    color: '#00ff88',
    margin: '0 0 12px 0',
    textAlign: 'center'
  }}>
    Beam Hopping
  </h2>
  <p style={{
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.7)',
    margin: '0 0 20px 0',
    textAlign: 'center',
    lineHeight: '1.6'
  }}>
    Multi-beam time-division hopping simulation for LEO satellites
  </p>
  <div style={{
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    justifyContent: 'center'
  }}>
    {['7-Beam', 'FRF3', 'Time Slots', '3GPP'].map((tag) => (
      <span
        key={tag}
        style={{
          padding: '4px 12px',
          backgroundColor: 'rgba(0, 255, 136, 0.2)',
          borderRadius: '12px',
          fontSize: '12px',
          color: '#88ffcc'
        }}
      >
        {tag}
      </span>
    ))}
  </div>
</Link>
```

### Step 5: 驗證

```bash
npm run typecheck
npm run dev
```

測試：
1. 訪問 `/` 確認兩個卡片都可點擊
2. 點擊 Beam Hopping 卡片跳轉到 `/beam-hopping`
3. 確認 BeamHoppingPage 顯示佔位內容
4. 點擊 Back to Home 返回首頁

## 驗收標準

- [ ] `BeamHoppingPage.tsx` 建立成功
- [ ] 路由 `/beam-hopping` 正常運作
- [ ] Landing Page 的 Beam Hopping 卡片可點擊
- [ ] 頁面導航正常
- [ ] TypeScript 編譯通過

## 下一步

完成後繼續 `02-FEATURE-STRUCTURE.md`
