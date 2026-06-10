// Shader-related types
import type * as THREE from 'three';

export interface DitherUniforms {
    tDiffuse: { value: THREE.Texture | null };
    resolution: { value: THREE.Vector2 };
    enableOutline: { value: boolean };
    outlineStrength: { value: number };
    enableDepthDither: { value: boolean };
    ditherTransition: { value: number };
    invertColors: { value: boolean };
    weatherType: { value: number };
    weatherIntensity: { value: number };
    weatherTime: { value: number };
    // 1-bit duotone palette (per-room) + tone-fix brightness lift.
    // Vector3 RGB (0-1); defaults to black ink / white paper for monochrome parity.
    uInkColor: { value: THREE.Vector3 };
    uPaperColor: { value: THREE.Vector3 };
    uBrightnessLift: { value: number };
    // Per-room post-process character (Phase 5b).
    // uScanIntensity: 0-1, slow horizontal CRT/surveillance scan band biasing the
    //   dither threshold (FORCED_ALIGNMENT only; 0 elsewhere — must stay 0 in
    //   POLARIZED so it never collides with the uNoiseDensity<0.01 hard-threshold).
    // uMisregister: 0-1, subtle 1-px duotone channel misregistration (IN_BETWEEN
    //   "misread by both systems"; 0 elsewhere).
    uScanIntensity: { value: number };
    uMisregister: { value: number };
    // uFlowerThresholdGain: signed per-room gain of the flower term in the
    //   dither threshold (positive = brighter flower cleans the frame; negative
    //   in INFO_OVERFLOW so brightness dirties it — flow-audit break #8).
    uFlowerThresholdGain: { value: number };
    // Gaze visual feedback (flow-audit break #1 + enhancement #2).
    // uGazeIntensity: 0-1 smoothed gaze intensity; drives the disciplinary
    //   vignette (scaled by uGazeVignetteStrength from GAZE_VISUAL config)
    //   and, CPU-side, the uContrast gaze boost.
    // uPitchLineV / uPitchLineAlpha: screen-space 45° gaze-threshold marker
    //   line (v position + opacity incl. the first-crossing pulse).
    uGazeIntensity: { value: number };
    uGazeVignetteStrength: { value: number };
    uPitchLineV: { value: number };
    uPitchLineAlpha: { value: number };
}

export interface CableUniforms {
    time: { value: number };
    color: { value: THREE.Color };
    pulseColor: { value: THREE.Color };
}

export interface ShaderDefinition {
    uniforms: Record<string, { value: unknown }>;
    vertexShader: string;
    fragmentShader: string;
}
