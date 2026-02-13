import { useEffect, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import { NTPU_CONFIG } from '@/config/ntpu.config';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

interface CameraSetupProps {
  controlsRef: RefObject<OrbitControlsImpl | null>;
}

export function CameraSetup({ controlsRef }: CameraSetupProps) {
  const { camera } = useThree();

  useEffect(() => {
    if (controlsRef.current) {
      const [px, py, pz] = NTPU_CONFIG.camera.initialPosition;
      const [tx, ty, tz] = NTPU_CONFIG.camera.target;

      camera.position.set(px, py, pz);

      // Set OrbitControls target from config to shift framing
      controlsRef.current.target.set(tx, ty, tz);
      controlsRef.current.update();

      camera.lookAt(tx, ty, tz);
    }
  }, [camera, controlsRef]);

  return null;
}
