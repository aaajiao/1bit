import type { EyeAwareness } from '../src/world/SkyEye';
import { describe, expect, it } from 'vitest';
import { SKY_EYE_AWARENESS } from '../src/config';
import {
    computeEyeAwareness,
    SKY_EYE_FOLLOW_LERP,
    SKY_EYE_MAX_LAG,
    SKY_EYE_PUPIL_GAIN,
    stepEyeFollow,
} from '../src/world/SkyEye';

const EPS = 1e-6;

function lagFrom(eye: { x: number; z: number }, px: number, pz: number): number {
    return Math.hypot(eye.x - px, eye.z - pz);
}

describe('skyEye stepEyeFollow', () => {
    it('never overshoots the leash, even on an instantaneous teleport', () => {
        const eye = { x: 0, z: 0 };
        stepEyeFollow(eye, 100000, 0); // one frame, huge jump
        expect(lagFrom(eye, 100000, 0)).toBeLessThanOrEqual(SKY_EYE_MAX_LAG + EPS);
    });

    it('keeps the eye within the leash across a long walk away from spawn', () => {
        const eye = { x: 0, z: 0 };
        let px = 0;
        let pz = 0;
        for (let i = 0; i < 5000; i++) {
            px += 2; // steady diagonal walk into fresh terrain
            pz += 2;
            stepEyeFollow(eye, px, pz);
            expect(lagFrom(eye, px, pz)).toBeLessThanOrEqual(SKY_EYE_MAX_LAG + EPS);
        }
    });

    it('eases all the way to a stationary player so the eye sits overhead', () => {
        const eye = { x: 0, z: 0 };
        for (let i = 0; i < 3000; i++)
            stepEyeFollow(eye, 50, -30);
        expect(eye.x).toBeCloseTo(50, 2);
        expect(eye.z).toBeCloseTo(-30, 2);
    });

    it('leaves a non-zero residual offset while the player is moving (pupil has something to track)', () => {
        const eye = { x: 0, z: 0 };
        let px = 0;
        for (let i = 0; i < 300; i++) {
            px += 2;
            stepEyeFollow(eye, px, 0);
        }
        const lag = lagFrom(eye, px, 0);
        expect(lag).toBeGreaterThan(0);
        expect(lag).toBeLessThanOrEqual(SKY_EYE_MAX_LAG + EPS);
    });

    it('does not move the eye when it is already on the player', () => {
        const eye = { x: 10, z: 10 };
        stepEyeFollow(eye, 10, 10);
        expect(eye.x).toBeCloseTo(10, 6);
        expect(eye.z).toBeCloseTo(10, 6);
    });
});

// Flow-audit break #4 — the eye must perceive the player's state.
describe('skyEye computeEyeAwareness', () => {
    function freshOut(): EyeAwareness {
        return {
            followLerp: -1,
            maxLag: -1,
            pupilGain: -1,
            blinkRate: -1,
            pupilScale: -1,
            pupilCenterPull: -1,
            ringSpeedMult: -1,
        };
    }

    it('reproduces the base constants exactly at neutral inputs (0, 0)', () => {
        const aw = computeEyeAwareness(0, 0, freshOut());
        expect(aw.followLerp).toBeCloseTo(SKY_EYE_FOLLOW_LERP, 9);
        expect(aw.maxLag).toBeCloseTo(SKY_EYE_MAX_LAG, 9);
        expect(aw.pupilGain).toBeCloseTo(SKY_EYE_PUPIL_GAIN, 9);
        expect(aw.blinkRate).toBeCloseTo(SKY_EYE_AWARENESS.BLINK_RATE_BASE, 9);
        expect(aw.pupilScale).toBeCloseTo(1, 9);
        expect(aw.pupilCenterPull).toBeCloseTo(0, 9);
        expect(aw.ringSpeedMult).toBeCloseTo(1, 9);
    });

    it('tightens follow/leash, boosts pupil gain, and blinks more at full flower', () => {
        const aw = computeEyeAwareness(1, 0, freshOut());
        expect(aw.followLerp).toBeCloseTo(
            SKY_EYE_FOLLOW_LERP * (1 + SKY_EYE_AWARENESS.FOLLOW_LERP_FLOWER_GAIN),
            9,
        );
        expect(aw.maxLag).toBeCloseTo(
            SKY_EYE_MAX_LAG * (1 - SKY_EYE_AWARENESS.MAX_LAG_FLOWER_SHRINK),
            9,
        );
        expect(aw.pupilGain).toBeCloseTo(
            SKY_EYE_PUPIL_GAIN * (1 + SKY_EYE_AWARENESS.PUPIL_GAIN_FLOWER_GAIN),
            9,
        );
        expect(aw.blinkRate).toBeCloseTo(
            SKY_EYE_AWARENESS.BLINK_RATE_BASE + SKY_EYE_AWARENESS.BLINK_RATE_FLOWER_GAIN,
            9,
        );
        // Flower alone never triggers the stare-back response.
        expect(aw.pupilScale).toBeCloseTo(1, 9);
        expect(aw.ringSpeedMult).toBeCloseTo(1, 9);
    });

    it('stares back at full gaze: dilated centered pupil, no blinking, faster rings', () => {
        const aw = computeEyeAwareness(0, 1, freshOut());
        expect(aw.blinkRate).toBeCloseTo(0, 9); // unblinking
        expect(aw.pupilScale).toBeCloseTo(1 + SKY_EYE_AWARENESS.PUPIL_DILATE_GAZE, 9);
        expect(aw.pupilCenterPull).toBeCloseTo(1, 9);
        expect(aw.ringSpeedMult).toBeCloseTo(SKY_EYE_AWARENESS.RING_SPEED_GAZE_MULT, 9);
    });

    it('suppresses even the flower-raised blink rate while being gazed at', () => {
        const brightCalm = computeEyeAwareness(1, 0, freshOut());
        const brightStared = computeEyeAwareness(1, 1, freshOut());
        expect(brightCalm.blinkRate).toBeGreaterThan(0);
        expect(brightStared.blinkRate).toBeCloseTo(0, 9);
    });

    it('responds monotonically to the flower (tighter leash, more blinks)', () => {
        let prevLag = computeEyeAwareness(0, 0, freshOut()).maxLag;
        let prevBlink = computeEyeAwareness(0, 0, freshOut()).blinkRate;
        for (let f = 0.1; f <= 1.0001; f += 0.1) {
            const aw = computeEyeAwareness(f, 0, freshOut());
            expect(aw.maxLag).toBeLessThan(prevLag);
            expect(aw.blinkRate).toBeGreaterThan(prevBlink);
            prevLag = aw.maxLag;
            prevBlink = aw.blinkRate;
        }
    });

    it('clamps out-of-range inputs to [0, 1]', () => {
        const low = computeEyeAwareness(-5, -5, freshOut());
        const neutral = computeEyeAwareness(0, 0, freshOut());
        const high = computeEyeAwareness(7, 7, freshOut());
        const full = computeEyeAwareness(1, 1, freshOut());
        expect(low).toEqual(neutral);
        expect(high).toEqual(full);
    });

    it('mutates and returns the provided out object (no per-frame allocation)', () => {
        const out = freshOut();
        const result = computeEyeAwareness(0.5, 0.5, out);
        expect(result).toBe(out);
        expect(out.followLerp).toBeGreaterThan(0);
    });
});
