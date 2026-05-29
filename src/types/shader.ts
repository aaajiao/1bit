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
