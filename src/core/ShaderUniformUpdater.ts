import type { WeatherState } from '../types';
import type { RoomShaderConfig } from '../world/RoomConfig';
import * as THREE from 'three';

/**
 * Default brightness lift (tone fix). Mirrors DitherShader.uniforms.uBrightnessLift
 * so the duotone uniforms injected here below also seed a sensible lift even when
 * the runtime ShaderMaterial (built in PostProcessing.ts) predates these uniforms.
 */
const DEFAULT_BRIGHTNESS_LIFT = 1.55;

/**
 * The runtime ShaderMaterial is constructed in PostProcessing.ts with its own
 * inline uniforms object, which may not declare the duotone palette uniforms
 * (uInkColor / uPaperColor / uBrightnessLift) that the fragment shader now reads.
 * If a uniform is missing, Three.js leaves the GLSL value at 0 (which would render
 * everything as ink). We lazily inject the missing uniform entries into the live
 * material.uniforms object so they upload correctly.
 *
 * Three.js caches the per-material uniform upload list the first time the material
 * is rendered (which, for this project, is the paused start-screen frame BEFORE
 * this updater ever runs). Mutating material.uniforms afterwards does not, on its
 * own, invalidate that cached list. We therefore, exactly once after injecting:
 *   - change material.customProgramCacheKey so the program cache key changes, which
 *     makes getProgram() take its new-program branch and reset the cached uniform
 *     list (it reuses the already-compiled GL program, so this is cheap), and
 *   - set material.needsUpdate = true so the renderer actually re-enters getProgram
 *     on the next render (a cache-key change alone does not trigger re-entry).
 * The next frame then rebuilds the uniform list from the now-complete uniforms.
 */
function ensureDuotoneUniforms(
    material: THREE.ShaderMaterial,
): void {
    const u = material.uniforms;
    let injected = false;

    if (!u.uInkColor) {
        u.uInkColor = { value: new THREE.Vector3(0.0, 0.0, 0.0) };
        injected = true;
    }
    if (!u.uPaperColor) {
        u.uPaperColor = { value: new THREE.Vector3(1.0, 1.0, 1.0) };
        injected = true;
    }
    if (!u.uBrightnessLift) {
        u.uBrightnessLift = { value: DEFAULT_BRIGHTNESS_LIFT };
        injected = true;
    }
    // Per-room post-process character (Phase 5b). Same lazy-inject guard as above
    // for materials built before these uniforms existed; default 0 = inert.
    if (!u.uScanIntensity) {
        u.uScanIntensity = { value: 0.0 };
        injected = true;
    }
    if (!u.uMisregister) {
        u.uMisregister = { value: 0.0 };
        injected = true;
    }

    if (injected) {
        // Force the renderer to rebuild its cached uniform list so the freshly
        // injected uniforms are actually uploaded. A new cache-key string is enough.
        const tagged = material as THREE.ShaderMaterial & { __duotoneInjected?: boolean };
        if (!tagged.__duotoneInjected) {
            tagged.__duotoneInjected = true;
            material.customProgramCacheKey = () => 'duotone';
            material.needsUpdate = true;
        }
    }
}

/**
 * Update post-processing shader uniforms
 */
export function updateShaderUniforms(
    shaderQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>,
    t: number,
    weather: WeatherState,
    shaderConfig: RoomShaderConfig,
    flowerIntensity: number,
    colorInversion: number,
    overrideProgress: number,
): void {
    ensureDuotoneUniforms(shaderQuad.material);
    const u = shaderQuad.material.uniforms;

    // Weather
    u.weatherType.value = weather.weatherType;
    u.weatherIntensity.value = weather.weatherIntensity;
    u.weatherTime.value = weather.weatherTime;

    // Room
    u.uNoiseDensity.value = shaderConfig.uNoiseDensity;
    u.uThresholdBias.value = shaderConfig.uThresholdBias;
    u.uTemporalJitter.value = shaderConfig.uTemporalJitter;
    u.uContrast.value = shaderConfig.uContrast;
    u.uGlitchAmount.value = shaderConfig.uGlitchAmount;
    u.uGlitchSpeed.value = shaderConfig.uGlitchSpeed;
    // Per-room post-process character (Phase 5b).
    u.uScanIntensity.value = shaderConfig.uScanIntensity;
    u.uMisregister.value = shaderConfig.uMisregister;

    // Room duotone palette (mutate the existing Vector3 in place to avoid churn).
    (u.uInkColor.value as THREE.Vector3).set(
        shaderConfig.inkColor[0],
        shaderConfig.inkColor[1],
        shaderConfig.inkColor[2],
    );
    (u.uPaperColor.value as THREE.Vector3).set(
        shaderConfig.paperColor[0],
        shaderConfig.paperColor[1],
        shaderConfig.paperColor[2],
    );

    // Globals & Player
    u.uTime.value = t;
    u.uFlowerIntensity.value = flowerIntensity;
    u.uColorInversion.value = colorInversion;
    u.uOverrideProgress.value = overrideProgress;
}
