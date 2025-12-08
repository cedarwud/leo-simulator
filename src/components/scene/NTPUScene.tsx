import React, { useRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { NTPU_CONFIG } from '@/config/ntpu.config';
import * as THREE from 'three';

export function NTPUScene() {
  const { scene } = useGLTF(NTPU_CONFIG.scene.modelPath);
  const groupRef = useRef<THREE.Group>(null);

  // Process scene materials, same as ntn-stack
  const processedScene = useMemo(() => {
    const clonedScene = scene.clone(true);

    clonedScene.traverse((obj: THREE.Object3D) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Convert MeshBasicMaterial to MeshStandardMaterial
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((mat) => {
              if (mat instanceof THREE.MeshBasicMaterial) {
                return new THREE.MeshStandardMaterial({
                  color: mat.color,
                  map: mat.map,
                });
              }
              return mat;
            });
          } else if (mesh.material instanceof THREE.MeshBasicMaterial) {
            const basicMat = mesh.material;
            mesh.material = new THREE.MeshStandardMaterial({
              color: basicMat.color,
              map: basicMat.map,
            });
          }
        }
      }
    });

    return clonedScene;
  }, [scene]);

  return (
    <group ref={groupRef} position={NTPU_CONFIG.scene.position}>
      <primitive object={processedScene} scale={NTPU_CONFIG.scene.scale} />
    </group>
  );
}

// Preload model
useGLTF.preload(NTPU_CONFIG.scene.modelPath);
