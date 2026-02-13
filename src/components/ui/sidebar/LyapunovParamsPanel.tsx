import { LyapunovConfig } from '@/types/lyapunov';

interface LyapunovParamsPanelProps {
  config: LyapunovConfig;
  onConfigChange: (config: LyapunovConfig) => void;
  spectrumSharingEnabled: boolean;
  onSpectrumSharingToggle: (enabled: boolean) => void;
}

/** Slider row component */
function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '12px',
        color: '#bbbbbb',
        marginBottom: '4px',
      }}>
        <span>{label}</span>
        <span style={{ fontFamily: 'monospace', color: '#cc88ff' }}>
          {value}{unit ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{
          width: '100%',
          height: '4px',
          accentColor: '#cc88ff',
          cursor: 'pointer',
        }}
      />
    </div>
  );
}

export function LyapunovParamsPanel({
  config,
  onConfigChange,
  spectrumSharingEnabled,
  onSpectrumSharingToggle,
}: LyapunovParamsPanelProps) {
  const update = (partial: Partial<LyapunovConfig>) => {
    onConfigChange({ ...config, ...partial });
  };

  return (
    <div>
      <div style={{
        fontSize: '15px',
        color: '#ffffff',
        fontWeight: '600',
        marginBottom: '12px',
      }}>
        Lyapunov Parameters
      </div>

      {/* Lyapunov Parameters */}
      <div style={{
        padding: '10px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: '10px',
      }}>
        <div style={{ fontSize: '12px', color: '#cc88ff', fontWeight: '600', marginBottom: '8px' }}>
          Lyapunov
        </div>

        <ParamSlider
          label="V (trade-off)"
          value={config.lyapunovV}
          min={1}
          max={500}
          step={10}
          onChange={v => update({ lyapunovV: v })}
        />

        <ParamSlider
          label="Max HO Freq (H̄)"
          value={config.maxHandoverFrequency}
          min={0.001}
          max={0.01}
          step={0.001}
          onChange={v => update({ maxHandoverFrequency: v })}
        />

        <ParamSlider
          label="Resource Util (σ₀)"
          value={config.resourceUtilizationThreshold}
          min={0.3}
          max={1.0}
          step={0.1}
          onChange={v => update({ resourceUtilizationThreshold: v })}
        />
      </div>

      {/* Beam Configuration */}
      <div style={{
        padding: '10px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: '10px',
      }}>
        <div style={{ fontSize: '12px', color: '#88ccff', fontWeight: '600', marginBottom: '8px' }}>
          Beam Config
        </div>

        {/* Beams per satellite toggle */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}>
          <span style={{ fontSize: '12px', color: '#bbbbbb' }}>Beams/Satellite</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[4, 8].map(n => (
              <button
                key={n}
                onClick={() => update({
                  beamsPerSatellite: n,
                  totalArrivalRateGbps: n === 4 ? 6.52 : 10.57,
                })}
                style={{
                  padding: '4px 12px',
                  backgroundColor: config.beamsPerSatellite === n
                    ? 'rgba(136, 204, 255, 0.2)'
                    : 'rgba(255, 255, 255, 0.05)',
                  border: config.beamsPerSatellite === n
                    ? '1px solid #88ccff'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  color: config.beamsPerSatellite === n ? '#88ccff' : '#999999',
                  fontSize: '12px',
                  fontWeight: config.beamsPerSatellite === n ? '600' : '400',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <ParamSlider
          label="Target SNR"
          value={config.targetSnrDb}
          min={6}
          max={20}
          step={1}
          unit=" dB"
          onChange={v => update({ targetSnrDb: v })}
        />

        <ParamSlider
          label="Bandwidth"
          value={config.satelliteBandwidthMhz}
          min={50}
          max={500}
          step={50}
          unit=" MHz"
          onChange={v => update({ satelliteBandwidthMhz: v })}
        />
      </div>

      {/* Spectrum Sharing */}
      <div style={{
        padding: '10px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '12px', color: '#ffaa44', fontWeight: '600' }}>
            Spectrum Sharing
          </span>
          <button
            onClick={() => onSpectrumSharingToggle(!spectrumSharingEnabled)}
            style={{
              padding: '4px 12px',
              backgroundColor: spectrumSharingEnabled
                ? 'rgba(100, 255, 100, 0.2)'
                : 'rgba(255, 255, 255, 0.05)',
              border: spectrumSharingEnabled
                ? '1px solid rgba(100, 255, 100, 0.5)'
                : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              color: spectrumSharingEnabled ? '#88ff88' : '#999999',
              fontSize: '12px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {spectrumSharingEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
    </div>
  );
}
