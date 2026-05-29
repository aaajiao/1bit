import { describe, expect, it } from 'vitest';
import { SKY_EYE_MAX_LAG, stepEyeFollow } from '../src/world/SkyEye';

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
