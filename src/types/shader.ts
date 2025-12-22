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
