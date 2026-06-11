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
//   FADE_SECONDS, and is gone for the session (one-time by design).
//
// No stored trail / corrupt data => silently no ghost. All animation is
// delta-driven (pause-gated upstream) and allocation-free per frame.

import type { TrailPoint } from '../stats/TrailRecorder';
import * as THREE from 'three';
import { GHOST, TRAIL } from '../config';
import { loadTrail } from '../stats/TrailRecorder';
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
 * Facing for segment `seg`: the direction of the latest non-degenerate
 * segment at or before it (a ghost standing still keeps looking where it was
 * last walking). 0 when the whole trail so far never moved.
 */
function headingForSegment(points: readonly TrailPoint[], seg: number): number {
    for (let i = seg; i >= 0; i--) {
        const dx = points[i + 1].x - points[i].x;
        const dz = points[i + 1].z - points[i].z;
        if (dx * dx + dz * dz > 1e-6)
            return Math.atan2(dx, dz);
    }
    return 0;
}

/**
 * Sample a trail at time `t` (seconds since replay start): linear position /
 * flower interpolation between the two keyframes around t, with `interval`
 * seconds per keyframe (the recorder's sampling rhythm). Clamps to the trail
 * ends; `done` flips once t reaches the final point. Null for an empty
 * trail. Pure.
 */
export function sampleTrail(
    points: readonly TrailPoint[],
    t: number,
    interval: number = TRAIL.SAMPLE_INTERVAL,
): GhostSample | null {
    if (points.length === 0 || interval <= 0)
        return null;
    const last = points.length - 1;
    if (last === 0) {
        const only = points[0];
        return { x: only.x, z: only.z, flower: only.flower, rotationY: 0, done: true };
    }

    const end = last * interval;
    const clamped = Math.max(0, Math.min(t, end));
    const seg = Math.min(last - 1, Math.floor(clamped / interval));
    const s = clamped / interval - seg;
    const a = points[seg];
    const b = points[seg + 1];
    return {
        x: a.x + (b.x - a.x) * s,
        z: a.z + (b.z - a.z) * s,
        flower: a.flower + (b.flower - a.flower) * s,
        rotationY: headingForSegment(points, seg),
        done: t >= end,
    };
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
 * trail from storage (or takes an injected one — tests) and silently does
 * nothing at all when there is none. Driven once per frame by
 * RoomFlowUpdater (which also owns its dispose).
 */
export class GhostSystem {
    private readonly trail: readonly TrailPoint[] | null;

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
     * @param trail - Replay trail; defaults to the persisted last-run trail.
     *   Null / fewer than 2 points => no ghost this session (静默).
     */
    constructor(
        private readonly scene: THREE.Scene,
        trail: readonly TrailPoint[] | null = loadTrail(),
    ) {
        this.trail = trail && trail.length >= 2 ? trail : null;
        if (!this.trail)
            return;

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
        const start = this.trail[0];
        group.position.set(start.x, 0, start.z);
        group.rotation.y = sampleTrail(this.trail, 0)?.rotationY ?? 0;

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
        const { trail, group, bodyMat, chestMat } = this;
        if (this.phase === 'GONE' || !trail || !group || !bodyMat || !chestMat)
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
            const sample = sampleTrail(trail, this.clock);
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
