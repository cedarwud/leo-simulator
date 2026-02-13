import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { NTPU_CONFIG } from '@/config/ntpu.config';
import * as THREE from 'three';

export function NTPUScene() {
  const { scene } = useGLTF(NTPU_CONFIG.scene.modelPath);

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
                const replacement = new THREE.MeshStandardMaterial({
                  color: mat.color,
                  map: mat.map,
                });
                mat.dispose();
                return replacement;
              }
              return mat;
            });
          } else if (mesh.material instanceof THREE.MeshBasicMaterial) {
            const basicMat = mesh.material;
            mesh.material = new THREE.MeshStandardMaterial({
              color: basicMat.color,
              map: basicMat.map,
            });
            basicMat.dispose();
          }
        }
      }
    });

    return clonedScene;
  }, [scene]);

  return (
    <group position={NTPU_CONFIG.scene.position}>
      <primitive object={processedScene} scale={NTPU_CONFIG.scene.scale} />
    </group>
  );
}

// Preload model
useGLTF.preload(NTPU_CONFIG.scene.modelPath);
