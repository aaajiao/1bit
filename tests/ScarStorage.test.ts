import type { PersistedScars } from '../src/stats/ScarStorage';
import type { ScarPoint } from '../src/world/ScarField';
import { describe, expect, it } from 'vitest';
import { SCAR_FIELD, SCAR_STORAGE, WORLD } from '../src/config';
import {
    createEmptyScarRecord,
    decodeScarRecord,
    encodeScarRecord,
    loadScarRecord,
    saveScarRecord,
    ScarStore,
    withRunCompleted,
    withScarAt,
} from '../src/stats/ScarStorage';
import {
    scarDepth,
    scarDistortionFor,
    scarSeverityAt,
    scarsNearChunk,
} from '../src/world/ScarField';

function makeRecord(scars: ScarPoint[] = [], runsCompleted = 0): PersistedScars {
    return { version: SCAR_STORAGE.VERSION, scars, runsCompleted };
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

describe('scar wire format (F2 cross-run scars)', () => {
    it('round-trips a record through encode/decode', () => {
        const record = makeRecord([{ x: 3, z: -2, count: 4 }, { x: 0, z: 0, count: 1 }], 7);
        const decoded = decodeScarRecord(encodeScarRecord(record));
        expect(decoded).toEqual(record);
        // The decoder rebuilds clean objects (no aliasing of parsed payloads).
        expect(decoded).not.toBe(record);
        expect(decoded!.scars[0]).not.toBe(record.scars[0]);
    });

    it('stamps the configured wire version on encode', () => {
        const payload = JSON.parse(encodeScarRecord(createEmptyScarRecord())) as { version: number };
        expect(payload.version).toBe(SCAR_STORAGE.VERSION);
    });

    it('rejects null/empty/corrupt input', () => {
        expect(decodeScarRecord(null)).toBeNull();
        expect(decodeScarRecord(undefined)).toBeNull();
        expect(decodeScarRecord('')).toBeNull();
        expect(decodeScarRecord('not json {{')).toBeNull();
        expect(decodeScarRecord('42')).toBeNull();
        expect(decodeScarRecord('null')).toBeNull();
        expect(decodeScarRecord('"a string"')).toBeNull();
    });

    it('rejects a version mismatch (stale payloads read as absent)', () => {
        const payload = JSON.parse(encodeScarRecord(makeRecord([], 2))) as Record<string, unknown>;
        payload.version = SCAR_STORAGE.VERSION + 1;
        expect(decodeScarRecord(JSON.stringify(payload))).toBeNull();
    });

    it('rejects malformed scars and runsCompleted fields', () => {
        const base = JSON.parse(encodeScarRecord(makeRecord([{ x: 1, z: 2, count: 3 }], 1))) as Record<string, any>;

        expect(decodeScarRecord(JSON.stringify({ ...base, scars: 'nope' }))).toBeNull();
        expect(decodeScarRecord(JSON.stringify({ ...base, scars: [{ x: 1, z: 2 }] }))).toBeNull();
        expect(decodeScarRecord(JSON.stringify({ ...base, scars: [{ x: 1, z: 2, count: 0 }] }))).toBeNull();
        expect(decodeScarRecord(JSON.stringify({ ...base, scars: [{ x: 'a', z: 2, count: 1 }] }))).toBeNull();
        expect(decodeScarRecord(JSON.stringify({ ...base, scars: [null] }))).toBeNull();
        expect(decodeScarRecord(JSON.stringify({ ...base, runsCompleted: -1 }))).toBeNull();
        expect(decodeScarRecord(JSON.stringify({ ...base, runsCompleted: 'many' }))).toBeNull();
        expect(decodeScarRecord(JSON.stringify({ ...base, runsCompleted: undefined }))).toBeNull();
    });

    it('trims oversized scar lists to the cap, keeping the most recent (tail)', () => {
        const over = Array.from({ length: SCAR_STORAGE.MAX_SCARS + 5 }, (_, k) => ({ x: k, z: 0, count: 1 }));
        const decoded = decodeScarRecord(encodeScarRecord(makeRecord(over, 0)));
        expect(decoded!.scars).toHaveLength(SCAR_STORAGE.MAX_SCARS);
        // Tail (most recently touched) survives; the oldest 5 are dropped.
        expect(decoded!.scars[0]!.x).toBe(5);
        expect(decoded!.scars[SCAR_STORAGE.MAX_SCARS - 1]!.x).toBe(SCAR_STORAGE.MAX_SCARS + 4);
    });
});

// Place spacing safely beyond the aggregation radius (distinct scars).
const APART = SCAR_FIELD.RADIUS * 4;

describe('scar aggregation (withScarAt / withRunCompleted)', () => {
    it('appends a new place as a fresh count-1 scar anchored at the resistance', () => {
        const next = withScarAt(createEmptyScarRecord(), 2, -3);
        expect(next.scars).toEqual([{ x: 2, z: -3, count: 1 }]);
    });

    it('quantizes the stored anchor to the POSITION_GRID', () => {
        const next = withScarAt(createEmptyScarRecord(), 3.26, -7.74);
        expect(next.scars).toEqual([{ x: 3.5, z: -7.5, count: 1 }]);
    });

    it('aggregates a repeat resistance at the same spot (count++) without drifting', () => {
        let record = createEmptyScarRecord();
        record = withScarAt(record, 2, -3);
        record = withScarAt(record, 2, -3);
        record = withScarAt(record, 2, -3);
        expect(record.scars).toEqual([{ x: 2, z: -3, count: 3 }]);
    });

    it('aggregates within RADIUS, nudging the anchor toward the new position', () => {
        let record = createEmptyScarRecord();
        record = withScarAt(record, 0, 0);
        // 40m away: inside RADIUS (60) => same scar, anchor drifts by NUDGE.
        record = withScarAt(record, 40, 0);
        expect(record.scars).toHaveLength(1);
        expect(record.scars[0]!.count).toBe(2);
        expect(record.scars[0]!.x).toBeCloseTo(40 * SCAR_STORAGE.ANCHOR_NUDGE, 12);
        expect(record.scars[0]!.z).toBe(0);
    });

    it('opens a NEW scar beyond RADIUS (the wound stays where it happened)', () => {
        let record = createEmptyScarRecord();
        record = withScarAt(record, 0, 0);
        record = withScarAt(record, SCAR_FIELD.RADIUS, 0);
        expect(record.scars).toHaveLength(2);
        expect(record.scars.map(s => s.count)).toEqual([1, 1]);
    });

    it('moves a re-touched scar to the most-recent end', () => {
        let record = createEmptyScarRecord();
        record = withScarAt(record, 0, 0);
        record = withScarAt(record, APART, APART);
        record = withScarAt(record, 0, 0); // touch the older one again
        expect(record.scars.map(s => `${s.x},${s.z}`)).toEqual([`${APART},${APART}`, '0,0']);
        expect(record.scars[1]!.count).toBe(2);
    });

    it('evicts the least-recently-touched scar when over the cap', () => {
        let record = createEmptyScarRecord();
        for (let k = 0; k < SCAR_STORAGE.MAX_SCARS; k++)
            record = withScarAt(record, k * APART, 0);
        // Refresh the would-be-oldest entry, then overflow with a far place.
        record = withScarAt(record, 0, 0);
        record = withScarAt(record, -APART, -APART);
        expect(record.scars).toHaveLength(SCAR_STORAGE.MAX_SCARS);
        // Place (APART,0) became the oldest after (0,0) was refreshed.
        expect(record.scars.some(s => s.x === APART && s.z === 0)).toBe(false);
        expect(record.scars.some(s => s.x === 0 && s.z === 0)).toBe(true);
        expect(record.scars.some(s => s.x === -APART && s.z === -APART)).toBe(true);
    });

    it('never mutates its input (boot snapshots stay frozen)', () => {
        const original = makeRecord([{ x: 1, z: 1, count: 1 }], 2);
        const originalScars = original.scars;
        withScarAt(original, 1, 1);
        withScarAt(original, 5, 5);
        withRunCompleted(original);
        expect(original.scars).toBe(originalScars);
        expect(original).toEqual(makeRecord([{ x: 1, z: 1, count: 1 }], 2));
    });

    it('withRunCompleted increments the counter only', () => {
        const next = withRunCompleted(makeRecord([{ x: 1, z: 1, count: 1 }], 4));
        expect(next.runsCompleted).toBe(5);
        expect(next.scars).toEqual([{ x: 1, z: 1, count: 1 }]);
    });
});

describe('scar persistence (save/load/ScarStore)', () => {
    it('saves under the configured key and loads the same record back', () => {
        const storage = makeFakeStorage();
        const record = makeRecord([{ x: 1, z: 2, count: 3 }], 6);
        saveScarRecord(record, storage);
        expect(storage.getItem(SCAR_STORAGE.KEY)).not.toBeNull();
        expect(loadScarRecord(storage)).toEqual(record);
    });

    it('returns null from empty storage and treats corrupt entries as absent', () => {
        expect(loadScarRecord(makeFakeStorage())).toBeNull();
        const corrupt = makeFakeStorage({ [SCAR_STORAGE.KEY]: '{broken' });
        expect(loadScarRecord(corrupt)).toBeNull();
    });

    it('is a silent no-op without storage (privacy mode / node)', () => {
        expect(() => saveScarRecord(createEmptyScarRecord(), null)).not.toThrow();
        expect(loadScarRecord(null)).toBeNull();
        const store = new ScarStore(null);
        expect(() => store.recordScar(0, 0)).not.toThrow();
        expect(() => store.forgetAll()).not.toThrow();
    });

    it('swallows setItem failures (quota exceeded)', () => {
        const storage = makeFakeStorage();
        storage.setItem = () => {
            throw new Error('QuotaExceededError');
        };
        expect(() => saveScarRecord(createEmptyScarRecord(), storage)).not.toThrow();
    });

    it('scarStore boots from storage and starts empty on corrupt data', () => {
        const storage = makeFakeStorage();
        saveScarRecord(makeRecord([{ x: 4, z: 4, count: 2 }], 3), storage);
        const store = new ScarStore(storage);
        expect(store.getScars()).toEqual([{ x: 4, z: 4, count: 2 }]);
        expect(store.getRunsCompleted()).toBe(3);
        expect(store.hasMemory()).toBe(true);

        const broken = new ScarStore(makeFakeStorage({ [SCAR_STORAGE.KEY]: 'garbage' }));
        expect(broken.getScars()).toEqual([]);
        expect(broken.getRunsCompleted()).toBe(0);
        expect(broken.hasMemory()).toBe(false);
    });

    it('scarStore persists every mutation immediately', () => {
        const storage = makeFakeStorage();
        const store = new ScarStore(storage);
        store.recordScar(7, -7);
        store.recordScar(7, -7);
        store.recordRunCompleted();
        const persisted = loadScarRecord(storage);
        expect(persisted).toEqual(makeRecord([{ x: 7, z: -7, count: 2 }], 1));
    });

    it('scarStore boot snapshot stays frozen across later mutations', () => {
        const store = new ScarStore(makeFakeStorage());
        store.recordScar(1, 1);
        const bootView = store.getScars();
        store.recordScar(1, 1);
        store.recordScar(APART, APART); // a distinct, far-away place
        // The previously handed-out array was never mutated (replaced wholesale).
        expect(bootView).toEqual([{ x: 1, z: 1, count: 1 }]);
        expect(store.getScars()).toHaveLength(2);
    });

    it('forgetAll clears memory and removes the persisted key', () => {
        const storage = makeFakeStorage();
        const store = new ScarStore(storage);
        store.recordScar(1, 1);
        store.recordRunCompleted();
        expect(store.hasMemory()).toBe(true);
        store.forgetAll();
        expect(store.hasMemory()).toBe(false);
        expect(store.getScars()).toEqual([]);
        expect(store.getRunsCompleted()).toBe(0);
        expect(storage.getItem(SCAR_STORAGE.KEY)).toBeNull();
    });
});

describe('scar field distortion (pure, deterministic)', () => {
    // The anchor IS the scar's stored world position (the resistance spot).
    const scar: ScarPoint = { x: 0, z: 0, count: 1 };
    const anchorX = scar.x;
    const anchorZ = scar.z;

    it('scarDepth ramps gently from MIN_DEPTH and clamps at saturation', () => {
        expect(scarDepth(1)).toBeGreaterThanOrEqual(SCAR_FIELD.MIN_DEPTH);
        expect(scarDepth(1)).toBeLessThan(1);
        expect(scarDepth(SCAR_FIELD.COUNT_SATURATION)).toBe(1);
        expect(scarDepth(SCAR_FIELD.COUNT_SATURATION * 10)).toBe(1);
        // Monotonic in count.
        for (let c = 1; c < SCAR_FIELD.COUNT_SATURATION; c++)
            expect(scarDepth(c + 1)).toBeGreaterThan(scarDepth(c));
    });

    it('a recorded resistance scars the very spot it happened at (record -> field)', () => {
        // The F2 promise: come back next session to where you resisted and
        // the wound is THERE — not at some cluster center 50-113m away.
        const resistX = 137.3;
        const resistZ = -912.8;
        const record = withScarAt(createEmptyScarRecord(), resistX, resistZ);
        const severityAtSpot = scarSeverityAt(record.scars, resistX, resistZ);
        // Quantization moves the anchor by at most POSITION_GRID/2 per axis.
        const maxQuantizationLoss = Math.hypot(SCAR_STORAGE.POSITION_GRID / 2, SCAR_STORAGE.POSITION_GRID / 2) / SCAR_FIELD.RADIUS;
        expect(severityAtSpot).toBeGreaterThanOrEqual(scarDepth(1) * (1 - maxQuantizationLoss));
    });

    it('severity is maximal at the anchor, fades with distance, 0 beyond RADIUS', () => {
        const atAnchor = scarSeverityAt([scar], anchorX, anchorZ);
        const mid = scarSeverityAt([scar], anchorX + SCAR_FIELD.RADIUS / 2, anchorZ);
        const outside = scarSeverityAt([scar], anchorX + SCAR_FIELD.RADIUS, anchorZ);
        expect(atAnchor).toBeCloseTo(scarDepth(1), 12);
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(atAnchor);
        expect(outside).toBe(0);
        expect(scarSeverityAt([], anchorX, anchorZ)).toBe(0);
    });

    it('overlapping scars take the MAX, not the sum', () => {
        const a: ScarPoint = { x: 0, z: 0, count: SCAR_FIELD.COUNT_SATURATION };
        const b: ScarPoint = { x: 0, z: 0, count: 1 };
        const both = scarSeverityAt([a, b], anchorX, anchorZ);
        expect(both).toBeCloseTo(scarDepth(SCAR_FIELD.COUNT_SATURATION), 12);
        expect(both).toBeLessThanOrEqual(1);
    });

    it('severity grows with the aggregated count (温和递增)', () => {
        const one = scarSeverityAt([{ x: 0, z: 0, count: 1 }], anchorX + 10, anchorZ);
        const three = scarSeverityAt([{ x: 0, z: 0, count: 3 }], anchorX + 10, anchorZ);
        expect(three).toBeGreaterThan(one);
    });

    it('distortion is deterministic for identical inputs (position -> amounts)', () => {
        const a = scarDistortionFor(0.8, 3, 5, -7);
        const b = scarDistortionFor(0.8, 3, 5, -7);
        expect(a).toEqual(b);
        // And differs across seeds (different buildings get different wounds).
        const c = scarDistortionFor(0.8, 4, 5, -7);
        expect(c).not.toEqual(a);
    });

    it('distortion stays within the clamped maxima, scaled by severity', () => {
        for (const severity of [0.25, 0.5, 1, 7]) {
            const s = Math.min(1, severity);
            for (let i = 0; i < 8; i++) {
                const d = scarDistortionFor(severity, i, 11, -4);
                expect(Math.abs(d.tiltX)).toBeLessThanOrEqual(SCAR_FIELD.MAX_TILT_RAD * s);
                expect(Math.abs(d.tiltZ)).toBeLessThanOrEqual(SCAR_FIELD.MAX_TILT_RAD * s);
                expect(d.sink).toBeGreaterThanOrEqual(0);
                expect(d.sink).toBeLessThanOrEqual(SCAR_FIELD.MAX_SINK * s);
                expect(Math.abs(d.offsetX)).toBeLessThanOrEqual(SCAR_FIELD.MAX_OFFSET * s);
                expect(Math.abs(d.offsetZ)).toBeLessThanOrEqual(SCAR_FIELD.MAX_OFFSET * s);
            }
        }
    });

    it('zero severity produces exactly zero distortion (unscarred world untouched)', () => {
        expect(scarDistortionFor(0, 2, 3, 4)).toEqual({ tiltX: 0, tiltZ: 0, sink: 0, offsetX: 0, offsetZ: 0 });
        expect(scarDistortionFor(-1, 2, 3, 4)).toEqual({ tiltX: 0, tiltZ: 0, sink: 0, offsetX: 0, offsetZ: 0 });
    });

    it('scarsNearChunk keeps exactly the scars whose circle reaches the chunk footprint', () => {
        // Scar anchored at world (0, 0) — its own stored position.
        const scars: ScarPoint[] = [scar];
        // Chunk (0,0): footprint [-40,40)² — contains the anchor.
        expect(scarsNearChunk(scars, 0, 0)).toHaveLength(1);
        // Chunk (1,1): footprint [40,120)² — corner (40,40) is ~56.6m from
        // the anchor, inside RADIUS.
        expect(scarsNearChunk(scars, 1, 1)).toHaveLength(1);
        // A far chunk: distance from anchor to footprint >> RADIUS.
        const farChunk = Math.ceil((SCAR_FIELD.RADIUS + WORLD.CHUNK_SIZE) / WORLD.CHUNK_SIZE) + 2;
        expect(scarsNearChunk(scars, farChunk, farChunk)).toHaveLength(0);
        // Brute-force agreement: a kept chunk must contain SOME in-range point.
        for (let cx = -3; cx <= 3; cx++) {
            for (let cz = -3; cz <= 3; cz++) {
                const kept = scarsNearChunk(scars, cx, cz).length > 0;
                let reachable = false;
                const half = WORLD.CHUNK_SIZE / 2;
                for (let px = -half; px <= half && !reachable; px += 4) {
                    for (let pz = -half; pz <= half && !reachable; pz += 4) {
                        const wx = cx * WORLD.CHUNK_SIZE + px;
                        const wz = cz * WORLD.CHUNK_SIZE + pz;
                        if (Math.hypot(wx - anchorX, wz - anchorZ) < SCAR_FIELD.RADIUS)
                            reachable = true;
                    }
                }
                expect(kept).toBe(reachable);
            }
        }
    });
});
