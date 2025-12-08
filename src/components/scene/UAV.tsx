import React, { useRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
// @ts-ignore - SkeletonUtils has no TypeScript definitions
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

interface UAVProps {
  position: [number, number, number];
  scale?: number;
}

export function UAV({ position, scale = 10 }: UAVProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/models/uav.glb');

  // Clone scene using useMemo (SkeletonUtils for skeletal animation)
  const clonedScene = useMemo(() => {
    const cloned = SkeletonUtils.clone(scene);

    // Set shadows only, do not modify materials
    cloned.traverse((obj: THREE.Object3D) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    return cloned;
  }, [scene]);

  return (
    <group ref={groupRef} position={position} scale={scale}>
      <primitive object={clonedScene} />
      <pointLight
        intensity={0.3}
        distance={50}
        decay={2}
        color="#ffffff"
        position={[0, 2, 0]}
      />
    </group>
  );
}

// Preload model
useGLTF.preload('/models/uav.glb');
