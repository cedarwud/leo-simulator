# SDD-10: Physical Layer Model (SINR + Channel + Antenna)

## 1. Purpose

Replace the v1 fixed-capacity model with a paper-faithful physical layer that computes **distance-dependent SINR and Shannon capacity** per (satellite, cell) link. This module is the foundation for all v2 SDDs.

## 2. Paper Equations

### 2.1 Received Data (Eq. 2)

```
D_c^f = ΣΣΣ y_{s,c,b}^{f,t} × W_c^f × T_slot × log₂(1 + SINR_{s,c,b}^{f,t})
```

where SINR includes inter-beam interference and thermal noise.

### 2.2 SINR (derived from Eq. 2)

```
SINR_{s,c,b}^{f,t} = P_{s,c}^f × G_p × h_{s,c}^f
                      / (I_{s,c,b}^{f,t} + I_{c}^{g,f,t} + k × T_c × W_c^f)
```

- `P_{s,c}^f`: Transmit power allocated to cell c by satellite s
- `G_p = G_1p × G_2p`: Product of peak Tx and Rx antenna gains
- `h_{s,c}^f`: Channel gain (path loss) between satellite s and cell c center
- `I_{s,c,b}^{f,t}`: Inter-beam interference (Eq. 3)
- `I_c^{g,f,t}`: Terrestrial interference (ignored per Section II-B.3)
- `k × T_c × W_c^f`: Thermal noise

### 2.3 Inter-Beam Interference (Eq. 3)

```
I_{s,c,b}^{f,t} = Σ_{c'≠c} Σ_{s'} Σ_{b'∈B_b} y_{s',c',b'}^{f,t}
                 × P_{s,c}^f × G_1(θ_{c',s',c}) × G_2(θ_{s',c,s}) × h_{s',c}^f
```

where:
- `B_b`: Set of beams with same spectrum & polarization as beam b
- `G_1(θ)`: Tx antenna gain attenuation at off-axis angle θ
- `G_2(θ)`: Rx antenna gain attenuation at off-axis angle θ

### 2.4 Off-Axis Angles (Eq. 4-5)

```
θ_{c',s',c} = arccos[(d²_{s',c} + d²_{s',c'} - d²_{c,c'}) / (2 × d_{s',c} × d_{s',c'})]
θ_{s',c,s}  = arccos[(d²_{s,c} + d²_{s',c} - d²_{s,s'}) / (2 × d_{s,c} × d_{s',c})]
```

### 2.5 Channel Gain / Path Loss

Paper uses 3GPP TR 38.811 channel model (Section V-A):
```
h_{s,c}^f = 10^(-PL/10)
PL(dB) = FSPL(d, f_c) + SF + CL
FSPL = 32.45 + 20×log₁₀(f_GHz) + 20×log₁₀(d_km)
```

- **Frequency**: 20 GHz (Ka band)
- **SF/CL**: Elevation-dependent from 3GPP TR 38.811 Table (already in `PathLossCalculator.ts`)

### 2.6 Antenna Models

Paper references:
- **Satellite Tx antenna**: [20] (SpaceX parabolic), with off-axis gain pattern G_1(θ)
- **User Rx antenna**: [38] (3GPP 38.811), parabolic with peak gain G_2p
- **Terrestrial user Rx**: Omnidirectional, 0 dBi peak gain

Standard parabolic antenna gain model (ITU-R S.672):
```
G(θ) = G_max - min(12 × (θ/θ_3dB)², G_sll)     for 0 ≤ θ ≤ θ_m
G(θ) = G_max - G_sll                               for θ > θ_m
```

where:
- `G_max`: Peak gain (dBi)
- `θ_3dB`: Half-power beamwidth
- `G_sll`: Side lobe level (typically 20-30 dB)
- `θ_m = θ_3dB × √(G_sll/12)`: Transition angle

### 2.7 Satellite-Terrestrial Interference (Eq. 6, 9)

```
I_{g,c}^{f,t} = Σ_{s∈S} z_{s,c}^{f,t} × P_{s,c}^f × G_1p × G_1(θ_{c,s,g}) × G_3(θ_{s,g}) × h_{s,g}^f

INR constraint: I_g^{f,t} < I_g^th = -10 dB
```

### 2.8 Interference Threshold for Beam Sharing (Eq. 8)

```
G_th_{c,c'} = I_s^th - 10×log₁₀(S_c × B) - SNR_{c'} - 10×log₁₀(h_{s_c',c} / (δ_{c,c'} × h_{s_c,c}))

where δ_{c,c'} = 10^((SNR_c - SNR_c') / 10)
      I_s^th = -5 dB (inter-beam INR threshold)
```

## 3. Paper Parameters (Table II)

| Parameter | Value | Notes |
|-----------|-------|-------|
| Frequency | 20 GHz | Ka band downlink |
| Satellite bandwidth W₁ | 200 MHz | |
| Terrestrial bandwidth W₂ | 100 MHz | |
| Cell center bandwidth W_center | 20 MHz | For terrestrial cell center |
| Orbit altitude | 550 km | |
| Min elevation angle | 35° | |
| Target SNR | 12 dB | Per paper simplification |
| Inter-beam INR I_s^th | -5 dB | |
| Satellite-terrestrial INR I_g^th | -10 dB | |
| Receiver temperature T_c | 290 K (assumed) | Standard |
| Boltzmann constant k | 1.38×10⁻²³ J/K | |
| Satellite Tx power P_s | ~50 dBm per beam | From ref [20] |
| Satellite Tx peak gain G_1p | ~38 dBi | Ka-band parabolic |
| User Rx peak gain G_2p | ~35 dBi | 0.6m parabolic dish |
| Terrestrial Rx peak gain G_gp | 0 dBi | Handheld terminal |
| Spot beam 3dB beamwidth | ~1.5° | 550km, 34.6km cell radius |

## 4. Design

### 4.1 New Module: `channelModel.ts`

```
src/features/beam-hopping/algorithms/channelModel.ts
```

**Exported functions:**

```typescript
/** Physical layer parameters for Paper 4-1 */
export interface PhysicalLayerConfig {
  frequencyGhz: number;       // 20 GHz
  orbitalAltitudeKm: number;  // 550 km
  txPowerDbm: number;         // per-beam transmit power
  txPeakGainDbi: number;      // G_1p satellite antenna
  rxPeakGainDbi: number;      // G_2p user antenna
  beamwidth3dBDeg: number;    // spot beam 3dB beamwidth
  sideLobeLevel: number;      // G_sll (dB)
  receiverTempK: number;      // T_c
  interBeamINRThresholdDb: number;  // I_s^th = -5
  satTerrestrialINRThresholdDb: number; // I_g^th = -10
}

/** Compute slant distance from satellite to cell center */
export function computeSlantDistance(
  satelliteAltKm: number,
  elevationDeg: number
): number;

/** Compute free-space path loss (dB) */
export function computeFSPL(
  distanceKm: number,
  frequencyGhz: number
): number;

/** Full path loss using 3GPP 38.811 model (dB) */
export function computePathLoss(
  distanceKm: number,
  elevationDeg: number,
  frequencyGhz: number
): number;

/** Channel gain h_{s,c} (linear, not dB) */
export function computeChannelGain(
  distanceKm: number,
  elevationDeg: number,
  frequencyGhz: number
): number;

/** Antenna gain attenuation at off-axis angle θ (dB) */
export function computeAntennaGain(
  offAxisAngleDeg: number,
  peakGainDbi: number,
  beamwidth3dBDeg: number,
  sideLobeLevel: number
): number;

/** Off-axis angle between two cells as seen from a satellite (Eq. 4) */
export function computeOffAxisAngle(
  dSatToCell: number,    // d_{s',c}
  dSatToCell2: number,   // d_{s',c'}
  dCellToCell: number    // d_{c,c'}
): number;

/** SINR for a (satellite, cell, beam) link (dB) */
export function computeSINR(
  signalPower: number,      // P × G_p × h (linear)
  interBeamInterference: number,  // I_{s,c,b} (linear)
  terrestrialInterference: number, // I_c^g (linear)
  noisePower: number        // kTW (linear)
): number;

/** Shannon capacity per slot (Mbits) */
export function computeCapacityPerSlot(
  sinrDb: number,
  bandwidthMhz: number,
  slotDurationMs: number
): number;

/** Eq. 8: Dynamic threshold for beam sharing */
export function computeInterferenceThreshold(
  interBeamINR: number,
  numVisibleSats: number,
  numBeams: number,
  snrC: number,
  snrCprime: number,
  hRatio: number
): number;

/** Eq. 9: Satellite-terrestrial interference for a cluster (dB) */
export function computeSatTerrestrialInterference(
  txPowerDbm: number,
  txPeakGainDbi: number,
  txOffAxisGainDb: number,
  rxGainDbi: number,
  channelGainDb: number
): number;
```

### 4.2 Distance Calculation

The slant distance from satellite at altitude `h` to a cell center at elevation `el`:

```
d_slant = h / sin(el)
```

More precisely (with Earth radius R_e = 6371 km):
```
d_slant = -R_e × sin(el) + √((R_e × sin(el))² + 2×R_e×h + h²)
```

For inter-cell distance, we can use flat-earth approximation for nearby cells:
```
d_{c,c'} = √((x_c - x_{c'})² + (z_c - z_{c'})²) × scale_factor
```

where `scale_factor` converts simulation units to km (34.6 km per cell spacing).

### 4.3 Integration Points

**Replace in `lyapunovOptimizer.ts`** (line 154-158):
```typescript
// v1 (REMOVE):
const snrLinear = Math.pow(10, config.targetSnrDb / 10);
const capacityPerSlot = (config.satelliteBandwidthMhz / config.beamsPerSatellite) *
  (config.slotDurationMs / 1000) * Math.log2(1 + snrLinear);

// v2 (REPLACE WITH):
// Per-cell capacity computed using computeCapacityPerSlot() with actual SINR
```

**Replace in `spectrumSharing.ts`** (line 74-96):
```typescript
// v1 (REMOVE): computeInterference() with -20 + load * 20
// v2 (REPLACE WITH): computeSatTerrestrialInterference() using actual antenna/channel model

// v1 (REMOVE): computeCapacityGain() with fixed SNR
// v2 (REPLACE WITH): computeCapacityPerSlot() using actual SINR for shared spectrum
```

**Replace in `wmisScheduler.ts`** (line 52-57 weight calculation):
```typescript
// v1: uses config.targetSnrDb directly
// v2: pass actual SNR per (satellite, cell) pair from channelModel
```

### 4.4 Paper Simplification Note

The paper states in Section V-A: "target SNR of all beam cells is set to 12 dB". This means the paper **also uses a fixed target SNR** for capacity calculation, but the **interference model** (Eq. 3, 8) depends on actual distances and off-axis angles. Our implementation should:

1. Use **12 dB target SNR** for capacity calculation (consistent with paper)
2. Use **distance-dependent channel gain** for interference calculations (Eq. 3, 8)
3. Use **off-axis antenna gain model** for beam conflict determination (Eq. 4-5, 8)

This means the key improvement from SDD-10 is NOT changing capacity calculation, but rather providing the **interference model** that feeds into conflict graph construction (SDD-11) and spectrum sharing interference constraints (SDD-13).

## 5. Affected Files

| File | Change |
|------|--------|
| `src/features/beam-hopping/algorithms/channelModel.ts` | **NEW**: Complete physical layer module |
| `src/features/beam-hopping/algorithms/index.ts` | Export new module |
| `src/types/paper41.ts` | Add `PhysicalLayerConfig`, update `Paper41Config` |
| `src/features/beam-hopping/algorithms/__tests__/channelModel.test.ts` | **NEW**: Unit tests |

## 6. Deferred Integration

The following integrations are deferred to their respective SDDs:
- **SDD-11**: Conflict graph uses `computeOffAxisAngle()` + `computeInterferenceThreshold()` (Eq. 8) for satellite-aware edge construction
- **SDD-12**: WMIS uses per-cell capacity from `computeCapacityPerSlot()` in weight calculation
- **SDD-13**: BSSA uses `computeSatTerrestrialInterference()` (Eq. 9) for interference constraints and `computeCapacityPerSlot()` for fitness (Eq. 39)
- **SDD-14**: Handover uses channel gain for satellite selection quality metrics

## 7. Verification Criteria

- [ ] `computeFSPL(550/sin(35°), 20)` returns ~189 dB (Ka-band at ~960 km slant distance)
- [ ] `computeSlantDistance(550, 90)` = 550 km (directly overhead)
- [ ] `computeSlantDistance(550, 35)` ≈ 958 km
- [ ] `computeAntennaGain(0, 38, 1.5, 25)` = 38 dBi (on-axis = peak)
- [ ] `computeAntennaGain(1.5, 38, 1.5, 25)` ≈ 26 dBi (3dB down at beamwidth)
- [ ] `computeCapacityPerSlot(12, 50, 0.2)` ≈ 35.85 Mbits (consistent with v1)
- [ ] `computeOffAxisAngle()` matches geometric expectation for known triangle
- [ ] `computeSatTerrestrialInterference()` returns plausible INR values for Ka-band
- [ ] 20 unit tests covering all exported functions
- [ ] TypeScript compiles cleanly with `npx tsc --noEmit`
