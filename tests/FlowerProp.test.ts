// Tests for FlowerProp intensity logic: gaze forcing, the post-gaze recovery
// hold (flow-audit enhancement #3), and the player-target getter used by the
// gaze one-way clamp (flow-audit medium #1).
import { describe, expect, it } from 'vitest';
import { GAZE } from '../src/config';
import {
    animateFlower,
    createFlowerProp,
    forceFlowerIntensity,
    getFlowerIntensity,
    getFlowerTargetIntensity,
    overrideFlowerIntensity,
    setFlowerIntensity,
} from '../src/player/FlowerProp';

const STEP = 0.05; // Seconds per simulated frame

/** Run animateFlower in fixed steps; returns the advanced clock time. */
function simulate(
    flower: ReturnType<typeof createFlowerProp>,
    seconds: number,
    startTime = 0,
): number {
    let t = startTime;
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i++) {
        t += STEP;
        animateFlower(flower, t, STEP);
    }
    return t;
}

describe('flowerProp', () => {
    describe('gaze forcing', () => {
        it('should lerp toward the forced value while being forced', () => {
            const flower = createFlowerProp();
            forceFlowerIntensity(flower, true, 0.2);
            simulate(flower, 3.0);
            expect(getFlowerIntensity(flower)).toBeCloseTo(0.2, 1);
        });
    });

    describe('post-gaze recovery hold', () => {
        it('should hold the extinguished level for FLOWER_RECOVERY_DELAY after forcing ends', () => {
            const flower = createFlowerProp();
            forceFlowerIntensity(flower, true, 0.2);
            let t = simulate(flower, 3.0);
            const dimmed = getFlowerIntensity(flower);

            // Release the gaze: recovery must NOT begin inside the hold window.
            forceFlowerIntensity(flower, false);
            t = simulate(flower, GAZE.FLOWER_RECOVERY_DELAY - 0.2, t);
            expect(getFlowerIntensity(flower)).toBeCloseTo(dimmed, 5);

            // After the delay the flower recovers toward the player target (0.5).
            simulate(flower, 3.0, t);
            expect(getFlowerIntensity(flower)).toBeCloseTo(0.5, 1);
        });

        it('should cancel the hold when the player sets a new intensity', () => {
            const flower = createFlowerProp();
            forceFlowerIntensity(flower, true, 0.2);
            let t = simulate(flower, 3.0);

            forceFlowerIntensity(flower, false);
            t = simulate(flower, 0.5, t); // Still inside the hold window

            setFlowerIntensity(flower, 0.8); // Deliberate player input
            simulate(flower, 3.0, t);
            expect(getFlowerIntensity(flower)).toBeCloseTo(0.8, 1);
        });

        it('should let override pin max intensity with no pending hold', () => {
            const flower = createFlowerProp();
            forceFlowerIntensity(flower, true, 0.2);
            const t = simulate(flower, 3.0);

            overrideFlowerIntensity(flower);
            expect(getFlowerIntensity(flower)).toBe(1.0);

            simulate(flower, 1.0, t);
            expect(getFlowerIntensity(flower)).toBeCloseTo(1.0, 5);
        });
    });

    describe('player target getter (one-way clamp support)', () => {
        it('should return the player-set target intensity', () => {
            const flower = createFlowerProp();
            expect(getFlowerTargetIntensity(flower)).toBe(0.5);
            setFlowerIntensity(flower, 0.2);
            expect(getFlowerTargetIntensity(flower)).toBe(0.2);
        });
    });
});
