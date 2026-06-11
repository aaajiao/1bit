import type { TrailPoint } from '../src/stats/TrailRecorder';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GAMEPLAY, GHOST, TRAIL } from '../src/config';
import {
    clearStoredTrail,
    decodeTrail,
    encodeTrail,
    loadTrail,
    saveTrail,
    TrailRecorder,
} from '../src/stats/TrailRecorder';
import {
    GhostSystem,
    recognitionBoost,
    sampleTrail,
    stepAngleToward,
    TrailCursor,
} from '../src/world/GhostSystem';

const INTERVAL = TRAIL.SAMPLE_INTERVAL;

function makeTrail(triples: [number, number, number][]): TrailPoint[] {
    return triples.map(([x, z, flower]) => ({ x, z, flower }));
}

/** Minimal in-memory Storage double (tests run in node — no localStorage). */
function makeFakeStorage(initial: Record<string, string> = {}): Storage {
    const map = new Map(Object.entries(initial));
    return {
        get length() { return map.size; },
        clear: () => map.clear(),
        getItem: (key: string) => map.get(key) ?? null,
        key: (index: number) => [...map.keys()][index] ?? null,
        removeItem: (key: string) => void map.delete(key),
        setItem: (key: string, value: string) => void map.set(key, String(value)),
    } as Storage;
}

describe('trail config (F4 ghost replay)', () => {
    it('keeps the knobs self-consistent', () => {
        expect(TRAIL.SAMPLE_INTERVAL).toBeGreaterThan(0);
        expect(TRAIL.MAX_POINTS).toBeGreaterThan(TRAIL.MIN_POINTS);
        // Ring buffer covers on the order of ~20 minutes at the cadence.
        expect(TRAIL.MAX_POINTS * TRAIL.SAMPLE_INTERVAL).toBeGreaterThanOrEqual(600);
        expect(TRAIL.MAX_POINTS * TRAIL.SAMPLE_INTERVAL).toBeLessThanOrEqual(3600);
        // A run too short for a snapshot is too short for a ghost.
        expect(TRAIL.MIN_POINTS * TRAIL.SAMPLE_INTERVAL)
            .toBeGreaterThanOrEqual(GAMEPLAY.MIN_RUN_DURATION_FOR_SNAPSHOT);
        // Presence band and fade timings are sane.
        expect(GHOST.PRESENCE_MIN).toBeGreaterThan(0);
        expect(GHOST.PRESENCE_MAX).toBeLessThanOrEqual(1);
        expect(GHOST.PRESENCE_MIN).toBeLessThan(GHOST.PRESENCE_MAX);
        expect(GHOST.HOLD_SECONDS).toBeGreaterThan(0);
        expect(GHOST.FADE_SECONDS).toBeGreaterThan(0);
        // Delayed entrance must put the player outside the recognize radius,
        // so the one-time flare is armed-by-construction at entry.
        expect(GHOST.ENTRY_DISTANCE).toBeGreaterThan(GHOST.RECOGNIZE_DISTANCE);
    });
});

describe('trail wire format (encode/decode)', () => {
    it('round-trips a trail through encode/decode', () => {
        const trail = makeTrail([[0.1, -2.5, 0.5], [10.3, 4.2, 0.75], [-7.8, 0, 1]]);
        const decoded = decodeTrail(encodeTrail(trail));
        expect(decoded).toEqual(trail);
        // The decoder rebuilds clean objects (no aliasing of parsed payloads).
        expect(decoded).not.toBe(trail);
        expect(decoded![0]).not.toBe(trail[0]);
    });

    it('quantizes coordinates to 0.1m and flower to 0.01 (JSON size)', () => {
        const decoded = decodeTrail(encodeTrail(makeTrail([
            [1.2345, -6.7891, 0.123456],
            [100.06, 0.04, 0.987],
        ])));
        expect(decoded).toEqual([
            { x: 1.2, z: -6.8, flower: 0.12 },
            { x: 100.1, z: 0, flower: 0.99 },
        ]);
    });

    it('clamps out-of-range flower intensities on both ends', () => {
        const decoded = decodeTrail(encodeTrail(makeTrail([[0, 0, -1], [1, 1, 7]])));
        expect(decoded![0].flower).toBe(0);
        expect(decoded![1].flower).toBe(1);
    });

    it('stamps the configured wire version on encode', () => {
        const payload = JSON.parse(encodeTrail(makeTrail([[0, 0, 0], [1, 1, 1]]))) as { version: number };
        expect(payload.version).toBe(TRAIL.VERSION);
    });

    it('rejects null/empty/corrupt input', () => {
        expect(decodeTrail(null)).toBeNull();
        expect(decodeTrail(undefined)).toBeNull();
        expect(decodeTrail('')).toBeNull();
        expect(decodeTrail('not json {{')).toBeNull();
        expect(decodeTrail('42')).toBeNull();
        expect(decodeTrail('null')).toBeNull();
        expect(decodeTrail('"a string"')).toBeNull();
    });

    it('rejects a version mismatch (stale payloads read as absent)', () => {
        const payload = JSON.parse(encodeTrail(makeTrail([[0, 0, 0], [1, 1, 1]]))) as Record<string, unknown>;
        payload.version = TRAIL.VERSION + 1;
        expect(decodeTrail(JSON.stringify(payload))).toBeNull();
    });

    it('rejects malformed point arrays', () => {
        const base = { version: TRAIL.VERSION };
        expect(decodeTrail(JSON.stringify({ ...base, points: 'nope' }))).toBeNull();
        // Truncated triplet.
        expect(decodeTrail(JSON.stringify({ ...base, points: [0, 0, 0, 1, 1] }))).toBeNull();
        // Non-numeric / non-finite entries.
        expect(decodeTrail(JSON.stringify({ ...base, points: [0, 0, 0, 'a', 1, 1] }))).toBeNull();
        expect(decodeTrail(JSON.stringify({ ...base, points: [0, 0, 0, null, 1, 1] }))).toBeNull();
        // Non-finite numbers (JSON 1e999 parses to Infinity).
        expect(decodeTrail(`{"version":${TRAIL.VERSION},"points":[0,0,0,1e999,1,1]}`)).toBeNull();
        // Missing points entirely.
        expect(decodeTrail(JSON.stringify(base))).toBeNull();
    });

    it('rejects trails too short to walk (< 2 points => 静默无幽灵)', () => {
        expect(decodeTrail(JSON.stringify({ version: TRAIL.VERSION, points: [] }))).toBeNull();
        expect(decodeTrail(JSON.stringify({ version: TRAIL.VERSION, points: [1, 2, 0.5] }))).toBeNull();
    });

    it('trims oversized trails to the cap, keeping the most recent (tail)', () => {
        const over = Array.from(
            { length: TRAIL.MAX_POINTS + 5 },
            (_, k) => [k, 0, 0.5] as [number, number, number],
        );
        const decoded = decodeTrail(encodeTrail(makeTrail(over)));
        expect(decoded).toHaveLength(TRAIL.MAX_POINTS);
        // Tail (most recent walk) survives; the oldest 5 are dropped.
        expect(decoded![0].x).toBe(5);
        expect(decoded![TRAIL.MAX_POINTS - 1].x).toBe(TRAIL.MAX_POINTS + 4);
    });
});

describe('trailRecorder (ring buffer on the 2s stats cadence)', () => {
    it('records the spawn point on the very first frame', () => {
        const rec = new TrailRecorder();
        rec.update(1 / 60, 3, -4, 0.5);
        expect(rec.getPoints()).toEqual([{ x: 3, z: -4, flower: 0.5 }]);
    });

    it('then samples once per SAMPLE_INTERVAL, frame-rate independently', () => {
        const rec = new TrailRecorder();
        // 10 simulated seconds at 60fps after the initial sample.
        for (let i = 0; i < 600; i++)
            rec.update(1 / 60, i, i, 0.5);
        // 1 spawn sample + floor((10s - first frame) / 2s) = 5 -> 5 or 6.
        const n60 = rec.getPoints().length;
        expect(n60).toBeGreaterThanOrEqual(5);
        expect(n60).toBeLessThanOrEqual(6);

        // Same wall time at 10fps lands the same number of samples (±1).
        const rec10 = new TrailRecorder();
        for (let i = 0; i < 100; i++)
            rec10.update(1 / 10, i, i, 0.5);
        expect(Math.abs(rec10.getPoints().length - n60)).toBeLessThanOrEqual(1);
    });

    it('caps at MAX_POINTS, dropping the oldest first (last ~20 minutes)', () => {
        const rec = new TrailRecorder();
        const extra = 25;
        for (let i = 0; i < TRAIL.MAX_POINTS + extra; i++)
            rec.update(INTERVAL, i, 0, 0.5);
        const points = rec.getPoints();
        expect(points).toHaveLength(TRAIL.MAX_POINTS);
        expect(points[0].x).toBe(extra);
        expect(points[points.length - 1].x).toBe(TRAIL.MAX_POINTS + extra - 1);
    });

    it('hasMeaningfulTrail flips at MIN_POINTS, and reset starts over', () => {
        const rec = new TrailRecorder();
        for (let i = 0; i < TRAIL.MIN_POINTS - 1; i++)
            rec.update(INTERVAL, i, i, 0.5);
        expect(rec.hasMeaningfulTrail()).toBe(false);
        rec.update(INTERVAL, 99, 99, 0.5);
        expect(rec.hasMeaningfulTrail()).toBe(true);

        rec.reset();
        expect(rec.getPoints()).toEqual([]);
        expect(rec.hasMeaningfulTrail()).toBe(false);
        // The post-reset timer is "due" again: first frame samples immediately.
        rec.update(1 / 60, 7, 7, 0.7);
        expect(rec.getPoints()).toEqual([{ x: 7, z: 7, flower: 0.7 }]);
    });
});

describe('trail persistence (save/load/clear)', () => {
    it('saves under the configured key and loads the same trail back', () => {
        const storage = makeFakeStorage();
        const trail = makeTrail([[0, 0, 0.5], [2, 2, 0.6], [4, 0, 0.7]]);
        saveTrail(trail, storage);
        expect(storage.getItem(TRAIL.KEY)).not.toBeNull();
        expect(loadTrail(storage)).toEqual(trail);
    });

    it('returns null from empty storage and treats corrupt entries as absent', () => {
        expect(loadTrail(makeFakeStorage())).toBeNull();
        expect(loadTrail(makeFakeStorage({ [TRAIL.KEY]: '{broken' }))).toBeNull();
    });

    it('is a silent no-op without storage (privacy mode / node)', () => {
        expect(() => saveTrail(makeTrail([[0, 0, 0], [1, 1, 1]]), null)).not.toThrow();
        expect(loadTrail(null)).toBeNull();
        expect(() => clearStoredTrail(null)).not.toThrow();
    });

    it('swallows setItem failures (quota exceeded)', () => {
        const storage = makeFakeStorage();
        storage.setItem = () => {
            throw new Error('QuotaExceededError');
        };
        expect(() => saveTrail(makeTrail([[0, 0, 0], [1, 1, 1]]), storage)).not.toThrow();
    });

    it('clearStoredTrail removes the persisted key (the forgetting, F2/F4)', () => {
        const storage = makeFakeStorage();
        saveTrail(makeTrail([[0, 0, 0.5], [1, 1, 0.5]]), storage);
        clearStoredTrail(storage);
        expect(storage.getItem(TRAIL.KEY)).toBeNull();
        expect(loadTrail(storage)).toBeNull();
    });
});

describe('sampleTrail (pure replay interpolator)', () => {
    const trail = makeTrail([
        [0, 0, 0.2], // t = 0
        [10, 0, 0.4], // t = INTERVAL, heading +x
        [10, 20, 1.0], // t = 2*INTERVAL, heading +z
    ]);

    it('returns the exact keyframes at sample times', () => {
        const s0 = sampleTrail(trail, 0)!;
        expect(s0.x).toBe(0);
        expect(s0.z).toBe(0);
        expect(s0.flower).toBe(0.2);
        expect(s0.done).toBe(false);

        const s1 = sampleTrail(trail, INTERVAL)!;
        expect(s1.x).toBe(10);
        expect(s1.z).toBe(0);
        expect(s1.flower).toBe(0.4);
        expect(s1.done).toBe(false);
    });

    it('lerps position and flower at the midpoint of a segment', () => {
        const mid = sampleTrail(trail, INTERVAL * 1.5)!;
        expect(mid.x).toBeCloseTo(10, 12);
        expect(mid.z).toBeCloseTo(10, 12);
        expect(mid.flower).toBeCloseTo(0.7, 12);
        expect(mid.done).toBe(false);
    });

    it('faces the walk direction (local +z forward convention)', () => {
        // First segment walks +x => rotationY = atan2(dx, dz) = π/2.
        expect(sampleTrail(trail, INTERVAL * 0.5)!.rotationY).toBeCloseTo(Math.PI / 2, 12);
        // Second segment walks +z => rotationY = 0.
        expect(sampleTrail(trail, INTERVAL * 1.5)!.rotationY).toBeCloseTo(0, 12);
    });

    it('keeps the previous heading through a stationary segment', () => {
        const still = makeTrail([[0, 0, 0.5], [0, 10, 0.5], [0, 10, 0.8], [0, 10, 0.2]]);
        // Segments 1 and 2 are degenerate; the +z heading of segment 0 holds.
        expect(sampleTrail(still, INTERVAL * 1.5)!.rotationY).toBeCloseTo(0, 12);
        expect(sampleTrail(still, INTERVAL * 2.5)!.rotationY).toBeCloseTo(0, 12);
        // A trail that never moved faces 0 by convention.
        const frozen = makeTrail([[5, 5, 0.5], [5, 5, 0.5]]);
        expect(sampleTrail(frozen, INTERVAL * 0.5)!.rotationY).toBe(0);
    });

    it('clamps beyond both ends and flags done at the final point', () => {
        const before = sampleTrail(trail, -5)!;
        expect(before.x).toBe(0);
        expect(before.done).toBe(false);

        const atEnd = sampleTrail(trail, INTERVAL * 2)!;
        expect(atEnd.x).toBe(10);
        expect(atEnd.z).toBe(20);
        expect(atEnd.done).toBe(true);

        const past = sampleTrail(trail, INTERVAL * 99)!;
        expect(past.x).toBe(10);
        expect(past.z).toBe(20);
        expect(past.flower).toBe(1);
        expect(past.done).toBe(true);
    });

    it('handles degenerate trails (empty => null, single point => done)', () => {
        expect(sampleTrail([], 0)).toBeNull();
        const single = sampleTrail(makeTrail([[3, 4, 0.6]]), 0)!;
        expect(single).toEqual({ x: 3, z: 4, flower: 0.6, rotationY: 0, done: true });
    });

    it('is deterministic for identical inputs', () => {
        expect(sampleTrail(trail, 1.234)).toEqual(sampleTrail(trail, 1.234));
    });
});

describe('trailCursor (forward-only per-frame sampler)', () => {
    const trail = makeTrail([
        [0, 0, 0.2],
        [10, 0, 0.4],
        [10, 0, 0.6], // stationary segment: heading must hold
        [10, 20, 1.0],
    ]);

    it('matches the pure sampleTrail across a monotonic sweep', () => {
        const cursor = new TrailCursor(trail);
        const end = INTERVAL * (trail.length - 1);
        for (let t = -0.5; t <= end + 1; t += 0.13) {
            const fromCursor = cursor.sample(t)!;
            const oneShot = sampleTrail(trail, t)!;
            expect(fromCursor).toEqual(oneShot);
        }
    });

    it('returns ONE reused object mutated in place (per-frame allocation-free)', () => {
        const cursor = new TrailCursor(makeTrail([[0, 0, 0.1], [4, 0, 0.9]]));
        const first = cursor.sample(0);
        expect(cursor.sample(INTERVAL / 2)).toBe(first);
        expect(cursor.sample(INTERVAL)).toBe(first);
    });

    it('keeps the previous heading through stationary segments', () => {
        const cursor = new TrailCursor(trail);
        // Segment 0 walks +x => π/2; segment 1 is degenerate => heading holds.
        expect(cursor.sample(INTERVAL * 0.5)!.rotationY).toBeCloseTo(Math.PI / 2, 12);
        expect(cursor.sample(INTERVAL * 1.5)!.rotationY).toBeCloseTo(Math.PI / 2, 12);
        // Segment 2 walks +z => 0 again.
        expect(cursor.sample(INTERVAL * 2.5)!.rotationY).toBeCloseTo(0, 12);
    });

    it('never moves backwards: a regressing t clamps onto the current segment', () => {
        const cursor = new TrailCursor(trail);
        const ahead = cursor.sample(INTERVAL * 2.5)!;
        const aheadX = ahead.x;
        const aheadZ = ahead.z;
        // t regresses below the cursor's segment: clamp to its start keyframe
        // (the cursor only ever advances), never a rescan to an earlier one.
        const back = cursor.sample(INTERVAL * 0.5)!;
        expect(back.x).toBe(trail[2].x);
        expect(back.z).toBe(trail[2].z);
        // And it resumes forward correctly from there.
        const resumed = cursor.sample(INTERVAL * 2.5)!;
        expect(resumed.x).toBeCloseTo(aheadX, 12);
        expect(resumed.z).toBeCloseTo(aheadZ, 12);
    });

    it('handles degenerate trails like sampleTrail (null / single-point done)', () => {
        expect(new TrailCursor([]).sample(0)).toBeNull();
        expect(new TrailCursor(trail, 0).sample(0)).toBeNull();
        const single = new TrailCursor(makeTrail([[3, 4, 0.6]])).sample(0)!;
        expect(single).toEqual({ x: 3, z: 4, flower: 0.6, rotationY: 0, done: true });
    });
});

describe('stepAngleToward (shortest-arc, frame-rate independent)', () => {
    it('converges toward the target without overshoot', () => {
        let angle = 0;
        for (let i = 0; i < 240; i++)
            angle = stepAngleToward(angle, 1.5, 1 / 60, 6);
        expect(angle).toBeCloseTo(1.5, 3);
    });

    it('takes the short way across the ±π wrap', () => {
        // From just below +π to just above -π: the short arc passes π (up),
        // so the very first step must INCREASE the angle.
        const stepped = stepAngleToward(3.0, -3.0, 1 / 60, 6);
        expect(stepped).toBeGreaterThan(3.0);
    });

    it('composes across delta splits (exponential easing)', () => {
        const whole = stepAngleToward(0, 1, 0.2, 6);
        let split = 0;
        for (let i = 0; i < 4; i++)
            split = stepAngleToward(split, 1, 0.05, 6);
        expect(split).toBeCloseTo(whole, 12);
    });
});

describe('recognitionBoost (one-time flare envelope)', () => {
    const { RECOGNIZE_RISE_SECONDS: rise, RECOGNIZE_FALL_SECONDS: fall } = GHOST;

    it('rises to 1 at the rise time, falls back to 0, then stays 0', () => {
        expect(recognitionBoost(0)).toBe(0);
        expect(recognitionBoost(rise / 2)).toBeCloseTo(0.5, 12);
        expect(recognitionBoost(rise)).toBe(1);
        expect(recognitionBoost(rise + fall / 2)).toBeCloseTo(0.5, 12);
        expect(recognitionBoost(rise + fall)).toBe(0);
        expect(recognitionBoost(rise + fall + 100)).toBe(0);
    });

    it('is 0 for negative time (not yet recognized)', () => {
        expect(recognitionBoost(-1)).toBe(0);
    });

    it('stays within [0, 1] across the whole envelope', () => {
        for (let t = 0; t <= rise + fall + 1; t += 0.05) {
            const b = recognitionBoost(t);
            expect(b).toBeGreaterThanOrEqual(0);
            expect(b).toBeLessThanOrEqual(1);
        }
    });
});

describe('ghostSystem (headless integration)', () => {
    const FAR_PLAYER = new THREE.Vector3(1000, 2, 1000);

    function countGhostMeshes(scene: THREE.Scene): number {
        let meshes = 0;
        scene.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh)
                meshes++;
        });
        return meshes;
    }

    it('spawns at the trail start and walks it at the recorded rhythm', () => {
        const scene = new THREE.Scene();
        const trail = makeTrail([[0, 0, 0.3], [10, 0, 0.5], [10, 20, 0.9]]);
        const ghost = new GhostSystem(scene, null, trail);
        // Waits unseen until the player leaves the trail start behind.
        expect(ghost.isPresent()).toBe(false);
        expect(countGhostMeshes(scene)).toBe(0);
        ghost.update(0.05, FAR_PLAYER); // player is far away => enters
        expect(ghost.isPresent()).toBe(true);
        // Body + head + chest light.
        expect(countGhostMeshes(scene)).toBe(3);

        const group = scene.children[0] as THREE.Group;
        expect(group.position.x).toBe(0);
        expect(group.position.z).toBe(0);

        // Advance one full sample interval (delta-driven).
        for (let i = 0; i < 60; i++)
            ghost.update(INTERVAL / 60, FAR_PLAYER);
        expect(group.position.x).toBeCloseTo(10, 5);
        expect(group.position.z).toBeCloseTo(0, 5);
        // y stays pinned to the ground plane the whole way.
        expect(group.position.y).toBe(0);
        ghost.dispose();
    });

    it('waits for the player to leave the trail start before entering (偶遇)', () => {
        const scene = new THREE.Scene();
        const ghost = new GhostSystem(scene, null, makeTrail([[0, 0, 0.5], [5, 0, 0.5]]));

        // The player lingers near the trail start (= the deterministic spawn
        // point): no ghost, no clock — it would otherwise be born inside the
        // player and burn its one-time recognition on frame zero.
        const atSpawn = new THREE.Vector3(1, 2, 1);
        for (let i = 0; i < 100; i++)
            ghost.update(0.05, atSpawn);
        expect(ghost.isPresent()).toBe(false);
        expect(scene.children).toHaveLength(0);

        // Just inside the entry radius: still waiting.
        const near = new THREE.Vector3(GHOST.ENTRY_DISTANCE - 1, 2, 0);
        ghost.update(0.05, near);
        expect(ghost.isPresent()).toBe(false);

        // The player finally walks away: the ghost enters AT the trail start
        // and begins its walk only now.
        const away = new THREE.Vector3(GHOST.ENTRY_DISTANCE + 5, 2, 0);
        ghost.update(0.05, away);
        expect(ghost.isPresent()).toBe(true);
        expect(countGhostMeshes(scene)).toBe(3);
        const group = scene.children[0] as THREE.Group;
        expect(group.position.x).toBe(0);
        expect(group.position.z).toBe(0);
        ghost.dispose();
    });

    it('dispose while still waiting leaves no trace', () => {
        const scene = new THREE.Scene();
        const ghost = new GhostSystem(scene, null, makeTrail([[0, 0, 0.5], [5, 0, 0.5]]));
        ghost.update(0.05, new THREE.Vector3(0, 2, 0)); // still waiting
        ghost.dispose();
        expect(ghost.isPresent()).toBe(false);
        expect(scene.children).toHaveLength(0);
        // Inert afterward: a disposed waiting ghost can never enter.
        expect(() => ghost.update(0.05, FAR_PLAYER)).not.toThrow();
        expect(scene.children).toHaveLength(0);
    });

    it('holds at the end, fades, and is gone for the session', () => {
        const scene = new THREE.Scene();
        const ghost = new GhostSystem(scene, null, makeTrail([[0, 0, 0.5], [2, 0, 0.5]]));

        // Walk to the end, through the hold and the fade, plus margin.
        const total = INTERVAL + GHOST.HOLD_SECONDS + GHOST.FADE_SECONDS + 1;
        const steps = Math.ceil(total / 0.05);
        for (let i = 0; i < steps; i++)
            ghost.update(0.05, FAR_PLAYER);

        expect(ghost.isPresent()).toBe(false);
        expect(countGhostMeshes(scene)).toBe(0);
        // Further updates are inert (one-time by design).
        expect(() => ghost.update(0.05, FAR_PLAYER)).not.toThrow();
        ghost.dispose();
    });

    it('flares the chest light once when the player comes within 10m', () => {
        const scene = new THREE.Scene();
        // A long stationary-ish trail so the ghost stays walking throughout.
        const trail = makeTrail(Array.from({ length: 50 }, (_, k) => [k * 0.1, 0, 0.4] as [number, number, number]));
        const ghost = new GhostSystem(scene, null, trail);
        const far = new THREE.Vector3(500, 2, 500);
        ghost.update(0.05, far); // delayed entrance: the ghost enters
        ghost.update(0.05, far); // observed outside the radius => arms
        const group = scene.children[0] as THREE.Group;
        const chest = group.children[2] as THREE.Mesh;
        const chestMat = chest.material as THREE.MeshBasicMaterial;
        const baseline = chestMat.color.r;

        // Step near the ghost: the flare rises over the next updates.
        const near = new THREE.Vector3(group.position.x + 3, 2, group.position.z);
        let peak = 0;
        const flareSteps = Math.ceil(
            (GHOST.RECOGNIZE_RISE_SECONDS + GHOST.RECOGNIZE_FALL_SECONDS) / 0.05,
        );
        for (let i = 0; i < flareSteps; i++) {
            ghost.update(0.05, near);
            peak = Math.max(peak, chestMat.color.r);
        }
        expect(peak).toBeGreaterThan(baseline + GHOST.RECOGNIZE_BOOST * 0.5);

        // After the envelope, the light settles back near the recorded value
        // and NEVER flares again, even when approached again.
        for (let i = 0; i < 40; i++)
            ghost.update(0.05, far);
        const settled = chestMat.color.r;
        let second = 0;
        for (let i = 0; i < flareSteps; i++) {
            ghost.update(0.05, near);
            second = Math.max(second, chestMat.color.r);
        }
        expect(second).toBeLessThanOrEqual(settled + 0.01);
        ghost.dispose();
    });

    it('is silently inert with no / unusable trail (静默无幽灵)', () => {
        const scene = new THREE.Scene();
        for (const trail of [null, [], makeTrail([[1, 1, 0.5]])]) {
            const ghost = new GhostSystem(scene, null, trail);
            expect(ghost.isPresent()).toBe(false);
            expect(scene.children).toHaveLength(0);
            expect(() => ghost.update(0.05, FAR_PLAYER)).not.toThrow();
            ghost.dispose();
        }
    });

    it('dispose mid-walk removes everything (PauseController dispose chain)', () => {
        const scene = new THREE.Scene();
        const ghost = new GhostSystem(scene, null, makeTrail([[0, 0, 0.5], [5, 5, 0.5]]));
        ghost.update(0.5, FAR_PLAYER);
        ghost.dispose();
        expect(ghost.isPresent()).toBe(false);
        expect(scene.children).toHaveLength(0);
        expect(() => ghost.dispose()).not.toThrow();
    });
});

describe('ghost trail burn-after-read (阅后即焚, one-time across boots)', () => {
    const FAR_PLAYER = new THREE.Vector3(1000, 2, 1000);

    it('consumes the stored trail the moment a ghost is constructed from it', () => {
        const storage = makeFakeStorage();
        saveTrail(makeTrail([[0, 0, 0.5], [5, 0, 0.6], [10, 0, 0.7]]), storage);
        const scene = new THREE.Scene();
        const ghost = new GhostSystem(scene, storage);

        // The stored copy is gone BEFORE the ghost even enters the world:
        // a re-boot from here would find nothing — the same ghost can never
        // walk twice, even when this run ends too short to save a new trail.
        expect(storage.getItem(TRAIL.KEY)).toBeNull();
        expect(loadTrail(storage)).toBeNull();

        // The in-memory copy still drives a full, correct replay.
        ghost.update(0.05, FAR_PLAYER);
        expect(ghost.isPresent()).toBe(true);
        const group = scene.children[0] as THREE.Group;
        expect(group.position.x).toBe(0);
        expect(group.position.z).toBe(0);
        ghost.dispose();
    });

    it('leaves storage untouched when there is nothing stored (no ghost)', () => {
        const storage = makeFakeStorage({ unrelated: 'keep' });
        const ghost = new GhostSystem(new THREE.Scene(), storage);
        expect(ghost.isPresent()).toBe(false);
        expect(storage.getItem('unrelated')).toBe('keep');
        ghost.dispose();
    });

    it('leaves corrupt stored data in place (construction failed => no burn)', () => {
        const storage = makeFakeStorage({ [TRAIL.KEY]: '{broken' });
        const ghost = new GhostSystem(new THREE.Scene(), storage);
        expect(ghost.isPresent()).toBe(false);
        expect(storage.getItem(TRAIL.KEY)).toBe('{broken');
        ghost.dispose();
    });

    it('leaves a too-short stored trail in place (decodes as absent => no burn)', () => {
        const storage = makeFakeStorage();
        saveTrail(makeTrail([[1, 1, 0.5]]), storage); // 1 point: unwalkable
        const before = storage.getItem(TRAIL.KEY);
        expect(before).not.toBeNull();
        const ghost = new GhostSystem(new THREE.Scene(), storage);
        expect(ghost.isPresent()).toBe(false);
        expect(storage.getItem(TRAIL.KEY)).toBe(before);
        ghost.dispose();
    });

    it('does not burn the storage for an injected trail when none is stored', () => {
        // Tests / future callers may inject a trail directly; with nothing
        // persisted the clear is a harmless no-op on other keys.
        const storage = makeFakeStorage({ unrelated: 'keep' });
        const ghost = new GhostSystem(new THREE.Scene(), storage, makeTrail([[0, 0, 0.5], [5, 0, 0.5]]));
        ghost.update(0.05, FAR_PLAYER);
        expect(ghost.isPresent()).toBe(true);
        expect(storage.getItem('unrelated')).toBe('keep');
        ghost.dispose();
    });
});
