# 星座切換功能說明

## 功能概述

leo-simulator 現在支援切換不同的衛星星座數據，可以選擇觀看 **Starlink** 或 **OneWeb** 衛星系統。

## 數據來源

所有數據來自 **orbit-engine** Stage 4 池優化輸出：
- 原始數據：`/home/sat/satellite/orbit-engine/data/outputs/stage4/link_feasibility_output_20251103_060257.json`
- 處理流程：TLE → SGP4 → 座標轉換 → 池優化

## 星座對比

| 星座 | 衛星數量 | 軌道週期 | 可見衛星數 | 數據大小 |
|------|---------|---------|-----------|---------|
| **Starlink** | 98 顆 | 95 分鐘 | 10-15 顆 | 4.2 MB |
| **OneWeb** | 26 顆 | 110 分鐘 | 3-5 顆 | 1.3 MB |

## 使用方式

### 1. 生成數據文件

```bash
cd /home/sat/satellite/leo-simulator

# 生成 Starlink 數據
python scripts/convert_orbit_engine_to_timeseries.py --constellation starlink

# 生成 OneWeb 數據
python scripts/convert_orbit_engine_to_timeseries.py --constellation oneweb

# 一次生成所有星座數據
python scripts/convert_orbit_engine_to_timeseries.py --all
```

### 2. 前端操作

1. 打開 http://localhost:3000/
2. 右上角會顯示「星座選擇」控制面板
3. 點擊 **Starlink** 或 **OneWeb** 按鈕切換星座
4. 系統會自動重新載入對應的衛星數據

## 技術實現

### 數據處理腳本

**檔案**：`scripts/convert_orbit_engine_to_timeseries.py`

**命令行參數**：
- `--constellation <name>` 或 `-c <name>`：選擇星座（starlink 或 oneweb）
- `--all` 或 `-a`：生成所有星座數據

**輸出文件**：
- `public/data/satellite-timeseries-starlink.json`
- `public/data/satellite-timeseries-oneweb.json`

### 前端組件

**星座選擇器**：`src/components/controls/ConstellationSelector.tsx`
- 顯示星座名稱、衛星數量、可見範圍
- 支援點擊切換
- 視覺回饋（高亮選中項）

**主場景**：`src/components/scene/MainScene.tsx`
- 管理當前選擇的星座狀態
- 動態載入對應的數據文件
- 使用 `key={constellation}` 強制重新載入組件

## 數據格式

每個星座數據文件包含：

```json
{
  "metadata": {
    "constellation": "starlink | oneweb",
    "generated_at": "ISO 8601 timestamp",
    "source": "orbit-engine Stage 4 pool_optimization",
    "orbit_period_minutes": 95.0
  },
  "statistics": {
    "total_satellites": 98,
    "constellation": "starlink",
    "time_points": 190,
    "time_step_seconds": 30,
    "avg_visible_satellites": 10.5,
    "visible_range": [9, 13]
  },
  "satellites": [
    {
      "id": "46058",
      "name": "46058",
      "constellation": "starlink",
      "position_timeseries": [
        {
          "timestamp": "2025-11-03T06:02:57Z",
          "is_visible": true,
          "azimuth_deg": 123.45,
          "elevation_deg": 45.67,
          "distance_km": 1234.56
        }
      ]
    }
  ]
}
```

## 換手動畫參數

換手動畫參數已針對長時間展示優化：

- **總時長**：50 秒（preparing 12s + selecting 10s + establishing 12s + switching 12s + completing 4s）
- **觸發提早**：仰角 < 45° 開始準備
- **候選衛星**：同時顯示 6 顆候選
- **動畫頻率**：0.3-0.8 Hz（緩慢呼吸感）

## 開發服務器

```bash
npm run dev
# 訪問 http://localhost:3000/
```

## 檔案位置

```
leo-simulator/
├── scripts/
│   └── convert_orbit_engine_to_timeseries.py  # 數據轉換腳本
├── public/data/
│   ├── satellite-timeseries-starlink.json     # Starlink 數據
│   └── satellite-timeseries-oneweb.json       # OneWeb 數據
├── src/
│   ├── components/
│   │   ├── controls/
│   │   │   └── ConstellationSelector.tsx     # 星座選擇器
│   │   ├── scene/
│   │   │   └── MainScene.tsx                 # 主場景（整合選擇器）
│   │   └── satellite/
│   │       ├── Satellites.tsx                # 衛星渲染
│   │       └── EnhancedSatelliteLinks.tsx   # 換手動畫
│   └── utils/satellite/
│       └── EnhancedHandoverManager.ts        # 換手管理器
└── CONSTELLATION_SWITCHING.md                # 本文檔
```

## orbit-engine 數據路徑

```
orbit-engine/
└── data/outputs/stage4/
    └── link_feasibility_output_20251103_060257.json
        ├── pool_optimization.optimized_pools.starlink  (98 顆)
        ├── pool_optimization.optimized_pools.oneweb    (26 顆)
        └── pool_optimization.optimized_pools.other     (其他星座)
```

## 未來擴展

如需添加更多星座（如 Other）：

1. 在 `ConstellationSelector.tsx` 添加選項
2. 在 `ConstellationType` 添加類型
3. 運行 `python scripts/convert_orbit_engine_to_timeseries.py --constellation other`
4. 數據會自動生成到 `public/data/satellite-timeseries-other.json`
