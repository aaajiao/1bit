// 1-bit Chimera Void - Snapshot Echo ("世界替你打草稿")
//
// The world has been watching and drawing you all along. Every few minutes it
// leaks a low-res 1-bit DRAFT of the current run's snapshot fingerprint onto
// ONE nearby building facade — the exact same procedural pattern the sunset
// overlay settles (stats/SnapshotPattern), generated from the run SO FAR, so
// the portrait reflects who you have been up to this moment. The draft
// materializes and dissolves in a hard on/off flicker (no alpha fades — strict
// 1-bit language), holds for a few seconds, then is gone.
//
// Design meaning: the end-of-run snapshot must not read as a bolted-on results
// screen. These mid-run drafts make the causal loop legible — the system is
// composing your likeness the whole time; sunset merely delivers the final
// copy. black = the system doing the drawing, white = the self being drawn.
//
// Lifecycle: a hash + elapsed-time arming gate (in spirit like the F3 REBEL
// event) fires at most once every few minutes and only when a building stands
// within SNAPSHOT_ECHO.RADIUS. The chosen host is picked deterministically over
// the position-sorted candidates (no per-frame randomness in the gate). The
// draft rides its host each frame (so a wandering building keeps its portrait),
// and the event ENDS — freeing the per-event material + canvas texture — either
// when the display duration lapses OR the moment the host's chunk unloads out
// from under it. The decal geometry is a single owned singleton; only the
// pattern texture/material is regenerated per event so it re-reads the run.

import type { BehaviorTag, NormalizedMetrics } from '../stats/RunStatsCollector';
import type { PatternUniforms } from '../stats/StateSnapshotGenerator';
import * as THREE from 'three';
import { SNAPSHOT_ECHO, WORLD } from '../config/constants';
import { isPatternWhite } from '../stats/SnapshotPattern';
import { StateSnapshotGenerator } from '../stats/StateSnapshotGenerator';
import { hash } from '../utils/hash';

// ===========================================================================
// Pure gating / selection logic (unit-tested in tests/SnapshotEcho.test.ts)
// ===========================================================================

// Distinct integer salts, decorrelated from every prior per-chunk / per-event
// draw (FigureSystem's rebel + witness salts top out at 1291; ScarField <=
// 1153; ChunkManager <= 1117). The echo gate is indexed by a monotone event
// counter, never by chunk coordinates.
const ECHO_DELAY_SALT = 1301;
const ECHO_PICK_SALT = 1303;
const ECHO_DURATION_SALT = 1307;

/**
 * Deterministic arming delay (s) before echo event `eventIndex` may fire,
 * hash-drawn in [MIN_INTERVAL, MAX_INTERVAL] — a few minutes apart, decided
 * once per event, never a per-frame random decision. Pure.
 */
export function echoDelaySeconds(eventIndex: number): number {
    const { MIN_INTERVAL, MAX_INTERVAL } = SNAPSHOT_ECHO;
    return MIN_INTERVAL
        + hash(eventIndex + ECHO_DELAY_SALT, eventIndex * 13 - ECHO_DELAY_SALT)
        * (MAX_INTERVAL - MIN_INTERVAL);
}

/**
 * Deterministic display duration (s) for echo event `eventIndex`, hash-drawn
 * in [DURATION_MIN, DURATION_MAX]. Pure.
 */
export function echoDurationSeconds(eventIndex: number): number {
    const { DURATION_MIN, DURATION_MAX } = SNAPSHOT_ECHO;
    return DURATION_MIN
        + hash(eventIndex + ECHO_DURATION_SALT, eventIndex * 17 + ECHO_DURATION_SALT)
        * (DURATION_MAX - DURATION_MIN);
}

/**
 * Deterministic host pick for echo event `eventIndex` among `candidateCount`
 * eligible buildings (callers sort candidates into a stable order first).
 * Returns -1 when there is no candidate. Pure.
 */
export function pickEchoIndex(eventIndex: number, candidateCount: number): number {
    if (candidateCount <= 0)
        return -1;
    const draw = hash(eventIndex + ECHO_PICK_SALT, eventIndex * 29 + ECHO_PICK_SALT);
    return Math.min(candidateCount - 1, Math.floor(draw * candidateCount));
}

/**
 * Hard-flicker visibility of the draft at `elapsed` seconds into a display of
 * total `duration`: it strobes on/off (FLICKER_RATE toggles/s) inside the
 * FLICKER_IN window while appearing and the FLICKER_OUT window while
 * disappearing, and holds steady ON through the middle — never a soft fade.
 * Before the display starts or after it ends the draft is OFF. The head window
 * takes priority when the two windows would overlap (a very short duration), so
 * the appear stutter always wins. Pure, per-frame safe.
 */
export function echoVisible(elapsed: number, duration: number): boolean {
    const { FLICKER_IN_SECONDS, FLICKER_OUT_SECONDS, FLICKER_RATE } = SNAPSHOT_ECHO;
    if (elapsed < 0 || elapsed >= duration)
        return false;
    // Appearing: hard stutter (starts ON at elapsed 0).
    if (elapsed < FLICKER_IN_SECONDS)
        return Math.floor(elapsed * FLICKER_RATE) % 2 === 0;
    // Disappearing: hard stutter in the tail window.
    const outStart = duration - FLICKER_OUT_SECONDS;
    if (elapsed >= outStart)
        return Math.floor((elapsed - outStart) * FLICKER_RATE) % 2 === 0;
    // Steady middle: the portrait holds.
    return true;
}

// ===========================================================================
// The system
// ===========================================================================

/**
 * The slice of RunStatsCollector the echo drafts from (satisfied
 * structurally): the live normalized metrics + tags feed the exact same
 * StateSnapshotGenerator path the sunset overlay uses, gated by the minimum
 * run length so a barely-started run never drafts an "empty" portrait.
 */
export interface EchoStatsSource {
    normalize: () => NormalizedMetrics;
    generateTags: () => BehaviorTag[];
    hasMinimumSnapshotDuration: () => boolean;
}

/** A building the echo can draft onto: its group + owning chunk coords. */
export interface EchoTarget {
    group: THREE.Group;
    cx: number;
    cz: number;
}

/**
 * World query surface the echo needs (ChunkManager satisfies it structurally):
 * enumerate the building groups near a world point, and report whether a chunk
 * is still loaded (so a display can be torn down the instant its host unloads).
 */
export interface EchoWorldSource {
    collectBuildingsNear: (worldX: number, worldZ: number, radius: number, out: EchoTarget[]) => void;
    isChunkActive: (cx: number, cz: number) => boolean;
}

/**
 * Snapshot echo: the world's mid-run drafts of your portrait. Owns its own
 * root group + the single reused decal geometry; regenerates the pattern
 * texture/material per event. Driven once per frame by RoomFlowUpdater after
 * the room flow settles, so the chunk grid is already up to date this frame.
 */
export class SnapshotEcho {
    private readonly root = new THREE.Group();
    private readonly generator = new StateSnapshotGenerator();
    // Owned singleton geometry (the decal quad). The per-event material + its
    // canvas texture are the only regenerated GPU resources, freed on endEvent.
    private readonly geo = new THREE.PlaneGeometry(SNAPSHOT_ECHO.SIZE, SNAPSHOT_ECHO.SIZE);
    // Reused candidate buffer (no per-frame allocation while armed).
    private readonly candidateScratch: EchoTarget[] = [];

    private eventIndex = 0;
    private armTimer: number;

    // Active-event state (null/false between events).
    private decal: THREE.Mesh | null = null;
    private mat: THREE.MeshBasicMaterial | null = null;
    private tex: THREE.CanvasTexture | null = null;
    private host: EchoTarget | null = null;
    private elapsed = 0;
    private duration = 0;

    /**
     * @param scene - Scene the echo root group is added to.
     * @param stats - Live run-stats source (RunStatsCollector). The draft is
     *   generated from THIS run's metrics so far; a run below the snapshot
     *   minimum drafts nothing (the gate stays armed).
     */
    constructor(scene: THREE.Scene, private readonly stats: EchoStatsSource) {
        scene.add(this.root);
        this.armTimer = echoDelaySeconds(this.eventIndex);
    }

    /**
     * Per-frame update (delta-driven; main gates it while paused).
     * @param delta - Frame delta (s).
     * @param playerPos - Player world position, fresh this frame.
     * @param world - Building enumeration + chunk-liveness surface (ChunkManager).
     */
    update(delta: number, playerPos: THREE.Vector3, world: EchoWorldSource): void {
        if (this.host) {
            this.advanceEvent(delta, playerPos, world);
            return;
        }
        // Arming: a deterministic hash-drawn interval (echoDelaySeconds). Once
        // it drains the event fires the first frame a candidate exists.
        this.armTimer -= delta;
        if (this.armTimer > 0)
            return;
        this.tryStartEvent(playerPos, world);
    }

    /**
     * Attempt to open an echo: draft only once the run is long enough to have
     * a portrait, then pick a host among the nearby buildings and paint it. If
     * either the draft or a candidate is missing the gate stays drained and
     * retries next frame (mirrors the figures' "fire the first frame a
     * candidate exists" arming).
     */
    private tryStartEvent(playerPos: THREE.Vector3, world: EchoWorldSource): void {
        if (!this.stats.hasMinimumSnapshotDuration())
            return;

        const candidates = this.candidateScratch;
        candidates.length = 0;
        world.collectBuildingsNear(playerPos.x, playerPos.z, SNAPSHOT_ECHO.RADIUS, candidates);
        if (candidates.length === 0)
            return;

        // Stable order (chunk, then local position) so the deterministic pick
        // does not depend on chunk-map iteration order.
        candidates.sort((a, b) =>
            a.cx - b.cx || a.cz - b.cz
            || a.group.position.x - b.group.position.x
            || a.group.position.z - b.group.position.z);
        const host = candidates[pickEchoIndex(this.eventIndex, candidates.length)];
        candidates.length = 0;

        // Regenerate the draft from the run so far — the exact StateSnapshot
        // pattern math the sunset overlay settles, one canvas instead of a shader.
        const pattern = this.generator
            .generateFromMetrics(this.stats.normalize(), this.stats.generateTags())
            .pattern;
        this.tex = buildPatternTexture(pattern);
        this.mat = new THREE.MeshBasicMaterial({
            map: this.tex,
            side: THREE.DoubleSide,
        });
        this.decal = new THREE.Mesh(this.geo, this.mat);
        this.decal.visible = false; // echoVisible drives it from frame one
        this.positionDecal(this.decal, host, playerPos);
        this.root.add(this.decal);

        this.host = host;
        this.elapsed = 0;
        this.duration = echoDurationSeconds(this.eventIndex);
        // Commit the NEXT arming interval now, so the gate is deterministic.
        this.eventIndex++;
        this.armTimer = echoDelaySeconds(this.eventIndex);
    }

    /**
     * Advance the active display: end it (freeing the texture/material) the
     * instant the host chunk unloads OR the duration lapses; otherwise re-seat
     * the decal on the (possibly wandering) host and strobe its visibility.
     */
    private advanceEvent(delta: number, playerPos: THREE.Vector3, world: EchoWorldSource): void {
        const host = this.host;
        const decal = this.decal;
        if (!host || !decal)
            return;
        // Guard: the host's chunk left the active window mid-event — the
        // building (and its geometry) is being disposed by ChunkManager, so the
        // draft has nothing to sit on. Tear the event down immediately.
        if (!world.isChunkActive(host.cx, host.cz)) {
            this.endEvent();
            return;
        }

        this.elapsed += delta;
        if (this.elapsed >= this.duration) {
            this.endEvent();
            return;
        }

        this.positionDecal(decal, host, playerPos);
        decal.visible = echoVisible(this.elapsed, this.duration);
    }

    /**
     * Seat the decal on the near face of its host turned toward the player:
     * the building's live world center offset FACE_OFFSET toward the player,
     * the plane's +z normal aimed back at them. An approximation of "painted on
     * the facing wall" (buildings vary in footprint), recomputed each frame so
     * a wandering host keeps its portrait.
     */
    private positionDecal(decal: THREE.Mesh, host: EchoTarget, playerPos: THREE.Vector3): void {
        const bx = host.cx * WORLD.CHUNK_SIZE + host.group.position.x;
        const bz = host.cz * WORLD.CHUNK_SIZE + host.group.position.z;
        let dx = playerPos.x - bx;
        let dz = playerPos.z - bz;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len > 1e-4) {
            dx /= len;
            dz /= len;
        }
        else {
            dx = 0;
            dz = 1;
        }
        decal.position.set(
            bx + dx * SNAPSHOT_ECHO.FACE_OFFSET,
            SNAPSHOT_ECHO.HEIGHT,
            bz + dz * SNAPSHOT_ECHO.FACE_OFFSET,
        );
        // Plane's local +z faces the player (PlaneGeometry faces +z by default).
        decal.rotation.set(0, Math.atan2(dx, dz), 0);
    }

    /** End the active display and free the per-event material + canvas texture. */
    private endEvent(): void {
        if (this.decal) {
            this.root.remove(this.decal);
            this.decal = null;
        }
        // The decal geometry is the owned singleton (freed in dispose()); only
        // the per-event material and its texture are released here.
        this.mat?.dispose();
        this.mat = null;
        this.tex?.dispose();
        this.tex = null;
        this.host = null;
    }

    dispose(): void {
        this.endEvent();
        this.geo.dispose();
        this.root.parent?.remove(this.root);
    }
}

/**
 * Rasterize a snapshot pattern into a small hard 1-bit CanvasTexture: each
 * texel is pure white or pure black by the same threshold the sunset overlay /
 * share card use (stats/SnapshotPattern.isPatternWhite), frozen at time 0.
 * NearestFilter + no mipmaps keep the pixels crisp — the draft reads as a
 * coarse dither, not a blurred image.
 */
function buildPatternTexture(pattern: PatternUniforms): THREE.CanvasTexture {
    const n = SNAPSHOT_ECHO.RESOLUTION;
    const canvas = document.createElement('canvas');
    canvas.width = n;
    canvas.height = n;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(n, n);
    const data = image.data;
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            // Texel-center sample in [0, 1); v flipped so the drawn portrait is
            // upright once the texture maps onto the +z face.
            const u = (x + 0.5) / n;
            const v = 1 - (y + 0.5) / n;
            const on = isPatternWhite(pattern, u, v, 0) ? 255 : 0;
            const idx = (y * n + x) * 4;
            data[idx] = on;
            data[idx + 1] = on;
            data[idx + 2] = on;
            data[idx + 3] = 255;
        }
    }
    ctx.putImageData(image, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
}
