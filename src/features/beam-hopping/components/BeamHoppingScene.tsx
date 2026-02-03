import React, { Suspense, useState, useMemo, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Html } from '@react-three/drei';
import * as THREE from 'three';
import { NTPUScene } from '@/components/scene/NTPUScene';
import { EarthFixedCells, generateEarthFixedCells, DEFAULT_CELL_CONFIG, EarthFixedCell } from './EarthFixedCells';
import { BeamHoppingSystem, BeamManagementStats } from './BeamHoppingSystem';
import { MultiUEManager, DEFAULT_UE_CONFIGS, UEHandoverState } from './MultiUEManager';

// Loading indicator
function Loader() {
  return (
    <Html center>
      <div style={{
        color: 'white',
        fontSize: '18px',
        background: 'rgba(0, 0, 0, 0.7)',
        padding: '16px 32px',
        borderRadius: '8px',
      }}>
        Loading Beam Hopping Scene...
      </div>
    </Html>
  );
}

// 場景內容
interface SceneContentProps {
  onStatsUpdate?: (stats: BeamManagementStats) => void;
  selectedUEId?: string;
}

function SceneContent({ onStatsUpdate, selectedUEId }: SceneContentProps) {
  // 生成 Earth-Fixed Cells（4x5 六邊形網格）
  const initialCells = useMemo(() => {
    return generateEarthFixedCells(DEFAULT_CELL_CONFIG);
  }, []);
  
  // Cells 狀態（會被 BeamHoppingSystem 更新）
  const [cells, setCells] = useState<EarthFixedCell[]>(initialCells);
  
  // UE 換手狀態追蹤
  const [ueStates, setUEStates] = useState<Map<string, UEHandoverState>>(new Map());
  
  // 根據 Cell ID 獲取位置
  const getCellPosition = useCallback((cellId: number) => {
    const cell = initialCells.find(c => c.id === cellId);
    return cell ? cell.position : null;
  }, [initialCells]);
  
  // 獲取所有 UE 位置供 BeamHoppingSystem 使用
  const uePositions = useMemo(() => {
    const positions: { id: string; cellId: number; position: THREE.Vector3 }[] = [];
    
    for (const ue of DEFAULT_UE_CONFIGS) {
      const cellPos = getCellPosition(ue.cellId);
      if (cellPos) {
        positions.push({
          id: ue.id,
          cellId: ue.cellId,
          position: new THREE.Vector3(cellPos.x, 15, cellPos.z),
        });
      }
    }
    
    return positions;
  }, [getCellPosition]);
  
  // Cells 更新回調
  const handleCellsUpdate = useCallback((updatedCells: EarthFixedCell[]) => {
    setCells(updatedCells);
  }, []);
  
  // UE 狀態更新回調
  const handleUEStatesUpdate = useCallback((newStates: Map<string, UEHandoverState>) => {
    setUEStates(newStates);
  }, []);

  return (
    <>
      {/* NTPU 場景 */}
      <NTPUScene />

      {/* Earth-Fixed Cells（固定在地面的服務區域） */}
      <EarthFixedCells 
        cells={cells} 
        showLabels={true}
      />

      {/* 多 UE 顯示 */}
      <MultiUEManager
        ueConfigs={DEFAULT_UE_CONFIGS}
        getCellPosition={getCellPosition}
        selectedUEId={selectedUEId || DEFAULT_UE_CONFIGS[0]?.id}
        ueStates={ueStates}
        showAllLabels={true}
      />

      {/* Beam Hopping 系統（追蹤所有 UE） */}
      <BeamHoppingSystem
        cells={initialCells}
        uePositions={uePositions}
        selectedUEId={selectedUEId || DEFAULT_UE_CONFIGS[0]?.id}
        onStatsUpdate={onStatsUpdate}
        onCellsUpdate={handleCellsUpdate}
        onUEStatesUpdate={handleUEStatesUpdate}
      />
    </>
  );
}

export interface BeamHoppingSceneProps {
  onStateChange?: (state: {
    currentSlotIndex: number;
    isRunning: boolean;
    progress: number;
    activeBeams: number[];
  }) => void;
  /** Beam management 統計數據更新回調 */
  onStatsUpdate?: (stats: BeamManagementStats) => void;
  /** 當前選中的 UE ID */
  selectedUEId?: string;
}

export function BeamHoppingScene({ onStateChange, onStatsUpdate, selectedUEId }: BeamHoppingSceneProps) {
  return (
    <Canvas
      shadows
      gl={{
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      }}
      style={{ background: 'transparent' }}
    >
      {/* 相機設置 - 與主場景一致 */}
      <PerspectiveCamera
        makeDefault
        position={[0, 800, 1200]}
        fov={60}
        near={0.1}
        far={10000}
      />

      <OrbitControls
        target={[0, 200, 0]}
        enableDamping
        dampingFactor={0.05}
        zoomSpeed={0.5}
        minDistance={10}
        maxDistance={10000}
        maxPolarAngle={Math.PI / 2}
      />

      {/* 燈光 */}
      <hemisphereLight args={[0xffffff, 0x444444, 1.0]} />
      <ambientLight intensity={0.3} />
      <directionalLight
        castShadow
        position={[100, 500, 100]}
        intensity={1.5}
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-near={1}
        shadow-camera-far={1500}
        shadow-camera-top={500}
        shadow-camera-bottom={-500}
        shadow-camera-left={500}
        shadow-camera-right={-500}
      />

      <Suspense fallback={<Loader />}>
        <SceneContent onStatsUpdate={onStatsUpdate} selectedUEId={selectedUEId} />
      </Suspense>
    </Canvas>
  );
}
