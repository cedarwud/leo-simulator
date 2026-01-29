# SDD 03: 建立完整的 Landing Page

## 任務說明

完善 Landing Page，使其具有專業的視覺設計和完整的功能。

## 前置條件

- 完成 `02-CREATE-PAGES-STRUCTURE.md`
- 基本的頁面結構已建立

## 執行步驟

### Step 1: 更新 LandingPage.tsx

將 `src/pages/LandingPage.tsx` 替換為完整版本：

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import Starfield from '../components/ui/Starfield';

/**
 * 首頁 - LEO 衛星模擬器入口
 *
 * 提供兩種模擬模式的選擇：
 * 1. Satellite Handover - 衛星間換手模擬
 * 2. Beam Hopping - 多波束跳躍模擬 (開發中)
 */
export function LandingPage() {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      background: 'radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%)',
      overflow: 'hidden'
    }}>
      {/* 背景星空 */}
      <Starfield starCount={200} />

      {/* 主要內容 */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '40px'
      }}>
        {/* 標題區 */}
        <div style={{ textAlign: 'center', marginBottom: '60px' }}>
          <h1 style={{
            fontSize: '48px',
            fontWeight: '700',
            color: '#ffffff',
            margin: '0 0 16px 0',
            letterSpacing: '2px'
          }}>
            LEO Satellite Simulator
          </h1>
          <p style={{
            fontSize: '18px',
            color: 'rgba(255, 255, 255, 0.7)',
            margin: 0,
            maxWidth: '600px'
          }}>
            Low Earth Orbit Satellite Communication Simulation Platform
          </p>
          <p style={{
            fontSize: '14px',
            color: 'rgba(255, 255, 255, 0.5)',
            margin: '8px 0 0 0'
          }}>
            Based on 3GPP TR 38.821 NTN Standards
          </p>
        </div>

        {/* 模式選擇卡片 */}
        <div style={{
          display: 'flex',
          gap: '30px',
          flexWrap: 'wrap',
          justifyContent: 'center'
        }}>
          {/* Satellite Handover 卡片 */}
          <Link
            to="/satellite-handover"
            style={{
              width: '320px',
              padding: '40px 30px',
              backgroundColor: 'rgba(0, 136, 255, 0.1)',
              border: '2px solid rgba(0, 136, 255, 0.5)',
              borderRadius: '16px',
              textDecoration: 'none',
              transition: 'all 0.3s ease',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 136, 255, 0.2)';
              e.currentTarget.style.borderColor = '#0088ff';
              e.currentTarget.style.transform = 'translateY(-4px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 136, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.5)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              fontSize: '48px',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              🛰️
            </div>
            <h2 style={{
              fontSize: '24px',
              fontWeight: '600',
              color: '#0088ff',
              margin: '0 0 12px 0',
              textAlign: 'center'
            }}>
              Satellite Handover
            </h2>
            <p style={{
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.7)',
              margin: '0 0 20px 0',
              textAlign: 'center',
              lineHeight: '1.6'
            }}>
              Inter-satellite handover simulation with RSRP-based A4 event and geometric methods
            </p>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              justifyContent: 'center'
            }}>
              {['Starlink', 'OneWeb', 'RSRP', 'Geometric', 'DQN'].map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: '4px 12px',
                    backgroundColor: 'rgba(0, 136, 255, 0.2)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#88ccff'
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </Link>

          {/* Beam Hopping 卡片 (Coming Soon) */}
          <div
            style={{
              width: '320px',
              padding: '40px 30px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '2px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '16px',
              cursor: 'not-allowed',
              opacity: 0.6
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
              color: 'rgba(255, 255, 255, 0.5)',
              margin: '0 0 12px 0',
              textAlign: 'center'
            }}>
              Beam Hopping
            </h2>
            <p style={{
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.4)',
              margin: '0 0 20px 0',
              textAlign: 'center',
              lineHeight: '1.6'
            }}>
              Multi-beam time-division hopping simulation for LEO satellites
            </p>
            <div style={{
              textAlign: 'center',
              padding: '8px 16px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: '14px'
            }}>
              Coming Soon
            </div>
          </div>
        </div>

        {/* 底部資訊 */}
        <div style={{
          position: 'absolute',
          bottom: '30px',
          textAlign: 'center',
          color: 'rgba(255, 255, 255, 0.4)',
          fontSize: '13px'
        }}>
          <p style={{ margin: '0 0 4px 0' }}>
            NTPU Research Project | 3GPP NTN Compliant
          </p>
          <p style={{ margin: 0 }}>
            Starlink & OneWeb Constellation Data
          </p>
        </div>
      </div>
    </div>
  );
}
```

### Step 2: 驗證

```bash
npm run typecheck
npm run dev
```

訪問 `http://localhost:5173/` 檢查：
- 星空背景是否顯示
- 卡片 hover 效果是否正常
- 點擊 Satellite Handover 是否跳轉

## 驗收標準

- [ ] Landing Page 顯示正確
- [ ] 星空背景正常顯示
- [ ] Satellite Handover 卡片可點擊並跳轉
- [ ] Beam Hopping 卡片顯示 "Coming Soon"
- [ ] Hover 效果正常
- [ ] TypeScript 編譯通過

## 預期結果

一個專業的首頁，包含：
- 星空動畫背景
- 專案標題和說明
- 兩個模式選擇卡片
- 底部資訊

## 下一步

完成後繼續 `04-REFACTOR-SATELLITE-HANDOVER.md`
