import React, { useMemo } from 'react';
import { Text, Line } from '@react-three/drei';
import * as THREE from 'three';

/**
 * FRF3 頻率複用顏色
 * 相鄰 cells 使用不同頻率組以避免干擾
 */
export const FRF3_CELL_COLORS = {
  0: '#ff6666',  // 頻率組 0：紅色
  1: '#66ff66',  // 頻率組 1：綠色
  2: '#6688ff',  // 頻率組 2：藍色
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
  /** 頻率複用組 (0, 1, 2 for FRF3) */
  frequencyGroup: 0 | 1 | 2;
  /** Data Queue 長度 (bytes) */
  dataQueue: number;
  /** 流量到達率 */
  arrivalRate: number;
  /** 當前是否被服務 */
  isServed: boolean;
  /** 服務此 cell 的衛星 ID */
  servingSatelliteId: string | null;
  /** 服務此 cell 的波束顏色 */
  servingBeamColor: string | null;
  /** 能覆蓋此 cell 的衛星數量（用於顯示重疊區域）*/
  coveringSatelliteCount?: number;
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
  
  // 顏色邏輯：基於頻率複用組（FRF3）
  const frequencyColor = FRF3_CELL_COLORS[cell.frequencyGroup];
  const baseColor = cell.isServed && cell.servingBeamColor 
    ? cell.servingBeamColor 
    : frequencyColor;
  
  // 填充透明度：被服務時更亮
  const fillOpacity = cell.isServed ? 0.4 : 0.2;
  const borderOpacity = cell.isServed ? 1.0 : 0.8;
  const borderWidth = cell.isServed ? 4 : 2.5;
  
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
      
      {/* 六邊形邊框 */}
      <Line
        points={borderPoints}
        color={cell.isServed ? cell.servingBeamColor || '#ffffff' : frequencyColor}
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
        frequencyGroup,
        dataQueue: Math.random() * 1500000, // 暫時用隨機數據
        arrivalRate: 50 + Math.random() * 150, // Mbps
        isServed: false,
        servingSatelliteId: null,
        servingBeamColor: null,
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
