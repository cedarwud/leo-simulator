import React from 'react';
import { HandoverMethodType, HandoverStats } from '@/types/handover-method';
import { ConstellationType } from '../controls/ConstellationSelector';
import { GeometricMethodPanel, GeometricConfig } from './sidebar/GeometricMethodPanel';
import { RSRPMethodPanel } from './sidebar/RSRPMethodPanel';
import { RSRPHandoverConfig } from '@/utils/satellite/RSRPHandoverManager';

interface RightPanelProps {
  currentMethod: HandoverMethodType;
  stats: HandoverStats;
  constellation: ConstellationType;
  currentPhase?: string;
  currentSatelliteId?: string | null;
  onGeometricConfigChange?: (config: GeometricConfig) => void;
  onRsrpConfigChange?: (config: RSRPHandoverConfig) => void;
}

export function RightPanel({
  currentMethod,
  stats,
  constellation,
  currentPhase = 'stable',
  currentSatelliteId,
  onGeometricConfigChange,
  onRsrpConfigChange
}: RightPanelProps) {
  return (
    <>
      {/* CSS 動畫定義 */}
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>

      {/* 右側面板 */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        height: '100%',
        width: '360px',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        backdropFilter: 'blur(10px)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.15)',
        overflow: 'hidden',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideInRight 0.3s ease-out'
      }}>
        {/* 標題區 */}
        <div style={{
          padding: '24px 20px',
          borderBottom: '2px solid rgba(255, 255, 255, 0.15)'
        }}>
          <div style={{
            color: '#ffffff',
            fontSize: '18px',
            fontWeight: '600',
            letterSpacing: '0.5px',
            textAlign: 'center'
          }}>
            {currentMethod === 'geometric' && '📊 Geometric Decision Details'}
            {currentMethod === 'rsrp' && '📶 RSRP Decision Details'}
            {currentMethod === 'dqn' && '🤖 DQN Decision Details'}
          </div>
        </div>

        {/* 內容區 */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '20px'
        }}>
          {/* Geometric 方法內容 */}
          {currentMethod === 'geometric' && (
            <GeometricMethodPanel
              stats={stats}
              onConfigChange={onGeometricConfigChange}
            />
          )}

          {/* RSRP 方法內容 */}
          {currentMethod === 'rsrp' && (
            <RSRPMethodPanel
              stats={stats}
              constellation={constellation}
              currentPhase={currentPhase}
              currentSatelliteId={currentSatelliteId}
              onConfigChange={onRsrpConfigChange}
            />
          )}

          {/* DQN 方法內容 */}
          {currentMethod === 'dqn' && (
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              textAlign: 'center'
            }}>
              <div style={{
                fontSize: '14px',
                color: '#999999',
                lineHeight: '1.6'
              }}>
                🤖 DQN Method Under Development
                <div style={{ marginTop: '8px' }}>
                  Deep Reinforcement Learning strategy coming soon
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
