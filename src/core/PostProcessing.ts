// Post-processing setup module
import * as THREE from 'three';
import { DitherShader } from '../shaders/DitherShader';

/**
 * Components created by post-processing setup
 */
export interface PostProcessingComponents {
    renderTarget: THREE.WebGLRenderTarget;
    composerScene: THREE.Scene;
    composerCamera: THREE.OrthographicCamera;
    shaderQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
}

/**
 * Create post-processing render target and shader quad
 */
export function createPostProcessing(renderScale: number): PostProcessingComponents {
    const width = window.innerWidth * renderScale;
    const height = window.innerHeight * renderScale;

    // Render target for post-processing
    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
    });

    // Post-processing scene and camera
    const composerScene = new THREE.Scene();
    const composerCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Shader quad with dithering effect
    const shaderQuad = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: renderTarget.texture },
                resolution: { value: new THREE.Vector2(width, height) },
                enableOutline: { value: true },
                outlineStrength: { value: 0.3 },
                enableDepthDither: { value: false },
                ditherTransition: { value: 0.7 },
                invertColors: { value: false },
                // Weather
                weatherType: { value: 0 },
                weatherIntensity: { value: 0.0 },
                weatherTime: { value: 0.0 },
                // Room-specific uniforms
                uNoiseDensity: { value: 0.5 },
                uThresholdBias: { value: 0.0 },
                uTemporalJitter: { value: 0.0 },
                uContrast: { value: 1.0 },
                uGlitchAmount: { value: 0.0 },
                uGlitchSpeed: { value: 0.0 },
                uColorInversion: { value: 0.0 },
                uOverrideProgress: { value: 0.0 },
                uTime: { value: 0.0 },
                uFlowerIntensity: { value: 0.5 },
            },
            vertexShader: DitherShader.vertexShader,
            fragmentShader: DitherShader.fragmentShader,
        })
    );
    composerScene.add(shaderQuad);

    return { renderTarget, composerScene, composerCamera, shaderQuad };
}

/**
 * Update post-processing components on window resize
 */
export function updatePostProcessingSize(
    components: PostProcessingComponents,
    renderScale: number
): void {
    const width = window.innerWidth * renderScale;
    const height = window.innerHeight * renderScale;

    components.renderTarget.setSize(width, height);
    (components.shaderQuad.material.uniforms.resolution.value as THREE.Vector2).set(width, height);
}
