// Post-processing setup module
import type { DitherUniforms } from '../types';
import * as THREE from 'three';
import { createBlueNoiseTexture } from '../shaders/BlueNoiseTexture';
import { DitherShader } from '../shaders/DitherShader';
import { disposeRenderTarget } from '../utils/dispose';

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

    // Shader quad with dithering effect. `satisfies DitherUniforms` locks this
    // inline object against the types/shader.ts contract, so tsc flags any
    // drift between the GLSL declarations, this injection and the type.
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
                // Override payoff (enhancements #4/#5): raw-bypass crash frame
                // + sustained-hold edge band. Default 0 = inert.
                uRawBypass: { value: 0.0 },
                uOverrideSustain: { value: 0.0 },
                // F5 dither language: stress grain scale (1 = historical) +
                // per-room pattern crossfade (mode 0/0/blend 1 = pure Bayer,
                // overwritten each frame from the room config) + the
                // boot-generated blue-noise threshold texture.
                uDitherScale: { value: 1.0 },
                // Dither-scale anchor: the OUTPUT framebuffer center in
                // gl_FragCoord px (canvas size / 2 — the final pass renders at
                // full window size, NOT the renderScale-scaled `resolution`).
                uScreenCenter: { value: new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2) },
                uDitherModeFrom: { value: 0 },
                uDitherModeTo: { value: 0 },
                uDitherModeBlend: { value: 1.0 },
                tBlueNoise: { value: createBlueNoiseTexture() },
            } satisfies DitherUniforms,
            vertexShader: DitherShader.vertexShader,
            fragmentShader: DitherShader.fragmentShader,
        }),
    );
    composerScene.add(shaderQuad);

    return { renderTarget, composerScene, composerCamera, shaderQuad };
}

/**
 * Dispose all post-processing GPU resources: the render target, the shader
 * quad's geometry/material, and the boot-generated blue-noise texture
 * (material.dispose() does NOT release textures held in uniforms).
 */
export function disposePostProcessing(components: PostProcessingComponents): void {
    disposeRenderTarget(components.renderTarget);
    const material = components.shaderQuad.material;
    const blueNoise = material.uniforms.tBlueNoise?.value as THREE.Texture | null | undefined;
    blueNoise?.dispose();
    components.shaderQuad.geometry.dispose();
    material.dispose();
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
    // Keep the dither-scale anchor on the OUTPUT framebuffer center (canvas
    // px — the final pass renders at full window size, unscaled).
    (components.shaderQuad.material.uniforms.uScreenCenter.value as THREE.Vector2)
        .set(window.innerWidth / 2, window.innerHeight / 2);
}

/**
 * Window-resize side effect for the whole render pipeline: camera aspect,
 * renderer canvas size, and the post-processing target/uniforms above.
 */
export function resizeRendering(
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    components: PostProcessingComponents,
    renderScale: number,
): void {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    updatePostProcessingSize(components, renderScale);
}

/**
 * The two-pass composed render: scene into the low-res target, then the
 * dither quad onto the canvas at full resolution.
 */
export function renderComposed(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    components: PostProcessingComponents,
): void {
    renderer.setRenderTarget(components.renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(components.composerScene, components.composerCamera);
}
