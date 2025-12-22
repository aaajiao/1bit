// 1-bit Chimera Void - Room Configuration
// Defines mental state rooms and their shader/audio parameters

/**
 * Room type enumeration representing different mental states
 */
export enum RoomType {
    INFO_OVERFLOW = 'INFO_OVERFLOW',      // High noise, no response
    FORCED_ALIGNMENT = 'FORCED_ALIGNMENT', // Split world, binary choice
    IN_BETWEEN = 'IN_BETWEEN',             // Glitch, misread by both systems
    POLARIZED = 'POLARIZED',               // Pure binary, zero dithering
}

/**
 * Shader parameters for each room type
 */
export interface RoomShaderConfig {
    uNoiseDensity: number;     // 0-1, dither pattern density
    uThresholdBias: number;    // -0.5 to 0.5, black/white balance offset
    uTemporalJitter: number;   // 0-1, temporal animation
    uContrast: number;         // 1.0+, overall contrast
    uGlitchAmount: number;     // 0-1, vertex displacement amplitude
    uGlitchSpeed: number;      // Hz, glitch animation frequency
}

/**
 * Audio parameters for each room type
 */
export interface RoomAudioConfig {
    baseFrequency: number;          // Ambient drone base frequency (Hz)
    harmonic: 'consonant' | 'dissonant' | 'binaural';
    noiseLayer: boolean;            // Whether to add high-frequency noise
    noiseGain: number;              // 0-1
    beatFrequency?: number;         // For binaural beats (L/R Hz difference)
}

/**
 * Complete room configuration
 */
export interface RoomConfig {
    shader: RoomShaderConfig;
    audio: RoomAudioConfig;
    visualCues: {
        buildingFlicker: boolean;   // Buildings swap geometry
        zFighting: boolean;         // Depth conflict artifacts
        crackVisible: boolean;      // Central crack/rift
        zeroDither: boolean;        // Pure 1-bit, no dithering
    };
}

/**
 * Default room configurations matching design document
 */
export const ROOM_CONFIGS: Record<RoomType, RoomConfig> = {
    [RoomType.INFO_OVERFLOW]: {
        shader: {
            uNoiseDensity: 0.85,
            uThresholdBias: 0.1,
            uTemporalJitter: 0.6,
            uContrast: 1.2,
            uGlitchAmount: 0.05,
            uGlitchSpeed: 2.0,
        },
        audio: {
            baseFrequency: 60,
            harmonic: 'dissonant',
            noiseLayer: true,
            noiseGain: 0.15,
        },
        visualCues: {
            buildingFlicker: true,
            zFighting: false,
            crackVisible: false,
            zeroDither: false,
        },
    },
    [RoomType.FORCED_ALIGNMENT]: {
        shader: {
            uNoiseDensity: 0.55,
            uThresholdBias: 0.0,
            uTemporalJitter: 0.2,
            uContrast: 1.0,
            uGlitchAmount: 0.02,
            uGlitchSpeed: 1.0,
        },
        audio: {
            baseFrequency: 55,
            harmonic: 'binaural',
            noiseLayer: false,
            noiseGain: 0,
            beatFrequency: 20,
        },
        visualCues: {
            buildingFlicker: false,
            zFighting: false,
            crackVisible: true,
            zeroDither: false,
        },
    },
    [RoomType.IN_BETWEEN]: {
        shader: {
            uNoiseDensity: 0.65,
            uThresholdBias: 0.05,
            uTemporalJitter: 0.4,
            uContrast: 1.1,
            uGlitchAmount: 0.08,
            uGlitchSpeed: 3.0,
        },
        audio: {
            baseFrequency: 50,
            harmonic: 'dissonant',
            noiseLayer: true,
            noiseGain: 0.08,
        },
        visualCues: {
            buildingFlicker: false,
            zFighting: true,
            crackVisible: false,
            zeroDither: false,
        },
    },
    [RoomType.POLARIZED]: {
        shader: {
            uNoiseDensity: 0.0,
            uThresholdBias: 0.0,
            uTemporalJitter: 0.0,
            uContrast: 2.0,
            uGlitchAmount: 0.0,
            uGlitchSpeed: 0.0,
        },
        audio: {
            baseFrequency: 40,
            harmonic: 'consonant',
            noiseLayer: false,
            noiseGain: 0,
        },
        visualCues: {
            buildingFlicker: false,
            zFighting: false,
            crackVisible: false,
            zeroDither: true,
        },
    },
};

/**
 * Noise density mapping based on flower intensity for INFO_OVERFLOW
 */
export const INFO_OVERFLOW_NOISE_MAP: Record<number, number> = {
    0.1: 0.75,
    0.3: 0.82,
    0.5: 0.88,
    0.7: 0.95,
    1.0: 1.0,
};

/**
 * Building refresh interval mapping based on flower intensity
 */
export const INFO_OVERFLOW_REFRESH_MAP: Record<number, number> = {
    0.1: 6.0,
    0.3: 5.0,
    0.5: 3.5,
    0.7: 2.5,
    1.0: 1.5,
};

/**
 * Interpolate shader config between two rooms for smooth transitions
 */
export function lerpRoomShaderConfig(
    from: RoomShaderConfig,
    to: RoomShaderConfig,
    t: number
): RoomShaderConfig {
    const lerp = (a: number, b: number) => a + (b - a) * t;
    return {
        uNoiseDensity: lerp(from.uNoiseDensity, to.uNoiseDensity),
        uThresholdBias: lerp(from.uThresholdBias, to.uThresholdBias),
        uTemporalJitter: lerp(from.uTemporalJitter, to.uTemporalJitter),
        uContrast: lerp(from.uContrast, to.uContrast),
        uGlitchAmount: lerp(from.uGlitchAmount, to.uGlitchAmount),
        uGlitchSpeed: lerp(from.uGlitchSpeed, to.uGlitchSpeed),
    };
}

/**
 * Get room type from chunk position (procedural assignment)
 */
export function getRoomTypeFromPosition(cx: number, cz: number): RoomType {
    // Use hash-based distribution for variety
    const hash = Math.abs(Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1;

    if (hash < 0.25) return RoomType.INFO_OVERFLOW;
    if (hash < 0.50) return RoomType.FORCED_ALIGNMENT;
    if (hash < 0.75) return RoomType.IN_BETWEEN;
    return RoomType.POLARIZED;
}
