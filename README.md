# 🛰️ LEO Satellite Handover Visualization

**3D Interactive Simulation of LEO Satellite Handover Using 3GPP Standards**

A React + Three.js visualization system demonstrating satellite handover mechanisms for LEO constellations (Starlink & OneWeb).

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (with npm)

### Installation & Run

```bash
# Clone this repository
git clone <repository-url>
cd leo-simulator

# Install dependencies
npm install

# Start development server
npm run dev
```

That's it! The app will open at `http://localhost:3000` 🎉

---

## 🧭 開發注意事項（避免 HMR 被舊 .js 影響）

- 專案採用 TypeScript，`tsconfig.json` 已設定 `"noEmit": true`，避免在 `src/` 產出 `.js`。
- 請使用提供的指令（`npm run dev` / `npm run build` / `npm run typecheck`），不要直接跑裸的 `tsc`，以免在 `src/` 生成 `.js` 讓 Vite/HMR 誤載舊檔。
- 若不小心把 TS 編譯出的 `.js` 帶進 `src/`，可執行 `npm run clean:ts-output` 清除（只會刪除與同名 `.ts/.tsx` 共存的 `.js/.map`，不會刪掉手寫 JS）。
- `npm run dev` / `npm run build` 會自動先跑清理腳本，確保開發時載入的都是最新 TS/TSX 原始碼。

---

## 📦 What's Included

This repository includes **pre-generated satellite data** for immediate use:

- ✅ `public/data/satellite-timeseries-starlink.json` (4.2 MB) - Starlink constellation
- ✅ `public/data/satellite-timeseries-oneweb.json` (1.3 MB) - OneWeb constellation
- ✅ `public/data/satellite-timeseries-starlink-enhanced.json` (6.9 MB) - Enhanced version

**No additional setup required** - just `npm install && npm run dev`!

---

## 🎮 Features

### Constellation Support
- **Starlink**: 98 satellites, ~10-15 visible, 95-min orbit
- **OneWeb**: 26 satellites, ~3-6 visible, 110-min orbit

### Handover Methods
- 🟢 **Geometric**: Elevation/distance-based (simple)
- 🔵 **RSRP-Based (A4)**: 3GPP A4 event trigger (standard-compliant)
- 🟠 **DQN-Based**: Deep Q-Network (under development)

### Visualization
- Real-time 3D satellite orbits
- UAV-satellite connection lines
- Handover phase indicators
- Signal quality gauges (RSRP/RSRQ/SINR)
- A4 event monitoring panel

---

## 📖 Documentation

- **[USER_GUIDE.md](USER_GUIDE.md)** - Detailed usage instructions
- **[CONSTELLATION_SWITCHING.md](CONSTELLATION_SWITCHING.md)** - How to switch constellations

---

## 🔄 Updating Satellite Data (Optional)

The included data is pre-generated from **orbit-engine** (our satellite data processing system).

To update with latest TLE data:

1. **Install orbit-engine** (separate repository)
2. **Run data generation** (~35 minutes)
   ```bash
   cd ../orbit-engine
   ./run.sh
   ```
3. **Convert to frontend format**
   ```bash
   cd ../leo-simulator
   python scripts/convert_orbit_engine_to_timeseries.py --all
   ```

**Note**: This is optional - the included data works perfectly for visualization and testing.

---

## 🛠️ Project Structure

```
leo-simulator/
├── public/
│   └── data/                    # Pre-generated satellite data (17 MB)
│       ├── satellite-timeseries-starlink.json
│       └── satellite-timeseries-oneweb.json
├── src/
│   ├── components/              # React components
│   │   ├── scene/              # 3D scene (MainScene, UAV, Satellites)
│   │   ├── satellite/          # Satellite rendering logic
│   │   └── ui/                 # UI panels (Sidebar, RightPanel)
│   ├── utils/                   # Utilities
│   │   └── satellite/          # Orbit calculation, handover managers
│   └── types/                   # TypeScript definitions
├── scripts/                     # Data conversion scripts (optional)
├── package.json
├── vite.config.ts
└── README.md
```

---

## 📊 Technical Details

### Coordinate Systems
- Observer: NTPU (24.94388888°N, 121.37083333°E, 36m)
- Satellite positions: Pre-calculated using SGP4 (Skyfield)
- Updates: 30-second intervals over 95-minute orbit

### Signal Models
- **RSRP**: Free Space Path Loss + Shadow Fading + Clutter Loss
- **Frequency**: 2.0 GHz (S-band)
- **Standards**: 3GPP TR 38.811 (NTN path loss models)

### Handover Standards
- **3GPP TS 38.331**: A3/A4/A5 event definitions
- **Time-to-Trigger (TTT)**: 10 seconds
- **Hysteresis**: Configurable

---

## 🎓 Academic References

Based on research paper:
- **Yu et al. (2022)**: "Performance Evaluation of Handover using A4 Event in LEO Satellites Network"

Implements standards:
- **3GPP TS 38.214**: 5G NR Physical layer procedures
- **3GPP TR 38.811**: Non-Terrestrial Networks (NTN) study

---

## 📝 License

[Add your license here]

---

## 🤝 Contributing

This is a research project. For questions or suggestions, please open an issue.

---

## 🌟 Quick Commands

```bash
# Development
npm run dev          # Start dev server (auto-opens browser)
npm run build        # Build for production
npm run preview      # Preview production build

# Code Quality
npm run lint         # ESLint check
npm run typecheck    # TypeScript type-only check (no emit)

# Utilities
npm run clean:ts-output  # Remove generated .js/.map that shadow TS/TSX
```

---

**Version**: 1.0.0
**Last Updated**: 2024-12-08
**Status**: Production Ready ✅
