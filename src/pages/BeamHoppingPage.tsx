import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { BeamHoppingScene, BeamHoppingSidebar, BeamManagementStats } from '../features/beam-hopping';
import { Starfield } from '../shared/components';

export function BeamHoppingPage() {
  // Beam management 統計數據
  const [stats, setStats] = useState<BeamManagementStats | undefined>(undefined);

  const handleStatsUpdate = useCallback((newStats: BeamManagementStats) => {
    setStats(newStats);
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
      <BeamHoppingSidebar stats={stats} />

      {/* 3D 場景 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '320px',
        right: 0,
        bottom: 0,
      }}>
        <BeamHoppingScene onStatsUpdate={handleStatsUpdate} />
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
        color: '#bbbbbb',
        fontSize: '13px',
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
