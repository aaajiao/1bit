import { describe, expect, it } from 'vitest';
import { STRESS } from '../src/config/constants';
import {
    computeRawStress,
    ditherScaleForStress,
    stepStress,
    StressLevel,
} from '../src/core/StressLevel';
import { RoomType } from '../src/world/RoomConfig';

/**
 * F5 "分辨率即情绪" — the stress->grain pipeline:
 * raw pressure max-combine -> asymmetric smoothing (attack fast, release
 * slow) -> dither sampling scale (uDitherScale).
 */
describe('sTRESS config knobs', () => {
    it('attacks faster than it releases (spec: ~0.3s / ~2s)', () => {
        expect(STRESS.ATTACK_SECONDS).toBeGreaterThan(0);
        expect(STRESS.RELEASE_SECONDS).toBeGreaterThan(STRESS.ATTACK_SECONDS);
    });

    it('keeps the scale band sane: 1.0 baseline, coarse but still a texture', () => {
        // SCALE_MIN must be exactly the historical grain — calm frames are
        // bit-identical to the pre-F5 dither.
        expect(STRESS.SCALE_MIN).toBe(1.0);
        expect(STRESS.SCALE_MAX).toBeGreaterThan(STRESS.SCALE_MIN);
        // 宁小勿大: full panic stays a readable halftone, not poster blocks.
        expect(STRESS.SCALE_MAX).toBeLessThanOrEqual(4);
    });

    it('keeps the INFO_OVERFLOW overload onset inside the intensity range', () => {
        expect(STRESS.INFO_FLOWER_OVERLOAD_START).toBeGreaterThan(0);
        expect(STRESS.INFO_FLOWER_OVERLOAD_START).toBeLessThan(1);
    });

    it('keeps the sunset component a partial weight (never full panic)', () => {
        expect(STRESS.SUNSET_WEIGHT).toBeGreaterThan(0);
        expect(STRESS.SUNSET_WEIGHT).toBeLessThan(1);
    });
});

describe('computeRawStress', () => {
    it('is 0 with no pressure in any room', () => {
        for (const room of Object.values(RoomType))
            expect(computeRawStress(0, 0, 0, room, 0)).toBe(0);
    });

    it('passes the gaze intensity through alone', () => {
        expect(computeRawStress(0.6, 0, 0, RoomType.POLARIZED, 0)).toBeCloseTo(0.6, 9);
    });

    it('passes the override sustain through alone', () => {
        expect(computeRawStress(0, 0.8, 0, RoomType.IN_BETWEEN, 0)).toBeCloseTo(0.8, 9);
    });

    it('max-combines (the loudest pressure wins, no stacking past 1)', () => {
        expect(computeRawStress(0.3, 0.8, 0, RoomType.IN_BETWEEN, 0)).toBeCloseTo(0.8, 9);
        expect(computeRawStress(0.9, 0.2, 1, RoomType.INFO_OVERFLOW, 1)).toBeCloseTo(1, 9);
    });

    it('reads a blazing flower as overload ONLY inside INFO_OVERFLOW', () => {
        expect(computeRawStress(0, 0, 1, RoomType.INFO_OVERFLOW, 0)).toBeCloseTo(1, 9);
        for (const room of [RoomType.FORCED_ALIGNMENT, RoomType.IN_BETWEEN, RoomType.POLARIZED])
            expect(computeRawStress(0, 0, 1, room, 0)).toBe(0);
    });

    it('ramps the overload from the onset threshold to full intensity', () => {
        const start = STRESS.INFO_FLOWER_OVERLOAD_START;
        expect(computeRawStress(0, 0, start, RoomType.INFO_OVERFLOW, 0)).toBe(0);
        expect(computeRawStress(0, 0, start - 0.2, RoomType.INFO_OVERFLOW, 0)).toBe(0);
        const mid = (start + 1) / 2;
        expect(computeRawStress(0, 0, mid, RoomType.INFO_OVERFLOW, 0)).toBeCloseTo(0.5, 9);
    });

    it('weights the sunset foreshadow down (the ending tightens, not panics)', () => {
        expect(computeRawStress(0, 0, 0, RoomType.POLARIZED, 1)).toBeCloseTo(STRESS.SUNSET_WEIGHT, 9);
        expect(computeRawStress(0, 0, 0, RoomType.POLARIZED, 0.5)).toBeCloseTo(STRESS.SUNSET_WEIGHT * 0.5, 9);
    });

    it('clamps out-of-range inputs', () => {
        expect(computeRawStress(1.5, 0, 0, RoomType.POLARIZED, 0)).toBe(1);
        expect(computeRawStress(-0.5, -1, -1, RoomType.INFO_OVERFLOW, -2)).toBe(0);
        expect(computeRawStress(0, 0, 0, RoomType.POLARIZED, 5)).toBeCloseTo(STRESS.SUNSET_WEIGHT, 9);
        expect(computeRawStress(0, 2, 0, RoomType.POLARIZED, 0)).toBe(1);
    });

    it('always lands in [0, 1]', () => {
        for (const g of [0, 0.5, 1, 2]) {
            for (const o of [0, 1]) {
                for (const f of [0, 0.9, 1.5]) {
                    const v = computeRawStress(g, o, f, RoomType.INFO_OVERFLOW, 1);
                    expect(v).toBeGreaterThanOrEqual(0);
                    expect(v).toBeLessThanOrEqual(1);
                }
            }
        }
    });
});

describe('stepStress (asymmetric exponential smoothing)', () => {
    it('rises by 1-1/e after one attack time constant', () => {
        expect(stepStress(0, 1, STRESS.ATTACK_SECONDS)).toBeCloseTo(1 - Math.exp(-1), 9);
    });

    it('falls to 1/e after one release time constant', () => {
        expect(stepStress(1, 0, STRESS.RELEASE_SECONDS)).toBeCloseTo(Math.exp(-1), 9);
    });

    it('attacks faster than it releases over the same delta', () => {
        const dt = STRESS.ATTACK_SECONDS;
        const risen = stepStress(0, 1, dt); // distance covered rising
        const fallen = 1 - stepStress(1, 0, dt); // distance covered falling
        expect(risen).toBeGreaterThan(fallen * 2);
    });

    it('is frame-rate independent while staying on one side of the target', () => {
        const one = stepStress(0.2, 1, 0.5);
        let two = stepStress(0.2, 1, 0.25);
        two = stepStress(two, 1, 0.25);
        expect(two).toBeCloseTo(one, 9);

        const oneDown = stepStress(0.9, 0.1, 1.0);
        let twoDown = stepStress(0.9, 0.1, 0.5);
        twoDown = stepStress(twoDown, 0.1, 0.5);
        expect(twoDown).toBeCloseTo(oneDown, 9);
    });

    it('does not move at delta 0 or when already at the target', () => {
        expect(stepStress(0.4, 1, 0)).toBeCloseTo(0.4, 9);
        expect(stepStress(0.4, 0.4, 1)).toBeCloseTo(0.4, 9);
    });

    it('converges to the target after enough time', () => {
        let v = 0;
        for (let i = 0; i < 600; i++)
            v = stepStress(v, 1, 1 / 60);
        expect(v).toBeCloseTo(1, 3);
        for (let i = 0; i < 1800; i++)
            v = stepStress(v, 0, 1 / 60);
        expect(v).toBeCloseTo(0, 3);
    });
});

describe('ditherScaleForStress', () => {
    it('maps the endpoints to the configured scale band', () => {
        expect(ditherScaleForStress(0)).toBeCloseTo(STRESS.SCALE_MIN, 9);
        expect(ditherScaleForStress(1)).toBeCloseTo(STRESS.SCALE_MAX, 9);
    });

    it('maps the midpoint linearly', () => {
        expect(ditherScaleForStress(0.5)).toBeCloseTo((STRESS.SCALE_MIN + STRESS.SCALE_MAX) / 2, 9);
    });

    it('clamps stress outside [0, 1]', () => {
        expect(ditherScaleForStress(-1)).toBeCloseTo(STRESS.SCALE_MIN, 9);
        expect(ditherScaleForStress(2)).toBeCloseTo(STRESS.SCALE_MAX, 9);
    });
});

describe('stressLevel (stateful smoother)', () => {
    it('boots calm: stress 0, scale at the historical baseline', () => {
        const s = new StressLevel();
        expect(s.getStress()).toBe(0);
        expect(s.update(1 / 60, 0, 0, 0, RoomType.IN_BETWEEN, 0)).toBeCloseTo(STRESS.SCALE_MIN, 9);
    });

    it('approaches SCALE_MAX under sustained full pressure', () => {
        const s = new StressLevel();
        let scale = STRESS.SCALE_MIN;
        for (let i = 0; i < 300; i++)
            scale = s.update(1 / 60, 1, 0, 0, RoomType.POLARIZED, 0);
        expect(scale).toBeCloseTo(STRESS.SCALE_MAX, 2);
    });

    it('releases slowly: one attack-length beat after release, grain is still coarse', () => {
        const s = new StressLevel();
        for (let i = 0; i < 300; i++)
            s.update(1 / 60, 1, 0, 0, RoomType.POLARIZED, 0);
        // Drop all pressure for ATTACK_SECONDS — release tau is ~7x longer,
        // so most of the coarseness must remain.
        s.update(STRESS.ATTACK_SECONDS, 0, 0, 0, RoomType.POLARIZED, 0);
        expect(s.getStress()).toBeGreaterThan(0.7);
    });

    it('is deterministic for the same input sequence', () => {
        const a = new StressLevel();
        const b = new StressLevel();
        for (let i = 0; i < 100; i++) {
            const gaze = (i % 30) / 30;
            expect(a.update(1 / 60, gaze, 0, 0.8, RoomType.INFO_OVERFLOW, 0))
                .toBe(b.update(1 / 60, gaze, 0, 0.8, RoomType.INFO_OVERFLOW, 0));
        }
    });
});
