import { describe, expect, it } from 'vitest';
import {
    INFO_OVERFLOW_REFRESH_MAP,
    lerpRoomShaderConfig,
    refreshIntervalForIntensity,
    ROOM_CONFIGS,
    RoomType,
} from '../src/world/RoomConfig';

/**
 * Phase 5b/6 — focused tests for the two NEW per-room post-process scalar
 * uniforms (uScanIntensity, uMisregister) and the revived per-frame interval
 * mapper (refreshIntervalForIntensity).
 *
 * The pre-existing RoomConfig/RoomColors suites cover the numeric/color lerp but
 * their close-comparison helpers do NOT assert these two new fields, so the lerp
 * of uScanIntensity/uMisregister is exercised here explicitly. Covers:
 * determinism, per-room differentiation, interpolation correctness, and bounds.
 */
describe('per-room post-process uniforms (uScanIntensity, uMisregister)', () => {
    const ALL_ROOMS = Object.values(RoomType);

    describe('config definition', () => {
        it('defines uScanIntensity and uMisregister for all four rooms', () => {
            for (const room of ALL_ROOMS) {
                const { shader } = ROOM_CONFIGS[room];
                expect(typeof shader.uScanIntensity).toBe('number');
                expect(typeof shader.uMisregister).toBe('number');
            }
        });

        it('keeps both scalars within the documented [0,1] range', () => {
            for (const room of ALL_ROOMS) {
                const { shader } = ROOM_CONFIGS[room];
                expect(shader.uScanIntensity).toBeGreaterThanOrEqual(0);
                expect(shader.uScanIntensity).toBeLessThanOrEqual(1);
                expect(shader.uMisregister).toBeGreaterThanOrEqual(0);
                expect(shader.uMisregister).toBeLessThanOrEqual(1);
            }
        });

        it('differentiates rooms: scan only FORCED_ALIGNMENT, misregister only IN_BETWEEN', () => {
            // uScanIntensity is the FORCED_ALIGNMENT signature; every other room is 0.
            expect(ROOM_CONFIGS[RoomType.FORCED_ALIGNMENT].shader.uScanIntensity).toBeGreaterThan(0);
            expect(ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader.uScanIntensity).toBe(0);
            expect(ROOM_CONFIGS[RoomType.IN_BETWEEN].shader.uScanIntensity).toBe(0);
            expect(ROOM_CONFIGS[RoomType.POLARIZED].shader.uScanIntensity).toBe(0);

            // uMisregister is the IN_BETWEEN signature; every other room is 0.
            expect(ROOM_CONFIGS[RoomType.IN_BETWEEN].shader.uMisregister).toBeGreaterThan(0);
            expect(ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader.uMisregister).toBe(0);
            expect(ROOM_CONFIGS[RoomType.FORCED_ALIGNMENT].shader.uMisregister).toBe(0);
            expect(ROOM_CONFIGS[RoomType.POLARIZED].shader.uMisregister).toBe(0);
        });

        it('keeps POLARIZED exactly inert (both scalars 0 so the hard-threshold branch is never perturbed)', () => {
            const { shader } = ROOM_CONFIGS[RoomType.POLARIZED];
            expect(shader.uScanIntensity).toBe(0);
            expect(shader.uMisregister).toBe(0);
        });
    });

    describe('lerpRoomShaderConfig — scan/misregister interpolation', () => {
        const fa = ROOM_CONFIGS[RoomType.FORCED_ALIGNMENT].shader; // scan 0.6, misreg 0.0
        const ib = ROOM_CONFIGS[RoomType.IN_BETWEEN].shader; // scan 0.0, misreg 0.5

        it('returns the from-config scalars at t=0', () => {
            const r = lerpRoomShaderConfig(fa, ib, 0);
            expect(r.uScanIntensity).toBeCloseTo(fa.uScanIntensity, 9);
            expect(r.uMisregister).toBeCloseTo(fa.uMisregister, 9);
        });

        it('returns the to-config scalars at t=1', () => {
            const r = lerpRoomShaderConfig(fa, ib, 1);
            expect(r.uScanIntensity).toBeCloseTo(ib.uScanIntensity, 9);
            expect(r.uMisregister).toBeCloseTo(ib.uMisregister, 9);
        });

        it('interpolates both scalars linearly at the midpoint', () => {
            const r = lerpRoomShaderConfig(fa, ib, 0.5);
            // scan: 0.6 -> 0.0, midpoint 0.3; misreg: 0.0 -> 0.5, midpoint 0.25.
            expect(r.uScanIntensity).toBeCloseTo((fa.uScanIntensity + ib.uScanIntensity) / 2, 9);
            expect(r.uMisregister).toBeCloseTo((fa.uMisregister + ib.uMisregister) / 2, 9);
            expect(r.uScanIntensity).toBeCloseTo(0.3, 9);
            expect(r.uMisregister).toBeCloseTo(0.25, 9);
        });

        it('interpolates linearly at an arbitrary t', () => {
            const t = 0.3;
            const r = lerpRoomShaderConfig(fa, ib, t);
            expect(r.uScanIntensity).toBeCloseTo(fa.uScanIntensity + (ib.uScanIntensity - fa.uScanIntensity) * t, 9);
            expect(r.uMisregister).toBeCloseTo(fa.uMisregister + (ib.uMisregister - fa.uMisregister) * t, 9);
        });

        it('clamps t<0 to the from-config scalars (no undershoot)', () => {
            const r = lerpRoomShaderConfig(fa, ib, -3);
            expect(r.uScanIntensity).toBeCloseTo(fa.uScanIntensity, 9);
            expect(r.uMisregister).toBeCloseTo(fa.uMisregister, 9);
        });

        it('clamps t>1 to the to-config scalars (no overshoot)', () => {
            const r = lerpRoomShaderConfig(fa, ib, 4);
            expect(r.uScanIntensity).toBeCloseTo(ib.uScanIntensity, 9);
            expect(r.uMisregister).toBeCloseTo(ib.uMisregister, 9);
        });

        it('is deterministic for the same inputs', () => {
            const a = lerpRoomShaderConfig(fa, ib, 0.42);
            const b = lerpRoomShaderConfig(fa, ib, 0.42);
            expect(a.uScanIntensity).toBe(b.uScanIntensity);
            expect(a.uMisregister).toBe(b.uMisregister);
        });

        it('never escapes [0,1] for any ordered pair of rooms across the t-range', () => {
            for (const a of ALL_ROOMS) {
                for (const b of ALL_ROOMS) {
                    const sa = ROOM_CONFIGS[a].shader;
                    const sb = ROOM_CONFIGS[b].shader;
                    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
                        const r = lerpRoomShaderConfig(sa, sb, t);
                        expect(r.uScanIntensity).toBeGreaterThanOrEqual(0);
                        expect(r.uScanIntensity).toBeLessThanOrEqual(1);
                        expect(r.uMisregister).toBeGreaterThanOrEqual(0);
                        expect(r.uMisregister).toBeLessThanOrEqual(1);
                    }
                }
            }
        });

        it('does not mutate the source configs', () => {
            const faScan = fa.uScanIntensity;
            const faMis = fa.uMisregister;
            const ibScan = ib.uScanIntensity;
            const ibMis = ib.uMisregister;
            lerpRoomShaderConfig(fa, ib, 0.5);
            expect(fa.uScanIntensity).toBe(faScan);
            expect(fa.uMisregister).toBe(faMis);
            expect(ib.uScanIntensity).toBe(ibScan);
            expect(ib.uMisregister).toBe(ibMis);
        });
    });
});

describe('refreshIntervalForIntensity (INFO_OVERFLOW flicker cadence)', () => {
    const BREAKPOINTS = Object.keys(INFO_OVERFLOW_REFRESH_MAP)
        .map(Number)
        .sort((a, b) => a - b);
    const MIN_INTERVAL = Math.min(...Object.values(INFO_OVERFLOW_REFRESH_MAP));
    const MAX_INTERVAL = Math.max(...Object.values(INFO_OVERFLOW_REFRESH_MAP));

    it('is deterministic for the same intensity', () => {
        expect(refreshIntervalForIntensity(0.42)).toBe(refreshIntervalForIntensity(0.42));
    });

    it('returns exactly the mapped value at each breakpoint', () => {
        for (const bp of BREAKPOINTS) {
            expect(refreshIntervalForIntensity(bp)).toBeCloseTo(INFO_OVERFLOW_REFRESH_MAP[bp], 9);
        }
    });

    it('clamps below the lowest breakpoint to the slowest interval', () => {
        const lowest = BREAKPOINTS[0];
        expect(refreshIntervalForIntensity(lowest - 0.5)).toBe(INFO_OVERFLOW_REFRESH_MAP[lowest]);
        expect(refreshIntervalForIntensity(0)).toBe(INFO_OVERFLOW_REFRESH_MAP[lowest]);
        expect(refreshIntervalForIntensity(-1)).toBe(INFO_OVERFLOW_REFRESH_MAP[lowest]);
    });

    it('clamps above the highest breakpoint to the fastest interval', () => {
        const highest = BREAKPOINTS[BREAKPOINTS.length - 1];
        expect(refreshIntervalForIntensity(highest + 0.5)).toBe(INFO_OVERFLOW_REFRESH_MAP[highest]);
        expect(refreshIntervalForIntensity(2)).toBe(INFO_OVERFLOW_REFRESH_MAP[highest]);
    });

    it('interpolates linearly between two breakpoints', () => {
        // Between 0.5 (3.5s) and 0.7 (2.5s): midpoint intensity 0.6 -> 3.0s.
        expect(refreshIntervalForIntensity(0.6)).toBeCloseTo(3.0, 9);
        // Between 0.1 (6.0s) and 0.3 (5.0s): intensity 0.2 -> 5.5s.
        expect(refreshIntervalForIntensity(0.2)).toBeCloseTo(5.5, 9);
    });

    it('is monotonically non-increasing as intensity rises (faster flicker)', () => {
        // Higher intensity => shorter interval => faster flicker.
        let prev = refreshIntervalForIntensity(0);
        for (let i = 0.05; i <= 1.0001; i += 0.05) {
            const cur = refreshIntervalForIntensity(i);
            expect(cur).toBeLessThanOrEqual(prev + 1e-9);
            prev = cur;
        }
    });

    it('stays within the map value bounds for any intensity', () => {
        for (let i = -0.5; i <= 1.5; i += 0.01) {
            const v = refreshIntervalForIntensity(i);
            expect(v).toBeGreaterThanOrEqual(MIN_INTERVAL - 1e-9);
            expect(v).toBeLessThanOrEqual(MAX_INTERVAL + 1e-9);
        }
    });
});
