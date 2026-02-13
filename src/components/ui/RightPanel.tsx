import { HandoverMethodType, HandoverStats } from '@/types/handover-method';
import { ConstellationType } from '../controls/ConstellationSelector';
import { GeometricMethodPanel, GeometricConfig } from './sidebar/GeometricMethodPanel';
import { RSRPMethodPanel } from './sidebar/RSRPMethodPanel';
import { SimulationChartsPanel } from './sidebar/SimulationChartsPanel';
import { RSRPHandoverConfig } from '@/utils/satellite/RSRPHandoverManager';
import type { LyapunovState } from '@/types/lyapunov';

interface RightPanelProps {
  currentMethod: HandoverMethodType;
  stats: HandoverStats;
  constellation: ConstellationType;
  currentPhase?: string;
  currentSatelliteId?: string | null;
  onGeometricConfigChange?: (config: GeometricConfig) => void;
  onRsrpConfigChange?: (config: RSRPHandoverConfig) => void;
  lyapunovState?: LyapunovState;
}

const TITLES: Record<string, string> = {
  lyapunov: 'Simulation Results',
  geometric: 'Geometric Decision Details',
  rsrp: 'RSRP Decision Details',
  dqn: 'DQN Decision Details',
};

export function RightPanel({
  currentMethod,
  stats,
  constellation,
  currentPhase = 'stable',
  currentSatelliteId,
  onGeometricConfigChange,
  onRsrpConfigChange,
  lyapunovState,
}: RightPanelProps) {
  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        height: '100%',
        width: '380px',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        backdropFilter: 'blur(10px)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.15)',
        overflow: 'hidden',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideInRight 0.3s ease-out'
      }}>
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
            {TITLES[currentMethod] ?? 'Details'}
          </div>
        </div>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '20px'
        }}>
          {currentMethod === 'lyapunov' && (
            lyapunovState && lyapunovState.history.length > 0 ? (
              <SimulationChartsPanel history={lyapunovState.history} />
            ) : (
              <div style={{
                padding: '16px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '14px', color: '#999999', lineHeight: '1.6' }}>
                  Waiting for simulation data...
                  <div style={{ marginTop: '8px' }}>
                    Press Play in the Simulation Clock to start
                  </div>
                </div>
              </div>
            )
          )}

          {currentMethod === 'geometric' && (
            <GeometricMethodPanel
              stats={stats}
              onConfigChange={onGeometricConfigChange}
            />
          )}

          {currentMethod === 'rsrp' && (
            <RSRPMethodPanel
              stats={stats}
              constellation={constellation}
              currentPhase={currentPhase}
              currentSatelliteId={currentSatelliteId}
              onConfigChange={onRsrpConfigChange}
            />
          )}

          {currentMethod === 'dqn' && (
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '14px', color: '#999999', lineHeight: '1.6' }}>
                DQN Method Under Development
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
