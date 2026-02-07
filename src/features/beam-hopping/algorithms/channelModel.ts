/**
 * Physical Layer Channel Model — Paper 4-1, Section II / V-A
 *
 * Implements Ka-band (20 GHz) satellite-to-ground channel model based on:
 * - 3GPP TR 38.811: Path loss (FSPL + shadow fading + clutter loss)
 * - ITU-R S.672-like parabolic antenna gain pattern
 * - Off-axis angle geometry (Eq. 4-5) for interference calculation
 * - SINR computation (Eq. 2-3) and Shannon capacity
 * - Satellite-terrestrial interference (Eq. 6, 9)
 * - Dynamic inter-beam interference threshold (Eq. 8)
 *
 * Parameters from Table II:
 *   Frequency: 20 GHz (Ka band)
 *   Altitude: 550 km
 *   Target SNR: 12 dB
 *   Inter-beam INR threshold I_s^th: -5 dB
 *   Satellite-terrestrial INR threshold I_g^th: -10 dB
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const BOLTZMANN_K = 1.38e-23;       // J/K
const EARTH_RADIUS_KM = 6371;       // km
const DEG_TO_RAD = Math.PI / 180;

// ─── Configuration ───────────────────────────────────────────────────────────

export interface PhysicalLayerConfig {
  /** Operating frequency (GHz), default 20 (Ka band) */
  frequencyGhz: number;
  /** LEO satellite orbital altitude (km) */
  orbitalAltitudeKm: number;
  /** Per-beam transmit power (dBm) */
  txPowerDbm: number;
  /** Satellite Tx antenna peak gain (dBi) */
  txPeakGainDbi: number;
  /** User Rx antenna peak gain (dBi) */
  rxPeakGainDbi: number;
  /** Spot beam 3 dB beamwidth (degrees) */
  beamwidth3dBDeg: number;
  /** Antenna side lobe level below peak (dB positive) */
  sideLobeLevel: number;
  /** Receiver noise temperature (K) */
  receiverTempK: number;
  /** Inter-beam INR threshold I_s^th (dB) */
  interBeamINRThresholdDb: number;
  /** Satellite-terrestrial INR threshold I_g^th (dB) */
  satTerrestrialINRThresholdDb: number;
  /** Terrestrial user Rx peak gain (dBi) */
  terrestrialRxGainDbi: number;
  /** Rain rate (mm/h) for ITU-R P.618 attenuation, default 10 (moderate rain) */
  rainRateMmPerH?: number;
  /** Enable 3GPP 38.811 shadow fading (deterministic mean), default true */
  enableShadowFading?: boolean;
  /** Enable atmospheric effects (gaseous absorption + rain attenuation), default true */
  enableAtmosphericEffects?: boolean;
}

export const DEFAULT_PHYSICAL_LAYER_CONFIG: PhysicalLayerConfig = {
  frequencyGhz: 20,
  orbitalAltitudeKm: 550,
  txPowerDbm: 50,
  txPeakGainDbi: 38,
  rxPeakGainDbi: 35,
  beamwidth3dBDeg: 1.5,
  sideLobeLevel: 25,
  receiverTempK: 290,
  interBeamINRThresholdDb: -5,
  satTerrestrialINRThresholdDb: -10,
  terrestrialRxGainDbi: 0,
  rainRateMmPerH: 10,
  enableShadowFading: true,
  enableAtmosphericEffects: true,
};

// ─── 3GPP TR 38.811 Shadow Fading & Clutter Loss Table ──────────────────────

interface PathLossTableEntry {
  elevation: number;
  sfLos: number;
  cl: number;
}

/**
 * Suburban scenario, LOS condition (from 3GPP TR 38.811)
 * Already present in PathLossCalculator.ts — duplicated here for self-contained module.
 */
const PATH_LOSS_TABLE: PathLossTableEntry[] = [
  { elevation: 10, sfLos: 1.79, cl: 19.52 },
  { elevation: 20, sfLos: 1.14, cl: 18.17 },
  { elevation: 30, sfLos: 1.14, cl: 18.42 },
  { elevation: 40, sfLos: 0.92, cl: 18.28 },
  { elevation: 50, sfLos: 1.42, cl: 18.63 },
  { elevation: 60, sfLos: 1.56, cl: 17.68 },
  { elevation: 70, sfLos: 0.85, cl: 16.50 },
  { elevation: 80, sfLos: 0.72, cl: 16.30 },
  { elevation: 90, sfLos: 0.72, cl: 16.30 },
];

function interpolatePathLossParams(elevationDeg: number): { sf: number; cl: number } {
  const el = Math.max(10, Math.min(90, elevationDeg));
  let lo = 0;
  let hi = PATH_LOSS_TABLE.length - 1;
  for (let i = 0; i < PATH_LOSS_TABLE.length - 1; i++) {
    if (el >= PATH_LOSS_TABLE[i].elevation && el <= PATH_LOSS_TABLE[i + 1].elevation) {
      lo = i;
      hi = i + 1;
      break;
    }
  }
  const lower = PATH_LOSS_TABLE[lo];
  const upper = PATH_LOSS_TABLE[hi];
  const t = upper.elevation === lower.elevation ? 0 : (el - lower.elevation) / (upper.elevation - lower.elevation);
  return {
    sf: lower.sfLos + t * (upper.sfLos - lower.sfLos),
    cl: lower.cl + t * (upper.cl - lower.cl),
  };
}

// ─── Distance Calculations ──────────────────────────────────────────────────

/**
 * Compute slant distance from satellite to ground point.
 *
 * Uses the exact formula with Earth curvature:
 *   d = -R_e sin(el) + sqrt((R_e sin(el))² + 2 R_e h + h²)
 *
 * @param altitudeKm Satellite orbital altitude (km)
 * @param elevationDeg Elevation angle from ground point (degrees)
 * @returns Slant distance in km
 */
export function computeSlantDistance(altitudeKm: number, elevationDeg: number): number {
  const el = elevationDeg * DEG_TO_RAD;
  const Re = EARTH_RADIUS_KM;
  const h = altitudeKm;
  const sinEl = Math.sin(el);
  return -Re * sinEl + Math.sqrt((Re * sinEl) ** 2 + 2 * Re * h + h * h);
}

// ─── Path Loss ──────────────────────────────────────────────────────────────

/**
 * Free-space path loss (dB)
 *
 * FSPL = 92.45 + 20 log₁₀(f_GHz) + 20 log₁₀(d_km)
 *
 * Derivation: 20*log10(4π*d*f/c) where d in km, f in GHz
 *   = 20*log10(4π) + 20*log10(d*1e3) + 20*log10(f*1e9) - 20*log10(3e8)
 *   = 20*log10(4π) + 20*log10(d) + 60 + 20*log10(f) + 180 - 20*log10(3e8)
 *   = 92.45 + 20*log10(f_GHz) + 20*log10(d_km)
 */
export function computeFSPL(distanceKm: number, frequencyGhz: number): number {
  if (distanceKm <= 0) return 0;
  return 92.45 + 20 * Math.log10(frequencyGhz) + 20 * Math.log10(distanceKm);
}

/**
 * Rain attenuation (dB) — ITU-R P.618 simplified
 *
 * A_rain = γ_R × L_e
 * where γ_R = k × R^α (specific attenuation, dB/km, ITU-R P.838)
 *       L_e = L_s × r_p (effective path length through rain)
 *       L_s = (H_R - H_S) / sin(el) (slant path below rain height)
 *       r_p = 1 / (1 + L_G/35) (path reduction factor)
 *
 * Ka-band 20 GHz vertical polarization: k ≈ 0.0751, α ≈ 1.099
 * Rain height H_R ≈ 3.0 km (ITU-R P.839, mid-latitude 20°N)
 */
export function computeRainAttenuation(
  elevationDeg: number,
  frequencyGhz: number,
  rainRateMmPerH: number,
): number {
  if (rainRateMmPerH <= 0 || elevationDeg <= 0) return 0;

  // ITU-R P.838 regression coefficients for vertical polarization
  // Approximation valid for 15-30 GHz range
  const fRatio = frequencyGhz / 20;
  const kV = 0.0751 * fRatio ** 1.6;
  const alphaV = 1.099;

  // Rain height (ITU-R P.839, mid-latitude average)
  const H_R = 3.0; // km
  const H_S = 0.0; // station height above sea level (km)

  const elRad = elevationDeg * DEG_TO_RAD;
  const sinEl = Math.sin(elRad);
  if (sinEl <= 0.01) return 0;

  // Slant path length below rain height (km)
  const L_s = (H_R - H_S) / sinEl;

  // Horizontal projection
  const L_G = L_s * Math.cos(elRad);

  // Path reduction factor (ITU-R P.618 simplified)
  const r_p = 1 / (1 + L_G / 35);

  // Effective path length
  const L_e = L_s * r_p;

  // Specific attenuation (dB/km)
  const gamma_R = kV * Math.pow(rainRateMmPerH, alphaV);

  return gamma_R * L_e;
}

/**
 * Atmospheric gaseous attenuation (dB) — ITU-R P.676 simplified
 *
 * At Ka-band (20 GHz):
 *   Oxygen:      γ_o ≈ 0.01 dB/km, scale height h_o ≈ 6 km
 *   Water vapor:  γ_w ≈ 0.05 dB/km, scale height h_w ≈ 2 km
 *
 * Zenith attenuation: A_zenith = γ_o × h_o + γ_w × h_w ≈ 0.16 dB
 * Slant correction:   A_gas = A_zenith / sin(elevation)
 */
export function computeGaseousAttenuation(
  elevationDeg: number,
  frequencyGhz: number,
): number {
  if (elevationDeg <= 0) return 0;

  // Specific attenuation coefficients at 20 GHz (approximate scaling)
  const fRatio = frequencyGhz / 20;
  const gamma_o = 0.01 * fRatio; // O₂ dry air
  const gamma_w = 0.05 * fRatio; // H₂O water vapor

  // Equivalent scale heights (km)
  const h_o = 6.0;
  const h_w = 2.0;

  // Zenith attenuation (dB)
  const A_zenith = gamma_o * h_o + gamma_w * h_w;

  const sinEl = Math.sin(elevationDeg * DEG_TO_RAD);
  if (sinEl <= 0.01) return A_zenith * 100; // cap at very low elevation

  return A_zenith / sinEl;
}

/**
 * Full path loss using 3GPP TR 38.811 model (dB)
 *
 * PL = FSPL(d, fc) + CL(elevation) + SF(elevation) + A_gas(elevation) + A_rain(elevation, R)
 *
 * Shadow fading uses deterministic mean from 3GPP table (not random).
 * Atmospheric effects: ITU-R P.676 gaseous + ITU-R P.618 rain attenuation.
 *
 * @param config Optional physical layer config. When omitted, SF and gaseous
 *   attenuation are enabled by default; rain uses config.rainRateMmPerH.
 */
export function computePathLoss(
  distanceKm: number,
  elevationDeg: number,
  frequencyGhz: number,
  config?: PhysicalLayerConfig,
): number {
  const fspl = computeFSPL(distanceKm, frequencyGhz);
  const { sf, cl } = interpolatePathLossParams(elevationDeg);

  let totalLoss = fspl + cl;

  // Shadow fading (3GPP 38.811 LOS, deterministic mean value)
  if (config?.enableShadowFading ?? true) {
    totalLoss += sf;
  }

  // Atmospheric effects
  if (config?.enableAtmosphericEffects ?? true) {
    totalLoss += computeGaseousAttenuation(elevationDeg, frequencyGhz);

    const rainRate = config?.rainRateMmPerH ?? 0;
    if (rainRate > 0) {
      totalLoss += computeRainAttenuation(elevationDeg, frequencyGhz, rainRate);
    }
  }

  return totalLoss;
}

/**
 * Channel gain h_{s,c}^f (linear scale)
 *
 * h = 10^(-PL/10)
 */
export function computeChannelGain(
  distanceKm: number,
  elevationDeg: number,
  frequencyGhz: number,
  config?: PhysicalLayerConfig,
): number {
  const pl = computePathLoss(distanceKm, elevationDeg, frequencyGhz, config);
  return Math.pow(10, -pl / 10);
}

// ─── Antenna Gain Pattern ───────────────────────────────────────────────────

/**
 * Antenna gain at off-axis angle θ (dB)
 *
 * ITU-R S.672-like parabolic pattern:
 *   G(θ) = G_max - min(12 × (θ/θ_3dB)², G_sll)   for |θ| ≤ θ_m
 *   G(θ) = G_max - G_sll                           for |θ| > θ_m
 *
 * where θ_m = θ_3dB × sqrt(G_sll / 12)
 *
 * @param offAxisAngleDeg Off-axis angle θ (degrees)
 * @param peakGainDbi Peak gain G_max (dBi)
 * @param beamwidth3dBDeg Half-power beamwidth θ_3dB (degrees)
 * @param sideLobeLevel Side lobe level G_sll (dB below peak, positive value)
 * @returns Antenna gain in dBi
 */
export function computeAntennaGain(
  offAxisAngleDeg: number,
  peakGainDbi: number,
  beamwidth3dBDeg: number,
  sideLobeLevel: number,
): number {
  const theta = Math.abs(offAxisAngleDeg);
  const attenuation = Math.min(12 * (theta / beamwidth3dBDeg) ** 2, sideLobeLevel);
  return peakGainDbi - attenuation;
}

// ─── Off-Axis Angles (Eq. 4-5) ─────────────────────────────────────────────

/**
 * Off-axis angle using law of cosines (Eq. 4)
 *
 * θ = arccos((a² + b² - c²) / (2ab))
 *
 * @param dSatToTarget Distance from satellite to the target cell (km)
 * @param dSatToSource Distance from satellite to the interfering cell (km)
 * @param dTargetToSource Distance between the two cell centers (km)
 * @returns Off-axis angle in degrees
 */
export function computeOffAxisAngle(
  dSatToTarget: number,
  dSatToSource: number,
  dTargetToSource: number,
): number {
  if (dSatToTarget <= 0 || dSatToSource <= 0 || dTargetToSource <= 0) return 0;

  const cosAngle = (dSatToTarget ** 2 + dSatToSource ** 2 - dTargetToSource ** 2)
    / (2 * dSatToTarget * dSatToSource);

  // Clamp to [-1, 1] for numerical safety
  const clamped = Math.max(-1, Math.min(1, cosAngle));
  return Math.acos(clamped) / DEG_TO_RAD;
}

// ─── SINR and Capacity ──────────────────────────────────────────────────────

/**
 * Thermal noise power (linear, Watts)
 *
 * N = k × T_c × W (Hz)
 */
export function computeNoisePower(
  receiverTempK: number,
  bandwidthMhz: number,
): number {
  return BOLTZMANN_K * receiverTempK * bandwidthMhz * 1e6;
}

/**
 * SINR computation (dB)
 *
 * SINR = S / (I_beam + I_terrestrial + N)
 *
 * All inputs in linear (Watts)
 */
export function computeSINR(
  signalPower: number,
  interBeamInterference: number,
  terrestrialInterference: number,
  noisePower: number,
): number {
  const sinrLinear = signalPower / (interBeamInterference + terrestrialInterference + noisePower);
  return 10 * Math.log10(Math.max(sinrLinear, 1e-20));
}

/**
 * Shannon capacity per slot (Mbits)
 *
 * C = W × T_slot × log₂(1 + SINR_linear)
 *
 * @param sinrDb SINR in dB
 * @param bandwidthMhz Bandwidth in MHz
 * @param slotDurationMs Slot duration in ms
 * @returns Capacity in Mbits
 */
export function computeCapacityPerSlot(
  sinrDb: number,
  bandwidthMhz: number,
  slotDurationMs: number,
): number {
  const sinrLinear = Math.pow(10, sinrDb / 10);
  return bandwidthMhz * (slotDurationMs / 1000) * Math.log2(1 + sinrLinear);
}

// ─── Interference Threshold (Eq. 8) ────────────────────────────────────────

/**
 * Dynamic threshold for inter-beam interference (Eq. 8)
 *
 * G_th_{c,c'} = I_s^th - 10 log₁₀(S_c × B) - SNR_{c'} - 10 log₁₀(h_{s_c',c} / (δ × h_{s_c,c}))
 *
 * where δ = 10^((SNR_c - SNR_c') / 10)
 *
 * @param interBeamINRDb I_s^th (dB), typically -5
 * @param numVisibleSats S_c: max visible satellites for cell c
 * @param numBeams B: beams per satellite
 * @param snrCDb SNR of cell c (dB)
 * @param snrCprimeDb SNR of cell c' (dB)
 * @param channelGainRatio h_{s_c',c} / h_{s_c,c} (linear)
 * @returns G_th in dB — max allowed sum of antenna gain attenuation
 */
export function computeInterferenceThreshold(
  interBeamINRDb: number,
  numVisibleSats: number,
  numBeams: number,
  snrCDb: number,
  snrCprimeDb: number,
  channelGainRatio: number,
): number {
  const delta = Math.pow(10, (snrCDb - snrCprimeDb) / 10);
  const ratioDb = 10 * Math.log10(Math.max(channelGainRatio / delta, 1e-20));
  return interBeamINRDb - 10 * Math.log10(numVisibleSats * numBeams) - snrCprimeDb - ratioDb;
}

// ─── Satellite-Terrestrial Interference (Eq. 6, 9) ──────────────────────────

/**
 * Satellite-to-terrestrial interference for one beam-cluster pair (dB)
 *
 * I_{g,c} = P_{s,c} × G_1p × G_1(θ_{c,s,g}) × G_gp × h_{s,g}
 *
 * All parameters in dB, result in dB (relative to noise = INR).
 *
 * @param txPowerDbm Satellite transmit power (dBm)
 * @param txPeakGainDbi Satellite Tx peak gain (dBi)
 * @param txOffAxisGainDb Tx antenna gain at off-axis angle to cluster (dB)
 * @param rxGainDbi Terrestrial Rx gain (dBi), typically 0
 * @param channelGainDb Channel gain h_{s,g} in dB (negative)
 * @param noisePowerDbm Noise power at receiver (dBm)
 * @returns INR in dB
 */
export function computeSatTerrestrialINR(
  txPowerDbm: number,
  txOffAxisGainDb: number,
  rxGainDbi: number,
  channelGainDb: number,
  noisePowerDbm: number,
): number {
  const interferencePowerDbm = txPowerDbm + txOffAxisGainDb + rxGainDbi + channelGainDb;
  return interferencePowerDbm - noisePowerDbm;
}

// ─── Per-Cell Capacity Map ──────────────────────────────────────────────────

/**
 * Compute per-cell capacity map from satellite-cell geometry.
 *
 * For each (cellId, elevation) pair, computes the full link budget:
 *   slant distance → path loss (FSPL+CL+SF+gas+rain) → channel gain
 *   → received power → SINR (no inter-beam interference; handled by conflict graph)
 *   → Shannon capacity per slot
 *
 * @returns Map from cellId to capacity per slot (Mbits)
 */
export function computeCellCapacityMap(
  assignments: Array<{ cellId: number; elevationDeg: number }>,
  physConfig: PhysicalLayerConfig,
  bandwidthMhz: number,
  beamsPerSat: number,
  slotDurationMs: number,
): Map<number, number> {
  const capMap = new Map<number, number>();
  const bwPerBeam = bandwidthMhz / beamsPerSat;
  const noisePower = computeNoisePower(physConfig.receiverTempK, bwPerBeam);

  for (const { cellId, elevationDeg } of assignments) {
    const dist = computeSlantDistance(physConfig.orbitalAltitudeKm, elevationDeg);
    const channelGain = computeChannelGain(dist, elevationDeg, physConfig.frequencyGhz, physConfig);

    // Received signal power (Watts): P_rx = P_tx × G_1p × G_2p × h
    const signalPower = computeReceivedPower(
      physConfig.txPowerDbm,
      physConfig.txPeakGainDbi,
      physConfig.rxPeakGainDbi,
      channelGain,
    );

    // SINR (no inter-beam interference here; handled by conflict graph)
    const sinrDb = computeSINR(signalPower, 0, 0, noisePower);

    // Shannon capacity per slot (Mbits)
    const cap = computeCapacityPerSlot(sinrDb, bwPerBeam, slotDurationMs);
    capMap.set(cellId, cap);
  }

  return capMap;
}

// ─── Convenience Helpers ────────────────────────────────────────────────────

/**
 * Compute received signal power (linear, Watts) for a (satellite, cell) link
 *
 * P_rx = P_tx × G_1p × G_2p × h_{s,c}
 *
 * (all in dB then convert to linear)
 */
export function computeReceivedPower(
  txPowerDbm: number,
  txGainDbi: number,
  rxGainDbi: number,
  channelGainLinear: number,
): number {
  const txPowerWatts = Math.pow(10, (txPowerDbm - 30) / 10);
  const txGainLinear = Math.pow(10, txGainDbi / 10);
  const rxGainLinear = Math.pow(10, rxGainDbi / 10);
  return txPowerWatts * txGainLinear * rxGainLinear * channelGainLinear;
}

/**
 * Convert dBm to Watts
 */
export function dbmToWatts(dbm: number): number {
  return Math.pow(10, (dbm - 30) / 10);
}

/**
 * Convert Watts to dBm
 */
export function wattsToDbm(watts: number): number {
  return 10 * Math.log10(Math.max(watts, 1e-30)) + 30;
}

/**
 * Convert dB to linear
 */
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 10);
}

/**
 * Convert linear to dB
 */
export function linearToDb(linear: number): number {
  return 10 * Math.log10(Math.max(linear, 1e-30));
}
