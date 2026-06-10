// Constants Configuration
// Centralized constants for gameplay, rendering, and performance tuning

/**
 * Gameplay constants
 */
export const GAMEPLAY = {
    /** Probability of playing info chirp sound per frame in INFO_OVERFLOW room */
    INFO_CHIRP_PROBABILITY: 0.02,
    /**
     * Flower-driven chirp-probability multiplier (flow-audit break #8): the
     * effective chirp rate is scaled by FLOOR + flowerIntensity * GAIN, so a
     * dim flower halves the chatter and a blazing one doubles it.
     */
    INFO_CHIRP_FLOWER_PROB_FLOOR: 0.5,
    INFO_CHIRP_FLOWER_PROB_GAIN: 1.5,
    /** Hint condition: gaze time threshold in seconds */
    HINT_GAZE_TIME_THRESHOLD: 5.0,
    /** Hint condition: flower forced down count */
    HINT_FORCED_DOWN_COUNT: 2,
    /** Minimum play time (seconds) before a sunset produces a snapshot */
    MIN_RUN_DURATION_FOR_SNAPSHOT: 30.0,
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
    PULSE_DISTANCE: 5.0,
    /** Probability of cable pulse per check (2.5%) */
    PULSE_PROBABILITY: 0.025,
    /** Cooldown between pulse sounds (seconds) */
    PULSE_COOLDOWN: 2.5,
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
    /** Minimum flower intensity when gazing (full gaze, looking straight up) */
    FLOWER_MIN_INTENSITY: 0.1,
    /**
     * Forced flower intensity at the moment of threshold crossing (gaze
     * intensity 0). Kept below the default flower intensity (0.5) so a
     * default-intensity player sees the flower visibly dim the instant they
     * cross the 45° threshold (flow-audit medium #1).
     */
    FLOWER_FORCED_START: 0.35,
    /**
     * Delay (seconds) after gaze ends before the flower starts recovering,
     * so the player can look back down and see the extinguished flower
     * (flow-audit enhancement #3).
     */
    FLOWER_RECOVERY_DELAY: 2.5,
} as const;

/**
 * Gaze visual feedback constants (screen-space, DitherShader)
 * Flow-audit break #1 ("注视=对比度变化") + enhancement #2 (45° line / vignette).
 */
export const GAZE_VISUAL = {
    /** Additive uContrast gain per unit of gaze intensity */
    CONTRAST_GAIN: 0.8,
    /** Upper clamp for gaze-boosted uContrast (POLARIZED base is already 2.0) */
    CONTRAST_MAX: 2.5,
    /** Peak ink mix of the gaze vignette at full gaze intensity (0-1, gentle) */
    VIGNETTE_STRENGTH: 0.35,
    /** Pitch window (radians) around the 45° threshold where the marker line shows */
    PITCH_LINE_WINDOW: 0.3,
    /** Base alpha of the threshold marker line when pitch is at the threshold */
    PITCH_LINE_ALPHA: 0.35,
    /** Extra alpha at the start of the first-crossing pulse */
    PITCH_LINE_PULSE_ALPHA: 0.65,
    /** First-crossing pulse duration (seconds) */
    PITCH_LINE_PULSE_DURATION: 0.6,
} as const;

/**
 * Sky-eye awareness constants (flow-audit break #4: the eye must perceive the
 * player). All values are unitless gains applied on top of the SkyEye base
 * constants (SKY_EYE_FOLLOW_LERP / SKY_EYE_MAX_LAG / SKY_EYE_PUPIL_GAIN):
 * a bright flower draws the eye's attention; being gazed at provokes a
 * confrontational stare-back.
 */
export const SKY_EYE_AWARENESS = {
    /**
     * Baseline blink rate in blinks/second at flower intensity 0.
     * ≈ the old per-frame `random > 0.999` draw at 60fps, now delta-scaled
     * so blinking is frame-rate independent.
     */
    BLINK_RATE_BASE: 0.06,
    /** Extra blinks/second at full flower intensity (the light is noticed) */
    BLINK_RATE_FLOWER_GAIN: 0.24,
    /** Follow-lerp multiplier gain at full flower intensity (eye keeps up tighter) */
    FOLLOW_LERP_FLOWER_GAIN: 2.0,
    /** Fraction of the max-lag leash removed at full flower intensity (eye hovers closer) */
    MAX_LAG_FLOWER_SHRINK: 0.6,
    /** Pupil tracking-gain multiplier gain at full flower intensity */
    PUPIL_GAIN_FLOWER_GAIN: 1.5,
    /** Extra pupil scale at full gaze intensity (dilated stare-back) */
    PUPIL_DILATE_GAZE: 0.8,
    /** Ring spin speed multiplier at full gaze intensity (audit: x1.5-2) */
    RING_SPEED_GAZE_MULT: 1.75,
} as const;

/**
 * Camera constants
 */
export const CAMERA = {
    /**
     * Vertical field of view (degrees). Single source of truth for
     * SceneSetup and any screen-space math (e.g. 45° gaze-threshold line).
     */
    FOV_DEGREES: 80,
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
    /**
     * How long the "[SHIFT] maybe you can resist" hint stays visible once its
     * conditions are first met (seconds). Previously the hint was marked shown
     * the same frame it appeared (~16ms — flow-audit break #2).
     */
    HINT_DISPLAY_DURATION: 10.0,
    /**
     * Peak value fed into the uOverrideProgress edge-pulse channel while the
     * override key is held during cooldown: the pulse glows at low intensity
     * proportional to the remaining cooldown, so the denial is legible
     * (flow-audit break #2, failure-feedback tier 1).
     */
    COOLDOWN_FEEDBACK_MAX: 0.3,
} as const;

/**
 * Input constants shared by the desktop and touch control paths
 * (flow-audit break #9: touch devices must be able to enter AND move).
 */
export const INPUT = {
    /** Flower intensity step per wheel tick / Q-E press / touch button tap */
    FLOWER_STEP: 0.1,
    /**
     * Delay (ms) before retrying a rejected requestPointerLock. Browsers
     * enforce a ~1.25s cooldown after ESC-exit during which the request
     * rejects (flow-audit medium #15).
     */
    POINTER_LOCK_RETRY_MS: 1300,
    /** Left-half drag distance (px) for full virtual-joystick deflection */
    TOUCH_JOYSTICK_RADIUS_PX: 70,
    /** Touch-look sensitivity multiplier over the base mouse sensitivity */
    TOUCH_LOOK_SENSITIVITY_MULT: 1.5,
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
