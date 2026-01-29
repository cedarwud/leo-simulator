import { BeamConfig, Beam, FRF3_COLORS } from '../types';

/**
 * 生成 7-beam 六角形排列的波束配置
 *
 * 排列方式:
 *         [2]
 *     [1]     [3]
 *         [0]
 *     [6]     [4]
 *         [5]
 */
export function generate7BeamLayout(config: BeamConfig): Beam[] {
  const { cellSpacing, coneRadiusBottom, frequencyReuseFactor } = config;

  // 六角形排列的偏移量
  const hexOffsets = [
    { x: 0, z: 0 },                                    // 中心 [0]
    { x: -cellSpacing * 0.866, z: cellSpacing * 0.5 }, // 左上 [1]
    { x: 0, z: cellSpacing },                          // 上   [2]
    { x: cellSpacing * 0.866, z: cellSpacing * 0.5 },  // 右上 [3]
    { x: cellSpacing * 0.866, z: -cellSpacing * 0.5 }, // 右下 [4]
    { x: 0, z: -cellSpacing },                         // 下   [5]
    { x: -cellSpacing * 0.866, z: -cellSpacing * 0.5 },// 左下 [6]
  ];

  // FRF3 頻率分組 (確保相鄰波束不同頻率)
  const frequencyGroups = [0, 1, 2, 1, 2, 0, 0];

  const colors = Object.values(FRF3_COLORS);

  return hexOffsets.map((offset, index) => ({
    id: index,
    position: { x: offset.x, z: offset.z },
    radius: coneRadiusBottom,
    color: frequencyReuseFactor === 3 ? colors[frequencyGroups[index]] : colors[0],
    isActive: false,
    frequencyGroup: frequencyGroups[index],
  }));
}

/**
 * 根據時隙更新波束活躍狀態
 */
export function updateBeamActiveStates(
  beams: Beam[],
  activeBeamIds: number[]
): Beam[] {
  return beams.map(beam => ({
    ...beam,
    isActive: activeBeamIds.includes(beam.id),
  }));
}
