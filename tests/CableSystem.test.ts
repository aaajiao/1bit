import { describe, expect, it } from 'vitest';
import { CABLE_UPLINK } from '../src/config';
import {
    uplinkDashDensity,
    uplinkDirectionSign,
    uplinkFlowerBoost,
    uplinkPulseSpeed,
} from '../src/world/CableSystem';

const EPS = 1e-9;

describe('uplinkFlowerBoost', () => {
    it('is exactly 0 at or below the threshold (cables stay static)', () => {
        expect(uplinkFlowerBoost(0)).toBe(0);
        expect(uplinkFlowerBoost(CABLE_UPLINK.FLOWER_THRESHOLD)).toBe(0);
        expect(uplinkFlowerBoost(CABLE_UPLINK.FLOWER_THRESHOLD - 0.01)).toBe(0);
    });

    it('ramps linearly from 0 at the threshold to 1 at full brightness', () => {
        expect(uplinkFlowerBoost(1)).toBeCloseTo(1, 12);
        const mid = (CABLE_UPLINK.FLOWER_THRESHOLD + 1) / 2;
        expect(uplinkFlowerBoost(mid)).toBeCloseTo(0.5, 12);
    });

    it('is monotonic in the active band', () => {
        const a = uplinkFlowerBoost(0.7);
        const b = uplinkFlowerBoost(0.85);
        const c = uplinkFlowerBoost(0.95);
        expect(a).toBeLessThan(b);
        expect(b).toBeLessThan(c);
    });

    it('clamps out-of-range inputs to [0,1]', () => {
        expect(uplinkFlowerBoost(-5)).toBe(0);
        expect(uplinkFlowerBoost(5)).toBeCloseTo(1, 12);
    });

    it('honors a custom threshold and never divides by zero at threshold >= 1', () => {
        expect(uplinkFlowerBoost(0.5, 0.4)).toBeCloseTo((0.5 - 0.4) / 0.6, 12);
        // Degenerate threshold: input is clamped to <= 1, so it can never
        // exceed a threshold of 1 — the result is a safe 0, not NaN/Infinity.
        expect(uplinkFlowerBoost(1, 1)).toBe(0);
        expect(uplinkFlowerBoost(5, 1)).toBe(0);
    });
});

describe('uplinkDirectionSign', () => {
    it('points toward the higher endpoint (up and away toward the eye)', () => {
        expect(uplinkDirectionSign(0, 10)).toBe(1); // end higher -> +lineDistance
        expect(uplinkDirectionSign(10, 0)).toBe(-1); // start higher -> -lineDistance
    });

    it('resolves a tie to +1', () => {
        expect(uplinkDirectionSign(5, 5)).toBe(1);
    });
});

describe('uplinkPulseSpeed', () => {
    it('spans SPEED_BASE..SPEED_BASE+SPEED_GAIN across the boost range', () => {
        expect(uplinkPulseSpeed(0)).toBeCloseTo(CABLE_UPLINK.SPEED_BASE, 12);
        expect(uplinkPulseSpeed(1)).toBeCloseTo(CABLE_UPLINK.SPEED_BASE + CABLE_UPLINK.SPEED_GAIN, 12);
        expect(uplinkPulseSpeed(0.5)).toBeCloseTo(CABLE_UPLINK.SPEED_BASE + 0.5 * CABLE_UPLINK.SPEED_GAIN, 12);
    });

    it('increases with brightness and clamps the boost', () => {
        expect(uplinkPulseSpeed(0.9)).toBeGreaterThan(uplinkPulseSpeed(0.1) + EPS);
        expect(uplinkPulseSpeed(-1)).toBeCloseTo(CABLE_UPLINK.SPEED_BASE, 12);
        expect(uplinkPulseSpeed(2)).toBeCloseTo(CABLE_UPLINK.SPEED_BASE + CABLE_UPLINK.SPEED_GAIN, 12);
    });
});

describe('uplinkDashDensity', () => {
    it('spans DENSITY_BASE..DENSITY_BASE+DENSITY_GAIN across the boost range', () => {
        expect(uplinkDashDensity(0)).toBeCloseTo(CABLE_UPLINK.DENSITY_BASE, 12);
        expect(uplinkDashDensity(1)).toBeCloseTo(CABLE_UPLINK.DENSITY_BASE + CABLE_UPLINK.DENSITY_GAIN, 12);
    });

    it('increases with brightness and clamps the boost', () => {
        expect(uplinkDashDensity(0.9)).toBeGreaterThan(uplinkDashDensity(0.1) + EPS);
        expect(uplinkDashDensity(-1)).toBeCloseTo(CABLE_UPLINK.DENSITY_BASE, 12);
        expect(uplinkDashDensity(2)).toBeCloseTo(CABLE_UPLINK.DENSITY_BASE + CABLE_UPLINK.DENSITY_GAIN, 12);
    });
});
