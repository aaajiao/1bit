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
 * halfRange (the chunk footprint half-width), and the crack-center value is the
 * room's baseline 0.55 by construction ((left + right) / 2).
 */
export const FORCED_ALIGNMENT_SIDE_NOISE = {
    /** uNoiseDensity at (and beyond) the far LEFT of the crack — tidy side */
    left: 0.4,
    /** uNoiseDensity at (and beyond) the far RIGHT of the crack — broken side */
    right: 0.7,
    /** Distance (m) from the crack center at which the side blend saturates */
    halfRange: WORLD.CHUNK_SIZE / 2,
    /**
     * Distance (m) inside the chunk footprint edge over which the side noise
     * eases back to the mid baseline ((left + right) / 2). Each FA chunk has
     * its own crack, so without this an FA→FA seam jumps right→left (0.7→0.4)
     * in a single step (flow-audit C1 #3); pulling both sides to the same mid
     * value AT the seam makes the field continuous across neighbors, while a
     * short 5m ramp keeps the tidy-left/broken-right reading intact everywhere
     * else.
     */
    seamBlendRange: 5,
} as const;

/**
 * FORCED_ALIGNMENT noise density for a world x position: signed distance from
 * the rift crack center (= the chunk center, same round convention as
 * worldToChunkCoord / RiftMechanic — the single chunk-coord source of truth).
 * Within seamBlendRange of the footprint edge the value eases to the mid
 * baseline so adjacent FA chunks meet seamlessly (see seamBlendRange doc).
 * Pure, per-frame safe.
 */
export function faSideNoiseDensity(worldX: number): number {
    const { left, right, halfRange, seamBlendRange } = FORCED_ALIGNMENT_SIDE_NOISE;
    const crackCenterX = worldToChunkCoord(worldX) * WORLD.CHUNK_SIZE;
    const offset = worldX - crackCenterX;
    const side = Math.max(-1, Math.min(1, offset / halfRange));
    const t = (side + 1) * 0.5;
    const raw = left + t * (right - left);

    // Seam smoothing: |offset| <= halfRange by the round convention, so the
    // distance to the nearest footprint edge is simply halfRange - |offset|.
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
 * IN_BETWEEN boundary-artifact densification (flow-audit enhancement #14):
 * the z-fight ghost clones must cluster where the chunk meets its neighbors,
 * so the "misread by both systems" shimmer foreshadows the boundary itself.
 * Distances are measured from a building's chunk-local position to the chunk
 * footprint edge (CHUNK_SIZE/2). Building positions are bounded to ±30 of an
 * 80m chunk, so the closest possible approach to the edge is 10m — INNER must
 * stay above that for the band to actually saturate.
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
 * localZ): 0 deep in the chunk interior, ramping to 1 within
 * INNER_DISTANCE of the footprint edge (Chebyshev metric, matching the
 * square chunk). Pure, per-chunk-build safe; exported for testing.
 */
export function inBetweenEdgeFactor(
    localX: number,
    localZ: number,
    chunkSize: number = WORLD.CHUNK_SIZE,
): number {
    const { INNER_DISTANCE, OUTER_DISTANCE } = IN_BETWEEN_EDGE_GHOSTS;
    const distToEdge = chunkSize / 2 - Math.max(Math.abs(localX), Math.abs(localZ));
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
        uScanIntensity: lerp(from.uScanIntensity, to.uScanIntensity),
        uMisregister: lerp(from.uMisregister, to.uMisregister),
        uFlowerThresholdGain: lerp(from.uFlowerThresholdGain, to.uFlowerThresholdGain),
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
 * Find the chunk nearest the origin (Euclidean on chunk coords, ties broken
 * by deterministic scan order) whose room is quiet enough to spawn in.
 * Scans the square [-maxRadiusChunks, maxRadiusChunks]² via the same room
 * attribution as everything else (getRoomTypeFromPosition); the radius cap
 * guards against pathological seeds, with the origin chunk as the fallback.
 * Pure and deterministic.
 */
export function findQuietSpawnChunk(
    maxRadiusChunks: number = SPAWN.SCAN_RADIUS_CHUNKS,
): { cx: number; cz: number } {
    let best: { cx: number; cz: number } | null = null;
    let bestDistSq = Infinity;
    for (let cz = -maxRadiusChunks; cz <= maxRadiusChunks; cz++) {
        for (let cx = -maxRadiusChunks; cx <= maxRadiusChunks; cx++) {
            if (!QUIET_SPAWN_ROOMS.has(getRoomTypeFromPosition(cx, cz)))
                continue;
            const distSq = cx * cx + cz * cz;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                best = { cx, cz };
            }
        }
    }
    return best ?? { cx: 0, cz: 0 };
}

/**
 * World-space spawn point inside the nearest quiet chunk (flow-audit medium
 * #7): the chunk center (the floor is CENTERED on cx*CHUNK_SIZE — see
 * worldToChunkCoord) plus the historical (8, 8) safe-spawn clearance, which
 * stays well inside the footprint so the offset point keeps the same room.
 */
export function findQuietSpawnPosition(
    maxRadiusChunks: number = SPAWN.SCAN_RADIUS_CHUNKS,
): { x: number; z: number } {
    const { cx, cz } = findQuietSpawnChunk(maxRadiusChunks);
    return {
        x: cx * WORLD.CHUNK_SIZE + SPAWN.SPAWN_OFFSET,
        z: cz * WORLD.CHUNK_SIZE + SPAWN.SPAWN_OFFSET,
    };
}
