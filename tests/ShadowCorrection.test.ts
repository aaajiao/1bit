import { describe, expect, it } from 'vitest';
import { FA_SHADOW } from '../src/config/constants';
import { FA_RIFT } from '../src/world/RoomConfig';
import {
    correctedShadowRect,
    quantizeShadowExtent,
    scarShadowSkew,
    shadowCrossesCrack,
} from '../src/world/ShadowCorrection';

describe('shadowCorrection (FORCED_ALIGNMENT idealized shadows)', () => {
    describe('config contract (FA_SHADOW)', () => {
        it('keeps the size clamps on the quantization grid', () => {
            // quantizeShadowExtent clamps AFTER rounding; the clamps must be
            // multiples of QUANT or clamping would break the grid rhythm.
            expect(FA_SHADOW.QUANT).toBeGreaterThan(0);
            expect(FA_SHADOW.MIN_SIZE % FA_SHADOW.QUANT).toBe(0);
            expect(FA_SHADOW.MAX_SIZE % FA_SHADOW.QUANT).toBe(0);
            expect(FA_SHADOW.MIN_SIZE).toBeGreaterThan(0);
            expect(FA_SHADOW.MIN_SIZE).toBeLessThanOrEqual(FA_SHADOW.MAX_SIZE);
        });

        it('keeps the decal a thin lifted floor overlay with sane skew clamps', () => {
            expect(FA_SHADOW.LIFT).toBeGreaterThan(0);
            expect(FA_SHADOW.LIFT).toBeLessThan(0.1);
            expect(FA_SHADOW.OFFSET_FACTOR).toBeGreaterThan(0);
            expect(FA_SHADOW.MAX_PER_CHUNK).toBeGreaterThanOrEqual(1);
            expect(FA_SHADOW.MAX_SKEW_ROT_RAD).toBeGreaterThan(0);
            // Keep the failed correction readable as a RECTANGLE gone wrong,
            // not arbitrary debris: under a quarter turn, shear below 1.
            expect(FA_SHADOW.MAX_SKEW_ROT_RAD).toBeLessThan(Math.PI / 4);
            expect(FA_SHADOW.MAX_SHEAR).toBeGreaterThan(0);
            expect(FA_SHADOW.MAX_SHEAR).toBeLessThan(1);
            expect(FA_SHADOW.MAX_SKEW_OFFSET).toBeGreaterThan(0);
        });

        it('keeps the crack keep-out band covering the gap without eating the corridor', () => {
            // Must cover the abyss plane half-width (crackWidth/2 + 3 = 5 in
            // FloorTile.createCrackedFloorMesh) so no decal floats over it...
            expect(FA_SHADOW.CRACK_KEEPOUT).toBeGreaterThanOrEqual(5);
            // ...but stay below the building clearance, or every
            // shore-adjacent decal would be skipped outright.
            expect(FA_SHADOW.CRACK_KEEPOUT).toBeLessThan(FA_RIFT.CLEARANCE);
        });
    });

    describe('quantizeShadowExtent', () => {
        it('returns multiples of QUANT clamped to [MIN_SIZE, MAX_SIZE]', () => {
            for (let extent = 0; extent <= 40; extent += 0.7) {
                const q = quantizeShadowExtent(extent);
                expect(q % FA_SHADOW.QUANT).toBe(0);
                expect(q).toBeGreaterThanOrEqual(FA_SHADOW.MIN_SIZE);
                expect(q).toBeLessThanOrEqual(FA_SHADOW.MAX_SIZE);
            }
        });

        it('floors tiny footprints to MIN_SIZE and caps huge ones at MAX_SIZE', () => {
            expect(quantizeShadowExtent(0)).toBe(FA_SHADOW.MIN_SIZE);
            expect(quantizeShadowExtent(0.4)).toBe(FA_SHADOW.MIN_SIZE);
            expect(quantizeShadowExtent(500)).toBe(FA_SHADOW.MAX_SIZE);
        });

        it('is monotonically non-decreasing in the footprint', () => {
            let prev = quantizeShadowExtent(0);
            for (let extent = 0.5; extent <= 30; extent += 0.5) {
                const q = quantizeShadowExtent(extent);
                expect(q).toBeGreaterThanOrEqual(prev);
                prev = q;
            }
        });
    });

    describe('correctedShadowRect', () => {
        it('is deterministic and grid-quantized on both axes', () => {
            const a = correctedShadowRect(5.3, 9.8);
            const b = correctedShadowRect(5.3, 9.8);
            expect(a).toEqual(b);
            expect(a.width % FA_SHADOW.QUANT).toBe(0);
            expect(a.depth % FA_SHADOW.QUANT).toBe(0);
        });

        it('idealizes: footprints in the same quantization bucket share one rect', () => {
            // The deliberate shape/shadow mismatch — nearby footprints collapse
            // onto the identical too-regular rectangle.
            const a = correctedShadowRect(6.2, 7.1);
            const b = correctedShadowRect(7.7, 8.9);
            expect(a.width).toBe(b.width);
            expect(a.depth).toBe(b.depth);
        });

        it('displaces every rect along the ONE fixed global azimuth', () => {
            // Direction constancy is the contract: anisotropic footprints
            // (4x20, 20x4, 8x16) must displace at exactly AZIMUTH_RAD, not an
            // aspect-ratio-bent angle; the magnitude is OFFSET_FACTOR of the
            // mean quantized extent.
            for (const [fx, fz] of [[3, 3], [4, 20], [20, 4], [8, 16], [6, 10], [14, 5], [30, 30]]) {
                const rect = correctedShadowRect(fx, fz);
                expect(Math.atan2(rect.offsetZ, rect.offsetX)).toBeCloseTo(FA_SHADOW.AZIMUTH_RAD, 10);
                expect(Math.hypot(rect.offsetX, rect.offsetZ)).toBeCloseTo(
                    FA_SHADOW.OFFSET_FACTOR * (rect.width + rect.depth) / 2,
                    10,
                );
            }
        });

        it('scales the displacement with the quantized extent (grid rhythm)', () => {
            const small = correctedShadowRect(FA_SHADOW.MIN_SIZE, FA_SHADOW.MIN_SIZE);
            const large = correctedShadowRect(FA_SHADOW.MAX_SIZE, FA_SHADOW.MAX_SIZE);
            expect(Math.abs(large.offsetX)).toBeGreaterThan(Math.abs(small.offsetX));
            expect(Math.abs(large.offsetZ)).toBeGreaterThan(Math.abs(small.offsetZ));
        });
    });

    describe('scarShadowSkew', () => {
        it('returns exact zeros at severity <= 0 (the corrected shadow)', () => {
            for (const severity of [0, -0.5, -100]) {
                for (let i = 0; i < 6; i++) {
                    const skew = scarShadowSkew(severity, i, 3, -7);
                    expect(skew).toEqual({ rotY: 0, shear: 0, offsetX: 0, offsetZ: 0 });
                }
            }
        });

        it('is deterministic per (severity, i, cx, cz)', () => {
            const a = scarShadowSkew(0.7, 2, 5, -3);
            const b = scarShadowSkew(0.7, 2, 5, -3);
            expect(a).toEqual(b);
        });

        it('clamps every component to the FA_SHADOW maxima across a seed sweep', () => {
            for (let i = 0; i < 10; i++) {
                for (let cx = -6; cx <= 6; cx += 3) {
                    for (let cz = -6; cz <= 6; cz += 3) {
                        // severity 5 must clamp to 1 first, then obey the maxima.
                        const skew = scarShadowSkew(5, i, cx, cz);
                        expect(Math.abs(skew.rotY)).toBeLessThanOrEqual(FA_SHADOW.MAX_SKEW_ROT_RAD);
                        expect(Math.abs(skew.shear)).toBeLessThanOrEqual(FA_SHADOW.MAX_SHEAR);
                        expect(Math.abs(skew.offsetX)).toBeLessThanOrEqual(FA_SHADOW.MAX_SKEW_OFFSET);
                        expect(Math.abs(skew.offsetZ)).toBeLessThanOrEqual(FA_SHADOW.MAX_SKEW_OFFSET);
                    }
                }
            }
        });

        it('scales linearly with severity for a fixed seed (deeper scar, wronger shadow)', () => {
            const full = scarShadowSkew(1, 4, 2, 9);
            const half = scarShadowSkew(0.5, 4, 2, 9);
            expect(half.rotY).toBeCloseTo(full.rotY * 0.5, 10);
            expect(half.shear).toBeCloseTo(full.shear * 0.5, 10);
            expect(half.offsetX).toBeCloseTo(full.offsetX * 0.5, 10);
            expect(half.offsetZ).toBeCloseTo(full.offsetZ * 0.5, 10);
        });

        it('decorrelates neighbouring buildings (not one shared wrongness)', () => {
            const rots = new Set<number>();
            for (let i = 0; i < 8; i++)
                rots.add(scarShadowSkew(1, i, 0, 0).rotY);
            expect(rots.size).toBeGreaterThan(1);
        });
    });

    describe('shadowCrossesCrack', () => {
        const NO_SKEW = { rotY: 0, shear: 0, offsetX: 0, offsetZ: 0 };

        it('passes decals that stay clear of the crack band', () => {
            // Small decal deep on the -x bank: center -30 + offsetX, half 2.
            const rect = correctedShadowRect(4, 4);
            expect(shadowCrossesCrack(-30, 0, rect, NO_SKEW)).toBe(false);
        });

        it('catches a max-size decal at the -x shore edge (azimuth points +x)', () => {
            // Foot at -CLEARANCE: offset cos(PI/4)*0.4*20 = 5.66 plus half
            // width 10 reaches x = 3.66 — over the crack gap.
            const rect = correctedShadowRect(20, 20);
            expect(shadowCrossesCrack(-FA_RIFT.CLEARANCE, 0, rect, NO_SKEW)).toBe(true);
        });

        it('passes the same decal on the +x bank (displaced AWAY from the crack)', () => {
            const rect = correctedShadowRect(20, 20);
            expect(shadowCrossesCrack(FA_RIFT.CLEARANCE, 0, rect, NO_SKEW)).toBe(false);
        });

        it('accounts for scar rotation/shear/slide widening the reach', () => {
            // A mid-size decal on the +x bank clears the band unscarred...
            const rect = correctedShadowRect(16, 16);
            expect(shadowCrossesCrack(FA_RIFT.CLEARANCE, 0, rect, NO_SKEW)).toBe(false);
            // ...but a full-severity skew (max rot + shear + slide toward the
            // crack) pushes its near corner across the keep-out edge.
            const skew = {
                rotY: FA_SHADOW.MAX_SKEW_ROT_RAD,
                shear: FA_SHADOW.MAX_SHEAR,
                offsetX: -FA_SHADOW.MAX_SKEW_OFFSET,
                offsetZ: 0,
            };
            expect(shadowCrossesCrack(FA_RIFT.CLEARANCE, 0, rect, skew)).toBe(true);
        });

        it('judges against the supplied crack line, not a hardcoded zero', () => {
            const rect = correctedShadowRect(20, 20);
            // Same decal, crack moved far away: no crossing.
            expect(shadowCrossesCrack(-FA_RIFT.CLEARANCE, 60, rect, NO_SKEW)).toBe(false);
        });
    });
});
