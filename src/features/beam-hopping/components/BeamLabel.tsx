import React from 'react';
import { Html } from '@react-three/drei';
import { Beam } from '../types';

interface BeamLabelProps {
  beam: Beam;
  satelliteHeight: number;
}

/**
 * 波束頂部標籤 (在衛星位置)
 */
export function BeamLabel({ beam, satelliteHeight }: BeamLabelProps) {
  return (
    <Html
      position={[beam.position.x, satelliteHeight + 20, beam.position.z]}
      center
      style={{ pointerEvents: 'none' }}
    >
      <div style={{
        padding: '4px 8px',
        backgroundColor: beam.isActive ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)',
        borderRadius: '4px',
        border: `1px solid ${beam.color}`,
        color: beam.isActive ? '#ffffff' : '#888888',
        fontSize: '11px',
        fontWeight: beam.isActive ? 'bold' : 'normal',
        whiteSpace: 'nowrap',
        transition: 'all 0.3s ease',
      }}>
        Beam {beam.id}
        {beam.isActive && (
          <span style={{ color: beam.color, marginLeft: '4px' }}>●</span>
        )}
      </div>
    </Html>
  );
}

interface BeamLabelsProps {
  beams: Beam[];
  satelliteHeight: number;
}

/**
 * 所有波束標籤
 */
export function BeamLabels({ beams, satelliteHeight }: BeamLabelsProps) {
  return (
    <group>
      {beams.map((beam) => (
        <BeamLabel
          key={beam.id}
          beam={beam}
          satelliteHeight={satelliteHeight}
        />
      ))}
    </group>
  );
}
