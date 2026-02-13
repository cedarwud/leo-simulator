export const NTPU_CONFIG = {
  observer: {
    name: 'National Taipei University',
    latitude: 24.9441667,    // degrees
    longitude: 121.3713889,  // degrees
    altitude: 50,            // meters
  },
  uav: {
    modelPath: '/models/uav.glb',
  },
  scene: {
    modelPath: '/scenes/NTPU.glb',
    position: [0, 0, 0] as [number, number, number],
    scale: 1,
    rotation: [0, 0, 0] as [number, number, number],
  },
  camera: {
    initialPosition: [0, 800, 1200] as [number, number, number],
    target: [0, 200, 0] as [number, number, number],
    fov: 60,
    near: 0.1,
    far: 10000,
  },
};
