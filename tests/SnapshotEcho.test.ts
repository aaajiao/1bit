import { describe, expect, it } from 'vitest';
import { SNAPSHOT_ECHO, WORLD } from '../src/config/constants';
import {
    echoDelaySeconds,
    echoDurationSeconds,
    echoVisible,
    pickEchoIndex,
} from '../src/world/SnapshotEcho';

describe('snapshotEcho (world drafts your portrait)', () => {
    describe('config sanity (SNAPSHOT_ECHO)', () => {
        it('keeps the arming interval a positive few-minute band', () => {
            expect(SNAPSHOT_ECHO.MIN_INTERVAL).toBeGreaterThan(0);
            expect(SNAPSHOT_ECHO.MAX_INTERVAL).toBeGreaterThan(SNAPSHOT_ECHO.MIN_INTERVAL);
        });

        it('keeps the display duration a positive few-second band', () => {
            expect(SNAPSHOT_ECHO.DURATION_MIN).toBeGreaterThan(0);
            expect(SNAPSHOT_ECHO.DURATION_MAX).toBeGreaterThan(SNAPSHOT_ECHO.DURATION_MIN);
        });

        it('leaves a steady middle: the two flicker windows fit inside the shortest display', () => {
            expect(SNAPSHOT_ECHO.FLICKER_IN_SECONDS + SNAPSHOT_ECHO.FLICKER_OUT_SECONDS)
                .toBeLessThan(SNAPSHOT_ECHO.DURATION_MIN);
        });

        it('keeps the search radius inside the 3x3 near-chunk scan window', () => {
            // The 3x3 scan is a NEAR-complete heuristic, not exhaustive within
            // RADIUS: buildings are matched by their chunk-local anchor, and a
            // rim building whose placement+wander+scar dislocation (~40.5m) pushes
            // it toward a two-steps-away chunk can sit inside RADIUS yet be missed.
            // Keeping RADIUS < CHUNK_SIZE bounds that to at most the outer rim
            // (benign: such a building simply cannot host that event — no crash).
            expect(SNAPSHOT_ECHO.RADIUS).toBeLessThan(WORLD.CHUNK_SIZE);
        });
    });

    describe('echoDelaySeconds', () => {
        it('is deterministic and inside [MIN_INTERVAL, MAX_INTERVAL]', () => {
            for (let i = 0; i < 200; i++) {
                const d = echoDelaySeconds(i);
                expect(d).toBe(echoDelaySeconds(i));
                expect(d).toBeGreaterThanOrEqual(SNAPSHOT_ECHO.MIN_INTERVAL);
                expect(d).toBeLessThanOrEqual(SNAPSHOT_ECHO.MAX_INTERVAL);
            }
        });

        it('varies across event indices (not a constant)', () => {
            const values = new Set<number>();
            for (let i = 0; i < 40; i++)
                values.add(echoDelaySeconds(i));
            expect(values.size).toBeGreaterThan(20);
        });
    });

    describe('echoDurationSeconds', () => {
        it('is deterministic and inside [DURATION_MIN, DURATION_MAX]', () => {
            for (let i = 0; i < 200; i++) {
                const d = echoDurationSeconds(i);
                expect(d).toBe(echoDurationSeconds(i));
                expect(d).toBeGreaterThanOrEqual(SNAPSHOT_ECHO.DURATION_MIN);
                expect(d).toBeLessThanOrEqual(SNAPSHOT_ECHO.DURATION_MAX);
            }
        });
    });

    describe('pickEchoIndex', () => {
        it('returns -1 when there is no candidate', () => {
            expect(pickEchoIndex(0, 0)).toBe(-1);
            expect(pickEchoIndex(7, -3)).toBe(-1);
        });

        it('returns a valid, deterministic index within range', () => {
            for (let e = 0; e < 50; e++) {
                for (const count of [1, 2, 5, 13]) {
                    const idx = pickEchoIndex(e, count);
                    expect(idx).toBe(pickEchoIndex(e, count));
                    expect(idx).toBeGreaterThanOrEqual(0);
                    expect(idx).toBeLessThan(count);
                    expect(Number.isInteger(idx)).toBe(true);
                }
            }
        });

        it('spreads picks across the candidate range over many events', () => {
            const hits = new Set<number>();
            for (let e = 0; e < 100; e++)
                hits.add(pickEchoIndex(e, 5));
            expect(hits.size).toBe(5); // every slot is reachable
        });
    });

    describe('echoVisible (hard flicker, no fade)', () => {
        const D = 6; // a mid-band duration

        it('is off before the display and at/after its end', () => {
            expect(echoVisible(-0.1, D)).toBe(false);
            expect(echoVisible(D, D)).toBe(false);
            expect(echoVisible(D + 1, D)).toBe(false);
        });

        it('appears ON at the very first frame (hard materialize)', () => {
            expect(echoVisible(0, D)).toBe(true);
        });

        it('holds steady ON through the whole middle band', () => {
            const midStart = SNAPSHOT_ECHO.FLICKER_IN_SECONDS + 0.01;
            const midEnd = D - SNAPSHOT_ECHO.FLICKER_OUT_SECONDS - 0.01;
            for (let t = midStart; t < midEnd; t += 0.05)
                expect(echoVisible(t, D)).toBe(true);
        });

        it('actually toggles on/off inside the appear window', () => {
            const seen = new Set<boolean>();
            for (let t = 0; t < SNAPSHOT_ECHO.FLICKER_IN_SECONDS; t += 1 / (SNAPSHOT_ECHO.FLICKER_RATE * 4))
                seen.add(echoVisible(t, D));
            expect(seen.has(true)).toBe(true);
            expect(seen.has(false)).toBe(true);
        });

        it('actually toggles on/off inside the disappear window', () => {
            const seen = new Set<boolean>();
            const outStart = D - SNAPSHOT_ECHO.FLICKER_OUT_SECONDS;
            for (let t = outStart; t < D; t += 1 / (SNAPSHOT_ECHO.FLICKER_RATE * 4))
                seen.add(echoVisible(t, D));
            expect(seen.has(true)).toBe(true);
            expect(seen.has(false)).toBe(true);
        });

        it('returns a boolean (never a fractional alpha) across the display', () => {
            for (let t = 0; t < D; t += 0.017)
                expect(typeof echoVisible(t, D)).toBe('boolean');
        });
    });
});
