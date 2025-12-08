import React, { Suspense, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { HandoverMethodType, HandoverStats } from '@/types/handover-method';
import { ConstellationType } from '../controls/ConstellationSelector';
import { Satellites } from '../satellite/Satellites';
import { CameraSetup } from './CameraSetup';
import { NTPUScene } from './NTPUScene';
import { UAV } from './UAV';
import { Sidebar } from '../ui/Sidebar';
import { RightPanel } from '../ui/RightPanel';
import { HandoverLegend } from '../ui/HandoverLegend';
import { GeometricConfig } from '../ui/sidebar/GeometricMethodPanel';
import { RSRPHandoverConfig } from '@/utils/satellite/RSRPHandoverManager';
import { NTPU_CONFIG } from '@/config/ntpu.config';
import Starfield from '../ui/Starfield';

// Loading indicator in 3D scene
function Loader() {
  return (
    <Html center>
      <div style={{
        color: 'white',
        fontSize: '20px',
        background: 'rgba(0, 0, 0, 0.7)',
        padding: '20px 40px',
        borderRadius: '8px',
      }}>
        Loading NTPU Scene...
      </div>
    </Html>
  );
}

export function MainScene() {
    const [showDebug] = useState(false); // Set to true to show debug grid
    const [constellation, setConstellation] = useState<ConstellationType>('starlink');
    const [handoverMethod, setHandoverMethod] = useState<HandoverMethodType>('rsrp');
    const [handoverStats, setHandoverStats] = useState<HandoverStats>({
      totalHandovers: 0,
      pingPongEvents: 0,
      averageRSRP: -95,
      averageRSRQ: -12,
      averageSINR: 10,
      connectionDuration: 0,
      serviceInterruptions: 0,
      elapsedTime: 0
    });
    const [currentSatelliteId, setCurrentSatelliteId] = useState<string | null>(null);
    const [currentPhase, setCurrentPhase] = useState<string>('stable');
  
    // Global control parameters
    const [timeSpeed, setTimeSpeed] = useState<number>(3);
    const [animationSpeed, setAnimationSpeed] = useState<'fast' | 'normal' | 'slow'>('normal');
    const [candidateCount, setCandidateCount] = useState<number>(6);
  
    // Geometric method parameters
    const [geometricConfig, setGeometricConfig] = useState<GeometricConfig>({
      elevationWeight: 0.7,
      triggerElevation: 45,
      handoverCooldown: 5
    });
  
    // RSRP method parameters
    const [rsrpConfig, setRsrpConfig] = useState<RSRPHandoverConfig>({
      a4Threshold: -100,
      timeToTrigger: 10,
      handoverCooldown: 12
    });
  
    // Ref for OrbitControls to manually update its target/position
    const controlsRef = useRef<OrbitControlsImpl>(null);
  
    // Stats update callback
    const handleStatsUpdate = (stats: HandoverStats, satelliteId: string | null, phase: string) => {
      setHandoverStats(stats);
      setCurrentSatelliteId(satelliteId);
      setCurrentPhase(phase);
    };
  
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          background: 'radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%)',
          overflow: 'hidden',
        }}
      >
        <Starfield starCount={180} />
  
        {/* Left monitoring sidebar */}
        <Sidebar
          currentConstellation={constellation}
          onConstellationChange={setConstellation}
          currentMethod={handoverMethod}
          onMethodChange={setHandoverMethod}
          stats={handoverStats}
          currentSatelliteId={currentSatelliteId}
          currentPhase={currentPhase}
          timeSpeed={timeSpeed}
          animationSpeed={animationSpeed}
          candidateCount={candidateCount}
          onTimeSpeedChange={setTimeSpeed}
          onAnimationSpeedChange={setAnimationSpeed}
          onCandidateCountChange={setCandidateCount}
        />
  
        {/* Right decision details panel */}
        <RightPanel
          currentMethod={handoverMethod}
          stats={handoverStats}
          constellation={constellation}
          currentPhase={currentPhase}
          onGeometricConfigChange={setGeometricConfig}
          onRsrpConfigChange={setRsrpConfig}
        />
  
        {/* Handover legend (shown only during handover) */}
        <HandoverLegend
          phase={currentPhase}
          show={currentPhase !== 'stable'}
        />
  
        <Canvas
          shadows
          gl={{
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.2,
            alpha: true,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance',
            antialias: true,
          }}
        >
          {/* Camera setup component to manually set initial position */}
          <CameraSetup controlsRef={controlsRef} />
  
          {/* Camera */}
          <PerspectiveCamera
            makeDefault
            position={NTPU_CONFIG.camera.initialPosition.toArray()} // Use config again
            fov={NTPU_CONFIG.camera.fov}
            near={NTPU_CONFIG.camera.near}
            far={NTPU_CONFIG.camera.far}
          />
  
          {/* Orbit controls */}
          <OrbitControls
            ref={controlsRef} // Attach ref here
            enableDamping
            dampingFactor={0.05}
            minDistance={10}
            maxDistance={10000}
            maxPolarAngle={Math.PI / 2}
          />
  
          {/* Lights - Main light at top center */}
          <hemisphereLight args={[0xffffff, 0x444444, 1.0]} />
          <ambientLight intensity={0.2} />
          <directionalLight
            castShadow
            position={[0, 50, 0]}
            intensity={1.5}
            shadow-mapSize-width={4096}
            shadow-mapSize-height={4096}
            shadow-camera-near={1}
            shadow-camera-far={1000}
            shadow-camera-top={500}
            shadow-camera-bottom={-500}
            shadow-camera-left={500}
            shadow-camera-right={-500}
            shadow-bias={-0.0004}
            shadow-radius={8}
          />
  
          {/* Scene model */}
          <Suspense fallback={<Loader />}>
            <NTPUScene />
          </Suspense>
  
          {/* UAV model */}
          <Suspense fallback={null}>
            <UAV position={[0, 10, 0]} scale={10} />
          </Suspense>
  
          {/* Satellite system */}
          <Suspense fallback={null}>
            <Satellites
              dataUrl={`/data/satellite-timeseries-${constellation}.json`}
              timeSpeed={timeSpeed}
              handoverMethod={handoverMethod}
              onStatsUpdate={handleStatsUpdate}
              key={`${constellation}-${handoverMethod}`} // Force reload when constellation or method changes
            />
          </Suspense>
  
          {/* Grid helpers (debug only) */}
          {showDebug && (
            <>
              <gridHelper args={[1000, 50, '#888888', '#444444']} />
              <axesHelper args={[100]} />
            </>
          )}
        </Canvas>
      </div>
    );
  }
