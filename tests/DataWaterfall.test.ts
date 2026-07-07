import { describe, expect, it } from 'vitest';
import { DATA_WATERFALL, PERFORMANCE } from '../src/config/constants';
import {
    nextWaterfallOffset,
    waterfallEligible,
    waterfallScrollSpeed,
    waterfallStripCount,
    waterfallStripParams,
} from '../src/world/DataWaterfall';

describe('dataWaterfall (INFO_OVERFLOW facades leak their records)', () => {
    describe('config contract (DATA_WATERFALL)', () => {
        it('keeps the building gate a usable fraction and the strip band sane', () => {
            expect(DATA_WATERFALL.BUILDING_FRACTION).toBeGreaterThan(0);
            expect(DATA_WATERFALL.BUILDING_FRACTION).toBeLessThanOrEqual(1);
            expect(DATA_WATERFALL.STRIPS_MIN).toBeGreaterThanOrEqual(1);
            expect(DATA_WATERFALL.STRIPS_MIN).toBeLessThanOrEqual(DATA_WATERFALL.STRIPS_MAX);
            // waterfallStripParams folds k in at a x4 seed stride (s = i*4+k):
            // raising STRIPS_MAX past 4 would make building i's strip 4 collide
            // with building i+1's strip 0 across every placement draw.
            expect(DATA_WATERFALL.STRIPS_MAX).toBeLessThanOrEqual(4);
            // A record column, not a billboard.
            expect(DATA_WATERFALL.STRIP_WIDTH).toBeGreaterThan(0);
            expect(DATA_WATERFALL.STRIP_WIDTH).toBeLessThan(2);
            expect(DATA_WATERFALL.LATERAL_RANGE).toBeGreaterThanOrEqual(0);
            expect(DATA_WATERFALL.FACE_OFFSET).toBeGreaterThan(0);
        });

        it('keeps the strip height band and clamps consistent', () => {
            expect(DATA_WATERFALL.BOTTOM_Y).toBeGreaterThanOrEqual(0);
            expect(DATA_WATERFALL.MIN_STRIP_HEIGHT).toBeGreaterThan(0);
            expect(DATA_WATERFALL.HEIGHT_MIN).toBeLessThanOrEqual(DATA_WATERFALL.HEIGHT_MAX);
            // The drawn band must clear the post-clamp floor or the clamp
            // would rewrite every draw.
            expect(DATA_WATERFALL.HEIGHT_MIN)
                .toBeGreaterThanOrEqual(DATA_WATERFALL.BOTTOM_Y + DATA_WATERFALL.MIN_STRIP_HEIGHT);
        });

        it('aligns the glyph cells with the vertical wrap seam', () => {
            // Cells must tile the texture exactly, or a glyph would straddle
            // the repeat boundary and the scroll would show a seam.
            expect(DATA_WATERFALL.GLYPH_PITCH).toBeGreaterThan(0);
            expect(DATA_WATERFALL.TEX_WIDTH % DATA_WATERFALL.GLYPH_PITCH).toBe(0);
            expect(DATA_WATERFALL.TEX_HEIGHT % DATA_WATERFALL.GLYPH_PITCH).toBe(0);
            expect(DATA_WATERFALL.GLYPH_GATE).toBeGreaterThan(0);
            expect(DATA_WATERFALL.GLYPH_GATE).toBeLessThan(1);
            expect(DATA_WATERFALL.BURST_GATE).toBeGreaterThan(0);
            expect(DATA_WATERFALL.BURST_GATE).toBeLessThan(1);
        });

        it('keeps the records always crawling, faster under a bright flower', () => {
            expect(DATA_WATERFALL.V_PER_METER).toBeGreaterThan(0);
            expect(DATA_WATERFALL.SPEED_BASE).toBeGreaterThan(0);
            expect(DATA_WATERFALL.SPEED_FLOWER_GAIN).toBeGreaterThanOrEqual(0);
        });
    });

    describe('waterfallEligible', () => {
        it('is deterministic per (cx, cz, i)', () => {
            for (let i = 0; i < 8; i++) {
                expect(waterfallEligible(3, -7, i)).toBe(waterfallEligible(3, -7, i));
            }
        });

        it('honors the fraction extremes (1 = every facade, 0 = none)', () => {
            for (let i = 0; i < 10; i++) {
                expect(waterfallEligible(i, -i, i, 1)).toBe(true);
                expect(waterfallEligible(i, -i, i, 0)).toBe(false);
            }
        });

        it('accepts roughly BUILDING_FRACTION of buildings over a wide sweep', () => {
            let accepted = 0;
            let total = 0;
            for (let cx = -10; cx <= 10; cx++) {
                for (let cz = -10; cz <= 10; cz++) {
                    for (let i = 0; i < 6; i++) {
                        if (waterfallEligible(cx, cz, i))
                            accepted++;
                        total++;
                    }
                }
            }
            const rate = accepted / total;
            expect(rate).toBeGreaterThan(DATA_WATERFALL.BUILDING_FRACTION - 0.08);
            expect(rate).toBeLessThan(DATA_WATERFALL.BUILDING_FRACTION + 0.08);
        });

        it('decorrelates the same building index across z-neighboring chunks', () => {
            // The cz fold in the seed: index i in vertically adjacent chunks
            // must not share one gate outcome forever.
            const outcomes = new Set<boolean>();
            for (let cz = -12; cz <= 12; cz++)
                outcomes.add(waterfallEligible(4, cz, 2));
            expect(outcomes.size).toBe(2);
        });
    });

    describe('waterfallStripCount', () => {
        it('stays within [STRIPS_MIN, STRIPS_MAX] and is deterministic', () => {
            for (let cx = -8; cx <= 8; cx += 2) {
                for (let i = 0; i < 6; i++) {
                    const count = waterfallStripCount(cx, -cx + 3, i);
                    expect(count).toBeGreaterThanOrEqual(DATA_WATERFALL.STRIPS_MIN);
                    expect(count).toBeLessThanOrEqual(DATA_WATERFALL.STRIPS_MAX);
                    expect(Number.isInteger(count)).toBe(true);
                    expect(waterfallStripCount(cx, -cx + 3, i)).toBe(count);
                }
            }
        });

        it('actually varies across buildings (not one fixed count)', () => {
            const counts = new Set<number>();
            for (let i = 0; i < 40; i++)
                counts.add(waterfallStripCount(i, -i, i % 7));
            expect(counts.size).toBeGreaterThan(1);
        });
    });

    describe('waterfallStripParams', () => {
        it('is deterministic per (cx, cz, i, k, height)', () => {
            const a = waterfallStripParams(5, -3, 2, 1, 12);
            const b = waterfallStripParams(5, -3, 2, 1, 12);
            expect(a).toEqual(b);
        });

        it('picks a valid facade and stays within the lateral band', () => {
            const sides = new Set<number>();
            for (let cx = -6; cx <= 6; cx++) {
                for (let i = 0; i < 5; i++) {
                    for (let k = 0; k < 3; k++) {
                        const p = waterfallStripParams(cx, cx * 2 - 5, i, k, 15);
                        expect(Number.isInteger(p.side)).toBe(true);
                        expect(p.side).toBeGreaterThanOrEqual(0);
                        expect(p.side).toBeLessThanOrEqual(3);
                        expect(Math.abs(p.lateral)).toBeLessThanOrEqual(DATA_WATERFALL.LATERAL_RANGE);
                        sides.add(p.side);
                    }
                }
            }
            // All four facades appear somewhere across the sweep.
            expect(sides.size).toBe(4);
        });

        it('keeps the vertical extent inside the band, clamped to the building', () => {
            for (let i = 0; i < 8; i++) {
                // Tall building: the drawn band applies unclamped.
                const tall = waterfallStripParams(2, 7, i, 0, 100);
                expect(tall.bottom).toBe(DATA_WATERFALL.BOTTOM_Y);
                expect(tall.top).toBeLessThanOrEqual(DATA_WATERFALL.HEIGHT_MAX);
                expect(tall.top).toBeGreaterThanOrEqual(DATA_WATERFALL.HEIGHT_MIN);

                // Mid building: records never scroll above the roof.
                const mid = waterfallStripParams(2, 7, i, 0, 8);
                expect(mid.top).toBeLessThanOrEqual(8);
                expect(mid.top - mid.bottom).toBeGreaterThanOrEqual(DATA_WATERFALL.MIN_STRIP_HEIGHT);
            }
        });

        it('floors a stub building at MIN_STRIP_HEIGHT (no degenerate quads)', () => {
            const stub = waterfallStripParams(0, 0, 3, 0, 0.5);
            expect(stub.top).toBe(DATA_WATERFALL.BOTTOM_Y + DATA_WATERFALL.MIN_STRIP_HEIGHT);
        });

        it('desyncs strips: phases live in [0,1) and differ across k', () => {
            const phases = new Set<number>();
            for (let k = 0; k < 3; k++) {
                const p = waterfallStripParams(4, -9, 1, k, 15);
                expect(p.phase).toBeGreaterThanOrEqual(0);
                expect(p.phase).toBeLessThan(1);
                phases.add(p.phase);
            }
            expect(phases.size).toBeGreaterThan(1);
        });

        it('never collides building i strip 1 with building i+1 strip 0', () => {
            // The x4 seed stride: (i, k) and (i+1, k-1) draw distinct params.
            const a = waterfallStripParams(3, 3, 2, 1, 15);
            const b = waterfallStripParams(3, 3, 3, 0, 15);
            expect(a).not.toEqual(b);
        });
    });

    describe('waterfallScrollSpeed', () => {
        it('maps intensity 0 to the base speed and 1 to base + gain', () => {
            expect(waterfallScrollSpeed(0)).toBeCloseTo(DATA_WATERFALL.SPEED_BASE, 10);
            expect(waterfallScrollSpeed(1)).toBeCloseTo(
                DATA_WATERFALL.SPEED_BASE + DATA_WATERFALL.SPEED_FLOWER_GAIN,
                10,
            );
        });

        it('clamps out-of-range intensities to the [0,1] band', () => {
            expect(waterfallScrollSpeed(-2)).toBeCloseTo(DATA_WATERFALL.SPEED_BASE, 10);
            expect(waterfallScrollSpeed(7)).toBeCloseTo(
                DATA_WATERFALL.SPEED_BASE + DATA_WATERFALL.SPEED_FLOWER_GAIN,
                10,
            );
        });

        it('is monotonically non-decreasing in intensity (brighter = faster)', () => {
            let prev = waterfallScrollSpeed(0);
            for (let f = 0.1; f <= 1.0001; f += 0.1) {
                const speed = waterfallScrollSpeed(f);
                expect(speed).toBeGreaterThanOrEqual(prev);
                prev = speed;
            }
        });
    });

    describe('nextWaterfallOffset', () => {
        it('advances by speed x dt for an ordinary frame', () => {
            const dt = 1 / 60;
            expect(nextWaterfallOffset(0, dt, 0)).toBeCloseTo(DATA_WATERFALL.SPEED_BASE * dt, 10);
            expect(nextWaterfallOffset(0.2, dt, 1)).toBeCloseTo(
                0.2 + (DATA_WATERFALL.SPEED_BASE + DATA_WATERFALL.SPEED_FLOWER_GAIN) * dt,
                10,
            );
        });

        it('wraps into [0,1) and stays there over a long march', () => {
            let offset = 0.999;
            for (let frame = 0; frame < 2000; frame++) {
                offset = nextWaterfallOffset(offset, 1 / 60, (frame % 10) / 10);
                expect(offset).toBeGreaterThanOrEqual(0);
                expect(offset).toBeLessThan(1);
            }
        });

        it('ignores non-positive deltas (clock reseed safety)', () => {
            expect(nextWaterfallOffset(0.4, 0, 1)).toBe(0.4);
            expect(nextWaterfallOffset(0.4, -5, 1)).toBe(0.4);
        });

        it('clamps a pause-sized gap to MAX_FRAME_DELTA (no teleporting streams)', () => {
            const clamped = nextWaterfallOffset(0.1, PERFORMANCE.MAX_FRAME_DELTA, 0.5);
            expect(nextWaterfallOffset(0.1, 999, 0.5)).toBeCloseTo(clamped, 10);
        });
    });
});
