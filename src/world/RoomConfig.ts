// 1-bit Chimera Void - Room Configuration
// Defines mental state rooms and their shader/audio parameters
import { PERFORMANCE, SPAWN, WORLD } from '../config/constants';

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

/**
 * Dither pattern modes (F5 "每房间抖动图案") — numeric ids consumed by the
 * DitherShader (uDitherModeFrom / uDitherModeTo). Room transitions crossfade
 * the OUTPUT of two patterns (uDitherModeBlend), never these ids.
 * - BAYER: the classic ordered 4x4 grid (also POLARIZED's nominal mode —
 *   moot, since zero dither never samples a pattern).
 * - BLUE_NOISE: 64x64 best-candidate texture — dense but structureless,
 *   overload without order (INFO_OVERFLOW).
 * - DUAL_CONFLICT: Bayer and blue-noise contest the frame, interleaved by a
 *   slow low-frequency territory field — two systems fighting for the right
 *   to render you (IN_BETWEEN).
 * - MIRROR_BAYER: Bayer whose phase/orientation mirrors across the screen
 *   center — the two sides disagree down to the pattern (FORCED_ALIGNMENT).
 */
export const DITHER_MODE = {
    BAYER: 0,
    BLUE_NOISE: 1,
    DUAL_CONFLICT: 2,
    MIRROR_BAYER: 3,
} as const;

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
    // Per-room post-process character (Phase 5b).
    // uScanIntensity: 0-1. A slow horizontal scan band that biases the dither
    //   threshold — an orderly CRT/surveillance refresh. Nonzero ONLY in
    //   FORCED_ALIGNMENT; MUST stay 0 in POLARIZED so it never perturbs the
    //   uNoiseDensity<0.01 hard-threshold branch.
    uScanIntensity: number;
    // uMisregister: 0-1. Subtle ~1px duotone channel misregistration so the world
    //   reads as "misread by both systems". Nonzero ONLY in IN_BETWEEN.
    uMisregister: number;
    // uFlowerThresholdGain: signed gain of the flower term in the dither
    //   threshold (threshold -= (uFlowerIntensity - 0.5) * gain). Positive =
    //   brighter flower whitens/cleans the frame (default rooms). NEGATIVE in
    //   INFO_OVERFLOW so a brighter flower DIRTIES the frame instead — the
    //   room's "more input != more clarity" lesson (flow-audit break #8).
    uFlowerThresholdGain: number;
    // F5 dither pattern crossfade (ids from DITHER_MODE). The shader renders
    //   mix(pattern(ditherModeFrom), pattern(ditherMode), ditherModeBlend).
    //   Settled rooms carry the identity triple (mode, mode, 1); ONLY
    //   lerpRoomShaderConfig produces partial blends mid-transition — pattern
    //   ids are categorical and are never numerically interpolated.
    ditherMode: number;
    ditherModeFrom: number;
    ditherModeBlend: number;
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
            uScanIntensity: 0.0,
            uMisregister: 0.0,
            // REVERSED: brighter flower lowers clarity here (see interface doc).
            uFlowerThresholdGain: -0.1,
            // Blue-noise grain: overload without structure (F5).
            ditherMode: DITHER_MODE.BLUE_NOISE,
            ditherModeFrom: DITHER_MODE.BLUE_NOISE,
            ditherModeBlend: 1.0,
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
            // Phosphor amber (institutional / surveillance), chroma matched to the
            // cyan/red ends so the room reads clearly amber. paper #F0EED4, ink #221E0A
            inkColor: [0.1333, 0.1176, 0.0392],
            paperColor: [0.9412, 0.9333, 0.8314],
            // Orderly CRT/surveillance refresh band — the signature of this room.
            uScanIntensity: 0.6,
            uMisregister: 0.0,
            uFlowerThresholdGain: 0.1,
            // Mirrored Bayer: even the pattern takes sides across the rift (F5).
            ditherMode: DITHER_MODE.MIRROR_BAYER,
            ditherModeFrom: DITHER_MODE.MIRROR_BAYER,
            ditherModeBlend: 1.0,
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
            // Violet (liminal / misread by both systems), chroma raised to match the
            // other rooms so it no longer reads as flat grey. paper #EADDF3, ink #1C1228
            inkColor: [0.1098, 0.0706, 0.1569],
            paperColor: [0.9176, 0.8667, 0.9529],
            uScanIntensity: 0.0,
            // Subtle duotone misregistration — "misread by both systems".
            uMisregister: 0.5,
            uFlowerThresholdGain: 0.1,
            // Bayer vs blue-noise territory war: two systems contest the frame (F5).
            ditherMode: DITHER_MODE.DUAL_CONFLICT,
            ditherModeFrom: DITHER_MODE.DUAL_CONFLICT,
            ditherModeBlend: 1.0,
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
            // MUST stay 0: scan/misregister are dithering perturbations and POLARIZED
            // is pure binary (uNoiseDensity<0.01 hard-threshold branch).
            uScanIntensity: 0.0,
            uMisregister: 0.0,
            uFlowerThresholdGain: 0.1,
            // Nominal only: the zero-dither hard threshold never samples a
            // pattern, so POLARIZED's purity is untouched by the F5 modes.
            ditherMode: DITHER_MODE.BAYER,
            ditherModeFrom: DITHER_MODE.BAYER,
            ditherModeBlend: 1.0,
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
 * Building refresh interval mapping based on flower intensity. Higher intensity
 * => shorter interval => faster INFO_OVERFLOW building flicker.
 */
export const INFO_OVERFLOW_REFRESH_MAP: Record<number, number> = {
    0.1: 6.0,
    0.3: 5.0,
    0.5: 3.5,
    0.7: 2.5,
    1.0: 1.5,
};

/**
 * Sorted intensity breakpoints of INFO_OVERFLOW_REFRESH_MAP, precomputed once so
 * the per-frame lookup never re-sorts. Module-level (not per-frame allocation).
 */
const REFRESH_BREAKPOINTS = Object.keys(INFO_OVERFLOW_REFRESH_MAP)
    .map(Number)
    .sort((a, b) => a - b);

/** Precomputed sorted breakpoints of INFO_OVERFLOW_NOISE_MAP (same rationale). */
const NOISE_BREAKPOINTS = Object.keys(INFO_OVERFLOW_NOISE_MAP)
    .map(Number)
    .sort((a, b) => a - b);

/**
 * Piecewise-linear interpolation over a breakpoint map. Pure and cheap (no
 * allocation), safe to call per frame. Clamps to the map's end values.
 * `breakpoints` MUST be the sorted numeric keys of `map` (precomputed at module
 * level so the per-frame lookup never re-sorts).
 */
function interpolateIntensityMap(
    map: Record<number, number>,
    breakpoints: number[],
    intensity: number,
): number {
    if (intensity <= breakpoints[0])
        return map[breakpoints[0]];
    const last = breakpoints[breakpoints.length - 1];
    if (intensity >= last)
        return map[last];

    for (let k = 0; k < breakpoints.length - 1; k++) {
        const lo = breakpoints[k];
        const hi = breakpoints[k + 1];
        if (intensity >= lo && intensity <= hi) {
            const t = (intensity - lo) / (hi - lo);
            const a = map[lo];
            const b = map[hi];
            return a + (b - a) * t;
        }
    }
    // Unreachable given the clamps above, but keep a safe fallback.
    return map[last];
}

/**
 * Maps a flower intensity in [0,1] to a flicker refresh interval (seconds) by
 * piecewise-linear interpolation over INFO_OVERFLOW_REFRESH_MAP. Pure and cheap
 * (no allocation), safe to call per frame. Clamps to the map's end values.
 *
 * @param intensity - Flower intensity, expected in [0,1].
 * @returns Refresh interval in seconds.
 */
export function refreshIntervalForIntensity(intensity: number): number {
    return interpolateIntensityMap(INFO_OVERFLOW_REFRESH_MAP, REFRESH_BREAKPOINTS, intensity);
}

/**
 * Maps a flower intensity in [0,1] to the INFO_OVERFLOW dither noise density by
 * piecewise-linear interpolation over INFO_OVERFLOW_NOISE_MAP (flow-audit break
 * #8: the brighter the flower, the denser the overload). Pure, per-frame safe.
 */
export function noiseDensityForIntensity(intensity: number): number {
    return interpolateIntensityMap(INFO_OVERFLOW_NOISE_MAP, NOISE_BREAKPOINTS, intensity);
}

/**
 * INFO_OVERFLOW temporal-jitter response to the flower (flow-audit break #8):
 * uTemporalJitter = base + intensity * flowerGain (0.3 -> 0.9 across the range,
 * finally reaching the documented 0.9 ceiling).
 */
export const INFO_OVERFLOW_JITTER = {
    base: 0.3,
    flowerGain: 0.6,
} as const;

/** Pure mapper for the INFO_OVERFLOW flower-driven temporal jitter. */
export function infoOverflowJitterForIntensity(intensity: number): number {
    const clamped = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
    return INFO_OVERFLOW_JITTER.base + clamped * INFO_OVERFLOW_JITTER.flowerGain;
}

/**
 * FORCED_ALIGNMENT side asymmetry (flow-audit break #7): noise density slides
 * from a tidy LEFT of the rift crack to a broken RIGHT. The blend saturates at
 * halfRange (the CLUSTER footprint half-width — rooms are 2x2-chunk clusters
 * and the rift line is the cluster center, see riftLineXForWorldX), and the
 * crack-center value is the room's baseline 0.55 by construction
 * ((left + right) / 2).
 */
export const FORCED_ALIGNMENT_SIDE_NOISE = {
    /** uNoiseDensity at (and beyond) the far LEFT of the crack — tidy side */
    left: 0.4,
    /** uNoiseDensity at (and beyond) the far RIGHT of the crack — broken side */
    right: 0.7,
    /** Distance (m) from the crack center at which the side blend saturates */
    halfRange: (WORLD.CHUNK_SIZE * WORLD.CLUSTER_CHUNKS) / 2,
    /**
     * Distance (m) inside the cluster footprint edge over which the side
     * noise eases back to the mid baseline ((left + right) / 2). Each FA
     * CLUSTER has its own crack, so without this an FA→FA cluster seam jumps
     * right→left (0.7→0.4) in a single step (flow-audit C1 #3); pulling both
     * sides to the same mid value AT the seam makes the field continuous
     * across neighbors, while a short 5m ramp keeps the tidy-left/broken-right
     * reading intact everywhere else.
     */
    seamBlendRange: 5,
} as const;

/**
 * FORCED_ALIGNMENT noise density for a world x position: signed distance from
 * the rift crack center (= the CLUSTER center, same conversion chain as
 * RiftMechanic / ChunkManager — riftLineXForWorldX is the single source of
 * the crack base point). Within seamBlendRange of the cluster footprint edge
 * the value eases to the mid baseline so adjacent FA clusters meet seamlessly
 * (see seamBlendRange doc). Pure, per-frame safe.
 */
export function faSideNoiseDensity(worldX: number): number {
    const { left, right, halfRange, seamBlendRange } = FORCED_ALIGNMENT_SIDE_NOISE;
    const crackCenterX = riftLineXForWorldX(worldX);
    const offset = worldX - crackCenterX;
    const side = Math.max(-1, Math.min(1, offset / halfRange));
    const t = (side + 1) * 0.5;
    const raw = left + t * (right - left);

    // Seam smoothing: |offset| <= halfRange because the rift line is the
    // cluster center, so the distance to the nearest cluster footprint edge
    // is simply halfRange - |offset|.
    const distToSeam = halfRange - Math.abs(offset);
    if (distToSeam >= seamBlendRange)
        return raw;
    const mid = (left + right) * 0.5;
    const s = Math.max(0, distToSeam) / seamBlendRange;
    return mid + (raw - mid) * s;
}

/**
 * The room's LIVE shader target with its reactive overrides applied (flow-audit
 * breaks #7/#8): INFO_OVERFLOW's flower-driven noise/jitter and
 * FORCED_ALIGNMENT's side-asymmetric noise replace the static baseline. The
 * transition blender (world/RoomTransition) glides toward this target — and at
 * steady state exactly equals it — so reactive deltas ease in/out with the
 * transition instead of popping when the room gate flips.
 *
 * Rooms without reactive parameters return the SHARED static config; callers
 * must treat the result as read-only.
 */
export function reactiveRoomShaderConfig(
    roomType: RoomType,
    flowerIntensity: number,
    playerX: number,
): RoomShaderConfig {
    const base = ROOM_CONFIGS[roomType].shader;
    if (roomType === RoomType.INFO_OVERFLOW) {
        return {
            ...base,
            uNoiseDensity: noiseDensityForIntensity(flowerIntensity),
            uTemporalJitter: infoOverflowJitterForIntensity(flowerIntensity),
        };
    }
    if (roomType === RoomType.FORCED_ALIGNMENT) {
        return { ...base, uNoiseDensity: faSideNoiseDensity(playerX) };
    }
    return base;
}

/**
 * Per-room weather selection weights (flow-audit medium #3: weather must obey
 * the room's identity). Consumed by WeatherSystem.startRandomWeather — only the
 * SELECTION of the next event is weighted; weather already in progress is never
 * cut short. Order matches the rotation [STATIC, RAIN, GLITCH].
 *
 * - INFO_OVERFLOW heavily favors digital RAIN (data overload made literal).
 * - POLARIZED blocks STATIC/RAIN entirely; only GLITCH ("a crack in the
 *   system") may interrupt its pure-binary stillness.
 */
export interface WeatherTypeWeights {
    static: number;
    rain: number;
    glitch: number;
}

/** Equal thirds — identical odds to the historical unweighted rotation. */
export const DEFAULT_WEATHER_WEIGHTS: WeatherTypeWeights = { static: 1, rain: 1, glitch: 1 };

export const ROOM_WEATHER_WEIGHTS: Record<RoomType, WeatherTypeWeights> = {
    [RoomType.INFO_OVERFLOW]: { static: 1, rain: 6, glitch: 1 },
    [RoomType.FORCED_ALIGNMENT]: DEFAULT_WEATHER_WEIGHTS,
    [RoomType.IN_BETWEEN]: DEFAULT_WEATHER_WEIGHTS,
    [RoomType.POLARIZED]: { static: 0, rain: 0, glitch: 1 },
};

/**
 * Per-room scene-fog targets (flow-audit enhancement #12: INFO_OVERFLOW's
 * "noise horizon"). The fog color matches the mid-grey background, and under
 * INFO_OVERFLOW's dense Bayer dither (uNoiseDensity 0.85+) that mid grey
 * renders as a roiling ink/paper noise field — so pulling near/far in to
 * 8/45 makes the far world literally dissolve into noise ~30-45m out,
 * instead of fading into calm distance. Every other room keeps the global
 * PERFORMANCE fog so only the overload room closes in.
 */
export interface RoomFogConfig {
    near: number;
    far: number;
}

/** Default fog — identical to the boot values in PERFORMANCE (SceneSetup). */
export const DEFAULT_ROOM_FOG: RoomFogConfig = {
    near: PERFORMANCE.FOG_NEAR,
    far: PERFORMANCE.FOG_FAR,
};

export const ROOM_FOG: Record<RoomType, RoomFogConfig> = {
    [RoomType.INFO_OVERFLOW]: { near: 8, far: 45 },
    [RoomType.FORCED_ALIGNMENT]: DEFAULT_ROOM_FOG,
    [RoomType.IN_BETWEEN]: DEFAULT_ROOM_FOG,
    [RoomType.POLARIZED]: DEFAULT_ROOM_FOG,
};

/**
 * Exponential approach rate (1/s) of the displayed fog toward the current
 * room's target. ~2.0 gives a 0.5s time constant, matching the feel of the
 * shader-config transition (ROOM_TRANSITION.TRANSITION_SPEED).
 */
export const ROOM_FOG_BLEND_RATE = 2.0;

/**
 * Ease the displayed fog `current` toward `target` (mutates in place; THREE.Fog
 * satisfies the shape structurally). Frame-rate independent: the exponential
 * step 1 - exp(-rate * delta) composes exactly across arbitrary delta splits.
 * Pure logic; exported for testing.
 */
export function stepFogToward(
    current: RoomFogConfig,
    target: RoomFogConfig,
    delta: number,
    rate: number = ROOM_FOG_BLEND_RATE,
): void {
    const k = 1 - Math.exp(-rate * delta);
    current.near += (target.near - current.near) * k;
    current.far += (target.far - current.far) * k;
}

/**
 * F3 silhouette-figure density per room (world/FigureSystem): the
 * probability a chunk HOSTS any figure at all, and the conditional
 * probability a hosting chunk carries a second one (hard cap 2 per chunk).
 * Expected figures per chunk = host * (1 + second); with RENDER_DISTANCE=2
 * (a 5x5 chunk window) even the densest room stays around ~16 expected
 * on-screen figures (target <= 20) — a far-off presence, never a crowd.
 */
export interface RoomFigureDensity {
    /** Probability a chunk hosts at least one figure. */
    host: number;
    /** Probability a hosting chunk hosts a second figure (cap 2). */
    second: number;
}

export const ROOM_FIGURE_DENSITY: Record<RoomType, RoomFigureDensity> = {
    [RoomType.INFO_OVERFLOW]: { host: 0.5, second: 0.3 }, // densest: the overloaded crowd
    [RoomType.FORCED_ALIGNMENT]: { host: 0.45, second: 0.3 }, // ranks along the rift
    [RoomType.IN_BETWEEN]: { host: 0.35, second: 0.25 }, // medium: the liminal few
    [RoomType.POLARIZED]: { host: 0.15, second: 0.1 }, // sparse: most were driven out
};

/**
 * FORCED_ALIGNMENT figure placement (F3): figures keep a clearance from the
 * rift line and stand FACING it. The rift line is the cluster center x
 * (riftLineXForWorldX), i.e. the seam between a cluster's chunk columns, so
 * any single chunk's figures are all on one side of the crack: left-column
 * chunks (crack at local +x) form tidy ranks — one shared distance from the
 * crack, z snapped to a grid, exact facing — while right-column chunks
 * (crack at local -x) scatter with untidy facing. Tidy left / broken right
 * matches the room's side-asymmetric noise (FORCED_ALIGNMENT_SIDE_NOISE).
 */
export const FA_FIGURE_PLACEMENT = {
    /** Min |x| distance (m) from the rift line — nobody stands on the crack. */
    CRACK_CLEARANCE: 15,
    /** Tidy-side rank distance (m) from the crack; must be >= CRACK_CLEARANCE. */
    ROW_DISTANCE: 19,
    /** Tidy-side rank grid spacing (m) along z. */
    ROW_SNAP: 8,
    /** Broken-side scatter depth (m) beyond the clearance. */
    SCATTER_DEPTH: 20,
    /** Broken-side facing jitter (rad) off the exact crack-facing. */
    SCATTER_FACING_JITTER: 0.35,
} as const;

/**
 * IN_BETWEEN boundary-artifact densification (flow-audit enhancement #14):
 * the z-fight ghost clones must gather where the ROOM meets its neighbors, so
 * the "misread by both systems" shimmer foreshadows the boundary itself.
 * Rooms are 2x2-chunk clusters, so distances are measured from a building's
 * position to the CLUSTER footprint edge — the inner chunk seams of a cluster
 * are not boundaries and stay calm. Building positions are bounded to ±30 of
 * an 80m chunk, so in the cluster's outer band the closest possible approach
 * to the cluster edge is 10m — INNER must stay above that for the band to
 * actually saturate.
 */
export const IN_BETWEEN_EDGE_GHOSTS = {
    /** Edge distance (m) at or under which densification saturates (factor 1). */
    INNER_DISTANCE: 12,
    /** Edge distance (m) at or past which there is no densification (factor 0). */
    OUTER_DISTANCE: 24,
    /** Extra ghost clones per building at full edge factor (interior keeps 1-2). */
    EXTRA_GHOSTS: 2,
    /** Ghost offset amplitude multiplier at full edge factor (interior = 1). */
    OFFSET_MULT: 4,
} as const;

/**
 * Edge-proximity factor in [0,1] for a building at chunk-local (localX,
 * localZ) inside chunk (cx, cz): 0 deep in the CLUSTER interior, ramping to 1
 * within INNER_DISTANCE of the cluster footprint edge (Chebyshev metric,
 * matching the square cluster). The chunk coords locate the chunk within its
 * 2x2 cluster so the building's cluster-local position can be derived. Pure,
 * per-chunk-build safe; exported for testing.
 */
export function inBetweenEdgeFactor(
    localX: number,
    localZ: number,
    cx: number,
    cz: number,
    chunkSize: number = WORLD.CHUNK_SIZE,
): number {
    const { INNER_DISTANCE, OUTER_DISTANCE } = IN_BETWEEN_EDGE_GHOSTS;
    // Cluster-local position: world position minus the cluster center.
    const clusterLocalX = cx * chunkSize + localX - clusterCenterWorld(chunkToCluster(cx), chunkSize);
    const clusterLocalZ = cz * chunkSize + localZ - clusterCenterWorld(chunkToCluster(cz), chunkSize);
    const halfCluster = (chunkSize * WORLD.CLUSTER_CHUNKS) / 2;
    const distToEdge = halfCluster - Math.max(Math.abs(clusterLocalX), Math.abs(clusterLocalZ));
    const t = (OUTER_DISTANCE - distToEdge) / (OUTER_DISTANCE - INNER_DISTANCE);
    return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Copy a shader config: fresh object plus fresh color tuples (the only nested
 * values), so a frozen transition snapshot can never alias a live or shared
 * config (e.g. the ROOM_CONFIGS baselines reactiveRoomShaderConfig may return).
 */
export function cloneRoomShaderConfig(config: RoomShaderConfig): RoomShaderConfig {
    return {
        ...config,
        inkColor: [...config.inkColor],
        paperColor: [...config.paperColor],
    };
}

/**
 * The visually dominant pattern of a (possibly mid-blend) config: the side
 * holding at least half the crossfade. Used when a mid-blend snapshot is
 * frozen into a NEW transition's from-side — a three-way pattern blend can't
 * be represented by the (from, to, blend) triple, so the snapshot's minority
 * pattern is dropped (a sub-half texture mix; the numeric dither scalars
 * still freeze exactly, so room crossings stay tonally continuous). Pure.
 */
export function dominantDitherMode(config: RoomShaderConfig): number {
    return config.ditherModeBlend >= 0.5 ? config.ditherMode : config.ditherModeFrom;
}

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
    // Dither pattern ids are categorical — the shader crossfades the two
    // patterns' OUTPUTS (uDitherModeBlend), never the ids. At the clamped
    // endpoints pass that endpoint's own triple through (exact identity,
    // including a frozen snapshot's partial mix); mid-blend, crossfade from
    // each side's dominant pattern with the lerp factor itself.
    const ditherMode = tc <= 0
        ? from.ditherMode
        : tc >= 1 ? to.ditherMode : dominantDitherMode(to);
    const ditherModeFrom = tc <= 0
        ? from.ditherModeFrom
        : tc >= 1 ? to.ditherModeFrom : dominantDitherMode(from);
    const ditherModeBlend = tc <= 0
        ? from.ditherModeBlend
        : tc >= 1 ? to.ditherModeBlend : tc;
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
        uScanIntensity: lerp(from.uScanIntensity, to.uScanIntensity),
        uMisregister: lerp(from.uMisregister, to.uMisregister),
        uFlowerThresholdGain: lerp(from.uFlowerThresholdGain, to.uFlowerThresholdGain),
        ditherMode,
        ditherModeFrom,
        ditherModeBlend,
    };
}

/**
 * World coordinate -> chunk coordinate, matching the floor geometry convention:
 * chunk k's floor mesh is CENTERED on k*chunkSize (ChunkManager.createChunk),
 * so its visible footprint is [k*size - size/2, k*size + size/2). Math.round
 * maps a world coordinate to the chunk whose floor is actually under it;
 * Math.floor would be offset by half a chunk from the visible seams.
 * JS rounds .5 toward +Infinity for negative inputs too, so the footprint is
 * half-open ([k*size - size/2, k*size + size/2)) for every k.
 */
export function worldToChunkCoord(worldCoord: number, chunkSize: number = WORLD.CHUNK_SIZE): number {
    return Math.round(worldCoord / chunkSize);
}

/**
 * Chunk coordinate -> room-cluster coordinate, the SINGLE source of cluster
 * conversion (the cluster analogue of worldToChunkCoord). Rooms are assigned
 * per WORLD.CLUSTER_CHUNKS x WORLD.CLUSTER_CHUNKS chunk cluster, so a room is
 * a 160m place rather than an 80m island. Math.floor groups chunk coords into
 * contiguous runs of CLUSTER_CHUNKS for negative coordinates too: chunks
 * {2k, 2k+1} -> cluster k for every integer k (e.g. {-2, -1} -> -1).
 */
export function chunkToCluster(chunkCoord: number): number {
    return Math.floor(chunkCoord / WORLD.CLUSTER_CHUNKS);
}

/**
 * World coordinate (on one axis) of a cluster's CENTER. Cluster k spans the
 * chunk footprints of chunks [k*CLUSTER_CHUNKS, (k+1)*CLUSTER_CHUNKS), i.e.
 * [k*CLUSTER - CHUNK/2, (k+1)*CLUSTER - CHUNK/2) in world units, so its center
 * sits on the SEAM between the cluster's two chunk columns/rows. On the x
 * axis this is the FORCED_ALIGNMENT rift line (one crack per cluster).
 */
export function clusterCenterWorld(clusterCoord: number, chunkSize: number = WORLD.CHUNK_SIZE): number {
    return (clusterCoord * WORLD.CLUSTER_CHUNKS + (WORLD.CLUSTER_CHUNKS - 1) / 2) * chunkSize;
}

/**
 * X coordinate of the FORCED_ALIGNMENT rift line of the cluster containing
 * worldX: the cluster center (see clusterCenterWorld). The 4 chunks of an FA
 * cluster share this single crack line — the "one giant vertical rift" of the
 * design — instead of one crack per chunk. Single source for the crack base
 * point (faSideNoiseDensity, RiftMechanic, ChunkManager floor generation).
 */
export function riftLineXForWorldX(worldX: number, chunkSize: number = WORLD.CHUNK_SIZE): number {
    return clusterCenterWorld(chunkToCluster(worldToChunkCoord(worldX, chunkSize)), chunkSize);
}

/**
 * FORCED_ALIGNMENT rift presence (design doc: the rift is the room's spine —
 * "一条巨大的垂直裂口将空间分为左右两半", "到达前 20 米可见"). The crack used
 * to be a purely ground-level feature (a 4-5m black gap + fog capped near the
 * floor), invisible past ~30m in the amber haze. Three vertical layers plus a
 * shore corridor make it legible from anywhere in the room:
 *
 * - FOG: the abyss-fog column rises far above the floor; a sparse minority of
 *   particles "leak" past the dense band (越界泄漏) — taller without denser.
 * - TEAR: a translucent pure-black plane standing in the crack — from afar a
 *   dark vertical rip crossing the room, not a wall.
 * - BANNER: taut, trembling cables strung across the crack on fixed-height
 *   virtual anchors ("像意识形态横幅一样跨越裂口").
 * - CLEARANCE: buildings keep off both banks so sightlines along and across
 *   the rift stay open.
 *
 * All heights are WORLD-frame metres (y=0 = floor level) unless noted.
 * Consumed by FloorTile (fog + tear), ChunkAnimator (fog recycle) and
 * ChunkManager (corridor + banners).
 */
export const FA_RIFT = {
    /** Shore-corridor half-width (m): no buildings within this |x| of the rift line. */
    CLEARANCE: 12,
    /** Abyss-fog column (FloorTile.createAbyssFog / ChunkAnimator recycle). */
    FOG: {
        /** Chunk-local y the fog InstancedMesh sits at (historical -5). */
        MESH_Y: -5,
        /** Column floor (m, world) — recycled particles restart here. */
        BOTTOM: -165,
        /** Top of the DENSE band (m, world): most particles recycle here. */
        DENSE_TOP: 2,
        /** Top of the sparse leak band (m, world) — the visible fog column. */
        LEAK_TOP: 14,
        /** Fraction of particles that leak above DENSE_TOP (稍稀). */
        LEAK_FRACTION: 0.3,
        /** Uniform scale multiplier on leaking particles (稍大). */
        LEAK_SCALE: 1.6,
    },
    /** "Void tear": translucent black plane standing in the crack. */
    TEAR: {
        /** Top of the tear (m, world) above the floor. */
        HEIGHT: 10,
        /** Base y (m, world) — slightly below the floor, rising out of the crack. */
        BASE_Y: -1,
        /** Plane opacity — a dark rip in space, never an occluding wall. */
        OPACITY: 0.4,
        /** Multiplier on crackJagOffset (≈0-1.2m) for the ragged top edge. */
        JAG_SCALE: 2.5,
    },
    /** Taut "ideological banner" cables strung across the rift (ChunkManager). */
    BANNER: {
        /** Anchor height band (m, world): BASE + hash * VAR. */
        HEIGHT_BASE: 6,
        HEIGHT_VAR: 3,
        /**
         * Cable droop option. The effective sag is droop - span * 0.1
         * (CableSystem); with span = 2 * CLEARANCE this leaves ~0.2m (紧绷).
         */
        DROOP: 2.6,
        /** Mid-point tremble: amplitude (m) and angular speed (rad/s) (颤抖). */
        TREMBLE_AMPLITUDE: 0.08,
        TREMBLE_SPEED: 8,
    },
} as const;

/**
 * True when a world x lies inside the FORCED_ALIGNMENT shore corridor —
 * strictly within FA_RIFT.CLEARANCE of its cluster's rift line. ChunkManager
 * skips building placement here so both banks of the rift stay open. Pure;
 * riftLineXForWorldX stays the single source of the crack base point.
 */
export function isWithinRiftClearance(worldX: number, chunkSize: number = WORLD.CHUNK_SIZE): boolean {
    return Math.abs(worldX - riftLineXForWorldX(worldX, chunkSize)) < FA_RIFT.CLEARANCE;
}

/**
 * Get room type at a world position, attributed via the same footprint
 * convention as the visible floor geometry (see worldToChunkCoord).
 */
export function getRoomTypeAtWorldPosition(x: number, z: number, chunkSize: number = WORLD.CHUNK_SIZE): RoomType {
    return getRoomTypeFromPosition(
        worldToChunkCoord(x, chunkSize),
        worldToChunkCoord(z, chunkSize),
    );
}

/**
 * F1 "the world reads you" — behavior → room-weight bias.
 *
 * A lightweight normalized profile of the CURRENT run (produced by
 * stats/RunStatsCollector.getLiveProfile, null until ~30s of play) gently
 * re-weights which room a NEWLY generated cluster becomes (world/RoomLedger).
 * The bias is deliberately mild — a single room can at most double its odds
 * weight — so the world reads as a quiet mirror, never a theme switch.
 * Already-pinned clusters are never touched.
 */
export interface BehaviorProfile {
    /** Mean flower intensity 0-1 (low = suppressing the light, high = expressing). */
    avgFlower: number;
    /** Fraction of play time spent gazing at the sky eye, 0-1. */
    gazeRatio: number;
    /** Normalized override (resistance) activity, 0-1. */
    overrideActivity: number;
    /** Normalized affinity for the FORCED_ALIGNMENT crack line, 0-1. */
    crackAffinity: number;
}

/** Per-room selection weights (relative odds; neutral = all 1). */
export type RoomWeights = Record<RoomType, number>;

/**
 * Selection order of the weighted room pick. MUST stay in this historical
 * hash-bucket order (INFO < FA < IN_BETWEEN < POLARIZED): with neutral
 * weights the cumulative thresholds land exactly on 0.25/0.5/0.75, making
 * pickRoomFromWeights bit-identical to the pre-ledger quartile mapping.
 */
export const ROOM_PICK_ORDER: readonly RoomType[] = [
    RoomType.INFO_OVERFLOW,
    RoomType.FORCED_ALIGNMENT,
    RoomType.IN_BETWEEN,
    RoomType.POLARIZED,
];

/** Neutral weights — the unbiased quartile distribution. Treat as read-only. */
export const NEUTRAL_ROOM_WEIGHTS: RoomWeights = {
    [RoomType.INFO_OVERFLOW]: 1,
    [RoomType.FORCED_ALIGNMENT]: 1,
    [RoomType.IN_BETWEEN]: 1,
    [RoomType.POLARIZED]: 1,
};

/**
 * The behavior → room bias table (all F1 knobs live here):
 * each profile reading maps to a drive in [0,1] that lifts ONE room's weight
 * to at most 1 + drive * GAIN (capped by MAX_MULT). Raising a GAIN sharpens
 * one mirror axis; raising MAX_MULT makes the whole world more suggestible.
 */
export const BEHAVIOR_ROOM_BIAS = {
    /** Hard cap on any single room's weight (neutral = 1). Gentle: at most x2. */
    MAX_MULT: 2.0,
    /**
     * avgFlower pivot ± deadzone: below (pivot - deadzone) the player reads
     * as suppressing the light (POLARIZED drive ramps toward 1 at avgFlower
     * 0); above (pivot + deadzone) as expressing it (INFO_OVERFLOW drive
     * ramps toward 1 at avgFlower 1). Inside the deadzone — including the
     * 0.5 default the flower boots with — the flower exerts no bias at all.
     */
    FLOWER_PIVOT: 0.5,
    FLOWER_DEADZONE: 0.1,
    /** gazeRatio at which the FORCED_ALIGNMENT drive saturates to 1. */
    GAZE_SATURATION: 0.4,
    /** Per-room weight gain per unit drive: weight = 1 + drive * gain. */
    GAIN: {
        [RoomType.INFO_OVERFLOW]: 1.0, // expression: more signal, more noise
        [RoomType.FORCED_ALIGNMENT]: 1.0, // entanglement with the authority
        [RoomType.IN_BETWEEN]: 1.0, // probing the boundaries
        [RoomType.POLARIZED]: 1.0, // suppression: the world slides binary
    } as Record<RoomType, number>,
} as const;

/**
 * Map a live behavior profile to per-room selection weights (the F1 mirror):
 *
 * - LOW avgFlower (suppressing the light) → POLARIZED rises: the world
 *   slides toward pure binary.
 * - HIGH avgFlower (expressing) → INFO_OVERFLOW rises: more signal, more noise.
 * - override or crack activity (probing the boundaries) → IN_BETWEEN rises.
 * - HIGH gazeRatio (entangled with the authority) → FORCED_ALIGNMENT rises.
 *
 * profile = null (not yet formed) returns the neutral weights, so early-run
 * generation is exactly the unbiased distribution. Every weight stays within
 * [1, MAX_MULT] — the bias is a lean, never a takeover. Pure.
 */
export function biasedRoomWeights(profile: BehaviorProfile | null): RoomWeights {
    if (profile === null)
        return { ...NEUTRAL_ROOM_WEIGHTS };

    const { MAX_MULT, FLOWER_PIVOT, FLOWER_DEADZONE, GAZE_SATURATION, GAIN } = BEHAVIOR_ROOM_BIAS;
    const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

    // Drives in [0,1], one per behavioral reading.
    const lowEnd = FLOWER_PIVOT - FLOWER_DEADZONE;
    const highStart = FLOWER_PIVOT + FLOWER_DEADZONE;
    const suppression = clamp01((lowEnd - profile.avgFlower) / lowEnd);
    const expression = clamp01((profile.avgFlower - highStart) / (1 - highStart));
    const boundary = clamp01(Math.max(profile.overrideActivity, profile.crackAffinity));
    const entanglement = clamp01(profile.gazeRatio / GAZE_SATURATION);

    const weight = (drive: number, gain: number): number => Math.min(MAX_MULT, 1 + drive * gain);
    return {
        [RoomType.INFO_OVERFLOW]: weight(expression, GAIN[RoomType.INFO_OVERFLOW]),
        [RoomType.FORCED_ALIGNMENT]: weight(entanglement, GAIN[RoomType.FORCED_ALIGNMENT]),
        [RoomType.IN_BETWEEN]: weight(boundary, GAIN[RoomType.IN_BETWEEN]),
        [RoomType.POLARIZED]: weight(suppression, GAIN[RoomType.POLARIZED]),
    };
}

/**
 * The per-cluster deterministic random draw in [0,1) used for room
 * assignment — the historical getRoomTypeForCluster hash, extracted so the
 * session ledger's weighted pick consumes the SAME random source (neutral
 * weights therefore reproduce the unbiased mapping exactly). Pure.
 */
export function clusterRoomRandom(clusterX: number, clusterZ: number): number {
    return Math.abs(Math.sin(clusterX * 12.9898 + clusterZ * 78.233) * 43758.5453) % 1;
}

/**
 * Weighted room pick: r in [0,1) against the cumulative distribution of
 * `weights` over ROOM_PICK_ORDER. With NEUTRAL_ROOM_WEIGHTS the cumulative
 * thresholds are exactly 0.25/0.5/0.75 (1/4, 2/4, 3/4 are exact in IEEE754
 * floats), so this is bit-identical to the historical quartile mapping. Pure.
 */
export function pickRoomFromWeights(r: number, weights: RoomWeights): RoomType {
    let total = 0;
    for (const room of ROOM_PICK_ORDER)
        total += weights[room];
    let acc = 0;
    for (const room of ROOM_PICK_ORDER) {
        acc += weights[room];
        if (r < acc / total)
            return room;
    }
    return ROOM_PICK_ORDER[ROOM_PICK_ORDER.length - 1];
}

/**
 * Get room type from cluster position (procedural assignment). The hash is
 * drawn per CLUSTER, so every chunk of a 2x2 cluster shares one room.
 * This is the NEUTRAL (profile-free) path — tests and the spawn scan use it
 * directly; the session ledger (world/RoomLedger) layers the F1 behavior
 * bias over the same hash draw for newly generated clusters.
 */
export function getRoomTypeForCluster(clusterX: number, clusterZ: number): RoomType {
    return pickRoomFromWeights(clusterRoomRandom(clusterX, clusterZ), NEUTRAL_ROOM_WEIGHTS);
}

/**
 * Get room type from chunk position: chunks inherit the room of their 2x2
 * cluster (see chunkToCluster / getRoomTypeForCluster).
 */
export function getRoomTypeFromPosition(cx: number, cz: number): RoomType {
    return getRoomTypeForCluster(chunkToCluster(cx), chunkToCluster(cz));
}

/**
 * Rooms quiet enough to open a run in (flow-audit medium #7): the first
 * minute should be a quiet awakening, not INFO_OVERFLOW's data chatter or
 * FORCED_ALIGNMENT's rift. Lives here (not config/) with the other per-room
 * knobs, avoiding a config -> world import cycle.
 */
export const QUIET_SPAWN_ROOMS: ReadonlySet<RoomType> = new Set([
    RoomType.IN_BETWEEN,
    RoomType.POLARIZED,
]);

/**
 * Find the cluster nearest the origin (Euclidean on cluster coords, ties
 * broken by deterministic scan order) whose room is quiet enough to spawn in.
 * Rooms are per-cluster, so scanning the cluster grid is the natural unit
 * (and 4x cheaper than the old chunk scan). Scans the square
 * [-maxRadiusClusters, maxRadiusClusters]² via the same room attribution as
 * everything else (getRoomTypeForCluster); the radius cap guards against
 * pathological seeds, with the origin cluster as the fallback. Pure and
 * deterministic.
 */
export function findQuietSpawnCluster(
    maxRadiusClusters: number = SPAWN.SCAN_RADIUS_CLUSTERS,
): { clusterX: number; clusterZ: number } {
    let best: { clusterX: number; clusterZ: number } | null = null;
    let bestDistSq = Infinity;
    for (let clusterZ = -maxRadiusClusters; clusterZ <= maxRadiusClusters; clusterZ++) {
        for (let clusterX = -maxRadiusClusters; clusterX <= maxRadiusClusters; clusterX++) {
            if (!QUIET_SPAWN_ROOMS.has(getRoomTypeForCluster(clusterX, clusterZ)))
                continue;
            const distSq = clusterX * clusterX + clusterZ * clusterZ;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                best = { clusterX, clusterZ };
            }
        }
    }
    return best ?? { clusterX: 0, clusterZ: 0 };
}

/**
 * The "center chunk" of the nearest quiet cluster: the chunk whose floor
 * footprint contains the cluster's center point under the round convention
 * (worldToChunkCoord of clusterCenterWorld), so the spawn opens in the heart
 * of the quiet PLACE rather than at its rim. Pure and deterministic.
 */
export function findQuietSpawnChunk(
    maxRadiusClusters: number = SPAWN.SCAN_RADIUS_CLUSTERS,
): { cx: number; cz: number } {
    const { clusterX, clusterZ } = findQuietSpawnCluster(maxRadiusClusters);
    return {
        cx: worldToChunkCoord(clusterCenterWorld(clusterX)),
        cz: worldToChunkCoord(clusterCenterWorld(clusterZ)),
    };
}

/**
 * World-space spawn point inside the nearest quiet cluster (flow-audit medium
 * #7): its center chunk's center (the floor is CENTERED on cx*CHUNK_SIZE —
 * see worldToChunkCoord) plus the historical (8, 8) safe-spawn clearance,
 * which stays well inside the cluster footprint so the offset point keeps
 * the same room.
 */
export function findQuietSpawnPosition(
    maxRadiusClusters: number = SPAWN.SCAN_RADIUS_CLUSTERS,
): { x: number; z: number } {
    const { cx, cz } = findQuietSpawnChunk(maxRadiusClusters);
    return {
        x: cx * WORLD.CHUNK_SIZE + SPAWN.SPAWN_OFFSET,
        z: cz * WORLD.CHUNK_SIZE + SPAWN.SPAWN_OFFSET,
    };
}
