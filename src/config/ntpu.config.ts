import { Vector3 } from 'three';

export const NTPU_CONFIG = {
  observer: {
    name: 'National Taipei University',
    latitude: 24.9441667,    // degrees
    longitude: 121.3713889,  // degrees
    altitude: 50,            // meters
  },
  scene: {
    modelPath: '/scenes/NTPU.glb',
    position: new Vector3(0, 0, 0),
    scale: 1,
    rotation: [0, 0, 0] as [number, number, number],
  },
  camera: {
    initialPosition: new Vector3(0, 400, 2000), // 將攝影機的 Z 軸位置從 1000 增加到 2000，使其拉遠
    fov: 60,
    near: 0.1,
    far: 10000,
  },
};
