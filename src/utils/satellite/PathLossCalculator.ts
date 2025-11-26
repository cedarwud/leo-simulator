/**
 * 路径损耗计算器（基于 3GPP TR 38.811）
 *
 * 参考论文：
 * "Performance Evaluation of Handover using A4 Event in LEO Satellites Network"
 * Yu et al., 2022
 *
 * 路径损耗模型：PL = PLb + PLg + PLs + PLe
 * 基础路径损耗：PLb = FSPL(d, fc) + SF + CL(α, fc)
 *
 * 论文使用 SLS channel model，仅考虑 PLb（忽略 PLg, PLs, PLe）
 */

/**
 * 论文 Table I: SF 和 CL 根据仰角变化
 * Suburban scenario, LOS condition
 */
interface PathLossTableEntry {
  elevation: number;     // 仰角（度）
  sf_los: number;        // Shadow Fading LOS (dB)
  sf_nlos: number;       // Shadow Fading NLOS (dB)
  cl: number;            // Clutter Loss (dB)
}

const PATH_LOSS_TABLE: PathLossTableEntry[] = [
  { elevation: 10, sf_los: 1.79, sf_nlos: 8.93, cl: 19.52 },
  { elevation: 20, sf_los: 1.14, sf_nlos: 9.08, cl: 18.17 },
  { elevation: 30, sf_los: 1.14, sf_nlos: 8.78, cl: 18.42 },
  { elevation: 40, sf_los: 0.92, sf_nlos: 10.25, cl: 18.28 },
  { elevation: 50, sf_los: 1.42, sf_nlos: 10.56, cl: 18.63 },
  { elevation: 60, sf_los: 1.56, sf_nlos: 10.74, cl: 17.68 },
  { elevation: 70, sf_los: 0.85, sf_nlos: 10.17, cl: 16.50 },
  { elevation: 80, sf_los: 0.72, sf_nlos: 11.52, cl: 16.30 },
  { elevation: 90, sf_los: 0.72, sf_nlos: 11.52, cl: 16.30 },
];

/**
 * 路径损耗计算结果（详细分量）
 */
export interface PathLossBreakdown {
  fspl: number;          // 自由空间路径损耗 (dB)
  sf: number;            // Shadow Fading (dB) - 论文中使用平均值
  cl: number;            // Clutter Loss (dB)
  total: number;         // 总路径损耗 (dB)
  rsrp: number;          // 接收信号强度 (dBm)
}

/**
 * 根据仰角插值获取 SF 和 CL
 */
function interpolatePathLossParams(elevation: number, useLOS: boolean = true): { sf: number; cl: number } {
  // 限制仰角范围
  elevation = Math.max(10, Math.min(90, elevation));

  // 找到相邻的表格项
  let lowerIdx = 0;
  let upperIdx = PATH_LOSS_TABLE.length - 1;

  for (let i = 0; i < PATH_LOSS_TABLE.length - 1; i++) {
    if (elevation >= PATH_LOSS_TABLE[i].elevation && elevation <= PATH_LOSS_TABLE[i + 1].elevation) {
      lowerIdx = i;
      upperIdx = i + 1;
      break;
    }
  }

  const lower = PATH_LOSS_TABLE[lowerIdx];
  const upper = PATH_LOSS_TABLE[upperIdx];

  // 线性插值
  const ratio = (elevation - lower.elevation) / (upper.elevation - lower.elevation);

  const sf = useLOS
    ? lower.sf_los + ratio * (upper.sf_los - lower.sf_los)
    : lower.sf_nlos + ratio * (upper.sf_nlos - lower.sf_nlos);

  const cl = lower.cl + ratio * (upper.cl - lower.cl);

  return { sf, cl };
}

/**
 * 计算完整的路径损耗（符合论文模型）
 *
 * @param distance 距离 (km)
 * @param elevation 仰角 (度)
 * @param frequency_ghz 频率 (GHz)
 * @param tx_power_dbm 发射功率 (dBm)
 * @param useLOS 是否使用 LOS 模型（论文使用 LOS for suburban）
 * @param useSF 是否启用 Shadow Fading（论文使用，但对于确定性模拟可以禁用）
 * @returns 路径损耗详细分量和 RSRP
 */
export function calculatePathLoss(
  distance: number,
  elevation: number,
  frequency_ghz: number = 2.0,  // S-band
  tx_power_dbm: number = 50.0,  // 论文 Table II
  useLOS: boolean = true,
  useSF: boolean = false  // 默认不使用 SF（确定性模拟）
): PathLossBreakdown {
  // 1. 计算 FSPL（自由空间路径损耗）
  // FSPL(d, fc) = 32.45 + 20*log10(fc) + 20*log10(d)
  // d 单位：km, fc 单位：GHz
  const fspl = 32.45 + 20 * Math.log10(frequency_ghz) + 20 * Math.log10(distance);

  // 2. 获取 SF 和 CL（根据仰角插值）
  const { sf: sf_value, cl } = interpolatePathLossParams(elevation, useLOS);

  // SF 是 log-normal 随机变量，平均值为 0
  // 对于确定性模拟，我们可以：
  // - 使用 0（平均值）
  // - 使用固定的 SF 值（论文提供的 σ_SF）
  // 这里如果 useSF=true，使用 σ_SF 作为固定偏移（保守估计）
  const sf = useSF ? sf_value : 0;

  // 3. 总路径损耗
  const total = fspl + sf + cl;

  // 4. RSRP = Tx_Power - PL
  const rsrp = tx_power_dbm - total;

  return {
    fspl,
    sf,
    cl,
    total,
    rsrp
  };
}

/**
 * 简化接口：仅返回 RSRP
 */
export function calculateRSRP(
  distance: number,
  elevation: number,
  frequency_ghz: number = 2.0,
  tx_power_dbm: number = 50.0
): number {
  return calculatePathLoss(distance, elevation, frequency_ghz, tx_power_dbm).rsrp;
}
