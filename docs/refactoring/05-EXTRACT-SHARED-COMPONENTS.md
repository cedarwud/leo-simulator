# SDD 05: 抽取共用組件

## 任務說明

將可以在多個頁面共用的組件移動到 `shared/` 目錄。

## 前置條件

- 完成 `04-REFACTOR-SATELLITE-HANDOVER.md`
- 頁面導航已設定完成

## 執行步驟

### Step 1: 建立 shared 目錄結構

```bash
mkdir -p /home/sat/satellite/leo-simulator/src/shared/components
mkdir -p /home/sat/satellite/leo-simulator/src/shared/hooks
```

### Step 2: 移動 Starfield 組件

Starfield 是可以在多個頁面共用的背景組件。

```bash
# 移動檔案
mv /home/sat/satellite/leo-simulator/src/components/ui/Starfield.tsx \
   /home/sat/satellite/leo-simulator/src/shared/components/Starfield.tsx
```

### Step 3: 建立 shared/components/index.ts

建立 `src/shared/components/index.ts`：

```tsx
export { default as Starfield } from './Starfield';
```

### Step 4: 更新 Starfield.tsx 的 export

檢查 `src/shared/components/Starfield.tsx` 的 export 方式，確保正確：

```tsx
// 如果是 export default，保持不變
// 如果需要，更新為 named export
```

### Step 5: 更新 import 路徑

更新所有引用 Starfield 的檔案：

**src/pages/LandingPage.tsx:**
```tsx
// 舊
import Starfield from '../components/ui/Starfield';

// 新
import { Starfield } from '../shared/components';
```

**src/components/scene/MainScene.tsx:**
```tsx
// 舊
import Starfield from '../ui/Starfield';

// 新
import { Starfield } from '../../shared/components';
```

### Step 6: 更新 TypeScript 路徑別名 (可選)

如果需要，在 `tsconfig.json` 中添加路徑別名：

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@shared/*": ["./src/shared/*"],
      "@pages/*": ["./src/pages/*"]
    }
  }
}
```

並在 `vite.config.ts` 中添加對應配置：

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@pages': path.resolve(__dirname, './src/pages'),
    },
  },
});
```

### Step 7: 驗證

```bash
npm run typecheck
npm run dev
```

確認：
- Landing Page 的星空背景正常
- Satellite Handover 頁面的星空背景正常

## 驗收標準

- [ ] `src/shared/` 目錄已建立
- [ ] Starfield 組件已移動到 shared
- [ ] 所有 import 路徑已更新
- [ ] TypeScript 編譯通過
- [ ] 兩個頁面的星空背景都正常顯示

## 預期結果

```
src/
├── shared/
│   ├── components/
│   │   ├── index.ts
│   │   └── Starfield.tsx
│   └── hooks/
│       └── (未來共用 hooks)
├── pages/
│   ├── LandingPage.tsx
│   └── SatelliteHandoverPage.tsx
└── ...
```

## 下一步

完成後繼續 `06-FINAL-TESTING.md`
