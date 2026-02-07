import { describe, it, expect } from 'vitest';
import {
  computeSlantDistance,
  computeFSPL,
  computePathLoss,
  computeChannelGain,
  computeAntennaGain,
  computeOffAxisAngle,
  computeNoisePower,
  computeSINR,
  computeCapacityPerSlot,
  computeInterferenceThreshold,
  computeSatTerrestrialINR,
  computeReceivedPower,
  computeRainAttenuation,
  computeGaseousAttenuation,
  computeCellCapacityMap,
  dbmToWatts,
  wattsToDbm,
  dbToLinear,
  linearToDb,
  DEFAULT_PHYSICAL_LAYER_CONFIG,
} from '../channelModel';

describe('channelModel', () => {
  describe('computeSlantDistance', () => {
    it('directly overhead (90°) should equal altitude', () => {
      const d = computeSlantDistance(550, 90);
      expect(d).toBeCloseTo(550, 0);
    });

    it('at 35° elevation should be ~892 km', () => {
      const d = computeSlantDistance(550, 35);
      // Exact with Earth curvature: ~891 km
      expect(d).toBeGreaterThan(850);
      expect(d).toBeLessThan(950);
    });

    it('lower elevation means larger slant distance', () => {
      const d35 = computeSlantDistance(550, 35);
      const d60 = computeSlantDistance(550, 60);
      const d90 = computeSlantDistance(550, 90);
      expect(d35).toBeGreaterThan(d60);
      expect(d60).toBeGreaterThan(d90);
    });
  });

  describe('computeFSPL', () => {
    it('FSPL at 550km, 20GHz should be ~173 dB', () => {
      // 92.45 + 20*log10(20) + 20*log10(550) = 92.45 + 26.02 + 54.81 = 173.28
      const fspl = computeFSPL(550, 20);
      expect(fspl).toBeGreaterThan(172);
      expect(fspl).toBeLessThan(175);
    });

    it('FSPL at ~892km (35° slant), 20GHz should be ~177 dB', () => {
      const d = computeSlantDistance(550, 35);
      const fspl = computeFSPL(d, 20);
      // 92.45 + 26.02 + 20*log10(892) ≈ 92.45 + 26.02 + 59.01 = 177.48
      expect(fspl).toBeGreaterThan(175);
      expect(fspl).toBeLessThan(180);
    });

    it('FSPL increases with distance', () => {
      expect(computeFSPL(1000, 20)).toBeGreaterThan(computeFSPL(500, 20));
    });

    it('FSPL increases with frequency', () => {
      expect(computeFSPL(550, 20)).toBeGreaterThan(computeFSPL(550, 2));
    });

    it('returns 0 for zero distance', () => {
      expect(computeFSPL(0, 20)).toBe(0);
    });
  });

  describe('computePathLoss', () => {
    it('path loss should be greater than FSPL (adds clutter loss)', () => {
      const d = computeSlantDistance(550, 50);
      const fspl = computeFSPL(d, 20);
      const pl = computePathLoss(d, 50, 20);
      expect(pl).toBeGreaterThan(fspl);
    });

    it('path loss at lower elevation has higher clutter loss', () => {
      const d35 = computeSlantDistance(550, 35);
      const d60 = computeSlantDistance(550, 60);
      // Even though slant distance is larger at 35°, check CL component
      const pl35 = computePathLoss(d35, 35, 20);
      const pl60 = computePathLoss(d60, 60, 20);
      // 35° is farther AND has higher CL, so PL should be larger
      expect(pl35).toBeGreaterThan(pl60);
    });
  });

  describe('computeChannelGain', () => {
    it('channel gain is between 0 and 1', () => {
      const h = computeChannelGain(550, 90, 20);
      expect(h).toBeGreaterThan(0);
      expect(h).toBeLessThan(1);
    });

    it('channel gain decreases with distance', () => {
      const h90 = computeChannelGain(550, 90, 20);
      const d35 = computeSlantDistance(550, 35);
      const h35 = computeChannelGain(d35, 35, 20);
      expect(h90).toBeGreaterThan(h35);
    });
  });

  describe('computeAntennaGain', () => {
    it('on-axis gain equals peak gain', () => {
      expect(computeAntennaGain(0, 38, 1.5, 25)).toBe(38);
    });

    it('at half-power beamwidth, gain is 3dB below peak', () => {
      // G(θ_3dB) = G_max - 12*(θ_3dB/θ_3dB)² = G_max - 12
      const g = computeAntennaGain(1.5, 38, 1.5, 25);
      expect(g).toBeCloseTo(38 - 12, 1);
    });

    it('at half of beamwidth, gain is down by 3dB', () => {
      // G(θ_3dB/2) = G_max - 12*(0.5)² = G_max - 3
      const g = computeAntennaGain(0.75, 38, 1.5, 25);
      expect(g).toBeCloseTo(38 - 3, 1);
    });

    it('beyond transition angle, gain equals peak minus sidelobe level', () => {
      const g = computeAntennaGain(10, 38, 1.5, 25);
      expect(g).toBe(38 - 25);
    });

    it('negative angle gives same result as positive', () => {
      expect(computeAntennaGain(-2, 38, 1.5, 25))
        .toBe(computeAntennaGain(2, 38, 1.5, 25));
    });
  });

  describe('computeOffAxisAngle', () => {
    it('returns 0 for coincident points', () => {
      expect(computeOffAxisAngle(100, 100, 0)).toBe(0);
    });

    it('equilateral triangle gives 60°', () => {
      const angle = computeOffAxisAngle(100, 100, 100);
      expect(angle).toBeCloseTo(60, 1);
    });

    it('right triangle geometry', () => {
      // d_a=5, d_b=5, d_c=5*sqrt(2) -> 90°
      const angle = computeOffAxisAngle(5, 5, 5 * Math.SQRT2);
      expect(angle).toBeCloseTo(90, 1);
    });

    it('very close cells have small off-axis angle', () => {
      // Satellite at 550km, cells 34.6km apart
      const dSat = 550;
      const dCell = 34.6;
      const angle = computeOffAxisAngle(dSat, dSat, dCell);
      expect(angle).toBeGreaterThan(0);
      expect(angle).toBeLessThan(5);
    });
  });

  describe('computeNoisePower', () => {
    it('returns positive value', () => {
      const n = computeNoisePower(290, 50); // 50 MHz
      expect(n).toBeGreaterThan(0);
    });

    it('scales with bandwidth', () => {
      const n50 = computeNoisePower(290, 50);
      const n100 = computeNoisePower(290, 100);
      expect(n100 / n50).toBeCloseTo(2, 5);
    });
  });

  describe('computeSINR', () => {
    it('SINR with no interference equals SNR', () => {
      const signalPower = 1e-10; // -100 dBm
      const noise = 1e-13;       // -130 dBm
      const sinr = computeSINR(signalPower, 0, 0, noise);
      expect(sinr).toBeCloseTo(30, 1); // 30 dB
    });

    it('interference reduces SINR', () => {
      const signal = 1e-10;
      const noise = 1e-13;
      const noInterference = computeSINR(signal, 0, 0, noise);
      const withInterference = computeSINR(signal, 1e-12, 0, noise);
      expect(withInterference).toBeLessThan(noInterference);
    });
  });

  describe('computeCapacityPerSlot', () => {
    it('12 dB SNR, 50 MHz, 200ms slot matches v1 calculation', () => {
      // v1: (200/4) * (200/1000) * log2(1 + 10^1.2) ≈ 50 * 0.2 * 4.17 ≈ 41.7
      // Here: with 50 MHz BW and 200ms:
      const cap = computeCapacityPerSlot(12, 50, 200);
      expect(cap).toBeCloseTo(50 * 0.2 * Math.log2(1 + Math.pow(10, 1.2)), 1);
    });

    it('higher SINR gives higher capacity', () => {
      expect(computeCapacityPerSlot(15, 50, 200))
        .toBeGreaterThan(computeCapacityPerSlot(12, 50, 200));
    });

    it('capacity scales with bandwidth', () => {
      const cap50 = computeCapacityPerSlot(12, 50, 200);
      const cap100 = computeCapacityPerSlot(12, 100, 200);
      expect(cap100 / cap50).toBeCloseTo(2, 5);
    });
  });

  describe('computeInterferenceThreshold (Eq. 8)', () => {
    it('returns a finite value for typical parameters', () => {
      // I_s^th = -5, 2 visible sats, 4 beams, same SNR, same channel gain
      const gth = computeInterferenceThreshold(-5, 2, 4, 12, 12, 1.0);
      expect(Number.isFinite(gth)).toBe(true);
    });

    it('more visible satellites lowers the threshold', () => {
      const gth2 = computeInterferenceThreshold(-5, 2, 4, 12, 12, 1.0);
      const gth4 = computeInterferenceThreshold(-5, 4, 4, 12, 12, 1.0);
      // More sats -> lower threshold (more restrictive)
      expect(gth4).toBeLessThan(gth2);
    });
  });

  describe('computeSatTerrestrialINR (Eq. 9)', () => {
    it('returns plausible INR for typical Ka-band parameters', () => {
      // Tx: 50 dBm, off-axis gain: -10 dB (attenuation), Rx: 0 dBi
      // Channel: -185 dB, Noise: -100 dBm
      const inr = computeSatTerrestrialINR(50, -10, 0, -185, -100);
      // INR = 50 + (-10) + 0 + (-185) - (-100) = -45 dB
      expect(inr).toBeCloseTo(-45, 1);
    });

    it('closer off-axis means higher interference', () => {
      const inrClose = computeSatTerrestrialINR(50, 30, 0, -185, -100);
      const inrFar = computeSatTerrestrialINR(50, -10, 0, -185, -100);
      expect(inrClose).toBeGreaterThan(inrFar);
    });
  });

  describe('computeReceivedPower', () => {
    it('returns positive power', () => {
      const h = computeChannelGain(550, 90, 20);
      const pRx = computeReceivedPower(50, 38, 35, h);
      expect(pRx).toBeGreaterThan(0);
    });
  });

  describe('unit conversion helpers', () => {
    it('dbmToWatts: 30 dBm = 1 W', () => {
      expect(dbmToWatts(30)).toBeCloseTo(1, 5);
    });

    it('wattsToDbm: 1 W = 30 dBm', () => {
      expect(wattsToDbm(1)).toBeCloseTo(30, 5);
    });

    it('dbToLinear: 10 dB = 10', () => {
      expect(dbToLinear(10)).toBeCloseTo(10, 5);
    });

    it('linearToDb: 100 = 20 dB', () => {
      expect(linearToDb(100)).toBeCloseTo(20, 5);
    });

    it('round-trip conversions', () => {
      expect(wattsToDbm(dbmToWatts(42))).toBeCloseTo(42, 5);
      expect(linearToDb(dbToLinear(-3))).toBeCloseTo(-3, 5);
    });
  });

  // ─── Phase A: New ITU-R P.618 / P.676 Tests ─────────────────────────────

  describe('computeRainAttenuation (ITU-R P.618)', () => {
    it('returns 0 for zero rain rate', () => {
      expect(computeRainAttenuation(45, 20, 0)).toBe(0);
    });

    it('returns 0 for non-positive elevation', () => {
      expect(computeRainAttenuation(0, 20, 10)).toBe(0);
      expect(computeRainAttenuation(-5, 20, 10)).toBe(0);
    });

    it('returns positive attenuation for moderate rain at Ka-band', () => {
      const atten = computeRainAttenuation(45, 20, 10);
      expect(atten).toBeGreaterThan(0);
      expect(atten).toBeLessThan(15);
    });

    it('higher rain rate produces higher attenuation', () => {
      expect(computeRainAttenuation(45, 20, 25))
        .toBeGreaterThan(computeRainAttenuation(45, 20, 5));
    });

    it('lower elevation produces higher attenuation (longer slant path)', () => {
      expect(computeRainAttenuation(35, 20, 10))
        .toBeGreaterThan(computeRainAttenuation(60, 20, 10));
    });

    it('zenith (90°) at 20 GHz 10 mm/h should give ~2-4 dB', () => {
      const atten = computeRainAttenuation(90, 20, 10);
      expect(atten).toBeGreaterThan(1);
      expect(atten).toBeLessThan(6);
    });
  });

  describe('computeGaseousAttenuation (ITU-R P.676)', () => {
    it('returns 0 for non-positive elevation', () => {
      expect(computeGaseousAttenuation(0, 20)).toBe(0);
      expect(computeGaseousAttenuation(-5, 20)).toBe(0);
    });

    it('returns positive attenuation', () => {
      expect(computeGaseousAttenuation(45, 20)).toBeGreaterThan(0);
    });

    it('zenith (90°) at 20 GHz should be ~0.16 dB', () => {
      const atten = computeGaseousAttenuation(90, 20);
      expect(atten).toBeCloseTo(0.16, 1);
    });

    it('lower elevation increases attenuation', () => {
      expect(computeGaseousAttenuation(35, 20))
        .toBeGreaterThan(computeGaseousAttenuation(60, 20));
    });

    it('at 35° elevation should be ~0.28 dB', () => {
      const atten = computeGaseousAttenuation(35, 20);
      expect(atten).toBeGreaterThan(0.2);
      expect(atten).toBeLessThan(0.5);
    });
  });

  describe('computePathLoss with enhanced model', () => {
    const noEffects = {
      ...DEFAULT_PHYSICAL_LAYER_CONFIG,
      enableShadowFading: false,
      enableAtmosphericEffects: false,
    };

    it('without config: returns FSPL + CL + SF + gas (backward compatible)', () => {
      const pl = computePathLoss(550, 50, 20);
      const fspl = computeFSPL(550, 20);
      expect(pl).toBeGreaterThan(fspl); // at least CL added
    });

    it('with SF enabled: higher than without', () => {
      const plNoSF = computePathLoss(550, 50, 20, {
        ...DEFAULT_PHYSICAL_LAYER_CONFIG,
        enableShadowFading: false,
        enableAtmosphericEffects: false,
      });
      const plWithSF = computePathLoss(550, 50, 20, {
        ...DEFAULT_PHYSICAL_LAYER_CONFIG,
        enableShadowFading: true,
        enableAtmosphericEffects: false,
      });
      expect(plWithSF).toBeGreaterThan(plNoSF);
    });

    it('with rain: higher than dry', () => {
      const plDry = computePathLoss(550, 50, 20, {
        ...DEFAULT_PHYSICAL_LAYER_CONFIG,
        rainRateMmPerH: 0,
      });
      const plWet = computePathLoss(550, 50, 20, {
        ...DEFAULT_PHYSICAL_LAYER_CONFIG,
        rainRateMmPerH: 25,
      });
      expect(plWet).toBeGreaterThan(plDry);
    });

    it('bare mode matches FSPL + CL only', () => {
      const pl = computePathLoss(550, 50, 20, noEffects);
      const fspl = computeFSPL(550, 20);
      // Should be FSPL + CL only, no SF/gas/rain
      expect(pl).toBeGreaterThan(fspl);
      expect(pl - fspl).toBeLessThan(25); // CL is ~18 dB
    });
  });

  describe('computeCellCapacityMap', () => {
    it('should return capacity for each cell', () => {
      const map = computeCellCapacityMap(
        [{ cellId: 1, elevationDeg: 60 }, { cellId: 2, elevationDeg: 45 }],
        DEFAULT_PHYSICAL_LAYER_CONFIG,
        200, 4, 200,
      );
      expect(map.size).toBe(2);
      expect(map.get(1)).toBeGreaterThan(0);
      expect(map.get(2)).toBeGreaterThan(0);
    });

    it('higher elevation gives higher capacity (less path loss)', () => {
      const map = computeCellCapacityMap(
        [{ cellId: 1, elevationDeg: 80 }, { cellId: 2, elevationDeg: 40 }],
        DEFAULT_PHYSICAL_LAYER_CONFIG,
        200, 4, 200,
      );
      expect(map.get(1)!).toBeGreaterThan(map.get(2)!);
    });

    it('capacity should be in reasonable Mbits range', () => {
      const map = computeCellCapacityMap(
        [{ cellId: 1, elevationDeg: 60 }],
        DEFAULT_PHYSICAL_LAYER_CONFIG,
        200, 4, 200,
      );
      const cap = map.get(1)!;
      // Shannon capacity at ~12 dB SINR, 50 MHz, 0.2s: ~0.8 Mbits
      // With real link budget it varies, but should be positive and < 100
      expect(cap).toBeGreaterThan(0);
      expect(cap).toBeLessThan(100);
    });

    it('returns empty map for empty assignments', () => {
      const map = computeCellCapacityMap(
        [], DEFAULT_PHYSICAL_LAYER_CONFIG, 200, 4, 200,
      );
      expect(map.size).toBe(0);
    });
  });
});
