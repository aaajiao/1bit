// 1-bit Chimera Void - Ghost Replay (F4 "上一局的你")
//
// If the previous run left a trail (stats/TrailRecorder), ONE ghost walks it
// this session: a half-present silhouette retracing last run's exact path at
// the original sampling rhythm, chest light replaying the recorded flower
// intensity. It is a memory, not an NPC:
//
// - It enters the world only after the player has first walked
//   GHOST.ENTRY_DISTANCE away from the trail start (delayed entrance): the
//   spawn point is deterministic and the trail usually starts there, so the
//   ghost must be something you turn around and find — never something you
//   spawn inside.
// - It never chases and never avoids the player. The only acknowledgement is
//   a single subtle chest-light flare the first time the player comes within
//   RECOGNIZE_DISTANCE after having been outside it (armed-after-exit) — it
//   recognized you. Nothing else. No HUD, no audio.
// - The world may have regenerated differently (F1 behavior bias); the ghost
//   walking through geometry that no longer exists is a property of memory,
//   not a bug — no collision correction. The one guard: y is pinned to the
//   ground plane, so it can never fall into the rift.
// - Reusing the F3 silhouette body (SharedAssets geometry + the SILHOUETTE
//   proportions) but visually distinct: mid-grey translucent body with a
//   low-frequency presence oscillation — the dither pipeline renders it as
//   an unstable halftone rather than the figures' solid ink.
// - After finishing the trail it stands HOLD_SECONDS, fades out over
//   FADE_SECONDS, and is gone for the session. The stored trail is consumed
//   at construction (burn after read), so the ghost is one-time across boots
//   too: a run too short to record a replacement leaves no ghost next session.
//
// No stored trail / corrupt data => silently no ghost (and the storage stays
// untouched). All animation is delta-driven (pause-gated upstream); the
// per-frame replay path is allocation-free — a forward-only TrailCursor
// mutates one reused sample object in place.

import type { TrailPoint } from '../stats/TrailRecorder';
import * as THREE from 'three';
import { GHOST, TRAIL } from '../config';
import { clearStoredTrail, defaultTrailStorage, loadTrail } from '../stats/TrailRecorder';
import { SILHOUETTE } from './FigureSystem';
import { getSharedAssets } from './SharedAssets';

// ===========================================================================
// Pure replay logic (unit-tested in tests/GhostTrail.test.ts)
// ===========================================================================

/** One interpolated replay sample along a trail. */
export interface GhostSample {
    x: number;
    z: number;
    /** Replayed flower intensity 0-1. */
    flower: number;
    /** Facing along the walk direction (radians; local +z = forward). */
    rotationY: number;
    /** True once t has reached the trail's final point. */
    done: boolean;
}

/**
 * Forward-only replay sampler: linear position / flower interpolation
 * between the two keyframes around `t`, with `interval` seconds per keyframe
 * (the recorder's sampling rhythm). Clamps to the trail ends; `done` flips
 * once t reaches the final point.
 *
 * Built for the per-frame path: replay time is monotonically non-decreasing,
 * so the segment cursor only ever advances (amortized O(1) per call — each
 * segment is visited once over the whole walk, never rescanned) and the
 * facing folds incrementally into a running heading (the latest
 * non-degenerate segment's direction; a ghost standing still keeps looking
 * where it was last walking). sample() returns ONE reused object mutated in
 * place — allocation-free per frame; callers must not retain it across calls.
 */
export class TrailCursor {
    /** Current segment index (only ever advances). */
    private seg = 0;
    /** Facing of the latest non-degenerate segment at or before `seg`. */
    private heading = 0;
    /** The reused output sample (mutated in place by every sample()). */
    private readonly out: GhostSample = { x: 0, z: 0, flower: 0, rotationY: 0, done: false };

    constructor(
        private readonly points: readonly TrailPoint[],
        private readonly interval: number = TRAIL.SAMPLE_INTERVAL,
    ) {
        if (points.length >= 2 && interval > 0)
            this.heading = this.segmentHeading(0, 0);
    }

    /** Heading of segment `i`, or `fallback` when it is degenerate (still). */
    private segmentHeading(i: number, fallback: number): number {
        const a = this.points[i];
        const b = this.points[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        return dx * dx + dz * dz > 1e-6 ? Math.atan2(dx, dz) : fallback;
    }

    /**
     * Sample the trail at time `t` (seconds since replay start, expected
     * monotonically non-decreasing across calls). Null for an unusable
     * trail (empty / non-positive interval). A regressing `t` never moves
     * the cursor backwards — it clamps onto the current segment instead.
     */
    sample(t: number): GhostSample | null {
        const { points, interval, out } = this;
        if (points.length === 0 || interval <= 0)
            return null;
        const last = points.length - 1;
        if (last === 0) {
            const only = points[0];
            out.x = only.x;
            out.z = only.z;
            out.flower = only.flower;
            out.rotationY = 0;
            out.done = true;
            return out;
        }

        const end = last * interval;
        const clamped = Math.max(0, Math.min(t, end));
        // Advance the cursor to the segment containing t, folding each newly
        // entered segment's direction into the running heading.
        const target = Math.min(last - 1, Math.floor(clamped / interval));
        while (this.seg < target) {
            this.seg++;
            this.heading = this.segmentHeading(this.seg, this.heading);
        }
        const seg = this.seg;
        const s = Math.min(1, Math.max(0, clamped / interval - seg));
        const a = points[seg];
        const b = points[seg + 1];
        out.x = a.x + (b.x - a.x) * s;
        out.z = a.z + (b.z - a.z) * s;
        out.flower = a.flower + (b.flower - a.flower) * s;
        out.rotationY = this.heading;
        out.done = t >= end;
        return out;
    }
}

/**
 * Sample a trail at an arbitrary time `t`: one-shot convenience over
 * TrailCursor for construction-time peeks and tests (allocates a fresh
 * cursor per call — per-frame callers hold a TrailCursor instead). Pure.
 */
export function sampleTrail(
    points: readonly TrailPoint[],
    t: number,
    interval: number = TRAIL.SAMPLE_INTERVAL,
): GhostSample | null {
    return new TrailCursor(points, interval).sample(t);
}

/**
 * Frame-rate-independent shortest-arc angle easing: step `current` toward
 * `target` by the exponential factor 1 - exp(-rate * delta), always around
 * the short way (the wrap at ±π is respected). Pure.
 */
export function stepAngleToward(
    current: number,
    target: number,
    delta: number,
    rate: number = GHOST.TURN_RATE,
): number {
    let diff = (target - current) % (Math.PI * 2);
    if (diff > Math.PI)
        diff -= Math.PI * 2;
    else if (diff < -Math.PI)
        diff += Math.PI * 2;
    return current + diff * (1 - Math.exp(-rate * delta));
}

/**
 * Recognition flare envelope 0-1 over time since the player first came near:
 * linear rise to 1 over RECOGNIZE_RISE_SECONDS, then linear fall back to 0
 * over RECOGNIZE_FALL_SECONDS, then 0 forever (it happens once). Pure.
 */
export function recognitionBoost(timeSince: number): number {
    const { RECOGNIZE_RISE_SECONDS: rise, RECOGNIZE_FALL_SECONDS: fall } = GHOST;
    if (timeSince <= 0)
        return 0;
    if (timeSince < rise)
        return timeSince / rise;
    const t = (timeSince - rise) / fall;
    return t >= 1 ? 0 : 1 - t;
}

// ===========================================================================
// The system
// ===========================================================================

type GhostPhase = 'WAITING' | 'WALKING' | 'HOLDING' | 'FADING' | 'GONE';

/**
 * The one-per-session ghost. Constructed at boot: loads the previous run's
 * trail from storage (or takes an injected one — tests), CONSUMES the stored
 * copy on success (burn after read — the same ghost never reappears across
 * boots), and silently does nothing at all when there is none. Driven once
 * per frame by RoomFlowUpdater (which also owns its dispose).
 */
export class GhostSystem {
    /** Forward-only per-frame replay sampler over the trail (allocation-free). */
    private readonly cursor: TrailCursor | null = null;

    private group: THREE.Group | null = null;
    /** Owned per-ghost render resources (disposed on vanish/dispose). */
    private bodyMat: THREE.MeshLambertMaterial | null = null;
    private chestMat: THREE.MeshBasicMaterial | null = null;
    private chestGeo: THREE.PlaneGeometry | null = null;

    private phase: GhostPhase = 'GONE';
    /** Accumulated replay clock (s) — delta-driven, frozen while paused. */
    private clock = 0;
    private phaseTimer = 0;
    private lightBase = 0;
    /** Clock time the player was first recognized; < 0 until it happens. */
    private recognizedAt = -1;
    /**
     * Recognition arms only after the player has been observed OUTSIDE the
     * recognize radius (armed-after-exit): the one-time flare must mark a
     * real approach, never a spawn-overlap freebie burned on frame zero.
     */
    private recognizeArmed = false;

    /**
     * @param scene - Scene the ghost is added to (deferred: the ghost only
     *   enters the world once the player first moves GHOST.ENTRY_DISTANCE
     *   away from the trail start — a memory you come BACK to, never one
     *   you spawn inside).
     * @param storage - Backing store the default trail loads from; cleared
     *   the moment a ghost is successfully constructed (burn after read).
     *   Injectable for tests.
     * @param trail - Replay trail; defaults to the persisted last-run trail.
     *   Null / fewer than 2 points => no ghost this session (静默) and the
     *   storage stays untouched.
     */
    constructor(
        private readonly scene: THREE.Scene,
        storage: Storage | null = defaultTrailStorage(),
        trail: readonly TrailPoint[] | null = loadTrail(storage),
    ) {
        if (!trail || trail.length < 2)
            return;

        // 阅后即焚 (burn after read): a successfully constructed ghost
        // CONSUMES the stored trail, so the same ghost can never reappear
        // across boots — one-time by design even when this run ends too
        // short (<30s) to save a replacement. This session's NEW trail is
        // recorded independently (stats/TrailRecorder, owned by
        // StatsSunsetUpdater) and persisted at sunset/unload as usual; the
        // F2 "遗忘" path clears the same key and is unaffected.
        clearStoredTrail(storage);

        this.cursor = new TrailCursor(trail);
        const assets = getSharedAssets();
        const h = GHOST.HEIGHT;
        const { BODY_RADIUS_FRAC, BODY_HEIGHT_FRAC, HEAD_RADIUS_FRAC, CHEST_HEIGHT_FRAC, CHEST_LIGHT_SIZE }
            = SILHOUETTE;

        // Mid-grey translucent body — same silhouette family as the F3
        // figures (shared geometry), different presence. No shadow: a memory
        // does not block light.
        this.bodyMat = new THREE.MeshLambertMaterial({
            color: new THREE.Color(GHOST.BODY_GREY, GHOST.BODY_GREY, GHOST.BODY_GREY),
            transparent: true,
            opacity: GHOST.PRESENCE_MAX,
        });

        const group = new THREE.Group();
        const start = trail[0];
        group.position.set(start.x, 0, start.z);
        group.rotation.y = this.cursor.sample(0)?.rotationY ?? 0;

        const body = new THREE.Mesh(assets.cylinderGeo, this.bodyMat);
        body.scale.set(BODY_RADIUS_FRAC * h, BODY_HEIGHT_FRAC * h, BODY_RADIUS_FRAC * h);
        body.position.y = (BODY_HEIGHT_FRAC * h) / 2;
        group.add(body);

        const head = new THREE.Mesh(assets.sphereGeo, this.bodyMat);
        head.scale.setScalar(HEAD_RADIUS_FRAC * h);
        head.position.y = (BODY_HEIGHT_FRAC + HEAD_RADIUS_FRAC) * h;
        group.add(head);

        // The chest light replays the RECORDED flower intensity (greyscale =
        // intensity, exactly like the figures' chest quads).
        this.chestGeo = new THREE.PlaneGeometry(CHEST_LIGHT_SIZE, CHEST_LIGHT_SIZE);
        this.chestMat = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF,
            side: THREE.DoubleSide,
            transparent: true,
        });
        this.lightBase = start.flower;
        this.chestMat.color.setScalar(this.lightBase);
        const chest = new THREE.Mesh(this.chestGeo, this.chestMat);
        chest.position.set(0, CHEST_HEIGHT_FRAC * h, BODY_RADIUS_FRAC * h + 0.02);
        group.add(chest);

        // NOT added to the scene yet: the ghost waits (clock frozen) for the
        // player to first leave the trail start behind (delayed entrance).
        this.group = group;
        this.phase = 'WAITING';
    }

    /**
     * Whether a ghost is currently in the world (false while it still waits
     * for its delayed entrance, and again once it faded).
     */
    isPresent(): boolean {
        return this.phase === 'WALKING' || this.phase === 'HOLDING' || this.phase === 'FADING';
    }

    /**
     * Per-frame update (delta-driven; main gates it while paused).
     * @param delta - Frame delta (s).
     * @param playerPos - Player world position, fresh this frame.
     */
    update(delta: number, playerPos: THREE.Vector3): void {
        const { cursor, group, bodyMat, chestMat } = this;
        if (this.phase === 'GONE' || !cursor || !group || !bodyMat || !chestMat)
            return;

        // Delayed entrance: while WAITING the ghost is unadded and its clock
        // is frozen. It enters (and starts walking) only once the player has
        // first put ENTRY_DISTANCE between themselves and the trail start —
        // it is always something you turn around and find.
        if (this.phase === 'WAITING') {
            const ex = playerPos.x - group.position.x;
            const ez = playerPos.z - group.position.z;
            if (ex * ex + ez * ez >= GHOST.ENTRY_DISTANCE * GHOST.ENTRY_DISTANCE) {
                this.scene.add(group);
                this.phase = 'WALKING';
            }
            return;
        }

        this.clock += delta;

        if (this.phase === 'WALKING') {
            // Cursor sampling: forward-only (the clock is monotonic), reused
            // output object — the replay never allocates per frame.
            const sample = cursor.sample(this.clock);
            if (sample) {
                // y pinned to the ground plane: memory never falls into the rift.
                group.position.set(sample.x, 0, sample.z);
                group.rotation.y = stepAngleToward(group.rotation.y, sample.rotationY, delta);
                this.lightBase = sample.flower;
                if (sample.done) {
                    this.phase = 'HOLDING';
                    this.phaseTimer = 0;
                }
            }
        }
        else if (this.phase === 'HOLDING') {
            this.phaseTimer += delta;
            if (this.phaseTimer >= GHOST.HOLD_SECONDS) {
                this.phase = 'FADING';
                this.phaseTimer = 0;
            }
        }
        else { // FADING
            this.phaseTimer += delta;
            if (this.phaseTimer >= GHOST.FADE_SECONDS) {
                this.vanish();
                return;
            }
        }

        // Recognition: the FIRST time the player comes within the horizontal
        // recognize radius AFTER having been observed outside it, the chest
        // light flares slightly — once, ever. The arming step (together with
        // the delayed entrance above, which guarantees the player starts
        // ENTRY_DISTANCE > RECOGNIZE_DISTANCE away) makes the flare mark a
        // real encounter rather than a spawn overlap.
        if (this.recognizedAt < 0) {
            const dx = playerPos.x - group.position.x;
            const dz = playerPos.z - group.position.z;
            const distSq = dx * dx + dz * dz;
            const recognizeSq = GHOST.RECOGNIZE_DISTANCE * GHOST.RECOGNIZE_DISTANCE;
            if (!this.recognizeArmed) {
                if (distSq > recognizeSq)
                    this.recognizeArmed = true;
            }
            else if (distSq < recognizeSq) {
                this.recognizedAt = this.clock;
            }
        }

        // Presence: low-frequency opacity oscillation x the final fade.
        const fade = this.phase === 'FADING'
            ? 1 - this.phaseTimer / GHOST.FADE_SECONDS
            : 1;
        const presence = GHOST.PRESENCE_MIN
            + (Math.sin(this.clock * GHOST.PRESENCE_SPEED) * 0.5 + 0.5)
            * (GHOST.PRESENCE_MAX - GHOST.PRESENCE_MIN);
        bodyMat.opacity = presence * fade;

        const boost = this.recognizedAt >= 0
            ? recognitionBoost(this.clock - this.recognizedAt) * GHOST.RECOGNIZE_BOOST
            : 0;
        chestMat.color.setScalar(Math.min(1, this.lightBase + boost));
        chestMat.opacity = fade;
    }

    /** Remove the ghost from the world and free its owned GPU resources. */
    private vanish(): void {
        this.phase = 'GONE';
        if (this.group) {
            this.group.parent?.remove(this.group);
            this.group = null;
        }
        // Shared body geometry belongs to SharedAssets (never disposed here);
        // the ghost owns its two materials and the chest quad geometry.
        this.bodyMat?.dispose();
        this.bodyMat = null;
        this.chestMat?.dispose();
        this.chestMat = null;
        this.chestGeo?.dispose();
        this.chestGeo = null;
    }

    dispose(): void {
        this.vanish();
    }
}
