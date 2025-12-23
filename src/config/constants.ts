// Constants Configuration
// Centralized constants for gameplay, rendering, and performance tuning

/**
 * Gameplay constants
 */
export const GAMEPLAY = {
    /** Probability of playing info chirp sound per frame in INFO_OVERFLOW room */
    INFO_CHIRP_PROBABILITY: 0.02,
    /** Hint condition: gaze time threshold in seconds */
    HINT_GAZE_TIME_THRESHOLD: 5.0,
    /** Hint condition: flower forced down count */
    HINT_FORCED_DOWN_COUNT: 2,
} as const;

/**
 * Cable proximity detection constants
 */
export const CABLE_PROXIMITY = {
    /** Distance to start cable hum audio (meters) */
    HUM_START_DISTANCE: 8.0,
    /** Distance to stop cable hum audio (meters) */
    HUM_STOP_DISTANCE: 12.0,
    /** Maximum distance for any cable audio effect */
    MAX_AUDIO_DISTANCE: 12.0,
    /** Distance for cable pulse effect */
    PULSE_DISTANCE: 2.5,
    /** Probability of cable pulse per frame */
    PULSE_PROBABILITY: 0.01,
    /** Squared distance for early-exit optimization (50m) */
    SKIP_DISTANCE_SQ: 2500,
    /** Frames between cable proximity checks (for performance) */
    CHECK_INTERVAL: 3,
} as const;

/**
 * Chunk and world generation constants
 */
export const WORLD = {
    /** Size of each chunk in world units */
    CHUNK_SIZE: 80,
    /** Number of chunks to render in each direction */
    RENDER_DISTANCE: 2,
    /** Animation LOD distances */
    ANIMATION_FULL_DISTANCE: 40,
    ANIMATION_LOD_DISTANCE: 80,
} as const;

/**
 * Gaze mechanic constants
 */
export const GAZE = {
    /** Pitch angle threshold to trigger gaze (radians, ~45°) */
    PITCH_THRESHOLD: Math.PI / 4,
    /** Maximum pitch angle (radians, 90°) */
    MAX_PITCH: Math.PI / 2,
    /** Intensity curve exponent */
    INTENSITY_CURVE: 2.0,
    /** Minimum flower intensity when gazing */
    FLOWER_MIN_INTENSITY: 0.1,
    /** Flower intensity range when gazing */
    FLOWER_INTENSITY_RANGE: 0.4,
} as const;

/**
 * Override mechanic constants
 */
export const OVERRIDE = {
    /** Hold duration to trigger override (seconds) */
    HOLD_THRESHOLD: 1.0,
    /** Duration of override effect (seconds) */
    EFFECT_DURATION: 0.5,
    /** Cooldown before can trigger again (seconds) */
    COOLDOWN: 3.0,
    /** Color inversion effect timings */
    FLASH_ON_DURATION: 0.1,
    FLASH_HOLD_END: 0.3,
    FLASH_OFF_END: 0.5,
} as const;

/**
 * Room transition constants
 */
export const ROOM_TRANSITION = {
    /** Speed of shader config interpolation */
    TRANSITION_SPEED: 2.0,
} as const;

/**
 * Performance tuning constants
 */
export const PERFORMANCE = {
    /** Default render scale (0.5 = half resolution) */
    DEFAULT_RENDER_SCALE: 0.5,
    /** Fog near distance */
    FOG_NEAR: 20,
    /** Fog far distance */
    FOG_FAR: 110,
} as const;
