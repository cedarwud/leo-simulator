// src/components/scene/CameraSetup.tsx
import React, { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { NTPU_CONFIG } from '@/config/ntpu.config';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib'; // For type inference

interface CameraSetupProps {
  controlsRef: React.RefObject<OrbitControlsImpl>;
}

export function CameraSetup({ controlsRef }: CameraSetupProps) {
  const { camera } = useThree();

  useEffect(() => {
    if (controlsRef.current) {
      const initialPos = NTPU_CONFIG.camera.initialPosition;
      camera.position.set(initialPos.x, initialPos.y, initialPos.z);
      
      // Set OrbitControls target (assuming center of scene is (0,0,0))
      controlsRef.current.target.set(0, 0, 0); 
      controlsRef.current.update(); // Update controls to reflect changes
      
      camera.lookAt(0, 0, 0); // Ensure camera looks at target
    }
  }, [camera, controlsRef]); // Dependencies: run once when camera/gl context is ready

  return null; // This component renders nothing itself
}