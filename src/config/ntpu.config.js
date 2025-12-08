import { Vector3 } from 'three';
export const NTPU_CONFIG = {
    observer: {
        name: 'National Taipei University',
        latitude: 24.9441667, // 度
        longitude: 121.3713889, // 度
        altitude: 50, // 米
    },
    scene: {
        modelPath: '/scenes/NTPU.glb',
        position: new Vector3(0, 0, 0),
        scale: 1,
        rotation: [0, 0, 0],
    },
    camera: {
        initialPosition: new Vector3(0, 400, 500),
        fov: 60,
        near: 0.1,
        far: 10000,
    },
};
