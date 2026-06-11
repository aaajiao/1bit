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
 * Flower opening-guidance pulse (flow-audit enhancement #1, the first link
 * of the "no tutorial" discoverability chain): for the first PULSE_DURATION
 * seconds of play the flower's target intensity sways sinusoidally between
 * PULSE_MIN and PULSE_MAX — a wordless "this light answers you" cue. The
 * player's first deliberate adjustment (wheel / Q-E / touch buttons) exits
 * the guidance immediately; any gaze forcing or post-gaze recovery hold
 * aborts it too (the world's grip outranks the teaching beat).
 */
export const FLOWER_INTRO = {
    /** Play-time seconds the opening pulse runs before settling back. */
    PULSE_DURATION: 10,
    /** Sway range of the pulsed target intensity (dim-to-soft band). */
    PULSE_MIN: 0.3,
    PULSE_MAX: 0.5,
    /** Angular speed of the sway (rad/s) — one full breath ≈ 3.1s. */
    PULSE_SPEED: 2.0,
} as const;

/**
 * Flower-adjustment fallback hint (flow-audit enhancement #1, second half):
 * after IDLE_SECONDS of play without ANY intensity adjustment, a minimal
 * "[scroll]" line fades in on the HUD; the first adjustment dismisses it
 * for the session (mirroring the override hint's keep-shown precedent).
 */
export const FLOWER_HINT = {
    /** Play-time seconds without any flower adjustment before the hint shows. */
    IDLE_SECONDS: 60,
} as const;

/**
 * Spawn-point selection (flow-audit medium #7): the origin chunk is always
 * INFO_OVERFLOW — the loudest room — so every run used to open at maximum
 * noise. The spawn scan walks outward from the origin for the nearest quiet
 * room instead (world/RoomConfig.findQuietSpawnPosition).
 */
export const SPAWN = {
    /** Half-width (chunks) of the square scan around the origin. */
    SCAN_RADIUS_CHUNKS: 6,
    /**
     * Offset (m) from the chunk center along both axes — preserves the
     * historical (8, 8) "safe spawn" clearance from center-anchored geometry.
     * Must stay well under CHUNK_SIZE/2 so the offset point is the same room.
     */
    SPAWN_OFFSET: 8,
    /** Spawn eye height (y, m). */
    SPAWN_HEIGHT: 2,
} as const;

/**
 * Sunset-settlement snapshot overlay rendering (flow-audit medium #9):
 * the 1-bit pattern is rendered once per frame into a small fixed-size
 * canvas and CSS-scaled to fullscreen (image-rendering: pixelated keeps it
 * sharp), instead of CPU-filling a window-sized ImageData every frame.
 */
export const SNAPSHOT_OVERLAY_CONFIG = {
    /** Fixed pattern canvas resolution (px, square), CSS-scaled to fullscreen. */
    CANVAS_SIZE: 512,
    /** Pattern cell size (px) inside the fixed canvas (one evaluation per cell). */
    PATTERN_BLOCK_SCALE: 4,
} as const;

/**
 * Sunset-settlement ritual (flow-audit enhancement #9): the snapshot is a
 * narrative beat, so player ACTIONS are briefly dulled while it lands
 * (look stays live) and the audio converges (SNAPSHOT_AUDIO_CONFIG).
 */
export const SNAPSHOT_RITUAL = {
    /** Seconds of action dulling (movement/jump/flower/override) at snapshot start. */
    INPUT_DULL_SECONDS: 2.5,
} as const;

/**
 * Last-run snapshot persistence (flow-audit enhancement #8): the run's
 * observation (tags + text + pattern params) is written to localStorage on
 * unload and surfaced as one quiet line on the next start screen.
 */
export const SNAPSHOT_STORAGE = {
    /** localStorage key for the persisted last-run snapshot. */
    KEY: '1bit:lastSnapshot',
    /** Wire-format version; bump to invalidate older persisted payloads. */
    VERSION: 1,
} as const;

/**
 * Pre-sunset foreshadow (flow-audit enhancement #8): over the last
 * LEAD_SECONDS of the day phase the duotone paper dims and warms slightly
 * (a dusk color-temperature shift) and the ambient drone descends
 * (SUNSET_FORESHADOW_AUDIO) — the ending becomes something you can feel
 * coming. Driven purely by the DayNightCycle phase (no new wall clock).
 */
export const SUNSET_FORESHADOW = {
    /** Seconds before sunset at which the foreshadow ramp starts. */
    LEAD_SECONDS: 30,
    /** Max fractional paper-color dim at the sunset moment (gentle). */
    PAPER_DIM: 0.10,
    /**
     * Warm channel skew at full foreshadow: R dims by (PAPER_DIM - WARM_SHIFT),
     * B by (PAPER_DIM + WARM_SHIFT) — a subtle shift toward dusk warmth.
     * Must stay <= PAPER_DIM so no channel ever brightens.
     */
    WARM_SHIFT: 0.05,
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
 * Sky-eye room dominance (flow-audit enhancement #11): in POLARIZED — the
 * authority's home room — the eye visibly takes over the sky: the ring group
 * grows, extra outer rings unfold, and the whole eye descends closer to the
 * player. The dominance level eases in/out exponentially as the player
 * crosses the room boundary, so the takeover (and the release on leaving)
 * is a smooth breath rather than a pop.
 */
export const SKY_EYE_DOMINANCE = {
    /** Ring-group scale multiplier at full dominance (audit: ~1.6x). */
    SCALE_MULT: 1.6,
    /** Height drop (m) below the base eye height at full dominance. */
    HEIGHT_DROP: 45,
    /** Extra outer rings revealed at full dominance (grow in with the level). */
    EXTRA_RINGS: 2,
    /** Exponential blend rate (1/s) of the dominance level (~0.7s time constant). */
    BLEND_RATE: 1.5,
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
    /**
     * Raw-bypass crash frame (flow-audit enhancement #4): for this window
     * right after the trigger the DitherShader outputs the raw, un-dithered,
     * un-tinted tDiffuse render — the system cracks open — before the duotone
     * inversion flash plays as the aftershock. Kept short (photosensitivity).
     */
    RAW_BYPASS_DURATION: 0.1,
    /**
     * Seconds for the sustained-hold edge band (uOverrideSustain) to decay
     * from full to zero after the key is released (flow-audit enhancement #5:
     * holding past the trigger now has a steady on-screen counterpart).
     */
    SUSTAIN_RELEASE_SECONDS: 0.2,
    /**
     * Per-success misregistration residue (flow-audit enhancement #6): every
     * successful override leaves a permanent-for-this-run +RESIDUE_STEP on the
     * uMisregister channel (clamped at RESIDUE_MAX), so POLARIZED's zero
     * jitter is never pristine again — the system remembers the resistance.
     * Cleared at sunset (run settlement).
     */
    RESIDUE_STEP: 0.01,
    RESIDUE_MAX: 0.05,
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
