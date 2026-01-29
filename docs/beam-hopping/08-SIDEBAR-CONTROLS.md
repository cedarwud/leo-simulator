# SDD 08: 建立控制面板

## 任務說明

建立 Beam Hopping 的左側控制面板，提供時隙控制和參數調整。

## 前置條件

- 完成 `07-BEAM-ANIMATION.md`
- 動畫已正常運作

## 執行步驟

### Step 1: 建立 BeamHoppingSidebar.tsx

建立 `src/features/beam-hopping/ui/BeamHoppingSidebar.tsx`：

```tsx
import React from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import { DEFAULT_SCHEDULE, FRF3_COLORS } from '../types';

interface BeamHoppingSidebarProps {
  currentSlotIndex: number;
  isRunning: boolean;
  progress: number;
  activeBeams: number[];
  speed: number;
  onToggle: () => void;
  onReset: () => void;
  onNextSlot: () => void;
  onPrevSlot: () => void;
  onSpeedChange: (speed: number) => void;
}

export function BeamHoppingSidebar({
  currentSlotIndex,
  isRunning,
  progress,
  activeBeams,
  speed,
  onToggle,
  onReset,
  onNextSlot,
  onPrevSlot,
  onSpeedChange,
}: BeamHoppingSidebarProps) {
  const colors = Object.values(FRF3_COLORS);

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      height: '100%',
      width: '320px',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      backdropFilter: 'blur(10px)',
      borderRight: '1px solid rgba(255, 255, 255, 0.15)',
      overflow: 'hidden',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* 標題 */}
      <div style={{
        padding: '20px',
        borderBottom: '2px solid rgba(255, 255, 255, 0.15)',
      }}>
        <div style={{
          color: '#ffffff',
          fontSize: '20px',
          fontWeight: '600',
          letterSpacing: '0.5px',
          marginBottom: '8px',
        }}>
          📡 Beam Hopping
        </div>
        <div style={{ color: '#999999', fontSize: '13px' }}>
          Multi-beam Time-Division Simulation
        </div>
      </div>

      {/* 內容 */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        {/* 當前時隙 */}
        <div>
          <div style={{
            fontSize: '15px',
            color: '#ffffff',
            fontWeight: '600',
            marginBottom: '12px',
          }}>
            ⏱️ Current Time Slot
          </div>
          <div style={{
            padding: '16px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}>
              <span style={{ color: '#999999', fontSize: '14px' }}>Slot</span>
              <span style={{
                color: '#00ff88',
                fontSize: '24px',
                fontWeight: '600',
                fontFamily: 'monospace',
              }}>
                {currentSlotIndex + 1} / {DEFAULT_SCHEDULE.length}
              </span>
            </div>

            {/* 進度條 */}
            <div style={{
              height: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '3px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${progress * 100}%`,
                backgroundColor: '#00ff88',
                borderRadius: '3px',
                transition: 'width 0.1s linear',
              }} />
            </div>
          </div>
        </div>

        {/* 活躍波束 */}
        <div>
          <div style={{
            fontSize: '15px',
            color: '#ffffff',
            fontWeight: '600',
            marginBottom: '12px',
          }}>
            📶 Active Beams
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
          }}>
            {[0, 1, 2, 3, 4, 5, 6].map((beamId) => {
              const isActive = activeBeams.includes(beamId);
              const colorIndex = [0, 1, 2, 1, 2, 0, 0][beamId];
              const color = colors[colorIndex];

              return (
                <div
                  key={beamId}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    backgroundColor: isActive ? `${color}33` : 'rgba(255, 255, 255, 0.05)',
                    border: `2px solid ${isActive ? color : 'rgba(255, 255, 255, 0.1)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isActive ? color : '#666666',
                    fontSize: '14px',
                    fontWeight: '600',
                    transition: 'all 0.3s ease',
                  }}
                >
                  B{beamId}
                </div>
              );
            })}
          </div>
        </div>

        {/* 播放控制 */}
        <div>
          <div style={{
            fontSize: '15px',
            color: '#ffffff',
            fontWeight: '600',
            marginBottom: '12px',
          }}>
            ▶️ Playback Control
          </div>
          <div style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
          }}>
            <button
              onClick={onPrevSlot}
              style={{
                padding: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SkipBack size={20} />
            </button>

            <button
              onClick={onToggle}
              style={{
                padding: '12px 24px',
                backgroundColor: isRunning ? 'rgba(255, 136, 0, 0.2)' : 'rgba(0, 255, 136, 0.2)',
                border: `2px solid ${isRunning ? '#ff8800' : '#00ff88'}`,
                borderRadius: '8px',
                color: isRunning ? '#ff8800' : '#00ff88',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontWeight: '600',
              }}
            >
              {isRunning ? <Pause size={20} /> : <Play size={20} />}
              {isRunning ? 'Pause' : 'Play'}
            </button>

            <button
              onClick={onNextSlot}
              style={{
                padding: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SkipForward size={20} />
            </button>

            <button
              onClick={onReset}
              style={{
                padding: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RotateCcw size={20} />
            </button>
          </div>
        </div>

        {/* 速度控制 */}
        <div>
          <div style={{
            fontSize: '15px',
            color: '#ffffff',
            fontWeight: '600',
            marginBottom: '12px',
          }}>
            ⚡ Animation Speed
          </div>
          <div style={{
            display: 'flex',
            gap: '8px',
          }}>
            {[0.5, 1, 2, 3].map((s) => (
              <button
                key={s}
                onClick={() => onSpeedChange(s)}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: speed === s ? 'rgba(0, 136, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${speed === s ? '#0088ff' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: '8px',
                  color: speed === s ? '#0088ff' : '#999999',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: speed === s ? '600' : '400',
                }}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* 圖例 */}
        <div>
          <div style={{
            fontSize: '15px',
            color: '#ffffff',
            fontWeight: '600',
            marginBottom: '12px',
          }}>
            🎨 Frequency Reuse (FRF3)
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            {[
              { color: colors[0], label: 'Group 0 (B0, B5, B6)', freq: 'f1' },
              { color: colors[1], label: 'Group 1 (B1, B3)', freq: 'f2' },
              { color: colors[2], label: 'Group 2 (B2, B4)', freq: 'f3' },
            ].map(({ color, label, freq }) => (
              <div
                key={freq}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '6px',
                }}
              >
                <div style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  backgroundColor: color,
                }} />
                <span style={{ color: '#cccccc', fontSize: '13px' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Step 2: 建立 ui 導出

建立 `src/features/beam-hopping/ui/index.ts`：

```typescript
export { BeamHoppingSidebar } from './BeamHoppingSidebar';
```

### Step 3: 更新功能模組主入口

更新 `src/features/beam-hopping/index.ts`：

```typescript
// Types
export * from './types';

// Utils
export * from './utils';

// Hooks
export * from './hooks';

// Components
export * from './components';

// UI
export * from './ui';
```

### Step 4: 驗證

```bash
npm run typecheck
```

## 驗收標準

- [ ] Sidebar 組件正確建立
- [ ] 時隙顯示正確
- [ ] 進度條動畫正常
- [ ] 播放控制按鈕正常
- [ ] 速度選擇正常
- [ ] FRF3 圖例正確
- [ ] TypeScript 編譯通過

## 下一步

完成後繼續 `09-INTEGRATION.md`
