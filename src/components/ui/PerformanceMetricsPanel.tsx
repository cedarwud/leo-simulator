import React from 'react';
import { HandoverStats } from '@/types/handover-method';
import { HandoverMethodType, HANDOVER_METHODS } from '@/types/handover-method';

interface PerformanceMetricsPanelProps {
  stats: HandoverStats;
  currentMethod: HandoverMethodType;
  currentSatelliteId: string | null;
  currentPhase: string;
}

export function PerformanceMetricsPanel({
  stats,
  currentMethod,
  currentSatelliteId,
  currentPhase
}: PerformanceMetricsPanelProps) {
  const method = HANDOVER_METHODS[currentMethod];

  // 格式化數字
  const formatNumber = (value: number | null, decimals: number = 1): string => {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    return value.toFixed(decimals);
  };

  // 格式化時間
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // RSRP 顏色指示器
  const getRSRPColor = (rsrp: number): string => {
    if (rsrp >= -80) return '#00ff88'; // 優秀
    if (rsrp >= -90) return '#88ff00'; // 良好
    if (rsrp >= -100) return '#ffaa00'; // 一般
    if (rsrp >= -110) return '#ff6600'; // 較差
    return '#ff0000'; // 極差
  };

  // Ping-pong 率
  const pingPongRate = stats.totalHandovers > 0
    ? (stats.pingPongEvents / stats.totalHandovers * 100)
    : 0;

  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      left: '20px',
      zIndex: 1000,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      padding: '16px',
      borderRadius: '8px',
      backdropFilter: 'blur(10px)',
      border: `1px solid ${method.color}40`,
      minWidth: '320px',
      fontFamily: 'monospace'
    }}>
      {/* 標題 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '12px',
        paddingBottom: '8px',
        borderBottom: `1px solid ${method.color}40`
      }}>
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: method.color,
          boxShadow: `0 0 8px ${method.color}`
        }} />
        <div style={{
          color: '#ffffff',
          fontSize: '15px',
          fontWeight: '600',
          letterSpacing: '0.5px'
        }}>
          Performance Metrics - {method.name}
        </div>
      </div>

      {/* 當前連接狀態 */}
      <div style={{
        marginBottom: '12px',
        padding: '8px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '4px'
      }}>
        <div style={{ fontSize: '11px', color: '#bbbbbb', marginBottom: '4px' }}>
          Current Connection
        </div>
        <div style={{ fontSize: '14px', color: '#ffffff' }}>
          {currentSatelliteId || 'No Connection'}
        </div>
        <div style={{ fontSize: '11px', color: '#999999', marginTop: '2px' }}>
          Phase: {currentPhase}
        </div>
      </div>

      {/* 指標網格 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px',
        marginBottom: '12px'
      }}>
        {/* 換手次數 */}
        <MetricCard
          label="Handovers"
          value={stats.totalHandovers.toString()}
          unit=""
          color={method.color}
        />

        {/* Ping-pong */}
        <MetricCard
          label="Ping-pong"
          value={stats.pingPongEvents.toString()}
          unit={`(${formatNumber(pingPongRate, 0)}%)`}
          color={pingPongRate > 20 ? '#ff6600' : method.color}
        />

        {/* 平均 RSRP */}
        <MetricCard
          label="Avg RSRP"
          value={formatNumber(stats.averageRSRP, 1)}
          unit="dBm"
          color={getRSRPColor(stats.averageRSRP)}
        />

        {/* 平均 SINR */}
        <MetricCard
          label="Avg SINR"
          value={formatNumber(stats.averageSINR, 1)}
          unit="dB"
          color={stats.averageSINR > 10 ? '#00ff88' : '#ffaa00'}
        />

        {/* 連接時長 */}
        <MetricCard
          label="Duration"
          value={formatNumber(stats.connectionDuration, 0)}
          unit="s"
          color={method.color}
        />

        {/* 服務中斷 */}
        <MetricCard
          label="Interruptions"
          value={stats.serviceInterruptions.toString()}
          unit=""
          color={stats.serviceInterruptions > 0 ? '#ff0000' : '#00ff88'}
        />
      </div>

      {/* 運行時間 */}
      <div style={{
        paddingTop: '8px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ fontSize: '12px', color: '#999999' }}>
          Runtime
        </div>
        <div style={{ fontSize: '14px', color: method.color, fontWeight: '600' }}>
          {formatTime(stats.elapsedTime)}
        </div>
      </div>

      {/* 平均 RSRQ */}
      {stats.averageRSRQ !== 0 && (
        <div style={{
          marginTop: '8px',
          fontSize: '12px',
          color: '#bbbbbb',
          textAlign: 'center'
        }}>
          Avg RSRQ: {formatNumber(stats.averageRSRQ, 1)} dB
        </div>
      )}
    </div>
  );
}

// 單個指標卡片
function MetricCard({
  label,
  value,
  unit,
  color
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <div style={{
      padding: '8px',
      backgroundColor: 'rgba(255, 255, 255, 0.03)',
      borderRadius: '4px',
      border: `1px solid ${color}20`
    }}>
      <div style={{
        fontSize: '11px',
        color: '#bbbbbb',
        marginBottom: '4px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        {label}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '4px'
      }}>
        <div style={{
          fontSize: '20px',
          color: color,
          fontWeight: '700'
        }}>
          {value}
        </div>
        <div style={{
          fontSize: '12px',
          color: '#999999'
        }}>
          {unit}
        </div>
      </div>
    </div>
  );
}
