import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { BeamHoppingScene, BeamHoppingSidebar } from '../features/beam-hopping';
import { Starfield } from '../shared/components';

interface SceneState {
  currentSlotIndex: number;
  isRunning: boolean;
  progress: number;
  activeBeams: number[];
}

export function BeamHoppingPage() {
  const [sceneState, setSceneState] = useState<SceneState>({
    currentSlotIndex: 0,
    isRunning: true,
    progress: 0,
    activeBeams: [],
  });

  const [speed, setSpeed] = useState(1);

  const handleStateChange = useCallback((state: SceneState) => {
    setSceneState(state);
  }, []);

  // 注意：這些控制函數目前是佔位符
  // 完整實作需要透過 Context 或 ref 來控制 Scene
  const handleToggle = useCallback(() => {
    // 目前由 Scene 內部自動控制
  }, []);

  const handleReset = useCallback(() => {
    // 目前由 Scene 內部自動控制
  }, []);

  const handleNextSlot = useCallback(() => {
    // 目前由 Scene 內部自動控制
  }, []);

  const handlePrevSlot = useCallback(() => {
    // 目前由 Scene 內部自動控制
  }, []);

  const handleSpeedChange = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
  }, []);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      background: 'radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%)',
      overflow: 'hidden',
    }}>
      {/* 星空背景 */}
      <Starfield starCount={200} />

      {/* 返回首頁按鈕 */}
      <Link
        to="/"
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '8px',
          color: '#ffffff',
          textDecoration: 'none',
          fontSize: '14px',
          transition: 'all 0.2s ease',
        }}
      >
        <Home size={16} />
        <span>Back to Home</span>
      </Link>

      {/* 側邊控制面板 */}
      <BeamHoppingSidebar
        currentSlotIndex={sceneState.currentSlotIndex}
        isRunning={sceneState.isRunning}
        progress={sceneState.progress}
        activeBeams={sceneState.activeBeams}
        speed={speed}
        onToggle={handleToggle}
        onReset={handleReset}
        onNextSlot={handleNextSlot}
        onPrevSlot={handlePrevSlot}
        onSpeedChange={handleSpeedChange}
      />

      {/* 3D 場景 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '320px',
        right: 0,
        bottom: 0,
      }}>
        <BeamHoppingScene onStateChange={handleStateChange} />
      </div>

      {/* 右下角說明 */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        padding: '12px 16px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#888888',
        fontSize: '12px',
        maxWidth: '250px',
        zIndex: 1001,
      }}>
        <div style={{ marginBottom: '8px', color: '#ffffff', fontWeight: '500' }}>
          Controls
        </div>
        <div>Drag to rotate view</div>
        <div>Scroll to zoom</div>
      </div>
    </div>
  );
}
