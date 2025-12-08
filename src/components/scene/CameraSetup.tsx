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
      const { initialPosition, target } = NTPU_CONFIG.camera;
      camera.position.set(initialPosition.x, initialPosition.y, initialPosition.z);
      
      // Set OrbitControls target from config to shift framing
      controlsRef.current.target.copy(target);
      controlsRef.current.update(); // Update controls to reflect changes
      
      camera.lookAt(target); // Ensure camera looks at configured target
    }
  }, [camera, controlsRef]); // Dependencies: run once when camera/gl context is ready

  return null; // This component renders nothing itself
}
