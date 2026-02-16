import type * as THREE from 'three';
import type { WeatherState } from '../types';
import type { RoomShaderConfig } from '../world/RoomConfig';

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

    // Globals & Player
    u.uTime.value = t;
    u.uFlowerIntensity.value = flowerIntensity;
    u.uColorInversion.value = colorInversion;
    u.uOverrideProgress.value = overrideProgress;
}
