// 1-bit Chimera Void - Room Configuration
// Defines mental state rooms and their shader/audio parameters

/**
 * Room type enumeration representing different mental states
 */
export enum RoomType {
    INFO_OVERFLOW = 'INFO_OVERFLOW', // High noise, no response
    FORCED_ALIGNMENT = 'FORCED_ALIGNMENT', // Split world, binary choice
    IN_BETWEEN = 'IN_BETWEEN', // Glitch, misread by both systems
    POLARIZED = 'POLARIZED', // Pure binary, zero dithering
}

/**
 * Shader parameters for each room type
 */
/**
 * Duotone color tuple, RGB components in 0-1 (sRGB-normalized).
 * Stored as a plain triple (not THREE.Color) so it interpolates cleanly inside
 * the pure numeric lerp and stays test-friendly.
 */
export type ColorRGB = [number, number, number];

export interface RoomShaderConfig {
    uNoiseDensity: number; // 0-1, dither pattern density
    uThresholdBias: number; // -0.5 to 0.5, black/white balance offset
    uTemporalJitter: number; // 0-1, temporal animation
    uContrast: number; // 1.0+, overall contrast
    uGlitchAmount: number; // 0-1, vertex displacement amplitude
    uGlitchSpeed: number; // Hz, glitch animation frequency
    // Per-room 1-bit duotone palette. The dithered scalar (~0 or ~1 per pixel)
    // is mapped to these two colors at the very end of the fragment shader:
    //   finalRGB = mix(inkColor, paperColor, value)
    // All rooms keep a near-identical value structure (paper L~0.90, ink L~0.07);
    // only hue/temperature differs so the result still reads as "1-bit with a cast".
    inkColor: ColorRGB; // the "0"/dark ink
    paperColor: ColorRGB; // the "1"/light paper
}

/**
 * Audio parameters for each room type
 */
export interface RoomAudioConfig {
    baseFrequency: number; // Ambient drone base frequency (Hz)
    harmonic: 'consonant' | 'dissonant' | 'binaural';
    noiseLayer: boolean; // Whether to add high-frequency noise
    noiseGain: number; // 0-1
    beatFrequency?: number; // For binaural beats (L/R Hz difference)
}

/**
 * Complete room configuration
 */
export interface RoomConfig {
    shader: RoomShaderConfig;
    audio: RoomAudioConfig;
    visualCues: {
        buildingFlicker: boolean; // Buildings swap geometry
        zFighting: boolean; // Depth conflict artifacts
        crackVisible: boolean; // Central crack/rift
        zeroDither: boolean; // Pure 1-bit, no dithering
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
            // Cold cyan (data / screen overload). paper #DCEDF2, ink #0A1A22
            inkColor: [0.0392, 0.1020, 0.1333],
            paperColor: [0.8627, 0.9294, 0.9490],
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
            // Phosphor amber-green (institutional / surveillance). paper #E9EAD2, ink #15180B
            inkColor: [0.0824, 0.0941, 0.0431],
            paperColor: [0.9137, 0.9176, 0.8235],
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
            // Near-neutral faint violet-grey (liminal anchor, lowest saturation). paper #E7E6EA, ink #111016
            inkColor: [0.0667, 0.0627, 0.0863],
            paperColor: [0.9059, 0.9020, 0.9176],
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
            // Charged warm red / bone (extremes / aggression, most charged). paper #F3E9E4, ink #1E0C0E
            inkColor: [0.1176, 0.0471, 0.0549],
            paperColor: [0.9529, 0.9137, 0.8941],
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
    t: number,
): RoomShaderConfig {
    // Clamp interpolation factor to [0, 1] to avoid extrapolation overshoot
    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    const lerp = (a: number, b: number) => a + (b - a) * tc;
    const lerpColor = (a: ColorRGB, b: ColorRGB): ColorRGB => [
        lerp(a[0], b[0]),
        lerp(a[1], b[1]),
        lerp(a[2], b[2]),
    ];
    return {
        uNoiseDensity: lerp(from.uNoiseDensity, to.uNoiseDensity),
        uThresholdBias: lerp(from.uThresholdBias, to.uThresholdBias),
        uTemporalJitter: lerp(from.uTemporalJitter, to.uTemporalJitter),
        uContrast: lerp(from.uContrast, to.uContrast),
        uGlitchAmount: lerp(from.uGlitchAmount, to.uGlitchAmount),
        uGlitchSpeed: lerp(from.uGlitchSpeed, to.uGlitchSpeed),
        // Fresh tuples each call so the shallow spread in ChunkManager never aliases.
        inkColor: lerpColor(from.inkColor, to.inkColor),
        paperColor: lerpColor(from.paperColor, to.paperColor),
    };
}

/**
 * Get room type from chunk position (procedural assignment)
 */
export function getRoomTypeFromPosition(cx: number, cz: number): RoomType {
    // Use hash-based distribution for variety
    const hash = Math.abs(Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1;

    if (hash < 0.25)
        return RoomType.INFO_OVERFLOW;
    if (hash < 0.50)
        return RoomType.FORCED_ALIGNMENT;
    if (hash < 0.75)
        return RoomType.IN_BETWEEN;
    return RoomType.POLARIZED;
}
