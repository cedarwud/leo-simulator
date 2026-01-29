# SDD 09: 整合與完成

## 任務說明

將所有組件整合到 BeamHoppingPage，完成 Beam Hopping 功能的最終整合。

## 前置條件

- 完成 `08-SIDEBAR-CONTROLS.md`
- 所有組件和 UI 已實作

## 執行步驟

### Step 1: 更新 BeamHoppingPage

更新 `src/pages/BeamHoppingPage.tsx`：

```tsx
import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { BeamHoppingScene, BeamHoppingSidebar } from '../features/beam-hopping';

interface SceneState {
  currentSlotIndex: number;
  isRunning: boolean;
  progress: number;
  activeBeams: number[];
}

export function BeamHoppingPage() {
  const [sceneState, setSceneState] = useState<SceneState>({
    currentSlotIndex: 0,
    isRunning: false,
    progress: 0,
    activeBeams: [],
  });

  const [speed, setSpeed] = useState(1);

  // 這些控制函數需要透過 ref 或 context 傳遞給 Scene
  // 簡化版本：使用 key 強制重新渲染
  const [sceneKey, setSceneKey] = useState(0);

  const handleStateChange = useCallback((state: SceneState) => {
    setSceneState(state);
  }, []);

  const handleToggle = useCallback(() => {
    // 透過重新渲染觸發狀態變化
    setSceneKey(k => k + 1);
  }, []);

  const handleReset = useCallback(() => {
    setSceneKey(k => k + 1);
  }, []);

  const handleNextSlot = useCallback(() => {
    // 需要實作
  }, []);

  const handlePrevSlot = useCallback(() => {
    // 需要實作
  }, []);

  const handleSpeedChange = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
  }, []);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0a0a1a 100%)',
      overflow: 'hidden',
    }}>
      {/* 返回首頁按鈕 */}
      <Link
        to="/"
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '8px',
          color: '#ffffff',
          textDecoration: 'none',
          fontSize: '14px',
          transition: 'all 0.2s ease',
        }}
      >
        <Home size={16} />
        <span>Back to Home</span>
      </Link>

      {/* 側邊控制面板 */}
      <BeamHoppingSidebar
        currentSlotIndex={sceneState.currentSlotIndex}
        isRunning={sceneState.isRunning}
        progress={sceneState.progress}
        activeBeams={sceneState.activeBeams}
        speed={speed}
        onToggle={handleToggle}
        onReset={handleReset}
        onNextSlot={handleNextSlot}
        onPrevSlot={handlePrevSlot}
        onSpeedChange={handleSpeedChange}
      />

      {/* 3D 場景 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '320px',
        right: 0,
        bottom: 0,
      }}>
        <BeamHoppingScene
          key={sceneKey}
          onStateChange={handleStateChange}
        />
      </div>

      {/* 右下角說明 */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        padding: '12px 16px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#888888',
        fontSize: '12px',
        maxWidth: '250px',
      }}>
        <div style={{ marginBottom: '8px', color: '#ffffff', fontWeight: '500' }}>
          Controls
        </div>
        <div>🖱️ Drag to rotate view</div>
        <div>🔍 Scroll to zoom</div>
        <div>⌨️ Space to play/pause</div>
      </div>
    </div>
  );
}
```

### Step 2: 更新路由配置

更新 `src/App.tsx` 添加 beam-hopping 路由：

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

### Step 3: 更新 pages 導出

更新 `src/pages/index.ts`：

```typescript
export { LandingPage } from './LandingPage';
export { SatelliteHandoverPage } from './SatelliteHandoverPage';
export { BeamHoppingPage } from './BeamHoppingPage';
```

### Step 4: 更新 LandingPage 啟用 Beam Hopping

更新 `src/pages/LandingPage.tsx` 中的 Beam Hopping 卡片：

將 Beam Hopping 的 `comingSoon: true` 改為 `comingSoon: false`：

```tsx
{
  title: 'Multi-Beam Hopping',
  description: 'Visualize beam hopping patterns with time-division multiplexing across multiple coverage cells',
  icon: Grid3X3,
  path: '/beam-hopping',
  gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  comingSoon: false,  // 改為 false
}
```

### Step 5: 完整功能整合 (進階)

為了讓 Sidebar 能夠控制 Scene，需要提升狀態或使用 Context。

建立 `src/features/beam-hopping/context/BeamHoppingContext.tsx`：

```tsx
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface BeamHoppingContextValue {
  // 狀態
  currentSlotIndex: number;
  isRunning: boolean;
  progress: number;
  activeBeams: number[];
  speed: number;

  // 更新狀態
  setCurrentSlotIndex: (index: number) => void;
  setIsRunning: (running: boolean) => void;
  setProgress: (progress: number) => void;
  setActiveBeams: (beams: number[]) => void;
  setSpeed: (speed: number) => void;

  // 動作
  toggle: () => void;
  reset: () => void;
  nextSlot: () => void;
  prevSlot: () => void;
}

const BeamHoppingContext = createContext<BeamHoppingContextValue | null>(null);

export function BeamHoppingProvider({ children }: { children: ReactNode }) {
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeBeams, setActiveBeams] = useState<number[]>([]);
  const [speed, setSpeed] = useState(1);

  const toggle = useCallback(() => {
    setIsRunning(r => !r);
  }, []);

  const reset = useCallback(() => {
    setCurrentSlotIndex(0);
    setProgress(0);
    setIsRunning(false);
  }, []);

  const nextSlot = useCallback(() => {
    setCurrentSlotIndex(i => (i + 1) % 8); // 8 slots
    setProgress(0);
  }, []);

  const prevSlot = useCallback(() => {
    setCurrentSlotIndex(i => (i - 1 + 8) % 8);
    setProgress(0);
  }, []);

  return (
    <BeamHoppingContext.Provider
      value={{
        currentSlotIndex,
        isRunning,
        progress,
        activeBeams,
        speed,
        setCurrentSlotIndex,
        setIsRunning,
        setProgress,
        setActiveBeams,
        setSpeed,
        toggle,
        reset,
        nextSlot,
        prevSlot,
      }}
    >
      {children}
    </BeamHoppingContext.Provider>
  );
}

export function useBeamHoppingContext() {
  const context = useContext(BeamHoppingContext);
  if (!context) {
    throw new Error('useBeamHoppingContext must be used within BeamHoppingProvider');
  }
  return context;
}
```

建立 `src/features/beam-hopping/context/index.ts`：

```typescript
export { BeamHoppingProvider, useBeamHoppingContext } from './BeamHoppingContext';
```

### Step 6: 驗證

```bash
npm run typecheck
npm run dev
```

訪問測試：
1. `/` - 首頁應顯示兩個可用選項
2. `/beam-hopping` - Beam Hopping 頁面應正常載入
3. 測試播放/暫停功能
4. 測試速度切換
5. 測試手動時隙切換

## 驗收標準

- [ ] BeamHoppingPage 正確整合所有組件
- [ ] 路由配置正確
- [ ] LandingPage 的 Beam Hopping 選項可用
- [ ] Sidebar 控制功能正常
- [ ] 3D 場景正確渲染
- [ ] 動畫播放流暢
- [ ] TypeScript 編譯通過
- [ ] 無控制台錯誤

## 後續優化建議

1. **效能優化**
   - 使用 `React.memo` 優化組件
   - 使用 `useMemo` 緩存計算
   - 考慮使用 instanced mesh 優化多波束渲染

2. **功能擴展**
   - 添加自定義時隙調度
   - 支援不同數量的波束配置
   - 添加統計圖表

3. **使用者體驗**
   - 添加鍵盤快捷鍵
   - 添加觸控手勢支援
   - 添加動畫過渡效果

## 完成

恭喜！Beam Hopping 功能開發完成。
