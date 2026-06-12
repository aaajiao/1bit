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
//   ~1.5s — your kin bow their heads around you.
// - ALIGNED (FORCED_ALIGNMENT): stands rigid outside the rift's clearance,
//   facing the crack — tidy ranks on the LEFT, scattered on the RIGHT.
// - MISREAD (IN_BETWEEN): low-frequency flicker between two render parameter
//   sets (solid ink vs wireframe, both shared assets) — read differently by
//   both systems; the room's z-fight language at figure scale.
// - REBEL event (rare): hash+time gated (at most once every few minutes,
//   only 30-60m out). A figure's light surges to full over ~2s, the body
//   glitch-strobes (the GLITCH weather language localized), then it vanishes
//   for the session — accompanied by a distant tear (playDistantTear),
//   volume falling off with distance.
//
// Lifecycle follows the SAME active chunk window as ChunkManager (figure
// placement is per-chunk deterministic via the project hash, so re-entering
// a chunk regenerates the same figures, minus the session's vanished
// rebels). Geometry and body materials are shared singletons (SharedAssets);
// only the tiny chest-light material is cloned per figure (it needs an
// independent intensity) and disposed with its chunk. All animation is
// delta-driven, hash-phase desynced, and LOD-gated by
// WORLD.ANIMATION_LOD_DISTANCE (distant figures stand perfectly still).

import * as THREE from 'three';
import { FIGURES, WORLD } from '../config/constants';
import { hash } from '../utils/hash';
import { FA_FIGURE_PLACEMENT, riftLineXForWorldX, ROOM_FIGURE_DENSITY, RoomType } from './RoomConfig';
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
 * FORCED_ALIGNMENT pose: outside the rift's ±CRACK_CLEARANCE, facing the
 * crack. The crack sits on the cluster-center seam, so a chunk is entirely
 * on one side: LEFT chunks (crack at local +x) stand in a tidy rank — one
 * shared distance, z snapped to the ROW_SNAP grid (distinct cells for the
 * chunk's two figures), exact +x facing; RIGHT chunks scatter in a band
 * beyond the clearance with untidy facing.
 */
function placeAligned(
    cx: number,
    cz: number,
    k: number,
    chunkSize: number,
): { x: number; z: number; rotationY: number } {
    const crackLocalX = riftLineXForWorldX(cx * chunkSize, chunkSize) - cx * chunkSize;
    const { CRACK_CLEARANCE, ROW_DISTANCE, ROW_SNAP, SCATTER_DEPTH, SCATTER_FACING_JITTER }
        = FA_FIGURE_PLACEMENT;

    if (crackLocalX > 0) {
        // Tidy LEFT: a single rank line, grid-snapped z, exact crack-facing.
        const cells = Math.floor((chunkSize - 20) / ROW_SNAP);
        const baseIdx = Math.floor(hash(cx + FIGURE_Z_SALT, cz - FIGURE_Z_SALT) * cells);
        const zIdx = (baseIdx + k * 3) % cells; // distinct cells for k=0,1
        return {
            x: crackLocalX - ROW_DISTANCE,
            z: (zIdx - (cells - 1) / 2) * ROW_SNAP,
            rotationY: Math.PI / 2, // local +z forward -> world +x: the crack
        };
    }

    // Broken RIGHT: scattered depth and z, facing roughly the crack (-x).
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
 * Deterministic figure placements for a chunk: count via the room density
 * gates, pose per archetype (FORCED_ALIGNMENT gets the rift-rank treatment),
 * plus hash-drawn height and desync phase. Pure; the system regenerates the
 * exact same list every time the chunk re-enters the active window.
 */
export function figurePlacementsForChunk(
    cx: number,
    cz: number,
    roomType: RoomType,
    chunkSize: number = WORLD.CHUNK_SIZE,
): FigurePlacement[] {
    const count = figureCountForChunk(cx, cz, roomType);
    const placements: FigurePlacement[] = [];
    for (let k = 0; k < count; k++) {
        const archetype: FigureArchetype = roomType === RoomType.FORCED_ALIGNMENT
            ? 'ALIGNED'
            : roomType === RoomType.IN_BETWEEN ? 'MISREAD' : 'CONFORMIST';
        const pose = archetype === 'ALIGNED'
            ? placeAligned(cx, cz, k, chunkSize)
            : placeFree(cx, cz, k, chunkSize);
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
 * Conformist chest-light breathing: a slow sine between LIGHT_BREATHE_MIN
 * and MAX, desynced per figure by the placement phase. Pure, per-frame safe.
 */
export function breatheLight(clock: number, phase: number): number {
    const { LIGHT_BREATHE_MIN, LIGHT_BREATHE_MAX, LIGHT_BREATHE_SPEED } = FIGURES;
    const mid = (LIGHT_BREATHE_MIN + LIGHT_BREATHE_MAX) / 2;
    const amp = (LIGHT_BREATHE_MAX - LIGHT_BREATHE_MIN) / 2;
    return mid + Math.sin(clock * LIGHT_BREATHE_SPEED + phase) * amp;
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
    /** Precomputed world position (figures never move) for distance checks. */
    worldPos: THREE.Vector3;
    placement: FigurePlacement;
    /** Conformist bow level 0-1 (1 = pressed to the dim floor). */
    press: number;
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
    private lastCx: number | null = null;
    private lastCz = 0;

    private rebelEventIndex = 0;
    private rebelArmTimer: number;
    private activeRebel: FigureRecord | null = null;

    /**
     * @param scene - Scene the figure root group is added to.
     * @param rooms - Per-chunk room attribution (pass the ChunkManager so the
     *   session ledger is consulted). Null falls back to the player's current
     *   room passed into update() (tests only).
     */
    constructor(
        scene: THREE.Scene,
        private readonly rooms: FigureRoomSource | null = null,
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
     */
    update(
        delta: number,
        playerPos: THREE.Vector3,
        playerState: FigurePlayerRead,
        currentRoomType: RoomType,
        audio?: FigureAudio,
    ): void {
        this.clock += delta;
        this.syncChunks(playerPos, currentRoomType);
        this.animateFigures(delta, playerPos, playerState, audio);
        this.updateRebelScheduler(delta, playerPos);
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
        const placements = figurePlacementsForChunk(cx, cz, roomType);
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
            worldPos: new THREE.Vector3(
                cx * WORLD.CHUNK_SIZE + placement.x,
                CHEST_HEIGHT_FRAC * h,
                cz * WORLD.CHUNK_SIZE + placement.z,
            ),
            placement,
            press: 0,
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
        for (const key in this.chunks) {
            const figures = this.chunks[key].figures;
            for (const fig of figures) {
                if (fig.state === 'VANISHED')
                    continue;
                if (fig.state !== 'IDLE') {
                    // Rebels are never LOD-gated (the band is 30-60m anyway).
                    this.advanceRebel(fig, delta, audio);
                    continue;
                }
                const distSq = playerPos.distanceToSquared(fig.worldPos);
                if (distSq > LOD_DISTANCE_SQ)
                    continue; // beyond the animation LOD: perfectly still
                this.animateIdle(fig, delta, playerState, distSq);
            }
        }
    }

    private animateIdle(
        fig: FigureRecord,
        delta: number,
        playerState: FigurePlayerRead,
        distSq: number,
    ): void {
        const p = fig.placement;
        if (p.archetype === 'ALIGNED')
            return; // regimented: rigid stance, constant faint light

        // Gentle in-place sway (delta-accumulated clock, hash-phased desync).
        fig.group.rotation.z = Math.sin(this.clock * FIGURES.SWAY_SPEED + p.phase)
            * FIGURES.SWAY_AMPLITUDE;

        // Chest light: breathing baseline; conformists bow toward the dim
        // floor over ~LIGHT_DIM_SECONDS while pressed (player gazing, or a
        // blazing flower nearby), recovering more slowly once released.
        if (p.archetype === 'CONFORMIST') {
            const pressed = conformistPressed(
                playerState.isGazing,
                playerState.flowerIntensity,
                distSq,
            );
            const step = pressed
                ? delta / FIGURES.LIGHT_DIM_SECONDS
                : -delta / FIGURES.LIGHT_RECOVER_SECONDS;
            fig.press = Math.max(0, Math.min(1, fig.press + step));
        }
        const breathing = breatheLight(this.clock, p.phase);
        fig.light = breathing + (FIGURES.LIGHT_DIM - breathing) * fig.press;
        fig.chestMat.color.setScalar(fig.light);

        // MISREAD (IN_BETWEEN): low-frequency flicker between two render
        // parameter sets — solid ink vs wireframe, both shared assets — the
        // room's "read differently by both systems" language at figure scale.
        if (p.archetype === 'MISREAD') {
            const t = (this.clock + p.phase) % FIGURES.MISREAD_FLICKER_PERIOD;
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
    private updateRebelScheduler(delta: number, playerPos: THREE.Vector3): void {
        if (this.activeRebel)
            return;
        this.rebelArmTimer = Math.max(0, this.rebelArmTimer - delta);
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
        // the quantized clock step: frame-rate independent, no Math.random).
        const step = Math.floor((this.clock + fig.placement.phase) * FIGURES.REBEL_FLICKER_RATE);
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
