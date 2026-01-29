import React from 'react';
import { Link } from 'react-router-dom';
import { MainScene } from '../components/scene/MainScene';
import { Home } from 'lucide-react';

/**
 * 衛星換手模擬頁面
 *
 * 包含：
 * - 3D 衛星模擬場景
 * - 返回首頁的導航按鈕
 */
export function SatelliteHandoverPage() {
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* 返回首頁按鈕 */}
      <Link
        to="/"
        style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 20px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '8px',
          color: 'rgba(255, 255, 255, 0.8)',
          textDecoration: 'none',
          fontSize: '14px',
          fontWeight: '500',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(0, 136, 255, 0.3)';
          e.currentTarget.style.borderColor = 'rgba(0, 136, 255, 0.5)';
          e.currentTarget.style.color = '#ffffff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
        }}
      >
        <Home size={16} />
        <span>Back to Home</span>
      </Link>

      {/* 3D 場景 */}
      <MainScene />
    </div>
  );
}
