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
                // Duotone palette + tone fix (mutated per-frame by ShaderUniformUpdater).
                // Declared here so Three.js builds the correct uniform upload list at
                // construction — the runtime inject in ShaderUniformUpdater is then a no-op.
                uInkColor: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
                uPaperColor: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
                uBrightnessLift: { value: 1.55 },
                // Per-room post-process character (Phase 5b). Default 0 = inert,
                // overwritten each frame by ShaderUniformUpdater from the room config.
                uScanIntensity: { value: 0.0 },
                uMisregister: { value: 0.0 },
                // Signed per-room flower->threshold gain (0.1 = historical
                // behavior); overwritten each frame from the room config.
                uFlowerThresholdGain: { value: 0.1 },
                // Gaze visual feedback (vignette + 45° threshold line). Default
                // 0 = inert, overwritten each frame by ShaderUniformUpdater.
                uGazeIntensity: { value: 0.0 },
                uGazeVignetteStrength: { value: 0.0 },
                uPitchLineV: { value: 0.5 },
                uPitchLineAlpha: { value: 0.0 },
            },
            vertexShader: DitherShader.vertexShader,
            fragmentShader: DitherShader.fragmentShader,
        }),
    );
    composerScene.add(shaderQuad);

    return { renderTarget, composerScene, composerCamera, shaderQuad };
}

/**
 * Update post-processing components on window resize
 */
export function updatePostProcessingSize(
    components: PostProcessingComponents,
    renderScale: number,
): void {
    const width = window.innerWidth * renderScale;
    const height = window.innerHeight * renderScale;

    components.renderTarget.setSize(width, height);
    (components.shaderQuad.material.uniforms.resolution.value as THREE.Vector2).set(width, height);
}
