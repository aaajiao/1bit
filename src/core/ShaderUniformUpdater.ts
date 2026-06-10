import type { WeatherState } from '../types';
import type { RoomShaderConfig } from '../world/RoomConfig';
import * as THREE from 'three';
import { CAMERA, GAZE, GAZE_VISUAL } from '../config';
import {
    faSideNoiseDensity,
    infoOverflowJitterForIntensity,
    noiseDensityForIntensity,
    ROOM_CONFIGS,
    RoomType,
} from '../world/RoomConfig';

/**
 * Default brightness lift (tone fix). Mirrors DitherShader.uniforms.uBrightnessLift
 * so the duotone uniforms injected here below also seed a sensible lift even when
 * the runtime ShaderMaterial (built in PostProcessing.ts) predates these uniforms.
 */
const DEFAULT_BRIGHTNESS_LIFT = 1.55;

/**
 * Precomputed tan(fovY/2) for projecting the 45° gaze-threshold pitch into
 * screen space (the marker line in DitherShader). FOV is fixed for the whole
 * session (CAMERA.FOV_DEGREES, same source SceneSetup uses).
 */
const TAN_HALF_FOV = Math.tan(THREE.MathUtils.degToRad(CAMERA.FOV_DEGREES) / 2);

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
    // Signed per-room flower->threshold gain; default 0.1 = the historical
    // hardcoded behavior, so a material missing the uniform stays unchanged.
    if (!u.uFlowerThresholdGain) {
        u.uFlowerThresholdGain = { value: 0.1 };
        injected = true;
    }
    // Gaze visual feedback (flow-audit break #1 + enhancement #2). Same lazy
    // inject guard; defaults 0 = inert (uPitchLineV is gated by alpha 0).
    if (!u.uGazeIntensity) {
        u.uGazeIntensity = { value: 0.0 };
        injected = true;
    }
    if (!u.uGazeVignetteStrength) {
        u.uGazeVignetteStrength = { value: 0.0 };
        injected = true;
    }
    if (!u.uPitchLineV) {
        u.uPitchLineV = { value: 0.5 };
        injected = true;
    }
    if (!u.uPitchLineAlpha) {
        u.uPitchLineAlpha = { value: 0.0 };
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
 * @param shaderQuad - Fullscreen quad carrying the DitherShader material
 * @param t - Elapsed time in seconds
 * @param weather - Current weather state
 * @param shaderConfig - Room shader config (smoothed by ChunkManager)
 * @param flowerIntensity - 0-1 current flower intensity
 * @param colorInversion - 0-1 override color-inversion value
 * @param overrideProgress - 0-1 override hold progress
 * @param gazeIntensity - 0-1 smoothed gaze intensity (GazeMechanic curve)
 * @param pitch - Camera pitch in radians (positive = looking up)
 * @param gazeThresholdPulse - 0-1 first-crossing pulse for the 45° marker line
 * @param currentRoomType - Player's current room (gates the reactive overrides)
 * @param playerX - Player world x (FORCED_ALIGNMENT side asymmetry)
 */
export function updateShaderUniforms(
    shaderQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>,
    t: number,
    weather: WeatherState,
    shaderConfig: RoomShaderConfig,
    flowerIntensity: number,
    colorInversion: number,
    overrideProgress: number,
    gazeIntensity: number,
    pitch: number,
    gazeThresholdPulse: number,
    currentRoomType: RoomType,
    playerX: number,
): void {
    ensureDuotoneUniforms(shaderQuad.material);
    const u = shaderQuad.material.uniforms;

    // Weather
    u.weatherType.value = weather.weatherType;
    u.weatherIntensity.value = weather.weatherIntensity;
    u.weatherTime.value = weather.weatherTime;

    // Room-reactive overrides (flow-audit breaks #7/#8), applied as DELTAS from
    // the room's static baseline on top of the transition-smoothed config:
    // at steady state the delta resolves to the exact reactive target, while
    // during a room transition the smoothed baseline keeps gliding (no pop).
    let noiseDensity = shaderConfig.uNoiseDensity;
    let temporalJitter = shaderConfig.uTemporalJitter;
    if (currentRoomType === RoomType.INFO_OVERFLOW) {
        // Overload negative feedback: brighter flower = denser noise + more jitter.
        const base = ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader;
        noiseDensity += noiseDensityForIntensity(flowerIntensity) - base.uNoiseDensity;
        temporalJitter += infoOverflowJitterForIntensity(flowerIntensity) - base.uTemporalJitter;
    }
    else if (currentRoomType === RoomType.FORCED_ALIGNMENT) {
        // Side asymmetry: tidy left of the rift crack, broken right.
        const base = ROOM_CONFIGS[RoomType.FORCED_ALIGNMENT].shader;
        noiseDensity += faSideNoiseDensity(playerX) - base.uNoiseDensity;
    }

    u.uNoiseDensity.value = Math.min(1, Math.max(0, noiseDensity));
    u.uThresholdBias.value = shaderConfig.uThresholdBias;
    u.uTemporalJitter.value = Math.min(1, Math.max(0, temporalJitter));
    // Gaze hardens the image (flow-audit break #1, "注视=对比度变化"): add a
    // contrast component on top of the room baseline, clamped so POLARIZED's
    // already-high 2.0 base cannot overexpose. Smoothing comes for free from
    // the GazeMechanic intensity curve (0 at threshold -> 1 straight up).
    u.uContrast.value = Math.min(
        shaderConfig.uContrast + gazeIntensity * GAZE_VISUAL.CONTRAST_GAIN,
        GAZE_VISUAL.CONTRAST_MAX,
    );
    u.uGlitchAmount.value = shaderConfig.uGlitchAmount;
    u.uGlitchSpeed.value = shaderConfig.uGlitchSpeed;
    // Per-room post-process character (Phase 5b).
    u.uScanIntensity.value = shaderConfig.uScanIntensity;
    u.uMisregister.value = shaderConfig.uMisregister;
    u.uFlowerThresholdGain.value = shaderConfig.uFlowerThresholdGain;

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

    // Gaze visual feedback (flow-audit break #1 + enhancement #2)
    u.uGazeIntensity.value = gazeIntensity;
    u.uGazeVignetteStrength.value = GAZE_VISUAL.VIGNETTE_STRENGTH;

    // 45° threshold marker line: project the threshold elevation into screen
    // space like a horizon marker. offset > 0 means the line sits above the
    // view center (player is below the threshold pitch).
    const pitchOffset = GAZE.PITCH_THRESHOLD - pitch;
    const proximity = Math.max(0, 1 - Math.abs(pitchOffset) / GAZE_VISUAL.PITCH_LINE_WINDOW);
    u.uPitchLineV.value = 0.5 + Math.tan(pitchOffset) / (2 * TAN_HALF_FOV);
    u.uPitchLineAlpha.value = Math.min(
        1,
        proximity * GAZE_VISUAL.PITCH_LINE_ALPHA
        + gazeThresholdPulse * GAZE_VISUAL.PITCH_LINE_PULSE_ALPHA,
    );
}
