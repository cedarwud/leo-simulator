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
    initialPosition: new Vector3(0, 800, 1200), // 將攝影機拉近並抬高視角，縮短 Z 軸距離並提高 Y
    target: new Vector3(0, 200, 0), // 將視角中心上移，讓畫面整體下移
    fov: 60,
    near: 0.1,
    far: 10000,
  },
};
