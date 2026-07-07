// 1-bit Chimera Void - Distant Silhouette Figures (F3 "you are not alone")
//
// Far-off 1-bit human silhouettes scattered through the ruins: everyone here
// is suppressing the same light. They are distant narrative scenery, NOT
// NPCs — no interaction, no collision, and they never approach the player.
//
// Archetypes (per-room knobs in RoomConfig.ROOM_FIGURE_DENSITY / FA_FIGURE_PLACEMENT,
// behavior timings in config FIGURES):
// - CONFORMIST (default): sways in place, chest flower-light breathing
//   0.15-0.3; when the player gazes at the sky eye (global discipline) or
//   blazes the flower >0.7 within 25m, the light presses down to 0.05 over
//   ~1.5s — your kin bow their heads around you. The flower is a full social
//   dial: too dim is loneliness, too bright bows them, and only the MIDDLE
//   band resonates — hold it in [0.3, 0.6] for a few seconds and nearby kin
//   converge their breathing onto a shared cadence and lift their light
//   (config FIGURES.RESONANCE_*). Press-down always wins over resonance.
// - ALIGNED (FORCED_ALIGNMENT): stands rigid outside the rift's clearance,
//   facing the crack — tidy ranks on the LEFT, scattered on the RIGHT.
// - MISREAD (IN_BETWEEN): low-frequency flicker between two render parameter
//   sets (solid ink vs wireframe, both shared assets) — read differently by
//   both systems; the room's z-fight language at figure scale.
// - REBEL event (rare): hash+time gated (at most once every few minutes,
//   only 30-60m out). A figure's light surges to full over ~2s, the body
//   glitch-strobes (the GLITCH weather language localized), then it vanishes
//   for the session — accompanied by a distant tear (playDistantTear),
//   volume falling off with distance. Rebellion is contagious: a SUCCESSFUL
//   player override opens a session-level contagion window (config FIGURES.
//   REBEL_CONTAGION_*) during which the arming gate drains markedly faster,
//   so distant kin rebel more often in the minutes after you resisted.
//
// ECLIPSE (weather batch): while the authority's disc transits, every
// standing figure in the active window turns its face to the sky — a hard
// body pitch + chest-light lift (ECLIPSE_FIGURES), never eased. EXCEPTION:
// if the player's flower burns loud enough, figures within a radius turn to
// the PLAYER instead — in the darkness your light is the loudest thing in
// the world. Priority is ONE pure ladder (figureAttitude): press-down
// suppression > eclipse facing > gale lean > forewarn facing > resonance >
// idle sway.
//
// WEATHER OMENS (weather batch, "the world reacts"): under a GALE the
// swaying kin lean INTO the wind — a small body tilt (pitch + roll from the
// wind heading vs the figure's facing) composed with the existing sway,
// scaling with the live storm intensity and gone the moment it ends. While
// the sky has DRAWN the next storm (WeatherState.forewarn), kin turn to face
// where it will come from, the turn scaling with the ramp — the world knows
// before you do. Both omens ride the SAME attitude ladder and pose machine
// as the eclipse (one decision point, one restore path); ALIGNED figures
// take neither (the ranks do not bend, even in the wind).
//
// Witnesses at the scars (F3 x F2): the scar field says "the system remembers
// you resisted" by leaning the buildings; this adds "others remember too". When
// a chunk lies within reach of a boot-snapshot scar, a config fraction
// (SCAR_WITNESS.FRACTION) of its figures are pulled OUT of their scattered pose
// onto a tight ring around the nearest scar anchor, each turned to FACE it — a
// silent crowd gathered at the place you resisted. Archetypes are unchanged;
// only the position/facing is redrawn (deterministic per chunk given the frozen
// boot scar list).
//
// Lifecycle follows the SAME active chunk window as ChunkManager (figure
// placement is per-chunk deterministic via the project hash, so re-entering
// a chunk regenerates the same figures, minus the session's vanished
// rebels). Geometry and body materials are shared singletons (SharedAssets);
// only the tiny chest-light material is cloned per figure (it needs an
// independent intensity) and disposed with its chunk. All animation is
// delta-driven, hash-phase desynced, and LOD-gated by
// WORLD.ANIMATION_LOD_DISTANCE (distant figures stand perfectly still).

import type { ScarPoint } from './ScarField';
import * as THREE from 'three';
import { ECLIPSE_FIGURES, FIGURES, SCAR_WITNESS, WEATHER_REACTIONS, WORLD } from '../config/constants';
import { hash } from '../utils/hash';
import { FA_FIGURE_PLACEMENT, faSideAxisX, riftLineXForWorldX, ROOM_FIGURE_DENSITY, RoomType } from './RoomConfig';
import { scarsNearChunk } from './ScarField';
import { getSharedAssets } from './SharedAssets';

// ===========================================================================
// Pure placement / behavior logic (unit-tested in tests/FigureSystem.test.ts)
// ===========================================================================

/** The three standing archetypes. Rebellion is an EVENT, not an archetype. */
export type FigureArchetype = 'CONFORMIST' | 'ALIGNED' | 'MISREAD';

export interface FigurePlacement {
    /** Chunk-local x/z (the chunk group sits on cx*CHUNK_SIZE, cz*CHUNK_SIZE). */
    x: number;
    z: number;
    /** Facing (radians around y); the figure's chest light faces local +z. */
    rotationY: number;
    archetype: FigureArchetype;
    /** Total silhouette height (m), in [FIGURES.HEIGHT_MIN, HEIGHT_MAX]. */
    height: number;
    /** Animation desync phase in [0, 2π). */
    phase: number;
}

// Distinct integer salts, decorrelated from every prior per-chunk draw
// (ChunkManager's salts top out at 1019, ScarField's at 1153).
const FIGURE_HOST_SALT = 1201;
const FIGURE_SECOND_SALT = 1213;
const FIGURE_X_SALT = 1217;
const FIGURE_Z_SALT = 1223;
const FIGURE_ROT_SALT = 1229;
const FIGURE_HEIGHT_SALT = 1231;
const FIGURE_PHASE_SALT = 1237;
const REBEL_DELAY_SALT = 1249;
const REBEL_PICK_SALT = 1259;
const REBEL_JITTER_SALT = 1277;
// Scar-witness redraw salts, decorrelated from every prior per-chunk draw
// (ChunkManager <= 1019, ScarField <= 1153, the figure draws above <= 1277).
const WITNESS_GATE_SALT = 1283;
const WITNESS_RING_SALT = 1289;
const WITNESS_ANGLE_SALT = 1291;

// Silhouette proportions as fractions of the figure height — module-local
// aesthetic constants (precedent: ChunkManager's anomaly scales). The shapes
// are deliberately minimal (cylinder torso + sphere head) so the silhouette
// stays readable after dithering, and the materials are the same family the
// buildings use, keeping the duotone/dither pipeline uniform. Exported as one
// object so the F4 ghost (world/GhostSystem) reuses the EXACT same body.
export const SILHOUETTE = {
    BODY_RADIUS_FRAC: 0.11,
    BODY_HEIGHT_FRAC: 0.82,
    HEAD_RADIUS_FRAC: 0.09,
    CHEST_HEIGHT_FRAC: 0.62,
    /** Chest flower-light quad edge length (m). */
    CHEST_LIGHT_SIZE: 0.14,
} as const;
const { BODY_RADIUS_FRAC, BODY_HEIGHT_FRAC, HEAD_RADIUS_FRAC, CHEST_HEIGHT_FRAC, CHEST_LIGHT_SIZE }
    = SILHOUETTE;

/** Squared animation LOD threshold (matches the building animation gate). */
const LOD_DISTANCE_SQ = WORLD.ANIMATION_LOD_DISTANCE * WORLD.ANIMATION_LOD_DISTANCE;

/**
 * Storm response (weather presence): the figures' glitch-flicker clock runs
 * (1 + weatherIntensity * gain)x faster while weather rages, so the MISREAD
 * swap and the rebel strobe shimmer harder under a storm. Intensity 0
 * reproduces the calm cadence exactly.
 */
const WEATHER_FLICKER_GAIN = 1;

/**
 * Deterministic figure count for a chunk: 0, 1 or 2, drawn against the
 * room's density knobs (RoomConfig.ROOM_FIGURE_DENSITY). The host gate and
 * the second-figure gate use decorrelated hash draws, and the draws are
 * room-independent — so a denser room's count dominates a sparser room's
 * pointwise (INFO_OVERFLOW >= IN_BETWEEN >= POLARIZED on every chunk). Pure.
 */
export function figureCountForChunk(cx: number, cz: number, roomType: RoomType): number {
    const density = ROOM_FIGURE_DENSITY[roomType];
    if (hash(cx + FIGURE_HOST_SALT, cz - FIGURE_HOST_SALT) >= density.host)
        return 0;
    return hash(cz + FIGURE_SECOND_SALT, cx + FIGURE_SECOND_SALT) < density.second ? 2 : 1;
}

/**
 * FORCED_ALIGNMENT pose: outside the chunk's own crack ±CRACK_CLEARANCE,
 * facing the crack. The PHYSICAL crack runs through every FA chunk's center
 * (riftLineXForWorldX → chunk-local x = 0); the side TREATMENT follows the
 * room's SEMANTIC axis (faSideAxisX, the cluster center — siding is about
 * the room, not the nearest crack): chunks west of the axis stand in a tidy
 * rank — one shared distance west of their crack, z snapped to the ROW_SNAP
 * grid (distinct cells for the chunk's two figures), exact +x facing toward
 * crack and axis; chunks east of it scatter in a band east of their crack
 * with untidy -x facing. Everyone still faces a rift.
 */
function placeAligned(
    cx: number,
    cz: number,
    k: number,
    chunkSize: number,
): { x: number; z: number; rotationY: number } {
    // Chunk-local x of the chunk's own crack — identically 0 on the regular
    // path; derived so the figures stay pinned to the physical-crack source.
    const crackLocalX = riftLineXForWorldX(cx * chunkSize, chunkSize) - cx * chunkSize;
    // Semantic side: chunk centers never sit ON the axis (it lies on the
    // seam between the cluster's columns), so the comparison is exact.
    const isTidyLeft = cx * chunkSize < faSideAxisX(cx * chunkSize, chunkSize);
    const { CRACK_CLEARANCE, ROW_DISTANCE, ROW_SNAP, SCATTER_DEPTH, SCATTER_FACING_JITTER }
        = FA_FIGURE_PLACEMENT;

    if (isTidyLeft) {
        // Tidy LEFT: a single rank line west of the crack, grid-snapped z,
        // exact crack-facing.
        const cells = Math.floor((chunkSize - 20) / ROW_SNAP);
        const baseIdx = Math.floor(hash(cx + FIGURE_Z_SALT, cz - FIGURE_Z_SALT) * cells);
        const zIdx = (baseIdx + k * 3) % cells; // distinct cells for k=0,1
        return {
            x: crackLocalX - ROW_DISTANCE,
            z: (zIdx - (cells - 1) / 2) * ROW_SNAP,
            rotationY: Math.PI / 2, // local +z forward -> world +x: the crack
        };
    }

    // Broken RIGHT: scattered depth and z east of the crack, facing roughly
    // the crack (-x).
    return {
        x: crackLocalX + CRACK_CLEARANCE
            + hash(cx - k + FIGURE_X_SALT, cz + k + FIGURE_X_SALT) * SCATTER_DEPTH,
        z: (hash(cz + k + FIGURE_Z_SALT, cx - k - FIGURE_Z_SALT) - 0.5) * (chunkSize - 20),
        rotationY: -Math.PI / 2
            + (hash(cx + k + FIGURE_ROT_SALT, cz - k + FIGURE_ROT_SALT) - 0.5) * 2 * SCATTER_FACING_JITTER,
    };
}

/** Free-standing pose for the non-FA rooms: scattered position and facing. */
function placeFree(
    cx: number,
    cz: number,
    k: number,
    chunkSize: number,
): { x: number; z: number; rotationY: number } {
    return {
        x: (hash(cx + k * 7 + FIGURE_X_SALT, cz - k + FIGURE_X_SALT) - 0.5) * (chunkSize - 16),
        z: (hash(cz + k * 7 + FIGURE_Z_SALT, cx + k + FIGURE_Z_SALT) - 0.5) * (chunkSize - 16),
        rotationY: hash(cx - k + FIGURE_ROT_SALT, cz + k * 7 + FIGURE_ROT_SALT) * Math.PI * 2,
    };
}

/**
 * Whether figure `k` of chunk (cx, cz) is drawn as a scar witness — pulled to
 * the nearest reachable scar. A single decorrelated hash gate against
 * SCAR_WITNESS.FRACTION, independent of the count/pose/height draws so the
 * choice never correlates with them. Pure.
 */
export function isScarWitness(cx: number, cz: number, k: number): boolean {
    return hash(cx + k + WITNESS_GATE_SALT, cz - k - WITNESS_GATE_SALT) < SCAR_WITNESS.FRACTION;
}

/** Nearest scar to a world position among `scars`; null when the list is empty. */
function nearestScar(scars: readonly ScarPoint[], worldX: number, worldZ: number): ScarPoint | null {
    let best: ScarPoint | null = null;
    let bestSq = Infinity;
    for (const scar of scars) {
        const dx = scar.x - worldX;
        const dz = scar.z - worldZ;
        const d = dx * dx + dz * dz;
        if (d < bestSq) {
            bestSq = d;
            best = scar;
        }
    }
    return best;
}

/**
 * Chunk-local pose for a witness figure: stand on a hash-drawn ring
 * (SCAR_WITNESS.RING_MIN..RING_MAX) around the scar's world anchor and face it
 * (local +z aimed at the scar — the convention placeAligned relies on, where
 * local +z maps to world (sin rotY, cos rotY)). Deterministic per (chunk, k).
 * Pure; exported for testing.
 */
export function witnessPose(
    scar: ScarPoint,
    cx: number,
    cz: number,
    k: number,
    chunkSize: number,
): { x: number; z: number; rotationY: number } {
    const { RING_MIN, RING_MAX } = SCAR_WITNESS;
    const radius = RING_MIN
        + hash(cx + k + WITNESS_RING_SALT, cz - k + WITNESS_RING_SALT) * (RING_MAX - RING_MIN);
    const angle = hash(cx - k + WITNESS_ANGLE_SALT, cz + k + WITNESS_ANGLE_SALT) * Math.PI * 2;
    const worldX = scar.x + Math.cos(angle) * radius;
    const worldZ = scar.z + Math.sin(angle) * radius;
    return {
        x: worldX - cx * chunkSize,
        z: worldZ - cz * chunkSize,
        // Face the scar anchor: local +z -> world (sin rotY, cos rotY).
        rotationY: Math.atan2(scar.x - worldX, scar.z - worldZ),
    };
}

/**
 * Deterministic figure placements for a chunk: count via the room density
 * gates, pose per archetype (FORCED_ALIGNMENT gets the rift-rank treatment),
 * plus hash-drawn height and desync phase. Pure; the system regenerates the
 * exact same list every time the chunk re-enters the active window.
 *
 * When `scars` is non-empty (the boot-snapshot scars reaching this chunk), a
 * SCAR_WITNESS.FRACTION share of the figures are pulled onto a ring around the
 * nearest scar and turned to face it — the crowd gathered where you resisted.
 * Archetypes stay as originally assigned. An empty `scars` (the default)
 * reproduces the pre-witness placement bit-for-bit.
 */
export function figurePlacementsForChunk(
    cx: number,
    cz: number,
    roomType: RoomType,
    chunkSize: number = WORLD.CHUNK_SIZE,
    scars: readonly ScarPoint[] = [],
): FigurePlacement[] {
    const count = figureCountForChunk(cx, cz, roomType);
    const placements: FigurePlacement[] = [];
    for (let k = 0; k < count; k++) {
        const archetype: FigureArchetype = roomType === RoomType.FORCED_ALIGNMENT
            ? 'ALIGNED'
            : roomType === RoomType.IN_BETWEEN ? 'MISREAD' : 'CONFORMIST';
        let pose = archetype === 'ALIGNED'
            ? placeAligned(cx, cz, k, chunkSize)
            : placeFree(cx, cz, k, chunkSize);

        // Witness: pull the chosen share to the nearest reachable scar, facing
        // it. Uses the figure's original scattered world position to pick the
        // nearest scar, so different figures can gather at different scars.
        if (scars.length > 0 && isScarWitness(cx, cz, k)) {
            const scar = nearestScar(scars, cx * chunkSize + pose.x, cz * chunkSize + pose.z);
            if (scar)
                pose = witnessPose(scar, cx, cz, k, chunkSize);
        }

        placements.push({
            ...pose,
            archetype,
            height: FIGURES.HEIGHT_MIN
                + hash(cx + k + FIGURE_HEIGHT_SALT, cz - k + FIGURE_HEIGHT_SALT)
                * (FIGURES.HEIGHT_MAX - FIGURES.HEIGHT_MIN),
            phase: hash(cx - k + FIGURE_PHASE_SALT, cz + k + FIGURE_PHASE_SALT) * Math.PI * 2,
        });
    }
    return placements;
}

/**
 * Conformist chest-light breathing with a resonance lift: a slow sine whose
 * FLOOR stays at LIGHT_BREATHE_MIN while its PEAK rises from LIGHT_BREATHE_MAX
 * (resonance 0, the lonely default) to RESONANCE_LIGHT_MAX (resonance 1, the
 * kin lit up together). Desynced per figure by `phase`. Pure, per-frame safe.
 */
export function resonantBreathe(clock: number, phase: number, resonance: number): number {
    const { LIGHT_BREATHE_MIN, LIGHT_BREATHE_MAX, RESONANCE_LIGHT_MAX, LIGHT_BREATHE_SPEED } = FIGURES;
    const r = Math.max(0, Math.min(1, resonance));
    const peak = LIGHT_BREATHE_MAX + (RESONANCE_LIGHT_MAX - LIGHT_BREATHE_MAX) * r;
    const mid = (LIGHT_BREATHE_MIN + peak) / 2;
    const amp = (peak - LIGHT_BREATHE_MIN) / 2;
    return mid + Math.sin(clock * LIGHT_BREATHE_SPEED + phase) * amp;
}

/**
 * Plain conformist breathing (no resonance) — the baseline band. Pure.
 */
export function breatheLight(clock: number, phase: number): number {
    return resonantBreathe(clock, phase, 0);
}

// ---------------------------------------------------------------------------
// Flower resonance: the mid-band social instrument (F3). All pure, all tested.
// ---------------------------------------------------------------------------

/**
 * Player-level resonance arming state: whether the flower currently READS as
 * inside the mid band (hysteretic — depends on the previous read) and how long
 * it has stayed there continuously. Owned by the system, threaded frame to
 * frame; a small plain object so the update stays allocation-conscious.
 */
export interface ResonanceArm {
    inBand: boolean;
    /** Continuous seconds in-band, capped at RESONANCE_ARM_SECONDS. */
    armTimer: number;
}

/**
 * Hysteretic band test: to ENTER resonance the flower must sit strictly inside
 * [RESONANCE_BAND_MIN, RESONANCE_BAND_MAX]; once inside, the band widens by
 * RESONANCE_BAND_HYSTERESIS on both edges, so a flower resting on an edge does
 * not chatter armed/unarmed. Pure.
 */
export function resonanceInBand(flowerIntensity: number, wasInBand: boolean): boolean {
    const { RESONANCE_BAND_MIN, RESONANCE_BAND_MAX, RESONANCE_BAND_HYSTERESIS } = FIGURES;
    const margin = wasInBand ? RESONANCE_BAND_HYSTERESIS : 0;
    return flowerIntensity >= RESONANCE_BAND_MIN - margin
        && flowerIntensity <= RESONANCE_BAND_MAX + margin;
}

/**
 * Advance the arming state one frame. Gazing (ambient discipline) or a flower
 * outside the hysteretic band resets the timer to 0 — resonance must be earned
 * fresh. In-band time accumulates and caps at RESONANCE_ARM_SECONDS. Mutates
 * `prev` in place and returns it (allocation-free on the per-frame path, called
 * once per frame from animateFigures); the two fields it writes are the whole
 * state, so callers can keep reassigning `state = updateResonanceArm(state, …)`.
 */
export function updateResonanceArm(
    prev: ResonanceArm,
    flowerIntensity: number,
    isGazing: boolean,
    delta: number,
): ResonanceArm {
    const inBand = !isGazing && resonanceInBand(flowerIntensity, prev.inBand);
    prev.armTimer = inBand
        ? Math.min(FIGURES.RESONANCE_ARM_SECONDS, prev.armTimer + Math.max(0, delta))
        : 0;
    prev.inBand = inBand;
    return prev;
}

/** Whether the arming timer has reached the sustained threshold. Pure. */
export function resonanceArmed(state: ResonanceArm): boolean {
    return state.armTimer >= FIGURES.RESONANCE_ARM_SECONDS;
}

/**
 * The shared reference phase all resonating kin converge toward: a slow common
 * drift off the elapsed clock, wrapped to [0, 2π). Identical for every figure,
 * so once converged they breathe in unison. Pure.
 */
export function resonanceReferencePhase(clock: number): number {
    const twoPi = Math.PI * 2;
    const p = (clock * FIGURES.RESONANCE_REFERENCE_DRIFT) % twoPi;
    return p < 0 ? p + twoPi : p;
}

/**
 * Ease `current` toward `target` along the phase circle by the shortest arc,
 * approaching at `rate` per second (clamped so a large frame delta can never
 * overshoot). Result wrapped to [0, 2π). Pure — used both to converge onto the
 * shared reference and to relax back to a figure's personal hash phase.
 */
export function convergePhase(current: number, target: number, rate: number, delta: number): number {
    const twoPi = Math.PI * 2;
    let diff = (target - current) % twoPi;
    if (diff > Math.PI)
        diff -= twoPi;
    else if (diff < -Math.PI)
        diff += twoPi;
    const step = Math.max(0, Math.min(1, rate * delta));
    let next = (current + diff * step) % twoPi;
    if (next < 0)
        next += twoPi;
    return next;
}

/**
 * Whether the player's presence presses a conformist's light down: gazing
 * at the eye bows EVERY kin (the discipline is ambient), while a blazing
 * flower (> DIM_FLOWER_THRESHOLD) only presses those within
 * DIM_FLOWER_DISTANCE. Pure.
 */
export function conformistPressed(isGazing: boolean, playerFlower: number, distSq: number): boolean {
    if (isGazing)
        return true;
    const { DIM_FLOWER_THRESHOLD, DIM_FLOWER_DISTANCE } = FIGURES;
    return playerFlower > DIM_FLOWER_THRESHOLD
        && distSq < DIM_FLOWER_DISTANCE * DIM_FLOWER_DISTANCE;
}

// ---------------------------------------------------------------------------
// ECLIPSE attitude — the priority ladder (weather batch). All pure, tested.
// ---------------------------------------------------------------------------

/**
 * What leads a standing figure's expression this frame (figureAttitude).
 * The rungs below the leader keep their non-conflicting channels (sway keeps
 * swaying, MISREAD keeps flickering); the ladder resolves the channels that
 * DO conflict — the body's orientation and the breathing convergence.
 */
export type FigureAttitude
    = 'PRESSED' | 'ECLIPSE_FACE_PLAYER' | 'ECLIPSE_LOOK_UP'
        | 'GALE_LEAN' | 'FOREWARN_FACE' | 'RESONANCE' | 'IDLE';

/**
 * ECLIPSE exception gate: does the player's flower, at this distance, pull a
 * figure's upturned face down to the PLAYER instead of the sky? True when
 * the flower burns above ECLIPSE_FIGURES.FACE_PLAYER_FLOWER_THRESHOLD and
 * the figure stands within FACE_PLAYER_RADIUS — in the darkness your light
 * is the loudest thing in the world. Only consulted while the transit is
 * active (figureAttitude). Pure.
 */
export function eclipseFacesPlayer(flowerIntensity: number, distSq: number): boolean {
    const { FACE_PLAYER_FLOWER_THRESHOLD, FACE_PLAYER_RADIUS } = ECLIPSE_FIGURES;
    return flowerIntensity > FACE_PLAYER_FLOWER_THRESHOLD
        && distSq < FACE_PLAYER_RADIUS * FACE_PLAYER_RADIUS;
}

/**
 * THE priority ladder for a standing figure — the ONE decision point, top
 * rung first:
 *
 *   press-down suppression > eclipse facing > gale lean > forewarn facing
 *     > resonance > idle sway
 *
 * - PRESSED: the player's gaze / blazing flower bows the kin; a bowed head
 *   does not lift for the eclipse (suppression wins over everything).
 * - ECLIPSE_FACE_PLAYER / ECLIPSE_LOOK_UP: during the transit every figure
 *   turns its face to the sky — unless the player's flower burns loud
 *   enough nearby (eclipseFacesPlayer), in which case the figure turns to
 *   the PLAYER instead. Eclipse facing outranks resonance: kin do not
 *   converge cadence while the authority's shadow crosses.
 * - GALE_LEAN: the live storm physically outranks its announcement — a body
 *   braced against the wind is not also turning to scan the horizon.
 * - FOREWARN_FACE: the drawn-but-unbroken storm turns kin toward its
 *   heading, the turn scaling with the ramp.
 * - RESONANCE: the mid-band breathing convergence (armed + in press radius).
 * - IDLE: the hash-desynced sway/breathing baseline.
 *
 * `pressed` and `resonating` are mutually exclusive by construction (gazing
 * disarms resonance the same frame; the resonance band's outer edge sits
 * below DIM_FLOWER_THRESHOLD), so gating the resonance drive on RESONANCE is
 * bit-identical to the pre-ladder behavior for CLEAR/STATIC/RAIN/GLITCH.
 * The omen flags default false, so every pre-omen caller keeps its exact
 * behavior. Extensible: a later feature adds a rung by inserting its check
 * at the right height and a member to FigureAttitude. Pure.
 */
export function figureAttitude(
    pressed: boolean,
    eclipseActive: boolean,
    facesPlayer: boolean,
    resonating: boolean,
    galeLeaning: boolean = false,
    forewarnFacing: boolean = false,
): FigureAttitude {
    if (pressed)
        return 'PRESSED';
    if (eclipseActive)
        return facesPlayer ? 'ECLIPSE_FACE_PLAYER' : 'ECLIPSE_LOOK_UP';
    if (galeLeaning)
        return 'GALE_LEAN';
    if (forewarnFacing)
        return 'FOREWARN_FACE';
    if (resonating)
        return 'RESONANCE';
    return 'IDLE';
}

/**
 * Body PITCH (rotation.x, YXZ order) of a figure leaning INTO the wind:
 * the up-vector tilts upwind by `lean` radians; this is its fore/aft
 * component in the figure's own frame. Positive rotation.x tilts the body
 * toward local +z (forward), so wind blowing along the facing (rel = 0)
 * gives -lean — the figure braces backward, upwind. Pure.
 *
 * @param windDirectionRad - Heading the wind blows TOWARD ((sin, cos) azimuth).
 * @param yaw - The figure's resting facing (placement.rotationY).
 * @param lean - Tilt magnitude (rad), e.g. FIGURE_LEAN_RAD x strength.
 */
export function galeLeanPitch(windDirectionRad: number, yaw: number, lean: number): number {
    return -Math.cos(windDirectionRad - yaw) * lean;
}

/**
 * Body ROLL (rotation.z) component of the same upwind tilt — composed
 * ADDITIVELY with the idle sway (rotation.z = sway + leanRoll), so the kin
 * keep breathing while braced. Positive rotation.z tilts the up-vector
 * toward local -x, which is upwind when the wind blows from the figure's
 * right (rel = +90°). Pure.
 */
export function galeLeanRoll(windDirectionRad: number, yaw: number, lean: number): number {
    return Math.sin(windDirectionRad - yaw) * lean;
}

/**
 * Yaw of a figure turning to face the ANNOUNCED storm: the shortest-arc
 * blend from its resting facing toward upwind (the storm arrives from where
 * the wind will blow FROM — heading + π), the blend fraction being the
 * forewarn ramp itself. Ramp 0 keeps the rest yaw (mod 2π); ramp 1 faces
 * the storm square on. Reuses convergePhase's arc math with the ramp as a
 * one-shot step. Pure.
 */
export function forewarnFacingYaw(restYaw: number, windDirectionRad: number, ramp: number): number {
    const r = Math.max(0, Math.min(1, ramp));
    return convergePhase(restYaw, windDirectionRad + Math.PI, r, 1);
}

/**
 * Deterministic arming delay (s) before rebel event `eventIndex` may fire,
 * hash-drawn in [REBEL_MIN_INTERVAL, REBEL_MAX_INTERVAL] — a few minutes
 * apart at most once, never a per-frame random decision. Pure.
 */
export function rebelDelaySeconds(eventIndex: number): number {
    const { REBEL_MIN_INTERVAL, REBEL_MAX_INTERVAL } = FIGURES;
    return REBEL_MIN_INTERVAL
        + hash(eventIndex + REBEL_DELAY_SALT, eventIndex * 13 - REBEL_DELAY_SALT)
        * (REBEL_MAX_INTERVAL - REBEL_MIN_INTERVAL);
}

/**
 * Rebellion is contagious: advance the session-level contagion window one
 * frame. A SUCCESSFUL player override (`refresh` true this frame — the same
 * resist event that scars the world) reopens the window to the full
 * REBEL_CONTAGION_WINDOW; otherwise it drains by delta toward 0. Clamped to
 * [0, WINDOW]. Pure — the window state is threaded frame to frame by the
 * caller. Your resistance is not an isolated keypress: it licenses others.
 */
export function contagionWindowTick(remaining: number, delta: number, refresh: boolean): number {
    if (refresh)
        return FIGURES.REBEL_CONTAGION_WINDOW;
    return Math.max(0, remaining - Math.max(0, delta));
}

/**
 * Drain the rebel arming gate one frame. While the contagion window is open
 * the countdown runs REBEL_CONTAGION_GATE_DIVISOR times faster, so the
 * effective arming interval is divided by that factor and distant figures
 * rebel more often in the minutes after a successful override. The picks and
 * distances stay hash-deterministic; only the WAIT shortens (deterministic
 * given the same window-state trajectory). Clamped at 0. Pure.
 */
export function stepRebelArmTimer(armTimer: number, delta: number, contagionActive: boolean): number {
    const rate = contagionActive ? FIGURES.REBEL_CONTAGION_GATE_DIVISOR : 1;
    return Math.max(0, armTimer - Math.max(0, delta) * rate);
}

/**
 * Deterministic candidate pick for rebel event `eventIndex` among
 * `candidateCount` eligible figures (callers sort candidates by stable id
 * first). Returns -1 when there is no candidate. Pure.
 */
export function pickRebelIndex(eventIndex: number, candidateCount: number): number {
    if (candidateCount <= 0)
        return -1;
    const draw = hash(eventIndex + REBEL_PICK_SALT, eventIndex * 31 + REBEL_PICK_SALT);
    return Math.min(candidateCount - 1, Math.floor(draw * candidateCount));
}

/** Whether a squared distance falls in the rebel trigger band (30-60m). Pure. */
export function isInRebelRange(distSq: number): boolean {
    const { REBEL_MIN_DISTANCE, REBEL_MAX_DISTANCE } = FIGURES;
    return distSq >= REBEL_MIN_DISTANCE * REBEL_MIN_DISTANCE
        && distSq <= REBEL_MAX_DISTANCE * REBEL_MAX_DISTANCE;
}

/**
 * Tear-volume proximity in [0,1] for a rebel trigger distance: 1 at the
 * closest possible trigger (REBEL_MIN_DISTANCE), 0 at the farthest. Pure.
 */
export function rebelTearProximity(distSq: number): number {
    const { REBEL_MIN_DISTANCE, REBEL_MAX_DISTANCE } = FIGURES;
    const t = (Math.sqrt(distSq) - REBEL_MIN_DISTANCE) / (REBEL_MAX_DISTANCE - REBEL_MIN_DISTANCE);
    return 1 - Math.max(0, Math.min(1, t));
}

// ===========================================================================
// The system
// ===========================================================================

/**
 * Room-attribution surface (ChunkManager satisfies structurally via its
 * ledger-backed getRoomTypeForChunk), so figures always agree with the
 * GENERATED world — F1 behavior bias included.
 */
export interface FigureRoomSource {
    getRoomTypeForChunk: (cx: number, cz: number) => RoomType;
}

/** The slice of PlayerState the figures react to (satisfied structurally). */
export interface FigurePlayerRead {
    isGazing: boolean;
    flowerIntensity: number;
}

/** Distant-tear sink (AudioController satisfies structurally). */
export interface FigureAudio {
    playDistantTear: (proximity: number) => void;
}

type FigureState = 'IDLE' | 'SURGE' | 'FLICKER' | 'VANISHED';

interface FigureRecord {
    /** Stable identity "cx,cz:k" — the session vanish list keys on this. */
    id: string;
    group: THREE.Group;
    body: THREE.Mesh;
    head: THREE.Mesh;
    /** Per-figure chest-light material clone (independent intensity). */
    chestMat: THREE.MeshBasicMaterial;
    /** Chest-light quad — the lift target of the eclipse look-up pose. */
    chest: THREE.Mesh;
    /** Resting chest-light height (m), restored when the eclipse pose drops. */
    chestBaseY: number;
    /**
     * Attitude pose currently written to the transforms (write-on-change for
     * the discrete channels): the eclipse poses plus the weather omens —
     * LEAN (gale) and FACE_STORM (forewarn) track continuously while held.
     */
    pose: 'NONE' | 'UP' | 'PLAYER' | 'LEAN' | 'FACE_STORM';
    /**
     * Gale-lean roll component (rad), composed additively with the idle sway
     * (rotation.z = sway + leanRoll). 0 whenever the LEAN pose is not held —
     * the calm sway math is bit-identical.
     */
    leanRoll: number;
    /** Precomputed world position (figures never move) for distance checks. */
    worldPos: THREE.Vector3;
    placement: FigurePlacement;
    /** Conformist bow level 0-1 (1 = pressed to the dim floor). */
    press: number;
    /**
     * Live breathing phase — starts at the personal hash phase and, while the
     * player resonates nearby, converges toward the shared reference; relaxes
     * back to the personal phase (placement.phase) once resonance ends.
     */
    livePhase: number;
    /** Resonance strength 0-1: eases in/out and lifts the breathing peak. */
    resonance: number;
    light: number;
    misreadWire: boolean;
    state: FigureState;
    rebelTimer: number;
    surgeFrom: number;
    tearProximity: number;
    /** Chunk-local resting x (the glitch strobe dislocates around it). */
    baseX: number;
}

interface ChunkFigures {
    /** Chunk-anchored group; null when the chunk hosts no figures. */
    group: THREE.Group | null;
    figures: FigureRecord[];
}

/**
 * Distant silhouette figures. Owns its own chunk-window lifecycle (the same
 * grid math as ChunkManager.update), per-chunk deterministic placement, the
 * idle behaviors, and the rare rebel events. update() is driven by
 * RoomFlowUpdater AFTER the room flow, so the chunk grid and the room
 * ledger's cluster pins are already settled for this frame.
 */
export class FigureSystem {
    private readonly root = new THREE.Group();
    private readonly assets = getSharedAssets();
    // Owned (non-shared) GPU resources: the chest-light quad geometry and the
    // base material figures clone from. Freed once in dispose().
    private readonly chestGeo = new THREE.PlaneGeometry(CHEST_LIGHT_SIZE, CHEST_LIGHT_SIZE);
    private readonly chestBaseMat: THREE.MeshBasicMaterial;

    private chunks: Record<string, ChunkFigures> = {};
    /** Figures that rebelled and vanished — never respawned this session. */
    private readonly vanishedIds = new Set<string>();
    /** Reused candidate buffer (no per-frame allocation while armed). */
    private readonly candidateScratch: FigureRecord[] = [];

    /** Accumulated play-time clock (s) — delta-driven, frozen while paused. */
    private clock = 0;
    /**
     * Flicker clock (s): the play-time clock accelerated by the current
     * weather intensity (WEATHER_FLICKER_GAIN) — drives the MISREAD flicker
     * and the rebel glitch strobe only; sway/breathing stay on `clock`.
     */
    private flickerClock = 0;
    private lastCx: number | null = null;
    private lastCz = 0;

    private rebelEventIndex = 0;
    private rebelArmTimer: number;
    private activeRebel: FigureRecord | null = null;

    /** Player-level flower-resonance arming, threaded frame to frame. */
    private resonanceArm: ResonanceArm = { inBand: false, armTimer: 0 };

    /**
     * Whether the ECLIPSE transit is active this frame (threaded by
     * RoomFlowUpdater from the weather broadcast — one frame stale by
     * design, the same staleness as weatherIntensity above it).
     */
    private eclipseActive = false;

    /**
     * Weather omens (threaded by RoomFlowUpdater from the same one-frame-
     * stale broadcast): live GALE strength in [0,1] (kin lean into the
     * wind), the forewarn ramp in [0,1] (kin turn toward the drawn storm),
     * and the shared event heading both read. All 0 in calm — the omen
     * rungs of the attitude ladder never fire and behavior is bit-identical.
     */
    private galeLean = 0;
    private forewarn = 0;
    private omenDirection = 0;

    /**
     * @param scene - Scene the figure root group is added to.
     * @param rooms - Per-chunk room attribution (pass the ChunkManager so the
     *   session ledger is consulted). Null falls back to the player's current
     *   room passed into update() (tests only).
     * @param bootScars - Frozen boot-snapshot cross-run scars (stats/ScarStorage
     *   via ScarFieldSource). A config fraction of the figures in chunks near a
     *   scar gather around it (witnessPose). Empty (default) keeps the scattered
     *   placement unchanged.
     */
    constructor(
        scene: THREE.Scene,
        private readonly rooms: FigureRoomSource | null = null,
        private readonly bootScars: readonly ScarPoint[] = [],
    ) {
        this.chestBaseMat = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF,
            side: THREE.DoubleSide,
        });
        scene.add(this.root);
        this.rebelArmTimer = rebelDelaySeconds(this.rebelEventIndex);
    }

    /**
     * Per-frame update (delta-driven throughout; main gates it while paused).
     *
     * @param delta - Frame delta (s).
     * @param playerPos - Player world position, fresh this frame.
     * @param playerState - Gaze/flower reads (PlayerState satisfies).
     * @param currentRoomType - The player's room; only used as the per-chunk
     *   room fallback when no room source was injected.
     * @param audio - Distant-tear sink for rebel events (AudioController).
     * @param weatherIntensity - 0-1 current weather intensity; gently speeds
     *   the figures' flicker clock (WEATHER_FLICKER_GAIN). 0 (default)
     *   reproduces the calm behavior exactly.
     * @param contagionActive - Whether the session-level contagion window is
     *   open (a recent successful player override). While true the rebel
     *   arming gate drains faster (stepRebelArmTimer). The window countdown is
     *   owned upstream (RoomFlowUpdater) and threaded in as this small flag,
     *   so the figures never reach into the override system. False (default)
     *   reproduces the calm gate exactly.
     * @param eclipseActive - Whether the ECLIPSE transit is running (weather
     *   broadcast via RoomFlowUpdater, one frame stale by design). While true
     *   every standing figure in the window takes the upturned pose — or
     *   turns to the player's burning flower (figureAttitude ladder). False
     *   (default) reproduces the legacy behavior exactly.
     * @param galeLean - Live GALE strength in [0,1]
     *   (WeatherReactions.liveGaleStrength — deliberately without the
     *   aftermath residual: kin straighten when the storm ends). Swaying kin
     *   within the animation LOD lean into the wind by
     *   WEATHER_REACTIONS.GALE.FIGURE_LEAN_RAD x this. 0 (default)
     *   reproduces the calm behavior exactly.
     * @param forewarn - Forewarn ramp in [0,1] (WeatherState.forewarn):
     *   swaying kin turn toward the announced storm, the turn scaling with
     *   the ramp. 0 (default) reproduces the calm behavior exactly.
     * @param omenDirection - Event heading (rad) both omens read
     *   (WeatherState.eventDirection): the gale's while it blows, the drawn
     *   event's while it is announced.
     */
    update(
        delta: number,
        playerPos: THREE.Vector3,
        playerState: FigurePlayerRead,
        currentRoomType: RoomType,
        audio?: FigureAudio,
        weatherIntensity: number = 0,
        contagionActive: boolean = false,
        eclipseActive: boolean = false,
        galeLean: number = 0,
        forewarn: number = 0,
        omenDirection: number = 0,
    ): void {
        this.eclipseActive = eclipseActive;
        this.galeLean = Math.max(0, Math.min(1, galeLean));
        this.forewarn = Math.max(0, Math.min(1, forewarn));
        this.omenDirection = omenDirection;
        this.clock += delta;
        this.flickerClock += delta * (1 + Math.max(0, weatherIntensity) * WEATHER_FLICKER_GAIN);
        this.syncChunks(playerPos, currentRoomType);
        this.animateFigures(delta, playerPos, playerState, audio);
        this.updateRebelScheduler(delta, playerPos, contagionActive);
    }

    /**
     * Keep the figure population in lockstep with the active chunk window
     * (same floor-grid convention as ChunkManager.update). Only does work
     * when the player crosses a chunk boundary.
     */
    private syncChunks(playerPos: THREE.Vector3, fallbackRoom: RoomType): void {
        const cx = Math.floor(playerPos.x / WORLD.CHUNK_SIZE);
        const cz = Math.floor(playerPos.z / WORLD.CHUNK_SIZE);
        if (this.lastCx === cx && this.lastCz === cz)
            return;
        this.lastCx = cx;
        this.lastCz = cz;

        const active = new Set<string>();
        for (let x = -WORLD.RENDER_DISTANCE; x <= WORLD.RENDER_DISTANCE; x++) {
            for (let z = -WORLD.RENDER_DISTANCE; z <= WORLD.RENDER_DISTANCE; z++) {
                const key = `${cx + x},${cz + z}`;
                active.add(key);
                if (!this.chunks[key])
                    this.createChunkFigures(cx + x, cz + z, fallbackRoom);
            }
        }
        for (const key in this.chunks) {
            if (!active.has(key))
                this.removeChunkFigures(key);
        }
    }

    private createChunkFigures(cx: number, cz: number, fallbackRoom: RoomType): void {
        const roomType = this.rooms
            ? this.rooms.getRoomTypeForChunk(cx, cz)
            : fallbackRoom;
        // Cross-run scars reaching this chunk (usually none): the same footprint
        // filter ChunkManager uses for the leaning buildings.
        const nearScars = this.bootScars.length > 0
            ? scarsNearChunk(this.bootScars, cx, cz)
            : this.bootScars;
        const placements = figurePlacementsForChunk(cx, cz, roomType, WORLD.CHUNK_SIZE, nearScars);
        const entry: ChunkFigures = { group: null, figures: [] };
        this.chunks[`${cx},${cz}`] = entry;

        for (let k = 0; k < placements.length; k++) {
            const id = `${cx},${cz}:${k}`;
            if (this.vanishedIds.has(id))
                continue; // a rebel vanished here earlier this session
            if (!entry.group) {
                entry.group = new THREE.Group();
                entry.group.position.set(cx * WORLD.CHUNK_SIZE, 0, cz * WORLD.CHUNK_SIZE);
                this.root.add(entry.group);
            }
            entry.figures.push(this.buildFigure(id, placements[k], cx, cz, entry.group));
        }
    }

    /**
     * Build one silhouette: cylinder torso + sphere head (shared geometry,
     * shared ink material — the building family, so the dither pipeline
     * treats them identically) plus the tiny chest flower-light quad (the
     * only per-figure material clone; tracked and disposed with the chunk).
     */
    private buildFigure(
        id: string,
        placement: FigurePlacement,
        cx: number,
        cz: number,
        parent: THREE.Group,
    ): FigureRecord {
        const h = placement.height;
        const group = new THREE.Group();
        group.position.set(placement.x, 0, placement.z);
        group.rotation.y = placement.rotationY;
        // YXZ: yaw first, so the eclipse look-up pitch (rotation.x) tilts the
        // body around the figure's OWN right axis instead of the world's.
        // Identity while the pitch is 0 — the legacy yaw + z-sway composition
        // is unchanged.
        group.rotation.order = 'YXZ';

        const body = new THREE.Mesh(this.assets.cylinderGeo, this.assets.matDark);
        body.scale.set(BODY_RADIUS_FRAC * h, BODY_HEIGHT_FRAC * h, BODY_RADIUS_FRAC * h);
        body.position.y = (BODY_HEIGHT_FRAC * h) / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const head = new THREE.Mesh(this.assets.sphereGeo, this.assets.matDark);
        head.scale.setScalar(HEAD_RADIUS_FRAC * h);
        head.position.y = (BODY_HEIGHT_FRAC + HEAD_RADIUS_FRAC) * h;
        head.castShadow = true;
        group.add(head);

        // The chest flower-light: an unlit quad whose greyscale level IS the
        // intensity (the dither maps brightness straight to paper/ink).
        const chestMat = this.chestBaseMat.clone();
        const chest = new THREE.Mesh(this.chestGeo, chestMat);
        chest.position.set(0, CHEST_HEIGHT_FRAC * h, BODY_RADIUS_FRAC * h + 0.02);
        group.add(chest);

        const light = placement.archetype === 'ALIGNED'
            ? FIGURES.ALIGNED_LIGHT
            : breatheLight(this.clock, placement.phase);
        chestMat.color.setScalar(light);

        parent.add(group);

        return {
            id,
            group,
            body,
            head,
            chestMat,
            chest,
            chestBaseY: CHEST_HEIGHT_FRAC * h,
            pose: 'NONE',
            leanRoll: 0,
            worldPos: new THREE.Vector3(
                cx * WORLD.CHUNK_SIZE + placement.x,
                CHEST_HEIGHT_FRAC * h,
                cz * WORLD.CHUNK_SIZE + placement.z,
            ),
            placement,
            press: 0,
            livePhase: placement.phase,
            resonance: 0,
            light,
            misreadWire: false,
            state: 'IDLE',
            rebelTimer: 0,
            surgeFrom: 0,
            tearProximity: 0,
            baseX: placement.x,
        };
    }

    private removeChunkFigures(key: string): void {
        const entry = this.chunks[key];
        delete this.chunks[key];
        for (const fig of entry.figures) {
            // A rebel whose chunk leaves the window mid-event simply ends the
            // event (its id is already committed to the vanish list).
            if (fig === this.activeRebel)
                this.activeRebel = null;
            // Bodies share pooled geometry/materials (never disposed here);
            // only the per-figure chest-light clone is owned by the figure.
            fig.chestMat.dispose();
        }
        if (entry.group)
            this.root.remove(entry.group);
    }

    private animateFigures(
        delta: number,
        playerPos: THREE.Vector3,
        playerState: FigurePlayerRead,
        audio?: FigureAudio,
    ): void {
        // Player-level resonance arming: advance once per frame (a global read,
        // independent of any figure) before the per-figure pass. Gazing or a
        // flower outside the mid band keeps it disarmed.
        this.resonanceArm = updateResonanceArm(
            this.resonanceArm,
            playerState.flowerIntensity,
            playerState.isGazing,
            delta,
        );
        const armed = resonanceArmed(this.resonanceArm);
        // Shared cadence all resonating kin converge onto — computed once.
        const refPhase = resonanceReferencePhase(this.clock);

        for (const key in this.chunks) {
            const figures = this.chunks[key].figures;
            for (const fig of figures) {
                if (fig.state === 'VANISHED')
                    continue;
                if (fig.state !== 'IDLE') {
                    // Rebels are never LOD-gated (the band is 30-60m anyway).
                    // A rebel owns its body for the whole arc: any eclipse
                    // pose it carried simply freezes (it vanishes within
                    // seconds either way).
                    this.advanceRebel(fig, delta, audio);
                    continue;
                }
                const distSq = playerPos.distanceToSquared(fig.worldPos);
                const withinLod = distSq <= LOD_DISTANCE_SQ;
                // ONE priority decision per figure (the figureAttitude
                // ladder). `pressed`/`resonating` reproduce the exact reads
                // animateIdle used to make, just hoisted so the ladder sees
                // them; the faces-player gate is eclipse-gated so the calm
                // path pays nothing for it. The weather-omen rungs are
                // LOD-gated like all figure animation (distant kin never
                // take the pose, so there is nothing to restore for them)
                // and skip ALIGNED — the ranks do not bend, even in the wind.
                const conformist = fig.placement.archetype === 'CONFORMIST';
                const omenEligible = withinLod && fig.placement.archetype !== 'ALIGNED';
                const pressed = conformist
                    && conformistPressed(playerState.isGazing, playerState.flowerIntensity, distSq);
                const resonating = conformist && armed
                    && distSq < FIGURES.DIM_FLOWER_DISTANCE * FIGURES.DIM_FLOWER_DISTANCE;
                const attitude = figureAttitude(
                    pressed,
                    this.eclipseActive,
                    this.eclipseActive && eclipseFacesPlayer(playerState.flowerIntensity, distSq),
                    resonating,
                    omenEligible && this.galeLean > 0,
                    omenEligible && this.forewarn > 0,
                );
                // Attitude pose BEFORE the LOD gate: the whole active window
                // answers the transit (write-on-change keeps it cheap; the
                // light/breathing channels below stay LOD-gated as before),
                // and a figure drifting past the LOD line mid-omen still gets
                // its restore-to-rest write here.
                this.applyAttitudePose(fig, attitude, playerPos);
                if (!withinLod)
                    continue; // beyond the animation LOD: perfectly still
                this.animateIdle(fig, delta, attitude, refPhase);
            }
        }
    }

    /**
     * Write the attitude pose for this frame — the ONE pose machine behind
     * the figureAttitude ladder, hard snaps only for the discrete channels
     * (the 1-bit language: a face turns, it never eases). On any pose CHANGE
     * every pose channel first resets to rest (pitch 0, rest yaw, chest
     * down, lean roll stripped from the sway and zeroed), so poses can hand
     * over to each other without a per-pair restore matrix; the new pose
     * then writes what it owns:
     *
     * - PLAYER (eclipse exception): per-frame player-tracking yaw.
     * - UP (eclipse): one-shot body pitch + chest-light lift.
     * - LEAN (gale): per-frame upwind tilt — pitch here, roll composed with
     *   the sway in animateIdle (galeLeanPitch / galeLeanRoll) — scaling
     *   with the live storm strength.
     * - FACE_STORM (forewarn): per-frame shortest-arc turn toward the
     *   announced heading, scaling with the ramp (forewarnFacingYaw).
     *
     * The per-frame branches only run while their (rare, event-gated)
     * attitude holds; a figure at rest costs one enum comparison.
     */
    private applyAttitudePose(fig: FigureRecord, attitude: FigureAttitude, playerPos: THREE.Vector3): void {
        const pose: FigureRecord['pose']
            = attitude === 'ECLIPSE_FACE_PLAYER'
                ? 'PLAYER'
                : attitude === 'ECLIPSE_LOOK_UP'
                    ? 'UP'
                    : attitude === 'GALE_LEAN'
                        ? 'LEAN'
                        : attitude === 'FOREWARN_FACE' ? 'FACE_STORM' : 'NONE';

        if (pose !== fig.pose) {
            // Hand-over reset: every channel back to rest, then the one-shot
            // writes of the incoming pose. (Restore-to-NONE is exactly this
            // reset — the transit passes, the wind drops, the body remembers
            // nothing.) rotation.z belongs to animateIdle, but the lean half
            // must be stripped HERE: a figure beyond the animation LOD never
            // reaches animateIdle, and would otherwise keep the gale tilt
            // frozen in its sway long after the wind drops.
            fig.pose = pose;
            fig.group.rotation.x = 0;
            fig.group.rotation.y = fig.placement.rotationY;
            fig.group.rotation.z -= fig.leanRoll;
            fig.chest.position.y = fig.chestBaseY;
            fig.leanRoll = 0;
            if (pose === 'UP') {
                fig.group.rotation.x = -ECLIPSE_FIGURES.LOOKUP_PITCH; // lean back: face to the sky
                fig.chest.position.y = fig.chestBaseY
                    + fig.placement.height * ECLIPSE_FIGURES.CHEST_LIFT_FRAC;
            }
        }

        if (pose === 'PLAYER') {
            // Face the player: local +z maps to world (sin rotY, cos rotY) —
            // the witnessPose convention. Tracks the player every frame.
            // Level, not upturned: the light meets yours, not the sky.
            fig.group.rotation.y = Math.atan2(playerPos.x - fig.worldPos.x, playerPos.z - fig.worldPos.z);
        }
        else if (pose === 'LEAN') {
            // Brace into the wind: strength ramps continuously with the
            // storm, so both components track per frame. The roll half is
            // composed with the sway in animateIdle (ALIGNED never leans).
            const lean = WEATHER_REACTIONS.GALE.FIGURE_LEAN_RAD * this.galeLean;
            fig.group.rotation.x = galeLeanPitch(this.omenDirection, fig.placement.rotationY, lean);
            fig.leanRoll = galeLeanRoll(this.omenDirection, fig.placement.rotationY, lean);
        }
        else if (pose === 'FACE_STORM') {
            // Turn toward the announced storm, the turn growing with the
            // forewarn ramp — per-frame because the ramp is.
            fig.group.rotation.y = forewarnFacingYaw(
                fig.placement.rotationY,
                this.omenDirection,
                this.forewarn,
            );
        }
    }

    private animateIdle(
        fig: FigureRecord,
        delta: number,
        attitude: FigureAttitude,
        refPhase: number,
    ): void {
        const p = fig.placement;
        if (p.archetype === 'ALIGNED')
            return; // regimented: rigid stance, constant faint light

        // Gentle in-place sway (delta-accumulated clock, hash-phased desync).
        // The bottom rung of the attitude ladder keeps this non-conflicting
        // channel alive under every higher attitude — a body still breathes.
        // The gale-lean roll composes ADDITIVELY (leanRoll is 0 outside the
        // LEAN pose, so the calm sway is bit-identical): braced kin still sway.
        fig.group.rotation.z = Math.sin(this.clock * FIGURES.SWAY_SPEED + p.phase)
            * FIGURES.SWAY_AMPLITUDE + fig.leanRoll;

        // Chest light: breathing baseline; conformists bow toward the dim
        // floor over ~LIGHT_DIM_SECONDS while pressed (player gazing, or a
        // blazing flower nearby), recovering more slowly once released.
        if (p.archetype === 'CONFORMIST') {
            const pressed = attitude === 'PRESSED';
            const step = pressed
                ? delta / FIGURES.LIGHT_DIM_SECONDS
                : -delta / FIGURES.LIGHT_RECOVER_SECONDS;
            fig.press = Math.max(0, Math.min(1, fig.press + step));

            // Resonance: only while it LEADS the ladder (attitude RESONANCE:
            // armed + within the press radius, no eclipse, not pressed) does
            // the breathing phase converge onto the shared reference and the
            // light lift; otherwise both relax back to the personal cadence.
            // Bit-identical to the pre-ladder gate for the legacy weather
            // types (pressed and resonating are mutually exclusive — see
            // figureAttitude); an eclipse now suppresses the convergence.
            const resonating = attitude === 'RESONANCE';
            const rTarget = resonating ? refPhase : p.phase;
            const rRate = resonating ? FIGURES.RESONANCE_CONVERGE_RATE : FIGURES.RESONANCE_RELAX_RATE;
            fig.livePhase = convergePhase(fig.livePhase, rTarget, rRate, delta);
            const rStep = resonating
                ? delta / FIGURES.RESONANCE_ATTACK_SECONDS
                : -delta / FIGURES.RESONANCE_RELEASE_SECONDS;
            fig.resonance = Math.max(0, Math.min(1, fig.resonance + rStep));
        }
        const breathing = resonantBreathe(this.clock, fig.livePhase, fig.resonance);
        fig.light = breathing + (FIGURES.LIGHT_DIM - breathing) * fig.press;
        fig.chestMat.color.setScalar(fig.light);

        // MISREAD (IN_BETWEEN): low-frequency flicker between two render
        // parameter sets — solid ink vs wireframe, both shared assets — the
        // room's "read differently by both systems" language at figure scale.
        // Runs on the weather-accelerated flicker clock (storms misread harder).
        if (p.archetype === 'MISREAD') {
            const t = (this.flickerClock + p.phase) % FIGURES.MISREAD_FLICKER_PERIOD;
            const wire = t < FIGURES.MISREAD_FLICKER_ON;
            if (wire !== fig.misreadWire) {
                fig.misreadWire = wire;
                const mat = wire ? this.assets.matWire : this.assets.matDark;
                fig.body.material = mat;
                fig.head.material = mat;
            }
        }
    }

    /**
     * Rebel event scheduler: a hash-drawn arming delay (a few minutes), then
     * the FIRST frame a candidate stands in the 30-60m band, one figure is
     * picked deterministically (event-index hash over the id-sorted
     * candidates) and commits to the surge -> glitch-strobe -> vanish arc.
     * No per-frame randomness anywhere in the gate.
     */
    private updateRebelScheduler(delta: number, playerPos: THREE.Vector3, contagionActive: boolean): void {
        if (this.activeRebel)
            return;
        // Contagion accelerates the countdown (stepRebelArmTimer): the gate is
        // still a deterministic hash-drawn interval, only drained faster while
        // a recent override keeps the window open.
        this.rebelArmTimer = stepRebelArmTimer(this.rebelArmTimer, delta, contagionActive);
        if (this.rebelArmTimer > 0)
            return;

        const candidates = this.candidateScratch;
        candidates.length = 0;
        for (const key in this.chunks) {
            for (const fig of this.chunks[key].figures) {
                if (fig.state === 'IDLE' && isInRebelRange(playerPos.distanceToSquared(fig.worldPos)))
                    candidates.push(fig);
            }
        }
        if (candidates.length === 0)
            return; // stay armed; fire the first frame a candidate exists

        candidates.sort((a, b) => (a.id < b.id ? -1 : 1));
        const rebel = candidates[pickRebelIndex(this.rebelEventIndex, candidates.length)];
        candidates.length = 0;

        rebel.state = 'SURGE';
        rebel.rebelTimer = 0;
        rebel.surgeFrom = rebel.light;
        rebel.tearProximity = rebelTearProximity(playerPos.distanceToSquared(rebel.worldPos));
        this.activeRebel = rebel;
        // Committed: even if the chunk regenerates later, this one is gone.
        this.vanishedIds.add(rebel.id);

        this.rebelEventIndex++;
        this.rebelArmTimer = rebelDelaySeconds(this.rebelEventIndex);
    }

    private advanceRebel(fig: FigureRecord, delta: number, audio?: FigureAudio): void {
        fig.rebelTimer += delta;

        if (fig.state === 'SURGE') {
            // The flower-light defiantly fills over ~2s.
            const t = Math.min(1, fig.rebelTimer / FIGURES.REBEL_SURGE_SECONDS);
            fig.light = fig.surgeFrom + (1 - fig.surgeFrom) * t;
            fig.chestMat.color.setScalar(fig.light);
            if (fig.rebelTimer >= FIGURES.REBEL_SURGE_SECONDS) {
                fig.state = 'FLICKER';
                fig.rebelTimer = 0;
                // The rip lands the moment the body starts breaking up,
                // volume falling off with the trigger distance.
                audio?.playDistantTear(fig.tearProximity);
            }
            return;
        }

        // FLICKER: the GLITCH weather language localized — a rapid visibility
        // strobe plus a deterministic per-step horizontal dislocation (hash of
        // the quantized step of the weather-accelerated flicker clock:
        // frame-rate independent, no Math.random).
        const step = Math.floor((this.flickerClock + fig.placement.phase) * FIGURES.REBEL_FLICKER_RATE);
        fig.group.visible = step % 2 === 0;
        fig.group.position.x = fig.baseX
            + (hash(step, REBEL_JITTER_SALT) - 0.5) * FIGURES.REBEL_JITTER_AMPLITUDE;
        if (fig.rebelTimer >= FIGURES.REBEL_FLICKER_SECONDS) {
            fig.state = 'VANISHED';
            fig.group.visible = false;
            fig.group.position.x = fig.baseX;
            this.activeRebel = null;
        }
    }

    dispose(): void {
        for (const key in this.chunks)
            this.removeChunkFigures(key);
        this.chunks = {};
        // Owned GPU resources only: shared geometries/materials belong to
        // SharedAssets and are disposed once by ChunkManager.dispose().
        this.chestGeo.dispose();
        this.chestBaseMat.dispose();
        this.root.parent?.remove(this.root);
    }
}
