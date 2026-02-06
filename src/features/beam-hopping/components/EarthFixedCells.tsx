import React, { useMemo } from 'react';
import { Text, Line } from '@react-three/drei';
import * as THREE from 'three';

/**
 * 論文 4-1：雙極化配置顏色
 * 衛星天線採用 2 種正交極化方式來緩解波束間干擾
 * "Satellite antennas adopt two polarization configurations to alleviate inter-beam interference"
 */
export const POLARIZATION_COLORS = {
  A: '#ff8844',  // 極化 A：橙色
  B: '#44aaff',  // 極化 B：青色
} as const;

/**
 * 波束極化分配（論文 4-1）
 * 相鄰波束使用不同極化以避免干擾
 * Beam 1, 3, 5, 7... → 極化 A
 * Beam 2, 4, 6, 8... → 極化 B
 */
export function getBeamPolarization(beamId: number): 'A' | 'B' {
  return beamId % 2 === 1 ? 'A' : 'B';
}

/**
 * 獲取波束顏色（基於極化）
 */
export function getBeamColor(beamId: number): string {
  return POLARIZATION_COLORS[getBeamPolarization(beamId)];
}

/**
 * @deprecated 使用 POLARIZATION_COLORS 替代
 * 保留向後兼容
 */
export const FRF3_CELL_COLORS = {
  0: POLARIZATION_COLORS.A,  // 映射到極化 A
  1: POLARIZATION_COLORS.B,  // 映射到極化 B
  2: POLARIZATION_COLORS.A,  // 映射到極化 A（循環）
} as const;

/**
 * Earth-Fixed Cell 定義
 * 基於 4-1 論文：cells 是固定在地面的服務區域
 */
export interface EarthFixedCell {
  id: number;
  /** 地面中心位置 (場景座標) */
  position: { x: number; z: number };
  /** Cell 半徑 */
  radius: number;
  /** @deprecated 使用 servingPolarization 替代 */
  frequencyGroup: 0 | 1 | 2;
  /** Data Queue 長度 (bytes) */
  dataQueue: number;
  /** 流量到達率 */
  arrivalRate: number;
  /** 當前是否被服務 */
  isServed: boolean;
  /** 服務此 cell 的衛星 ID */
  servingSatelliteId: string | null;
  /** 服務此 cell 的波束 ID */
  servingBeamId: number | null;
  /** 服務此 cell 的波束極化 (論文 4-1) */
  servingPolarization: 'A' | 'B' | null;
  /** 服務此 cell 的波束顏色 */
  servingBeamColor: string | null;
  /** 能覆蓋此 cell 的衛星數量（用於顯示重疊區域）*/
  coveringSatelliteCount?: number;
  /** 是否受到鄰近波束的干擾 (Paper 4-1: inter-beam interference) */
  isInterfered: boolean;
  /** 干擾來源列表（可能被多個 beam 同時干擾） */
  interferingSources: Array<{
    satelliteId: string;
    beamId: number;
    polarization: 'A' | 'B';
  }>;
}

/**
 * 取得指定 cell 的相鄰 cell IDs
 * 六邊形網格中相鄰 cell 中心距離 = √3 × radius
 */
export function getNeighborCellIds(cellId: number, cells: EarthFixedCell[]): number[] {
  const targetCell = cells.find(c => c.id === cellId);
  if (!targetCell) return [];

  const maxNeighborDist = targetCell.radius * Math.sqrt(3) * 1.1; // 加 10% 容差

  return cells
    .filter(c => {
      if (c.id === cellId) return false;
      const dx = c.position.x - targetCell.position.x;
      const dz = c.position.z - targetCell.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      return dist < maxNeighborDist;
    })
    .map(c => c.id);
}

/**
 * 生成六邊形頂點
 */
function createHexagonGeometry(radius: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const sides = 6;
  
  for (let i = 0; i <= sides; i++) {
    // 從頂部開始（-90度），讓六邊形是「尖頂」朝上
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    
    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }
  
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2); // 平放在地面
  return geometry;
}

/**
 * 生成六邊形邊框點
 */
function createHexagonBorderPoints(radius: number): [number, number, number][] {
  const points: [number, number, number][] = [];
  const sides = 6;
  
  for (let i = 0; i <= sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    points.push([x, 0, z]);
  }
  
  return points;
}

/**
 * 單個 Earth-Fixed Cell 組件
 */
interface EarthFixedCellProps {
  cell: EarthFixedCell;
  showLabel?: boolean;
}

function EarthFixedCellComponent({
  cell,
  showLabel = true,
}: EarthFixedCellProps) {
  // 六邊形幾何
  const hexGeometry = useMemo(() => createHexagonGeometry(cell.radius), [cell.radius]);
  const borderPoints = useMemo(() => createHexagonBorderPoints(cell.radius), [cell.radius]);

  // 論文 4-1 顏色邏輯：
  // - 被服務時：顯示服務波束的極化顏色（亮色）
  // - 受干擾時：紅色半透明（inter-beam interference）
  // - 未受影響：淺灰色（仍可見）
  const baseColor = cell.isServed && cell.servingPolarization
    ? POLARIZATION_COLORS[cell.servingPolarization]
    : cell.isInterfered
      ? '#ff2222'     // 受干擾：鮮紅色
      : '#aaaaaa';    // 未受影響：淺灰色

  const fillOpacity = cell.isServed ? 0.5 : cell.isInterfered ? 0.7 : 0.25;
  const borderOpacity = cell.isServed ? 1.0 : cell.isInterfered ? 1.0 : 0.7;
  const borderWidth = cell.isServed ? 4 : cell.isInterfered ? 4 : 2.5;
  
  return (
    <group position={[cell.position.x, 3, cell.position.z]}>
      {/* 六邊形填充 */}
      <mesh geometry={hexGeometry}>
        <meshBasicMaterial
          color={baseColor}
          transparent
          opacity={fillOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      
      {/* 六邊形邊框 - 論文 4-1：顏色由服務波束極化決定 */}
      <Line
        points={borderPoints}
        color={baseColor}
        lineWidth={borderWidth}
        transparent
        opacity={borderOpacity}
        dashed={!cell.isServed}
        dashSize={12}
        gapSize={6}
        depthWrite={false}
      />
      
      {/* Cell ID 標籤 */}
      {showLabel && (
        <Text
          position={[0, 8, 0]}
          fontSize={14}
          color={cell.isServed ? '#ffffff' : '#aaccff'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={1}
          outlineColor="#000000"
        >
          {`C${cell.id}`}
        </Text>
      )}
      
      {/* 服務衛星標識 - 顯示當前服務此 Cell 的衛星 */}
      {cell.servingSatelliteId && (
        <Text
          position={[0, -2, 0]}
          fontSize={10}
          color="#ffff00"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.8}
          outlineColor="#000000"
        >
          {cell.servingSatelliteId.replace('LEO-SAT-', 'S')}
        </Text>
      )}
      
      {/* 重疊覆蓋指示器 - 顯示有多少衛星可以覆蓋此 Cell */}
      {cell.coveringSatelliteCount && cell.coveringSatelliteCount > 1 && (
        <Text
          position={[cell.radius * 0.6, 5, -cell.radius * 0.5]}
          fontSize={8}
          color="#ff8800"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.5}
          outlineColor="#000000"
        >
          {`×${cell.coveringSatelliteCount}`}
        </Text>
      )}
    </group>
  );
}

/**
 * 計算六邊形網格中的 FRF3 頻率組
 * 使用 3-coloring 確保相鄰 cells 不同頻率
 * 
 * 對於 pointy-top odd-r 排列：
 * - 使用 (row + col) % 3 的變體來確保 3-coloring
 */
function calculateFrequencyGroup(row: number, col: number): 0 | 1 | 2 {
  // 對於 odd-r 六邊形網格的 3-coloring
  // 奇數行需要調整以保持正確的相鄰關係
  const adjustedCol = row % 2 === 1 ? col : col;
  return ((row % 3) + (adjustedCol % 3)) % 3 as 0 | 1 | 2;
}

/**
 * 生成 4x5 六邊形網格的 cells
 * 使用 offset 座標系統（odd-r）實現蜂巢式排列
 * 
 * Pointy-top 六邊形緊密排列公式：
 * - 水平間距 = sqrt(3) * radius
 * - 垂直間距 = 1.5 * radius
 * - 奇數行偏移 = sqrt(3) * radius / 2
 */
export function generateEarthFixedCells(config: {
  rows: number;
  cols: number;
  cellRadius: number;
  centerX: number;
  centerZ: number;
}): EarthFixedCell[] {
  const { rows, cols, cellRadius, centerX, centerZ } = config;
  const cells: EarthFixedCell[] = [];
  
  // 六邊形蜂巢式緊密排列的間距計算（pointy-top hexagon）
  const horizontalSpacing = cellRadius * Math.sqrt(3);  // ≈ 1.732 * radius
  const verticalSpacing = cellRadius * 1.5;
  const rowOffset = horizontalSpacing / 2;  // 奇數行的偏移量
  
  // 計算網格的總尺寸，以便居中
  const gridWidth = (cols - 1) * horizontalSpacing + rowOffset;
  const gridHeight = (rows - 1) * verticalSpacing;
  const startX = centerX - gridWidth / 2;
  const startZ = centerZ - gridHeight / 2;
  
  let cellId = 1;
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Odd-r offset: 奇數行向右偏移
      const xOffset = (row % 2 === 1) ? rowOffset : 0;
      
      const x = startX + col * horizontalSpacing + xOffset;
      const z = startZ + row * verticalSpacing;
      
      // 計算此 cell 的頻率組（FRF3）
      const frequencyGroup = calculateFrequencyGroup(row, col);
      
      cells.push({
        id: cellId,
        position: { x, z },
        radius: cellRadius,
        frequencyGroup,  // @deprecated 保留向後兼容
        dataQueue: 200 + Math.random() * 300, // 初始 200-500（範圍 0-1000）
        arrivalRate: 80 + Math.random() * 40, // 80-120 Mbps
        isServed: false,
        servingSatelliteId: null,
        servingBeamId: null,
        servingPolarization: null,  // 論文 4-1：由服務波束決定
        servingBeamColor: null,
        isInterfered: false,
        interferingSources: [],
      });
      
      cellId++;
    }
  }
  
  return cells;
}

/**
 * Earth-Fixed Cells 網格組件
 */
interface EarthFixedCellsProps {
  cells: EarthFixedCell[];
  showLabels?: boolean;
}

export function EarthFixedCells({
  cells,
  showLabels = true,
}: EarthFixedCellsProps) {
  return (
    <group>
      {cells.map((cell) => (
        <EarthFixedCellComponent
          key={cell.id}
          cell={cell}
          showLabel={showLabels}
        />
      ))}
    </group>
  );
}

/**
 * 預設配置
 */
export const DEFAULT_CELL_CONFIG = {
  rows: 4,
  cols: 5,
  cellRadius: 80,
  centerX: 0,
  centerZ: 0,
};
