import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BLUE_NOISE } from '../src/config/constants';
import {
    createBlueNoiseTexture,
    generateBlueNoiseRanks,
    quantizeRankToByte,
} from '../src/shaders/BlueNoiseTexture';

/**
 * F5 blue-noise dither texture — best-candidate ordered-dither generation.
 * Determinism is the contract (same seed -> bit-identical texture every
 * boot); the permutation property is what makes it a valid ordered-dither
 * threshold map; the spread check is what makes it BLUE noise.
 */
describe('bLUE_NOISE config knobs', () => {
    it('locks SIZE to 64 (the GLSL tiling constant BLUE_NOISE_SIZE is hardcoded to match)', () => {
        expect(BLUE_NOISE.SIZE).toBe(64);
    });

    it('has a usable candidate count and a finite seed', () => {
        expect(BLUE_NOISE.CANDIDATES).toBeGreaterThanOrEqual(1);
        expect(Number.isFinite(BLUE_NOISE.SEED)).toBe(true);
    });
});

describe('generateBlueNoiseRanks', () => {
    it('is deterministic: the same seed builds the identical rank array', () => {
        const a = generateBlueNoiseRanks(32, 7, 8);
        const b = generateBlueNoiseRanks(32, 7, 8);
        expect(a.length).toBe(32 * 32);
        for (let i = 0; i < a.length; i++)
            expect(a[i]).toBe(b[i]);
    });

    it('is deterministic at the production size/seed too', () => {
        const a = generateBlueNoiseRanks();
        const b = generateBlueNoiseRanks();
        for (let i = 0; i < a.length; i++)
            expect(a[i]).toBe(b[i]);
    });

    it('different seeds produce different textures', () => {
        const a = generateBlueNoiseRanks(32, 1, 8);
        const b = generateBlueNoiseRanks(32, 2, 8);
        let differs = 0;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i])
                differs++;
        }
        // Two independent permutations agree almost nowhere.
        expect(differs).toBeGreaterThan(a.length * 0.9);
    });

    it('is a permutation of the centered uniform threshold levels', () => {
        const size = BLUE_NOISE.SIZE;
        const total = size * size;
        const ranks = generateBlueNoiseRanks(size, BLUE_NOISE.SEED, BLUE_NOISE.CANDIDATES);
        const sorted = Array.from(ranks).sort((x, y) => x - y);
        for (let i = 0; i < total; i++)
            expect(sorted[i]).toBeCloseTo((i + 0.5) / total, 9);
    });

    it('stays strictly inside (0, 1)', () => {
        const ranks = generateBlueNoiseRanks(16, 3, 4);
        for (let i = 0; i < ranks.length; i++) {
            expect(ranks[i]).toBeGreaterThan(0);
            expect(ranks[i]).toBeLessThan(1);
        }
    });

    it('is blue: the earliest placements are well-spread (toroidal metric)', () => {
        const size = BLUE_NOISE.SIZE;
        const ranks = generateBlueNoiseRanks(size, BLUE_NOISE.SEED, BLUE_NOISE.CANDIDATES);
        // The K darkest texels are the first K placements; with white noise
        // their min pairwise distance would typically be ~1, with ideal blue
        // noise ~size/sqrt(K) = 8. Measured 4.47 for the production seed;
        // assert a conservative 3 so seed-math changes keep headroom.
        const K = 64;
        const idx = Array.from(ranks.keys()).sort((x, y) => ranks[x] - ranks[y]).slice(0, K);
        let minDistSq = Number.POSITIVE_INFINITY;
        for (let a = 0; a < idx.length; a++) {
            for (let b = a + 1; b < idx.length; b++) {
                const ax = idx[a] % size;
                const ay = (idx[a] - ax) / size;
                const bx = idx[b] % size;
                const by = (idx[b] - bx) / size;
                const dx = Math.min(Math.abs(ax - bx), size - Math.abs(ax - bx));
                const dy = Math.min(Math.abs(ay - by), size - Math.abs(ay - by));
                minDistSq = Math.min(minDistSq, dx * dx + dy * dy);
            }
        }
        expect(Math.sqrt(minDistSq)).toBeGreaterThanOrEqual(3);
    });
});

describe('quantizeRankToByte', () => {
    it('never emits 0 (a 0 threshold would whiten texels over pure black)', () => {
        expect(quantizeRankToByte(0)).toBe(1);
        expect(quantizeRankToByte(0.0001)).toBe(1);
    });

    it('caps at 255 and is monotonic', () => {
        expect(quantizeRankToByte(0.9999)).toBe(255);
        expect(quantizeRankToByte(1)).toBe(255);
        let prev = 0;
        for (let v = 0; v <= 1; v += 0.01) {
            const q = quantizeRankToByte(v);
            expect(q).toBeGreaterThanOrEqual(prev);
            expect(q).toBeGreaterThanOrEqual(1);
            expect(q).toBeLessThanOrEqual(255);
            prev = q;
        }
    });
});

describe('createBlueNoiseTexture', () => {
    it('builds a tiling, unfiltered threshold lookup of the right shape', () => {
        const tex = createBlueNoiseTexture(16, 5);
        expect(tex.image.width).toBe(16);
        expect(tex.image.height).toBe(16);
        expect(tex.minFilter).toBe(THREE.NearestFilter);
        expect(tex.magFilter).toBe(THREE.NearestFilter);
        expect(tex.wrapS).toBe(THREE.RepeatWrapping);
        expect(tex.wrapT).toBe(THREE.RepeatWrapping);
        expect(tex.needsUpdate || tex.version > 0).toBe(true);
        tex.dispose();
    });

    it('stores grayscale bytes in 1..255 with opaque alpha', () => {
        const tex = createBlueNoiseTexture(16, 5);
        const data = tex.image.data as Uint8Array;
        expect(data.length).toBe(16 * 16 * 4);
        for (let i = 0; i < data.length; i += 4) {
            expect(data[i]).toBeGreaterThanOrEqual(1);
            expect(data[i]).toBeLessThanOrEqual(255);
            expect(data[i + 1]).toBe(data[i]);
            expect(data[i + 2]).toBe(data[i]);
            expect(data[i + 3]).toBe(255);
        }
        tex.dispose();
    });

    it('is deterministic across constructions', () => {
        const a = createBlueNoiseTexture(16, 9);
        const b = createBlueNoiseTexture(16, 9);
        const da = a.image.data as Uint8Array;
        const db = b.image.data as Uint8Array;
        for (let i = 0; i < da.length; i++)
            expect(da[i]).toBe(db[i]);
        a.dispose();
        b.dispose();
    });
});
