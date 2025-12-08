import React from 'react';
import { HandoverMethodType, HANDOVER_METHODS } from '@/types/handover-method';

interface HandoverMethodSelectorProps {
  currentMethod: HandoverMethodType;
  onMethodChange: (method: HandoverMethodType) => void;
}

export function HandoverMethodSelector({
  currentMethod,
  onMethodChange
}: HandoverMethodSelectorProps) {
  const methods: HandoverMethodType[] = ['rsrp', 'geometric']; // 'dqn' requires model

  return (
    <div style={{
      position: 'absolute',
      top: '20px',
      left: '20px',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: '16px',
      borderRadius: '8px',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      minWidth: '280px'
    }}>
      <div style={{
        color: '#ffffff',
        fontSize: '16px',
        fontWeight: '600',
        marginBottom: '4px',
        letterSpacing: '0.5px'
      }}>
        Handover Method
      </div>

      {methods.map((methodId) => {
        const method = HANDOVER_METHODS[methodId];
        const isActive = currentMethod === methodId;

        return (
          <button
            key={methodId}
            onClick={() => onMethodChange(methodId)}
            style={{
              backgroundColor: isActive
                ? `${method.color}30`
                : 'rgba(255, 255, 255, 0.05)',
              border: isActive
                ? `2px solid ${method.color}`
                : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              padding: '12px 14px',
              color: isActive ? method.color : '#cccccc',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: isActive ? '600' : '400',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '6px',
              outline: 'none',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }
            }}
          >
            <div style={{
              fontSize: '14px',
              fontWeight: '600',
              color: isActive ? method.color : '#ffffff'
            }}>
              {method.name}
            </div>

            <div style={{
              fontSize: '13px',
              color: isActive ? `${method.color}cc` : '#bbbbbb',
              lineHeight: '1.4'
            }}>
              {method.description}
            </div>

            {method.academicReference && (
              <div style={{
                fontSize: '11px',
                color: isActive ? `${method.color}99` : '#999999',
                fontStyle: 'italic',
                marginTop: '2px'
              }}>
                {method.academicReference}
              </div>
            )}
          </button>
        );
      })}

      <div style={{
        marginTop: '8px',
        paddingTop: '12px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        fontSize: '12px',
        color: '#999999',
        lineHeight: '1.4'
      }}>
        <div style={{ marginBottom: '4px' }}>
          <span style={{ color: '#bbbbbb' }}>Academic Comparative Study</span>
        </div>
        <div>
          Performance evaluation and comparison of different handover strategies
        </div>
      </div>
    </div>
  );
}
