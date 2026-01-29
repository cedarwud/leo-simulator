# SDD 04: 重構 Satellite Handover 為獨立頁面

## 任務說明

為 Satellite Handover 頁面添加導航功能，使其可以返回首頁。

## 前置條件

- 完成 `03-CREATE-LANDING-PAGE.md`
- Landing Page 已完善

## 執行步驟

### Step 1: 更新 SatelliteHandoverPage.tsx

更新 `src/pages/SatelliteHandoverPage.tsx`，添加返回首頁的按鈕：

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { MainScene } from '../components/scene/MainScene';
import { Home } from 'lucide-react';

/**
 * 衛星換手模擬頁面
 *
 * 包含：
 * - 3D 衛星模擬場景
 * - 返回首頁的導航按鈕
 */
export function SatelliteHandoverPage() {
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
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

      {/* 3D 場景 */}
      <MainScene />
    </div>
  );
}
```

### Step 2: 驗證

```bash
npm run typecheck
npm run dev
```

測試流程：
1. 訪問 `/` (Landing Page)
2. 點擊 "Satellite Handover" 卡片
3. 確認跳轉到 `/satellite-handover`
4. 確認 "Back to Home" 按鈕顯示在頂部中央
5. 點擊按鈕返回首頁

## 驗收標準

- [ ] "Back to Home" 按鈕顯示在正確位置
- [ ] 按鈕 hover 效果正常
- [ ] 點擊按鈕可返回首頁
- [ ] 3D 場景正常顯示
- [ ] 左右側邊欄正常顯示
- [ ] TypeScript 編譯通過

## 預期結果

```
┌─────────────────────────────────────────────────────────┐
│                    [← Back to Home]                     │
├──────────┬──────────────────────────────┬───────────────┤
│          │                              │               │
│  Left    │        3D Scene              │    Right      │
│  Panel   │                              │    Panel      │
│          │                              │               │
└──────────┴──────────────────────────────┴───────────────┘
```

## 下一步

完成後繼續 `05-EXTRACT-SHARED-COMPONENTS.md`
