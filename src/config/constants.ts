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
 * Behavior-tag thresholds (RunStatsCollector.generateTags): the cut points
 * on the run's normalized 0-1 metrics that decide which behavior tags a
 * sunset snapshot earns. Single source of truth for the tag language —
 * LIVE_PROFILE's saturation knobs below reference these same values so the
 * snapshot vocabulary and the live world-bias normalization never drift.
 */
export const TAG_THRESHOLDS = {
    /** avgFlower below this reads as QUIET_LIGHT (kept the light low). */
    QUIET_LIGHT_MAX_FLOWER: 0.25,
    /** avgFlower below this (and above quiet) is MEDIUM_LIGHT; above, LOUD_LIGHT. */
    MEDIUM_LIGHT_MAX_FLOWER: 0.6,
    /** gazeRatio above this reads as HIGH_GAZE (kept meeting the eye). */
    HIGH_GAZE_MIN_RATIO: 0.5,
    /** gazeRatio below this reads as LOW_GAZE (avoided the eye). */
    LOW_GAZE_MAX_RATIO: 0.15,
    /** crackRatio above this reads as NEUTRAL_SEEKER (lived on the rift line). */
    NEUTRAL_SEEKER_MIN_CRACK_RATIO: 0.3,
    /**
     * overrideRatio above this reads as RESISTER: holding resistance 5% of
     * the run already reads as full boundary-probing.
     */
    RESISTER_MIN_OVERRIDE_RATIO: 0.05,
    /** Successful overrides at/above this count as RESISTER outright. */
    RESISTER_MIN_SUCCESSES: 1,
} as const;

/**
 * Live behavior profile (F1 "the world reads you"): RunStatsCollector
 * condenses the run-so-far into a lightweight normalized profile
 * (getLiveProfile) that gently biases the room assignment of NEWLY generated
 * clusters (world/RoomLedger). The mapping table itself — which behavior
 * pushes which room, and by how much — lives with the other per-room knobs
 * in world/RoomConfig.BEHAVIOR_ROOM_BIAS; this block only holds the
 * profile-side normalization and wiring cadence.
 */
export const LIVE_PROFILE = {
    /**
     * Seconds of play before the profile is considered formed. Below this
     * getLiveProfile() returns null, so boot-time chunk generation and the
     * spawn scan stay exactly the neutral (unbiased) room distribution.
     */
    MIN_DURATION: 30,
    /**
     * overrideTimeTotal/duration at which overrideActivity saturates to 1.
     * Defined AS the RESISTER tag threshold (TAG_THRESHOLDS above) — one
     * source, so the tag and the live bias can never drift apart.
     */
    OVERRIDE_SATURATION: TAG_THRESHOLDS.RESISTER_MIN_OVERRIDE_RATIO,
    /**
     * onCrackTime/duration at which crackAffinity saturates to 1. Defined AS
     * the NEUTRAL_SEEKER tag threshold: full crack-time affinity IS the tag.
     */
    CRACK_SATURATION: TAG_THRESHOLDS.NEUTRAL_SEEKER_MIN_CRACK_RATIO,
    /**
     * Seconds between feeding the live profile into the room ledger
     * (core/RoomFlowUpdater) — low-frequency by design; the ledger only
     * consults it when a brand-new cluster needs a room.
     */
    LEDGER_REFRESH_INTERVAL: 1.0,
} as const;

/**
 * Spawn-point selection (flow-audit medium #7): the origin chunk is always
 * INFO_OVERFLOW — the loudest room — so every run used to open at maximum
 * noise. The spawn scan walks outward from the origin for the nearest quiet
 * room instead (world/RoomConfig.findQuietSpawnPosition).
 */
export const SPAWN = {
    /**
     * Half-width (clusters) of the square scan around the origin. Rooms are
     * assigned per 2x2-chunk cluster (WORLD.CLUSTER_CHUNKS), so the scan walks
     * the cluster grid; 3 clusters = the same 6-chunk world coverage as the
     * historical chunk scan.
     */
    SCAN_RADIUS_CLUSTERS: 3,
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
 * Sunset snapshot share card (F6 分享卡片): the run's observation composed
 * into a downloadable 1080x1350 1-bit "negative label" — the pattern
 * fingerprint on top, one observation + tag row + run signature below.
 * Layout/delivery knobs only; the composition lives in stats/SnapshotCard.ts.
 */
export const SNAPSHOT_CARD = {
    /** Card pixel size (portrait 4:5). */
    WIDTH: 1080,
    HEIGHT: 1350,
    /** Pattern window height (top section) — exactly 2/3 of the card. */
    PATTERN_HEIGHT: 900,
    /** Horizontal margin of the divider and the whole label block (px). */
    MARGIN: 72,
    /**
     * Hairline divider between pattern and label (px) — the card's single
     * concession to color (dominant room's duotone paper tint).
     */
    DIVIDER_HEIGHT: 2,
    /**
     * Observation text: font size / line height (px), offset below the
     * divider, and the wrap cap (longer text is cut, label-style).
     */
    TEXT_FONT_SIZE: 40,
    TEXT_LINE_HEIGHT: 64,
    TEXT_TOP_OFFSET: 64,
    TEXT_MAX_LINES: 3,
    /**
     * Secondary English line (word-wrapped, drawn under the Chinese block):
     * smaller and dimmer than the primary, echoing the overlay's "secondary"
     * tier. GAP is the space below the last Chinese line; MAX_LINES caps the
     * block so the worst case (max CN lines + max EN lines) still clears the
     * tag row. Empty `textEn` (older snapshots) skips the block entirely.
     */
    TEXT_EN_FONT_SIZE: 24,
    TEXT_EN_LINE_HEIGHT: 34,
    TEXT_EN_TOP_GAP: 28,
    TEXT_EN_MAX_LINES: 4,
    TEXT_EN_ALPHA: 0.6,
    /**
     * Floor of breathing room kept between the English block's last line and
     * the tag row, so the secondary text never crowds the labels even when it
     * is clamped to fill the corridor.
     */
    TEXT_EN_BOTTOM_GAP: 16,
    /**
     * Tag row (small monospace, dimmed): font size / offset from the card
     * bottom (textBaseline: top) / alpha.
     */
    TAG_FONT_SIZE: 20,
    TAG_BOTTOM_OFFSET: 142,
    TAG_ALPHA: 0.65,
    /** Footer signature ("1bit · m:ss"): font size / offset from the bottom. */
    FOOTER_FONT_SIZE: 22,
    FOOTER_BOTTOM_OFFSET: 88,
    /** Download filename prefix (date + dominant text key are appended). */
    FILE_PREFIX: '1bit-snapshot',
    /** Object-URL revoke delay after the download click (ms). */
    REVOKE_DELAY_MS: 1000,
} as const;

/**
 * Cross-run scar persistence (F2 "the system remembers you resisted"):
 * every successful override leaves a permanent scar record in localStorage,
 * and every sunset increments the runs-completed counter. Unlike the
 * session-only RoomLedger (F1), this surface deliberately survives the tab.
 */
export const SCAR_STORAGE = {
    /** localStorage key for the persisted scar record. */
    KEY: '1bit:scars',
    /**
     * Wire-format version; bump to invalidate older persisted payloads.
     * v2: scar x/z are quantized WORLD coordinates of the resistance itself
     * (v1 stored cluster coordinates, anchoring scars up to ~113m away from
     * where the player actually resisted — those payloads read as absent).
     */
    VERSION: 2,
    /**
     * Maximum retained scar entries. Scars aggregate per place (a repeat
     * resistance within SCAR_FIELD.RADIUS of an existing scar => count++),
     * so this caps distinct PLACES; when full, the least-recently-touched
     * scar is forgotten first.
     */
    MAX_SCARS: 64,
    /** Stored anchor quantization grid (m) — keeps the JSON payload tidy. */
    POSITION_GRID: 0.5,
    /**
     * Fraction an existing scar's anchor drifts toward a repeat resistance
     * within its radius: the wound stays rooted where it first happened but
     * leans gently toward where the resisting keeps happening.
     */
    ANCHOR_NUDGE: 0.25,
} as const;

/**
 * The forgetting's in-screen confirmation (F2 #4): the entry used to pop a
 * native window.confirm — the only system-level dialog in the whole piece,
 * breaking the 1-bit screen language. Instead the entry itself arms on the
 * first click ("再点一次以遗忘"), quietly reverts after WINDOW_MS without a
 * second click, and erases the cross-run record on the confirming click.
 * Menu-state UI: a wall-clock DOM timeout is acceptable here — the start/
 * pause screen lives outside the delta-driven, pause-gated world.
 */
export const FORGET_CONFIRM = {
    /** Milliseconds the armed entry waits for the second click before reverting. */
    WINDOW_MS: 8000,
    /** Resting entry copy (mirrors the initial #forget-scars text in index.html). */
    IDLE_TEXT: '遗忘',
    /** Armed entry copy asking for the confirming second click. */
    CONFIRM_TEXT: '再点一次以遗忘',
} as const;

/**
 * World scar field (F2): permanent geometric distortion around the places
 * the player successfully resisted. Buildings near a scar point lean, settle
 * and dislocate — hash-deterministic per building, severity growing gently
 * with the aggregated resistance count. The geometry "never recovered".
 * The pure math lives in world/ScarField.ts.
 */
export const SCAR_FIELD = {
    /**
     * Influence radius (m) around a scar's anchor — the quantized world
     * position the resistance actually happened at. Also the aggregation
     * radius: a repeat resistance within it deepens the existing scar
     * (ScarStorage.withScarAt) instead of opening a new one.
     */
    RADIUS: 60,
    /** Aggregated count at which a scar's depth saturates to 1. */
    COUNT_SATURATION: 6,
    /**
     * Depth floor of a fresh (count=1) scar: severity starts at roughly
     * MIN_DEPTH and ramps to 1 at COUNT_SATURATION — visible from the first
     * resistance, but growing with each one (温和递增, clamped).
     */
    MIN_DEPTH: 0.5,
    /** Max lean (radians, per tilt axis) at full severity (~7°). */
    MAX_TILT_RAD: 0.12,
    /** Max downward settle (m) at full severity. */
    MAX_SINK: 1.6,
    /** Max lateral dislocation (m, per axis) at full severity. */
    MAX_OFFSET: 2.5,
} as const;

/**
 * Witnesses at the scars (F3 x F2 "others remember too"): where the world
 * carries a scar (a place the player resisted), a fraction of the nearby
 * silhouette figures gather AROUND that scar and face it — the crowd remembers
 * what the leaning buildings remember. Meanwhile the system tries to erase the
 * written record: inside REDACT_RADIUS of a scar the INFO_OVERFLOW glyph floor
 * is blacked out (a hard 1-bit redaction disc), so the data is gone but the
 * silent crowd keeps standing there. Placement math + redaction live in
 * world/FigureSystem and world/FloorTile; deterministic per chunk given the
 * boot scar snapshot.
 */
export const SCAR_WITNESS = {
    /** Fraction of a chunk's figures pulled to the nearest reachable scar. */
    FRACTION: 0.4,
    /** Ring radius band (m) the witnesses stand in around the scar anchor. */
    RING_MIN: 4,
    RING_MAX: 10,
    /** Radius (m) of the blacked-out glyph redaction disc around a scar. */
    REDACT_RADIUS: 8,
} as const;

/**
 * Distant silhouette figures (F3 "you are not alone"): minimal 1-bit human
 * silhouettes in the mid/far distance, each with a tiny chest flower-light —
 * everyone here is suppressing the same light. Pure scenery, NOT NPCs: no
 * interaction, no collision, and they never approach the player. The
 * per-room density and FORCED_ALIGNMENT placement knobs live with the other
 * per-room tables in world/RoomConfig (ROOM_FIGURE_DENSITY /
 * FA_FIGURE_PLACEMENT); this block holds the body range, the behavior
 * timings, and the rare rebel-event gating (world/FigureSystem).
 */
export const FIGURES = {
    /** Silhouette height range (m). */
    HEIGHT_MIN: 1.6,
    HEIGHT_MAX: 1.8,
    /** Conformist chest-light breathing band and angular speed (rad/s). */
    LIGHT_BREATHE_MIN: 0.15,
    LIGHT_BREATHE_MAX: 0.3,
    LIGHT_BREATHE_SPEED: 0.6,
    /** Light floor the kin press down to when the player gazes / blazes. */
    LIGHT_DIM: 0.05,
    /** Seconds for the light to reach the dim floor (spec: within 1-2s). */
    LIGHT_DIM_SECONDS: 1.5,
    /** Seconds for the breathing light to recover once released (slower). */
    LIGHT_RECOVER_SECONDS: 4.0,
    /** Player flower intensity above which nearby kin bow their lights. */
    DIM_FLOWER_THRESHOLD: 0.7,
    /** Distance (m) within which the blazing flower presses kin down. */
    DIM_FLOWER_DISTANCE: 25,
    /** Constant faint light of the FORCED_ALIGNMENT rank-standers. */
    ALIGNED_LIGHT: 0.12,
    /**
     * Flower resonance — "the social language of light" (F3): the flower dial
     * is a full social instrument. Too dim reads as loneliness, blazing above
     * DIM_FLOWER_THRESHOLD bows the kin in fear (the press-down), and only the
     * MIDDLE band resonates. Hold the flower inside
     * [RESONANCE_BAND_MIN, RESONANCE_BAND_MAX] continuously for
     * RESONANCE_ARM_SECONDS (not gazing) and nearby CONFORMIST kin — within the
     * same DIM_FLOWER_DISTANCE radius the press uses — slowly converge their
     * breathing onto a shared cadence and lift their light. Leave the band,
     * blaze, or gaze and each drifts back to its own hash-desynced phase. The
     * press-down suppression ALWAYS wins over resonance.
     *
     * Band edges use hysteresis (RESONANCE_BAND_HYSTERESIS): once inside, the
     * band widens by the margin so a flower resting on an edge does not chatter
     * armed/unarmed. The outer band stays below DIM_FLOWER_THRESHOLD, so a
     * blazing flower always exits resonance before it presses.
     */
    RESONANCE_BAND_MIN: 0.3,
    RESONANCE_BAND_MAX: 0.6,
    RESONANCE_BAND_HYSTERESIS: 0.04,
    /** Continuous in-band seconds before the kin start to resonate. */
    RESONANCE_ARM_SECONDS: 3.0,
    /**
     * Shared reference phase = a slow common drift (rad/s) off the elapsed
     * clock — identical for every resonating figure, so they breathe in unison
     * rather than merely near one another.
     */
    RESONANCE_REFERENCE_DRIFT: 0.05,
    /**
     * Phase-circle approach rates (per s, shortest-arc): CONVERGE pulls a
     * figure's live phase toward the shared reference while resonating; the
     * slower RELAX lets it drift back to its personal hash phase afterwards.
     */
    RESONANCE_CONVERGE_RATE: 0.5,
    RESONANCE_RELAX_RATE: 0.35,
    /** Seconds for a figure's resonance strength (amplitude lift) to ease in / out. */
    RESONANCE_ATTACK_SECONDS: 2.5,
    RESONANCE_RELEASE_SECONDS: 3.0,
    /** Breathing peak the lifted light tops out at while fully resonating. */
    RESONANCE_LIGHT_MAX: 0.4,
    /** In-place sway amplitude (rad) and speed (rad/s) — barely alive. */
    SWAY_AMPLITUDE: 0.045,
    SWAY_SPEED: 0.8,
    /** IN_BETWEEN misread flicker: period (s) and wireframe-on window (s). */
    MISREAD_FLICKER_PERIOD: 1.9,
    MISREAD_FLICKER_ON: 0.22,
    /**
     * Rebel-event arming interval band (s): hash-drawn per event index, so
     * a rebellion fires AT MOST once every few minutes (and only once a
     * candidate figure sits in the distance band below).
     */
    REBEL_MIN_INTERVAL: 150,
    REBEL_MAX_INTERVAL: 360,
    /** Trigger distance band (m): the rebellion always happens out THERE. */
    REBEL_MIN_DISTANCE: 30,
    REBEL_MAX_DISTANCE: 60,
    /** Seconds the chest light surges to full before the body breaks up. */
    REBEL_SURGE_SECONDS: 2.0,
    /** Seconds of localized glitch strobe before the figure vanishes. */
    REBEL_FLICKER_SECONDS: 0.9,
    /** Strobe rate (steps/s) and horizontal dislocation amplitude (m). */
    REBEL_FLICKER_RATE: 13,
    REBEL_JITTER_AMPLITUDE: 0.35,
    /**
     * Rebellion is contagious: a SUCCESSFUL player override (the same resist
     * event that scars the world) opens a session-level contagion window of
     * this many seconds during which the rebel arming gate counts down markedly
     * faster — distant kin rebel more often in the minutes after you did.
     * Each fresh success refreshes the window to full.
     */
    REBEL_CONTAGION_WINDOW: 180,
    /**
     * Gate acceleration while the contagion window is open: the arming
     * countdown drains this many times faster, so the effective REBEL_*_INTERVAL
     * band is divided by this factor. Rebel picks stay hash-deterministic; only
     * the WAIT shortens (deterministic given the same window-state trajectory).
     */
    REBEL_CONTAGION_GATE_DIVISOR: 3,
} as const;

/**
 * Ghost-trail recording + persistence (F4 "ghost replay"): the player's walk
 * is sampled as (x, z, flowerIntensity) points into a ring buffer and written
 * to localStorage at sunset / unload (stats/TrailRecorder, versioned-key
 * pattern mirroring SnapshotStorage). Next boot, world/GhostSystem replays
 * the stored trail once as a quiet silhouette — last run's you.
 */
export const TRAIL = {
    /** localStorage key for the persisted last-run trail. */
    KEY: '1bit:lastTrail',
    /** Wire-format version; bump to invalidate older persisted payloads. */
    VERSION: 1,
    /**
     * Seconds between trail samples — the same cadence as RunStatsCollector's
     * periodic sampling, and the replay's keyframe spacing (GhostSystem lerps
     * between consecutive points over this interval).
     */
    SAMPLE_INTERVAL: 2.0,
    /** Ring-buffer cap: 600 points x 2s = the last ~20 minutes of walking. */
    MAX_POINTS: 600,
    /**
     * Minimum points for a trail to be persisted (15 x 2s = 30s of play,
     * matching GAMEPLAY.MIN_RUN_DURATION_FOR_SNAPSHOT): a run too short to
     * earn a snapshot is also too short to leave a ghost.
     */
    MIN_POINTS: 15,
    /** Stored coordinate precision: decimals kept on x/z (0.1m grid). */
    POSITION_DECIMALS: 1,
    /** Stored flower-intensity precision (two decimals is plenty for a dot). */
    FLOWER_DECIMALS: 2,
} as const;

/**
 * Ghost replay (F4): the previous run's player, walking its recorded trail
 * through THIS run's world as a half-present silhouette. One-time and quiet:
 * it never reacts to the player beyond a single chest-light recognition
 * flare, never collides, and after finishing its walk it holds for a breath
 * and fades out for the session. No HUD, no audio — finding it IS the event.
 */
export const GHOST = {
    /** Silhouette height (m) — the middle of the FIGURES height band. */
    HEIGHT: 1.7,
    /**
     * Body greyscale level (0-1). Mid-grey instead of the figures' near-black
     * ink, so the dither renders the ghost as an unstable halftone pattern
     * rather than a solid silhouette — clearly kin, clearly not present.
     */
    BODY_GREY: 0.34,
    /**
     * Low-frequency presence oscillation of the body opacity (隐现): the
     * ghost never fully commits to being there. Band + angular speed (rad/s).
     */
    PRESENCE_MIN: 0.35,
    PRESENCE_MAX: 0.75,
    PRESENCE_SPEED: 0.9,
    /** Exponential turn rate (1/s) easing the facing along the walk. */
    TURN_RATE: 6.0,
    /** Seconds the ghost stands at the trail's end before fading. */
    HOLD_SECONDS: 3.0,
    /** Seconds of the final fade-out (then gone for the session). */
    FADE_SECONDS: 2.5,
    /**
     * Delayed entrance (偶遇): the ghost stays out of the world until the
     * player has first put this distance (m, horizontal) between themselves
     * and the trail start. The spawn point is deterministic across sessions
     * and the trail usually starts there, so without this gate the ghost
     * would materialize inside the player every run — it must always be
     * something you turn around and find. Keep it > RECOGNIZE_DISTANCE so
     * the recognition flare is armed-by-construction at entry.
     */
    ENTRY_DISTANCE: 20,
    /** Distance (m, horizontal) at which the ghost recognizes the player. */
    RECOGNIZE_DISTANCE: 10,
    /** Peak extra chest-light at the recognition flare (subtle, once). */
    RECOGNIZE_BOOST: 0.25,
    /** Recognition flare envelope: rise to peak, then fall back (s). */
    RECOGNIZE_RISE_SECONDS: 0.5,
    RECOGNIZE_FALL_SECONDS: 1.6,
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
 * Stress-driven dither grain (F5 "分辨率即情绪"): a smoothed 0-1 stress level
 * — computed in core/StressLevel.ts from the gaze, the held resistance,
 * INFO_OVERFLOW's flower overload and the dying day — coarsens the dither
 * sampling grid (uDitherScale: SCALE_MIN -> SCALE_MAX). The screen's grain IS
 * the player's pulse: pressure makes the halftone visibly coarser, release
 * lets it settle back fine. POLARIZED's zero-dither hard threshold never
 * samples a pattern, so the scale is inert there by construction.
 */
export const STRESS = {
    /** Attack time constant (s): stress rises fast. */
    ATTACK_SECONDS: 0.3,
    /** Release time constant (s): stress drains slowly. */
    RELEASE_SECONDS: 2.0,
    /** Dither sampling scale at stress 0 (1.0 = the historical grain). */
    SCALE_MIN: 1.0,
    /** Dither sampling scale at full stress (coarse, but still a texture). */
    SCALE_MAX: 2.5,
    /**
     * INFO_OVERFLOW overload onset: flower intensity at which the room reads
     * the blazing light as stress (ramps to 1 at intensity 1). Matches the
     * flower's "intense" state threshold (FlowerProp three-state system).
     */
    INFO_FLOWER_OVERLOAD_START: 0.7,
    /**
     * Weight of the pre-sunset foreshadow ramp in the stress max-combine:
     * the last ~30s of the day tighten the grain, but never to full panic.
     */
    SUNSET_WEIGHT: 0.6,
    /**
     * Settle deadband (scale units): uDitherScale holds still until the
     * stress-mapped candidate has drifted at least this far from the last
     * emitted value, then jumps straight TO it. Kills the full-screen pattern
     * crawl of a continuously micro-changing divisor — a slight stepping
     * (one deadband per step) is the accepted trade (宁可台阶感轻微).
     */
    SETTLE_DEADBAND: 0.05,
    /**
     * Settle snap epsilon (stress units): once the smoothed stress coasts
     * within this of a rest extreme (0 or 1) WHILE heading there, it snaps
     * exactly onto it — so calm always lands back on precisely SCALE_MIN
     * (the historical grain) instead of a sub-deadband residual offset.
     */
    SETTLE_SNAP: 0.01,
} as const;

/**
 * Blue-noise dither pattern (F5 "每房间抖动图案"): a SIZE x SIZE ordered
 * threshold texture generated once at boot via best-candidate sampling
 * (shaders/BlueNoiseTexture.ts), hash-seeded so every session builds the
 * exact same texture. INFO_OVERFLOW dithers with it (混乱但无结构感) and
 * IN_BETWEEN interleaves it against Bayer (DITHER_MODE in world/RoomConfig).
 */
export const BLUE_NOISE = {
    /**
     * Texture edge length (texels). MUST stay 64: the GLSL tiling constant
     * (BLUE_NOISE_SIZE in DitherShader) is hardcoded to match.
     */
    SIZE: 64,
    /** Deterministic generation seed (any change re-textures the noise). */
    SEED: 1337,
    /** Best-candidate draws per placement (higher = bluer, slower boot). */
    CANDIDATES: 8,
} as const;

/**
 * Flower hand-light (F5 "花是光"): the world is built from LIT materials
 * (MeshLambert/Phong — FloorTile, SharedAssets), so the flower's real
 * THREE.PointLight (FlowerProp.coreLight) genuinely brightens the pre-dither
 * luminance field around the player: a brighter flower means whiter,
 * finer-dithered surroundings — your light exposes you, closing the loop
 * with the gaze economy (太亮吸引注视). Per-state params follow the flower's
 * three-state system (dim/soft/intense): value = BASE + stateProgress * GAIN.
 */
export const FLOWER_LIGHT = {
    /**
     * Distance falloff exponent. 2 is the physical default; 1.5 is gentler,
     * so the light's reach actually reads in the dithered mid-distance.
     */
    DECAY: 1.5,
    /** PointLight intensity per state: [dim, soft, intense]. */
    INTENSITY: [
        { BASE: 0.3, GAIN: 0.5 },
        { BASE: 1.0, GAIN: 2.0 },
        { BASE: 4.0, GAIN: 4.0 },
    ],
    /** PointLight cutoff distance (m) per state: [dim, soft, intense]. */
    DISTANCE: [
        { BASE: 2.0, GAIN: 1.0 },
        { BASE: 4.0, GAIN: 2.0 },
        { BASE: 8.0, GAIN: 4.0 },
    ],
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
 * Cable uplink pulse (scene-richness batch): when the player's flower burns
 * bright, cables near the player report that light to the sky eye — hard 1-bit
 * dashes race UP each cable toward the authority overhead. This draws the
 * otherwise invisible rule "brighter = seen" as a literal line of light
 * travelling down the wires. black = the system, white = the self, the dashes
 * are the self's light being read by the system.
 */
export const CABLE_UPLINK = {
    /** Flower intensity above which cables begin to uplink (0-1). */
    FLOWER_THRESHOLD: 0.6,
    /**
     * Radius (m) around the player within which cables uplink. Kept well
     * inside the 3x3 near-chunk scan window (chunk = 80m) so a cable that
     * lights up is always re-scanned — and reset — before it can drift out of
     * range between frames.
     */
    RADIUS: 34.0,
    /** Dash density (dashes per meter) at threshold / at full brightness. */
    DENSITY_BASE: 0.16,
    DENSITY_GAIN: 0.24,
    /** Pulse travel speed (dash cycles/second) at threshold / at full brightness. */
    SPEED_BASE: 0.7,
    SPEED_GAIN: 1.6,
    /** Fraction of each dash cycle that is lit (hard on/off — no soft fade). */
    DASH_DUTY: 0.42,
} as const;

/**
 * Snapshot echo (scene-richness batch, "世界替你打草稿"): every few minutes the
 * world briefly leaks a low-res 1-bit DRAFT of the current run's snapshot
 * fingerprint onto one nearby building facade — the same procedural pattern the
 * sunset overlay settles (stats/SnapshotPattern), rendered from the run SO FAR.
 * It appears and disappears with a hard on/off flicker (never an alpha fade),
 * holds for a few seconds, then is gone. The end-of-run portrait is not a
 * bolted-on results screen: the system has been watching and drafting you all
 * along, and sunset merely delivers the final copy. black = the system doing
 * the drawing, white = the self being drawn, dither = the draft's own grain.
 */
export const SNAPSHOT_ECHO = {
    /**
     * Arming interval band (s): hash-drawn per event index (mirrors the F3
     * REBEL gate), so an echo surfaces AT MOST once every few minutes — and
     * only once a building actually stands within RADIUS of the player.
     */
    MIN_INTERVAL: 140,
    MAX_INTERVAL: 320,
    /** Search radius (m) for a host building; inside the 3x3 near-chunk scan. */
    RADIUS: 42,
    /** Draft display duration band (s), hash-drawn per event index. */
    DURATION_MIN: 4.0,
    DURATION_MAX: 8.0,
    /**
     * Hard-flicker windows (s) at the head/tail of the display: inside them the
     * decal strobes on/off (FLICKER_RATE toggles/s), so it materializes and
     * dissolves in 1-bit stutter rather than fading; the middle holds steady.
     */
    FLICKER_IN_SECONDS: 0.55,
    FLICKER_OUT_SECONDS: 0.7,
    FLICKER_RATE: 12,
    /** Draft texture edge (texels): deliberately low-res — a rough draft. */
    RESOLUTION: 28,
    /** Decal plane edge length (m) painted on the facade. */
    SIZE: 4.0,
    /** Decal center height (m) off the ground. */
    HEIGHT: 5.0,
    /**
     * Offset (m) from the building center toward the player at which the decal
     * floats: buildings vary in footprint, so this is a fair approximation of
     * "on the near face turned toward you" rather than a surface-exact projection.
     */
    FACE_OFFSET: 5.0,
} as const;

/**
 * Idealized shadows (scene-style batch): in FORCED_ALIGNMENT every building
 * gets a fake "corrected" shadow — a hard-black, perfectly axis-aligned
 * rectangle decal on the floor at its foot, displaced in ONE fixed global
 * azimuth and sized from the building's footprint but quantized to the room's
 * 8-unit grid rhythm. The slight mismatch between a building's real silhouette
 * and its too-regular shadow is the point: the system idealizes even shadows.
 * Near a cross-run scar the correction FAILS — the rectangle rotates, shears
 * and slides by hash-drawn amounts scaled by scar severity. Scar reach reuses
 * SCAR_FIELD.RADIUS via scarSeverityAt (one shared radius, no second knob).
 * Geometry math lives in world/ShadowCorrection.
 */
export const FA_SHADOW = {
    /**
     * Fixed global shadow azimuth (radians in the world XZ plane; 0 = +x,
     * PI/2 = +z): the ONE direction every corrected shadow is displaced in.
     * The axis-aligned rect never rotates toward it — it only slides — which
     * is exactly the institutional over-regularity the room speaks.
     */
    AZIMUTH_RAD: Math.PI / 4,
    /**
     * Rect size quantum (m): half the FA occupancy grid pitch
     * (RoomGeneration.GRID_SNAP_SIZE = 8), so shadow sizes step in the same
     * institutional rhythm without collapsing every small building to one size.
     */
    QUANT: 4,
    /**
     * Rect extent clamps (m) after quantization. Both MUST stay multiples of
     * QUANT so clamping preserves the grid rhythm; MIN also floors footprints
     * that would otherwise quantize to nothing.
     */
    MIN_SIZE: 4,
    MAX_SIZE: 20,
    /**
     * Displacement magnitude as a fraction of the MEAN quantized rect extent
     * ((width + depth) / 2): ONE scalar along the ONE azimuth, so every
     * shadow's displacement direction is identical regardless of aspect ratio.
     */
    OFFSET_FACTOR: 0.4,
    /**
     * Lift (m) above the floor plane — the FloorTile redaction-disc epsilon
     * pattern, paired with polygonOffset on the shared ink material so the
     * decal never z-fights the floor at grazing distances.
     */
    LIFT: 0.02,
    /**
     * Per-chunk decal cap. The populated FA building count tops out at 9
     * (chunkBuildingCount base 7 x OVERGROWN 1.35) before grid-occupancy and
     * rift-clearance skips, so this bound normally never bites — it is a
     * safety ceiling, not a rationing knob.
     */
    MAX_PER_CHUNK: 10,
    /** Scar-skew clamp at full severity: rotation off axis-alignment (rad, ~20°). */
    MAX_SKEW_ROT_RAD: 0.35,
    /** Scar-skew clamp: XZ shear factor (m of x drift per m of rect depth). */
    MAX_SHEAR: 0.5,
    /** Scar-skew clamp: extra lateral slide off the corrected spot (m, per axis). */
    MAX_SKEW_OFFSET: 2.5,
    /**
     * Half-width (m) of the keep-out band around the FA rift crack line: a
     * decal whose x extent would enter this band is skipped entirely, so no
     * shadow ever floats over the crack gap / abyss plane or visually bridges
     * the jagged silhouette the shore corridor keeps open. Matches the abyss
     * plane half-width in FloorTile.createCrackedFloorMesh (crackWidth/2 + 3),
     * which already covers the maximum jag erosion.
     */
    CRACK_KEEPOUT: 5,
} as const;

/**
 * Data waterfalls (scene-style batch): in INFO_OVERFLOW some facades leak the
 * district's own records — thin vertical strips down which 1-bit glyph streams
 * scroll, the floor's binary language climbing the walls. Strips are generated
 * per eligible building (hash-gated fraction) and every strip in every chunk
 * shares ONE glyph texture and ONE scrolling material; per-strip desync is
 * baked into the strip UVs, never cloned materials. The scroll speed follows
 * the player's CURRENT flower intensity — the brighter you burn, the faster
 * the district churns your records. black = the system's ledger, white = the
 * self written into it; every glyph pixel is hard on/off, no soft fades.
 */
export const DATA_WATERFALL = {
    /** Fraction of eligible INFO buildings (non-TREE) that leak records. */
    BUILDING_FRACTION: 0.35,
    /** Strips per leaking building (hash-drawn within [MIN, MAX]). */
    STRIPS_MIN: 1,
    STRIPS_MAX: 3,
    /** Strip quad width (m) — thin, a record column, not a billboard. */
    STRIP_WIDTH: 0.55,
    /**
     * Distance (m) from the building-group center to the strip plane — the
     * SNAPSHOT_ECHO.FACE_OFFSET approximation of "on the facade": buildings
     * are fragment clusters with no exact wall, so a fixed offset reads as
     * the face. Group biome scale multiplies it (bigger building, wider face).
     */
    FACE_OFFSET: 4.6,
    /** Max lateral slide (m, ±) of a strip along its facade. */
    LATERAL_RANGE: 3.0,
    /** Strip bottom (m) — just above the glyph floor. */
    BOTTOM_Y: 0.15,
    /** Hash-drawn strip-top band (m) before clamping to the building height. */
    HEIGHT_MIN: 6,
    HEIGHT_MAX: 18,
    /** Strip-height floor (m) after clamping, so stubs keep a legible stream. */
    MIN_STRIP_HEIGHT: 2.5,
    /** Baked UV density: texture heights per world metre (glyph size on wall). */
    V_PER_METER: 0.06,
    /**
     * Shared glyph-strip texture size (texels). Both extents MUST be multiples
     * of GLYPH_PITCH so cells align with the vertical wrap seam (no straddling
     * glyph at the repeat boundary).
     */
    TEX_WIDTH: 8,
    TEX_HEIGHT: 256,
    /** Glyph cell pitch (texels) — mirrors the INFO floor's 4px dot-matrix. */
    GLYPH_PITCH: 4,
    /** Cells whose hash draw exceeds this are lit (~55%, the floor's density). */
    GLYPH_GATE: 0.45,
    /** Texels whose hash draw exceeds this become stray data bursts (sparse). */
    BURST_GATE: 0.94,
    /** Scroll speed (texture heights/s) at flower intensity 0 / extra gain at 1. */
    SPEED_BASE: 0.06,
    SPEED_FLOWER_GAIN: 0.28,
} as const;

/**
 * Chunk and world generation constants
 */
export const WORLD = {
    /** Size of each chunk in world units */
    CHUNK_SIZE: 80,
    /**
     * Room-cluster edge length in chunks: rooms are assigned per 2x2-chunk
     * cluster (160m), so a room is a PLACE with real volume and its boundary
     * is an event again, not an 80m flicker. Cluster coordinate conversion
     * lives in world/RoomConfig.chunkToCluster (single source of truth).
     */
    CLUSTER_CHUNKS: 2,
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
 * Sky-eye familiarity (F2 "the eye knows you"): a returning visitor is
 * followed more tightly. The persisted runsCompleted counter (ScarStorage)
 * recalibrates the eye's BASE follow constants once at construction —
 * tighter follow lerp, shorter leash — ramping linearly to a cap so the
 * relationship deepens over the first few visits and then settles. No new
 * geometry; pure calibration of the existing awareness pipeline
 * (SkyEye.familiarEyeBase), composing multiplicatively with the per-frame
 * flower/gaze awareness gains. runsCompleted=0 reproduces the original
 * base constants exactly.
 */
export const SKY_EYE_FAMILIARITY = {
    /** Runs completed at which familiarity saturates to 1. */
    CAP_RUNS: 5,
    /** Base follow-lerp multiplier gain at full familiarity (2x tighter). */
    FOLLOW_LERP_GAIN: 1.0,
    /** Fraction of the base max-lag leash removed at full familiarity. */
    MAX_LAG_SHRINK: 0.4,
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
 * Sky-eye storm response (weather presence): while real weather rages above
 * the intensity threshold, the eye blinks visibly faster — the authority is
 * agitated by the storm. Below the threshold (calm, fading tails, transient
 * glitches) the eye's cadence is exactly unchanged.
 */
export const SKY_EYE_WEATHER = {
    /** Weather intensity above which the eye reacts to the storm at all. */
    INTENSITY_THRESHOLD: 0.4,
    /** Extra blink-rate multiplier at full storm intensity (1 + gain = 3.5x). */
    BLINK_RATE_STORM_GAIN: 2.5,
} as const;

/**
 * Weather lifecycle broadcast (weather core): a REAL rotation event now lives
 * a full arc — forewarn -> onset -> peak -> aftermath — instead of snapping
 * in and out of existence. WeatherSystem exposes each phase as a scalar in
 * WeatherState so world systems can lean into an approaching storm and let
 * its residue settle after it passes. Transient ambient glitches bypass the
 * whole arc, exactly as they bypass the onset broadcast.
 */
export const WEATHER_LIFECYCLE = {
    /**
     * Forewarn window (s): once the next real event is drawn (cooldown enters
     * this window), WeatherState.forewarn ramps 0 -> 1 until the event
     * breaks, and upcomingType / eventDirection name what is coming.
     */
    FOREWARN_SECONDS: 15,
    /**
     * Aftermath window (s): after a real event ends, WeatherState.aftermath
     * decays 1 -> 0 while lastEndedType names what just passed — the world
     * keeps ringing after the storm.
     */
    AFTERMATH_SECONDS: 25,
    /**
     * Hash salt (utils/hash, distinct integer namespace — max in use
     * elsewhere is 1583) for the once-per-event direction draw: each real
     * event gets one deterministic heading in radians for the whole
     * forewarn -> aftermath arc.
     */
    DIRECTION_SALT: 1597,
} as const;

/**
 * ECLIPSE scheduler (weather core): the rare cross-room event where the
 * authority's sky goes dark. NOT part of the per-room weighted rotation — it
 * runs on its own session clock, pauses the rotation while it lasts (no new
 * event starts; an in-progress event is never cut short — the eclipse waits),
 * and never draws a screen overlay (world systems consume eclipseProgress).
 */
export const WEATHER_ECLIPSE = {
    /** Minimum session play time (s) before the first eclipse can fire. */
    FIRST_MIN_SECONDS: 240,
    /** Random interval (s) between eclipses after the first, [min, max]. */
    INTERVAL_RANGE: [480, 900] as [number, number],
    /** Eclipse duration (s) — eclipseProgress runs 0 -> 1 across it. */
    DURATION_SECONDS: 15,
} as const;

/**
 * Per-type lifecycle tuning for the NEW rotation weather types (weather
 * core). Applied on top of the room's ROOM_WEATHER_PROFILES draw: duration
 * scales, intensity scales then clamps. STATIC/RAIN/GLITCH deliberately have
 * NO entry — the legacy cadence must stay bit-identical.
 */
export const WEATHER_TYPE_TUNING = {
    /** ASHFALL — the settling of noise: long, gentle, never a downpour. */
    ASHFALL: {
        DURATION_SCALE: 1.5,
        INTENSITY_SCALE: 0.6,
        INTENSITY_MIN: 0.2,
        INTENSITY_MAX: 0.7,
    },
    /** GALE — a directional shove: a little shorter, full room intensity. */
    GALE: {
        DURATION_SCALE: 0.75,
        INTENSITY_SCALE: 1.0,
        INTENSITY_MIN: 0.5,
        INTENSITY_MAX: 1.0,
    },
} as const;

/**
 * Behavior -> weather bias (weather core, mirror layer 4): the run-long
 * behavior profile (stats/RunStatsCollector.getLiveProfile — the SAME object
 * the room ledger consumes) gently skews WHAT the sky sends and HOW SOON.
 * Sustained bright/loud play (blazing flower, frequent overrides) leans the
 * rotation toward storm types and shortens the calm between events; sustained
 * dim/still play leans toward ASHFALL and stretches the calm. A null or
 * neutral profile is EXACTLY the unbiased behavior (bit-identical weights).
 */
export const WEATHER_BEHAVIOR_BIAS = {
    /** Max fractional shift of a type weight in either direction (+-30%). */
    MAX_WEIGHT_SHIFT: 0.3,
    /** Max fractional shift of a sampled cooldown in either direction. */
    MAX_COOLDOWN_SHIFT: 0.3,
    /**
     * avgFlower pivot +- deadzone (same convention as BEHAVIOR_ROOM_BIAS in
     * RoomConfig): inside the deadzone — including the 0.5 boot default —
     * the flower exerts no weather bias at all.
     */
    FLOWER_PIVOT: 0.5,
    FLOWER_DEADZONE: 0.1,
} as const;

/**
 * Per-room sky vocabulary (scene-style batch): the flat background becomes
 * four skies. One camera-following inverted dome (world/RoomSky) draws the
 * CURRENT room's treatment behind everything — sparse blinking specks
 * (INFO_OVERFLOW's signal without meaning), ruled ledger lines
 * (FORCED_ALIGNMENT's disciplined heaven), two misregistered celestial discs
 * (IN_BETWEEN's heaven misread by both systems), and a hard ink/paper split
 * through the seam plane (POLARIZED's binary reaching the sky). Everything is
 * hard on/off — the treatment hard-swaps on room change with a frame-count
 * flicker, never a crossfade; the full-screen dither pass owns all softness.
 */
export const ROOM_SKY = {
    /**
     * Dome radius (m). Must sit beyond every world feature (render window is
     * (RENDER_DISTANCE+1) chunks = 240m; fog far 110m) yet safely inside the
     * camera far plane (1000, SceneSetup) even at the rift fall's deepest
     * point (FA_RIFT.FOG.BOTTOM = -165m: 450 + 165 = 615 < 1000). The dome
     * follows the player on x/z, so it is never approached.
     */
    RADIUS: 450,
    /** Sphere tessellation. One draw call; the shell only needs to be round. */
    WIDTH_SEGMENTS: 48,
    HEIGHT_SEGMENTS: 24,
    /**
     * Draw order: before (behind) every default-order object. Paired with
     * depthWrite:false so the whole world overdraws the dome.
     */
    RENDER_ORDER: -1,
    /**
     * Room hard-swap flicker length (frames): the dome blinks off/on/off
     * across this many frames when the treatment swaps, then settles visible
     * — a 1-bit stutter, deliberately frame-counted (not time-based) so it
     * stays a barely-there glitch at any frame rate. Odd counts end hidden
     * -> settle visible (see world/RoomSky.swapFlickerVisible).
     */
    SWAP_FLICKER_FRAMES: 3,
    // ===== INFO_OVERFLOW: sparse static specks =====
    /** Lat/long speck-grid cells around the dome equator. */
    SPECK_GRID: 96,
    /** Fraction of grid cells hosting a speck (sparse — signal, not snow). */
    SPECK_FILL: 0.07,
    /** Speck edge as a fraction of its cell (small hard squares). */
    SPECK_SIZE: 0.3,
    /** Blink cycles per second (hard on/off phase, hash-desynced per cell). */
    SPECK_BLINK_SPEED: 0.8,
    // ===== FORCED_ALIGNMENT: horizontal ledger rule-lines =====
    /** Rule-lines from horizon to zenith (even angular spacing). */
    LINE_COUNT: 14,
    /** Lit fraction of each line period (thin hard rules). */
    LINE_THICKNESS: 0.06,
    // ===== IN_BETWEEN: two misregistered celestial discs =====
    /** Ink disc center: azimuth / elevation (rad above the horizon). */
    DISC_AZIMUTH: 0.7,
    DISC_ELEVATION: 0.62,
    /** Angular radius (rad) of each disc. */
    DISC_ANGULAR_RADIUS: 0.085,
    /** Paper disc misregister offset (rad) — a heaven printed off-plate. */
    DISC_OFFSET_AZIMUTH: 0.05,
    DISC_OFFSET_ELEVATION: 0.02,
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
 * First-person view-model framing (visual-stability fix): the two hands and
 * the held flower are children of the camera at fixed camera-space offsets,
 * but the camera FOV is a fixed VERTICAL 80° and only `camera.aspect` changes
 * on resize. With fixed offsets the on-screen x of a child = x / (|z| *
 * tan(vFov/2) * aspect), so a narrowing window (resizable PWA, phone portrait)
 * drifts the hands+flower off the side and clips them. Instead each hand is
 * anchored in NDC (screen-space) and its camera-space position is recomputed
 * every frame from the live aspect (player/viewmodelLayout.ndcToCameraSpace),
 * keeping it at exactly its anchor for ANY aspect — stable by construction.
 *
 * The reference anchors below are DERIVED from today's fixed offsets at the
 * 16:9 framing (vFov=80, aspect=16/9), so desktop reproduces the current look
 * to within 1e-2 (tests/ViewmodelLayout.test.ts is the regression guard):
 *   RIGHT: (0.6, -0.7, z=-0.90) -> ndc (0.44691, -0.92692)
 *   LEFT:  (-0.55, -0.6, z=-0.85) -> ndc (-0.43377, -0.84122)
 */
export const VIEWMODEL = {
    /** Vertical FOV (deg) the anchors were derived at — must equal CAMERA.FOV_DEGREES. */
    REFERENCE_FOV_DEGREES: 80,
    /** Aspect the anchors were derived at (16:9), documented for the regression test. */
    REFERENCE_ASPECT: 16 / 9,
    /**
     * Per-hand screen-space anchor: ndcX/ndcY in [-1,1] (the stable on-screen
     * position), z the camera-space depth (negative = in front). The hand's
     * local x/y are recomputed each frame from these + the live aspect.
     */
    LEFT_HAND: { ndcX: -0.43377, ndcY: -0.84122, z: -0.85 },
    RIGHT_HAND: { ndcX: 0.44691, ndcY: -0.92692, z: -0.90 },
    /**
     * Flower "recompose" on narrow aspect: as aspect drops from START_ASPECT
     * (no change) toward FULL_ASPECT (full effect) the flower scales up toward
     * MAX_SCALE_MULT so it stays readable while the hands shrink (see
     * HAND_SCALE). The center-nudge is DISABLED (MAX_CENTER_FRACTION 0): pulling
     * the flower toward screen-center dragged it off the right hand into the
     * middle and piled it onto the (then-overlapping) hands on phone portrait.
     * The flower now stays held in the right hand; HAND_SCALE fixes the squish.
     */
    FLOWER_RECOMPOSE: {
        /** Aspect at/above which the flower is untouched (1.0 = square). */
        START_ASPECT: 1.0,
        /** Aspect at/below which the recompose is fully applied (~tall portrait). */
        FULL_ASPECT: 0.5,
        /** Max fraction of the right hand's camera-space x to cancel (pull to center). 0 = disabled. */
        MAX_CENTER_FRACTION: 0,
        /** Max uniform scale multiplier of the flower at full recompose. */
        MAX_SCALE_MULT: 1.25,
    },
    /**
     * Narrow-aspect hand downscale (phone-portrait squish fix). The camera FOV
     * is a fixed VERTICAL 80°, so a narrow (portrait) viewport shrinks the
     * HORIZONTAL FOV and magnifies the fixed-size hand meshes horizontally
     * (~2.4× at phone portrait) until the two hands overlap in the centre.
     * Scaling each hand by aspect / REFERENCE_ASPECT (clamped to [MIN, 1])
     * neutralises that horizontal magnification — at/above REFERENCE_ASPECT the
     * scale is 1 (desktop unchanged); narrower viewports shrink toward MIN.
     * Applied to the hand MESH only, not the anchor position, so the on-screen
     * separation is preserved.
     */
    HAND_SCALE: {
        /** Floor for the per-hand scale so hands never vanish on extreme aspects. Tune on device. */
        MIN: 0.3,
    },
    /**
     * Safe-area lift: on devices with a bottom inset (phone home indicator)
     * the whole hands group is lifted by the NDC-equivalent of the inset so
     * the hands/flower are not hidden under it. The CSS var --sab (set to
     * env(safe-area-inset-bottom) in styles/main.css) is read each frame and
     * degrades to 0 where unavailable. The lift is applied at the right hand's
     * depth so it reads consistently with the lower (closest-to-edge) prop.
     */
    SAFE_AREA: {
        /** Camera-space depth (negative) the inset lift is computed at. */
        LIFT_DEPTH: -0.90,
        /** CSS custom property holding the bottom inset (px). */
        CSS_VAR: '--sab',
    },
} as const;

/**
 * IN_BETWEEN viewmodel misregister echo (scene-style batch): the room that
 * cannot resolve you prints you twice. Only while the current room is
 * IN_BETWEEN, the first-person viewmodel (hands + held flower) gains a
 * second, misregistered image — the hands re-read as solid ink, the flower
 * as bare paper wireframe — offset a few centimeters on the page like a
 * duotone plate that missed registration. Two systems each read you once;
 * they disagree. Hard on/off with a frame-counted flicker on room change
 * (the batch's swap language, ROOM_SKY.SWAP_FLICKER_FRAMES); the echo shares
 * the source geometries and mirrors the pose pairwise each frame
 * (player/ViewmodelEcho).
 */
export const VIEWMODEL_ECHO = {
    /**
     * Camera-local offset (m) of the echo at VIEWMODEL.REFERENCE_ASPECT. The
     * x component is rescaled by aspect / REFERENCE_ASPECT each frame
     * (misregisterOffsetX) so the ON-SCREEN offset is aspect-stable —
     * misregistration is a property of the page, not of the world. y needs
     * no compensation (the vertical FOV is fixed; only aspect changes).
     */
    OFFSET_X: 0.035,
    OFFSET_Y: 0.018,
    /**
     * Depth pushback (m, negative = deeper in front of the camera): overlap
     * regions lose the depth test against the source cleanly, so the echo
     * peeks out around the silhouette instead of z-fighting through it.
     */
    OFFSET_Z: -0.02,
    /**
     * Room hard-swap flicker length (frames), same language as
     * ROOM_SKY.SWAP_FLICKER_FRAMES: frame-counted (not time-based) so it
     * stays a barely-there stutter at any frame rate, and odd so the
     * countdown ends hidden and the settle frame reads as the swap landing.
     */
    FLICKER_FRAMES: 3,
    /**
     * Drawn after the default-order opaque pass (world + source hands have
     * written depth) and before the sky eye's authority overlay (999).
     * Paired with depthWrite:false on both echo materials: the echo can only
     * appear where it peeks out from behind the source, and can never punch
     * holes into the source's transparent pass (petals/sepals).
     */
    RENDER_ORDER: 1,
    /** Ink plate: the system that reads your body as solid mass. */
    INK_COLOR: 0x000000,
    /** Paper plate: the system that reads your desire as bare structure. */
    PAPER_COLOR: 0xFFFFFF,
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
    /**
     * Frame-delta clamp (s) for the render loop (core/FrameClock): avoids
     * huge physics/animation steps after a stall or tab switch (M1).
     */
    MAX_FRAME_DELTA: 0.1,
} as const;
