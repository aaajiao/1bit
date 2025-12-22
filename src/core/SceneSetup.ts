// Scene initialization module
import * as THREE from 'three';
import type { AppConfig } from '../types';

/**
 * Components created by scene setup
 */
export interface SceneComponents {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    scannerLight: THREE.SpotLight;
}

/**
 * Create and configure the main scene, camera, renderer, and lighting
 */
export function createScene(container: HTMLElement, config: AppConfig): SceneComponents {
    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x888888);
    scene.fog = new THREE.Fog(0x888888, config.fogNear, config.fogFar);

    // Camera
    const camera = new THREE.PerspectiveCamera(
        80,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.rotation.order = 'YXZ';

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    container.appendChild(renderer.domElement);

    // Disable new color management to match r128 behavior
    THREE.ColorManagement.enabled = false;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    // Lighting (intensity increased to compensate for r155+ decay changes)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x111111, 1.2);
    scene.add(hemiLight);

    const scannerLight = new THREE.SpotLight(0xffffff, 4.0);
    scannerLight.position.set(0, 80, 0);
    scannerLight.angle = Math.PI / 4;
    scannerLight.penumbra = 0.5;
    scannerLight.decay = 1; // Reduced from 2 to compensate
    scannerLight.distance = 250;
    scannerLight.castShadow = true;
    camera.add(scannerLight);

    // Add camera to scene
    scene.add(camera);

    return { scene, camera, renderer, scannerLight };
}
