import type { EyeAwareness, EyeDominancePose } from '../src/world/SkyEye';
import { describe, expect, it } from 'vitest';
import { SKY_EYE_AWARENESS, SKY_EYE_DOMINANCE, SKY_EYE_FAMILIARITY } from '../src/config';
import {
    computeEyeAwareness,
    computeEyeDominancePose,
    familiarEyeBase,
    SKY_EYE_FOLLOW_LERP,
    SKY_EYE_HEIGHT,
    SKY_EYE_MAX_LAG,
    SKY_EYE_PUPIL_GAIN,
    stepEyeDominance,
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

// F2 "the eye knows you" — returning visitors are followed more tightly.
describe('skyEye familiarity (familiarEyeBase)', () => {
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

    it('reproduces the original base constants exactly on a first visit (0 runs)', () => {
        const base = familiarEyeBase(0);
        expect(base.followLerp).toBe(SKY_EYE_FOLLOW_LERP);
        expect(base.maxLag).toBe(SKY_EYE_MAX_LAG);
    });

    it('tightens monotonically with completed runs and saturates at the cap', () => {
        let prev = familiarEyeBase(0);
        for (let runs = 1; runs <= SKY_EYE_FAMILIARITY.CAP_RUNS; runs++) {
            const base = familiarEyeBase(runs);
            expect(base.followLerp).toBeGreaterThan(prev.followLerp);
            expect(base.maxLag).toBeLessThan(prev.maxLag);
            prev = base;
        }
        const atCap = familiarEyeBase(SKY_EYE_FAMILIARITY.CAP_RUNS);
        const beyond = familiarEyeBase(SKY_EYE_FAMILIARITY.CAP_RUNS * 100);
        expect(beyond).toEqual(atCap);
        expect(atCap.followLerp).toBeCloseTo(
            SKY_EYE_FOLLOW_LERP * (1 + SKY_EYE_FAMILIARITY.FOLLOW_LERP_GAIN),
            9,
        );
        expect(atCap.maxLag).toBeCloseTo(
            SKY_EYE_MAX_LAG * (1 - SKY_EYE_FAMILIARITY.MAX_LAG_SHRINK),
            9,
        );
    });

    it('tolerates negative counts (clamped to the first-visit base)', () => {
        expect(familiarEyeBase(-3)).toEqual(familiarEyeBase(0));
    });

    it('composes with the awareness gains: familiar base feeds computeEyeAwareness', () => {
        const base = familiarEyeBase(SKY_EYE_FAMILIARITY.CAP_RUNS);
        // Neutral player state on a familiar base = exactly the familiar base.
        const neutral = computeEyeAwareness(0, 0, freshOut(), base.followLerp, base.maxLag);
        expect(neutral.followLerp).toBeCloseTo(base.followLerp, 9);
        expect(neutral.maxLag).toBeCloseTo(base.maxLag, 9);
        // Full flower multiplies on top of the familiar base (not the default).
        const bright = computeEyeAwareness(1, 0, freshOut(), base.followLerp, base.maxLag);
        expect(bright.followLerp).toBeCloseTo(
            base.followLerp * (1 + SKY_EYE_AWARENESS.FOLLOW_LERP_FLOWER_GAIN),
            9,
        );
        expect(bright.maxLag).toBeCloseTo(
            base.maxLag * (1 - SKY_EYE_AWARENESS.MAX_LAG_FLOWER_SHRINK),
            9,
        );
    });
});

// Flow-audit enhancement #11 — the eye dominates POLARIZED's sky.
describe('skyEye dominance', () => {
    function freshPose(): EyeDominancePose {
        return { scale: -1, height: -1, extraRingScale: -1 };
    }

    describe('stepEyeDominance', () => {
        it('eases toward 1 in the dominant room and 0 elsewhere', () => {
            let d = 0;
            d = stepEyeDominance(d, true, 0.5);
            expect(d).toBeGreaterThan(0);
            expect(d).toBeLessThan(1);

            let back = 1;
            back = stepEyeDominance(back, false, 0.5);
            expect(back).toBeLessThan(1);
            expect(back).toBeGreaterThan(0);
        });

        it('converges to the target after enough time', () => {
            let d = 0;
            for (let i = 0; i < 600; i++)
                d = stepEyeDominance(d, true, 1 / 60);
            expect(d).toBeCloseTo(1, 3);

            for (let i = 0; i < 600; i++)
                d = stepEyeDominance(d, false, 1 / 60);
            expect(d).toBeCloseTo(0, 3);
        });

        it('is frame-rate independent (two half steps equal one full step)', () => {
            const oneStep = stepEyeDominance(0.2, true, 1.0);
            const twoSteps = stepEyeDominance(stepEyeDominance(0.2, true, 0.5), true, 0.5);
            expect(twoSteps).toBeCloseTo(oneStep, 9);
        });

        it('does not move at delta 0', () => {
            expect(stepEyeDominance(0.4, true, 0)).toBeCloseTo(0.4, 9);
        });
    });

    describe('computeEyeDominancePose', () => {
        it('reproduces the base eye exactly at dominance 0', () => {
            const pose = computeEyeDominancePose(0, freshPose());
            expect(pose.scale).toBeCloseTo(1, 9);
            expect(pose.height).toBeCloseTo(SKY_EYE_HEIGHT, 9);
            expect(pose.extraRingScale).toBeCloseTo(0, 9);
        });

        it('reaches the full takeover at dominance 1: bigger, lower, rings unfolded', () => {
            const pose = computeEyeDominancePose(1, freshPose());
            expect(pose.scale).toBeCloseTo(SKY_EYE_DOMINANCE.SCALE_MULT, 9);
            expect(pose.height).toBeCloseTo(SKY_EYE_HEIGHT - SKY_EYE_DOMINANCE.HEIGHT_DROP, 9);
            expect(pose.extraRingScale).toBeCloseTo(1, 9);
        });

        it('interpolates monotonically: more dominance = bigger and lower', () => {
            let prev = computeEyeDominancePose(0, freshPose());
            for (let d = 0.1; d <= 1.0001; d += 0.1) {
                const pose = computeEyeDominancePose(d, freshPose());
                expect(pose.scale).toBeGreaterThan(prev.scale);
                expect(pose.height).toBeLessThan(prev.height);
                expect(pose.extraRingScale).toBeGreaterThan(prev.extraRingScale);
                prev = pose;
            }
        });

        it('clamps out-of-range dominance to [0, 1]', () => {
            expect(computeEyeDominancePose(-3, freshPose())).toEqual(computeEyeDominancePose(0, freshPose()));
            expect(computeEyeDominancePose(7, freshPose())).toEqual(computeEyeDominancePose(1, freshPose()));
        });

        it('mutates and returns the provided out object (no per-frame allocation)', () => {
            const out = freshPose();
            const result = computeEyeDominancePose(0.5, out);
            expect(result).toBe(out);
            expect(out.scale).toBeGreaterThan(1);
        });
    });
});
