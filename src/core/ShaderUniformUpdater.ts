import type { WeatherState } from '../types';
import type { RoomShaderConfig } from '../world/RoomConfig';
import * as THREE from 'three';
import { CAMERA, GAZE, GAZE_VISUAL, SUNSET_FORESHADOW } from '../config';

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
    // Override payoff (enhancements #4/#5). Same lazy-inject guard; 0 = inert.
    if (!u.uRawBypass) {
        u.uRawBypass = { value: 0.0 };
        injected = true;
    }
    if (!u.uOverrideSustain) {
        u.uOverrideSustain = { value: 0.0 };
        injected = true;
    }
    // F5 dither language. Defaults reproduce the historical look exactly:
    // scale 1 + mode 0/0 (pure Bayer, so tBlueNoise is never sampled even
    // while null) + blend 1.
    if (!u.uDitherScale) {
        u.uDitherScale = { value: 1.0 };
        injected = true;
    }
    // Dither-scale anchor (center-symmetric grain zoom). Inject with the live
    // canvas center so a material that predates the uniform still anchors on
    // the screen center; PostProcessing keeps it in sync on resize.
    if (!u.uScreenCenter) {
        u.uScreenCenter = { value: new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2) };
        injected = true;
    }
    if (!u.uDitherModeFrom) {
        u.uDitherModeFrom = { value: 0 };
        injected = true;
    }
    if (!u.uDitherModeTo) {
        u.uDitherModeTo = { value: 0 };
        injected = true;
    }
    if (!u.uDitherModeBlend) {
        u.uDitherModeBlend = { value: 1.0 };
        injected = true;
    }
    if (!u.tBlueNoise) {
        u.tBlueNoise = { value: null };
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
 * Per-frame inputs for {@link updateShaderUniforms}.
 *
 * core/ShaderSyncUpdater keeps ONE long-lived instance of this object (built
 * once via {@link createShaderUniformParams}) and mutates its fields in
 * place every frame, so the per-frame uniform sync allocates nothing.
 */
export interface ShaderUniformParams {
    /** Fullscreen quad carrying the DitherShader material */
    shaderQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    /** Elapsed time in seconds */
    t: number;
    /** Current weather state */
    weather: WeatherState;
    /**
     * Room shader config, transition-blended by ChunkManager/RoomTransition
     * with the reactive per-room overrides (INFO_OVERFLOW flower
     * noise/jitter, FORCED_ALIGNMENT side asymmetry) already baked in.
     */
    shaderConfig: RoomShaderConfig;
    /** 0-1 current flower intensity */
    flowerIntensity: number;
    /** 0-1 override color-inversion value */
    colorInversion: number;
    /** 0-1 override hold progress */
    overrideProgress: number;
    /**
     * 0/1 raw-bypass crash frame (enhancement #4): for ~0.1s after the
     * override triggers the shader outputs the raw, un-dithered tDiffuse.
     */
    rawBypass: number;
    /**
     * 0-1 sustained-hold edge band (enhancement #5): steady paper-white
     * while the key stays held past the trigger, fast decay on release.
     */
    overrideSustain: number;
    /**
     * 0-1 accumulated per-run resistance residue (enhancement #6): adds onto
     * the room's uMisregister so POLARIZED's zero jitter is never pristine
     * again after a successful override. Global player-driven layer (like the
     * gaze contrast / sunset foreshadow), NOT a room-reactivity delta — those
     * stay baked upstream in RoomTransition.
     */
    overrideResidue: number;
    /** 0-1 smoothed gaze intensity (GazeMechanic curve) */
    gazeIntensity: number;
    /** Camera pitch in radians (positive = looking up) */
    pitch: number;
    /** 0-1 first-crossing pulse for the 45° marker line */
    gazeThresholdPulse: number;
    /**
     * 0-1 pre-sunset foreshadow ramp (flow-audit enhancement #8): dims and
     * warms the duotone paper across the last ~30s of the day phase. Global
     * (not per-room) — room reactivity stays baked upstream in RoomTransition.
     */
    sunsetForeshadow: number;
    /**
     * Stress-driven dither sampling scale (F5 "分辨率即情绪"), >=1. Smoothed
     * CPU-side by core/StressLevel (attack fast / release slow) and fed in by
     * main.ts — a global player layer like the gaze contrast; the per-room
     * pattern crossfade rides shaderConfig instead.
     */
    ditherScale: number;
}

/**
 * Build the reusable params object for {@link updateShaderUniforms} with
 * inert defaults. Every dynamic field is overwritten each frame before the
 * update consumes it; the point of this factory is to allocate exactly once.
 */
export function createShaderUniformParams(
    shaderQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>,
    shaderConfig: RoomShaderConfig,
): ShaderUniformParams {
    return {
        shaderQuad,
        t: 0,
        weather: { weatherType: 0, weatherIntensity: 0, weatherTime: 0 },
        shaderConfig,
        flowerIntensity: 0,
        colorInversion: 0,
        overrideProgress: 0,
        rawBypass: 0,
        overrideSustain: 0,
        overrideResidue: 0,
        gazeIntensity: 0,
        pitch: 0,
        gazeThresholdPulse: 0,
        sunsetForeshadow: 0,
        ditherScale: 1,
    };
}

/**
 * Update post-processing shader uniforms from the per-frame params object.
 */
export function updateShaderUniforms(params: ShaderUniformParams): void {
    const {
        shaderQuad,
        t,
        weather,
        shaderConfig,
        flowerIntensity,
        colorInversion,
        overrideProgress,
        rawBypass,
        overrideSustain,
        overrideResidue,
        gazeIntensity,
        pitch,
        gazeThresholdPulse,
        sunsetForeshadow,
        ditherScale,
    } = params;
    ensureDuotoneUniforms(shaderQuad.material);
    const u = shaderQuad.material.uniforms;

    // Weather
    u.weatherType.value = weather.weatherType;
    u.weatherIntensity.value = weather.weatherIntensity;
    u.weatherTime.value = weather.weatherTime;

    // Room scalars. The reactive per-room overrides (flow-audit breaks #7/#8:
    // INFO_OVERFLOW flower noise/jitter, FORCED_ALIGNMENT side asymmetry) are
    // baked into shaderConfig upstream by world/RoomTransition, where they are
    // also frozen into the transition from-snapshot on room exit — so room
    // crossings never pop (flow-audit medium #4). Clamp as a final guard.
    u.uNoiseDensity.value = Math.min(1, Math.max(0, shaderConfig.uNoiseDensity));
    u.uThresholdBias.value = shaderConfig.uThresholdBias;
    u.uTemporalJitter.value = Math.min(1, Math.max(0, shaderConfig.uTemporalJitter));
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
    // The resistance residue (enhancement #6) rides the misregistration
    // channel ON TOP of the room baseline: a global, player-earned layer
    // (each successful override adds a sliver, cleared at sunset), so
    // POLARIZED's pristine 0 is never quite 0 again this run.
    u.uMisregister.value = Math.min(1, shaderConfig.uMisregister + overrideResidue);
    u.uFlowerThresholdGain.value = shaderConfig.uFlowerThresholdGain;
    // F5 dither language: the room's pattern crossfade triple (categorical
    // ids + output-blend factor, baked upstream by RoomTransition — never
    // numerically lerped) and the global stress-driven grain scale.
    u.uDitherModeFrom.value = shaderConfig.ditherModeFrom;
    u.uDitherModeTo.value = shaderConfig.ditherMode;
    u.uDitherModeBlend.value = Math.min(1, Math.max(0, shaderConfig.ditherModeBlend));
    u.uDitherScale.value = Math.max(1, ditherScale);

    // Room duotone palette (mutate the existing Vector3 in place to avoid churn).
    (u.uInkColor.value as THREE.Vector3).set(
        shaderConfig.inkColor[0],
        shaderConfig.inkColor[1],
        shaderConfig.inkColor[2],
    );
    // Pre-sunset foreshadow (enhancement #8): a GLOBAL dusk shift on the
    // paper — dim slightly, warm slightly (R dims least, B most). At
    // foreshadow 0 this is the exact room palette; like the gaze-contrast add
    // above it layers on top of shaderConfig rather than into it (room
    // reactivity stays baked upstream in RoomTransition).
    const duskDimR = 1 - sunsetForeshadow * (SUNSET_FORESHADOW.PAPER_DIM - SUNSET_FORESHADOW.WARM_SHIFT);
    const duskDimG = 1 - sunsetForeshadow * SUNSET_FORESHADOW.PAPER_DIM;
    const duskDimB = 1 - sunsetForeshadow * (SUNSET_FORESHADOW.PAPER_DIM + SUNSET_FORESHADOW.WARM_SHIFT);
    (u.uPaperColor.value as THREE.Vector3).set(
        shaderConfig.paperColor[0] * duskDimR,
        shaderConfig.paperColor[1] * duskDimG,
        shaderConfig.paperColor[2] * duskDimB,
    );

    // Globals & Player
    u.uTime.value = t;
    u.uFlowerIntensity.value = flowerIntensity;
    u.uColorInversion.value = colorInversion;
    u.uOverrideProgress.value = overrideProgress;
    // Override payoff (enhancements #4/#5): crash frame + held-resistance band.
    u.uRawBypass.value = rawBypass;
    u.uOverrideSustain.value = overrideSustain;

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
