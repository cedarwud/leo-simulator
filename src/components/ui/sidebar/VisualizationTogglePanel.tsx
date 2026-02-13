/**
 * Visualization Toggle Panel
 *
 * 控制場景中可選視覺化功能的開關
 */

import { Grid3X3, Radio, GitBranch, LucideIcon } from 'lucide-react';
import type { VisualizationToggles } from '@/types/unified-scene';

interface VisualizationTogglePanelProps {
  toggles: VisualizationToggles;
  onToggleChange: (key: keyof VisualizationToggles, value: boolean) => void;
}

/**
 * Toggle Switch 元件
 */
function ToggleSwitch({
  enabled,
  onChange,
  label,
  icon: Icon,
  description,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  label: string;
  icon: LucideIcon;
  description?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        backgroundColor: enabled ? 'rgba(0, 170, 255, 0.1)' : 'rgba(255, 255, 255, 0.04)',
        borderRadius: '8px',
        border: `1px solid ${enabled ? 'rgba(0, 170, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onClick={() => onChange(!enabled)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icon size={18} color={enabled ? '#00aaff' : '#888888'} />
        <div>
          <div style={{
            fontSize: '14px',
            fontWeight: '500',
            color: enabled ? '#ffffff' : '#aaaaaa',
          }}>
            {label}
          </div>
          {description && (
            <div style={{
              fontSize: '11px',
              color: '#666666',
              marginTop: '2px',
            }}>
              {description}
            </div>
          )}
        </div>
      </div>

      {/* Toggle Switch */}
      <div
        style={{
          width: '44px',
          height: '24px',
          backgroundColor: enabled ? '#00aaff' : '#444444',
          borderRadius: '12px',
          position: 'relative',
          transition: 'background-color 0.2s ease',
        }}
      >
        <div
          style={{
            width: '18px',
            height: '18px',
            backgroundColor: '#ffffff',
            borderRadius: '50%',
            position: 'absolute',
            top: '3px',
            left: enabled ? '23px' : '3px',
            transition: 'left 0.2s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        />
      </div>
    </div>
  );
}

export function VisualizationTogglePanel({
  toggles,
  onToggleChange,
}: VisualizationTogglePanelProps) {
  return (
    <div>
      <div style={{
        fontSize: '15px',
        color: '#ffffff',
        fontWeight: '600',
        marginBottom: '12px',
      }}>
        Visualization Options
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        <ToggleSwitch
          enabled={toggles.showGroundCells}
          onChange={(value) => onToggleChange('showGroundCells', value)}
          label="Ground Cells"
          icon={Grid3X3}
          description="Hexagonal coverage areas"
        />

        <ToggleSwitch
          enabled={toggles.showBeams}
          onChange={(value) => onToggleChange('showBeams', value)}
          label="Satellite Beams"
          icon={Radio}
          description="Beam-to-cell connections"
        />

        <ToggleSwitch
          enabled={toggles.showConflictEdges}
          onChange={(value) => onToggleChange('showConflictEdges', value)}
          label="Conflict Edges"
          icon={GitBranch}
          description="Inter-beam interference graph"
        />
      </div>

      {/* 次要選項 (當主要功能開啟時) */}
      {(toggles.showGroundCells || toggles.showBeams) && (
        <div style={{
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <div style={{
            fontSize: '12px',
            color: '#888888',
            marginBottom: '8px',
          }}>
            Label Options
          </div>
          <div style={{
            display: 'flex',
            gap: '8px',
          }}>
            {toggles.showGroundCells && (
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#aaaaaa',
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={toggles.showCellLabels}
                  onChange={(e) => onToggleChange('showCellLabels', e.target.checked)}
                  style={{ accentColor: '#00aaff' }}
                />
                Cell Labels
              </label>
            )}
            {toggles.showBeams && (
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#aaaaaa',
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={toggles.showBeamLabels}
                  onChange={(e) => onToggleChange('showBeamLabels', e.target.checked)}
                  style={{ accentColor: '#00aaff' }}
                />
                Beam Labels
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
