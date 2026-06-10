// Tests for FlowerProp intensity logic: gaze forcing, the post-gaze recovery
// hold (flow-audit enhancement #3), the player-target getter used by the
// gaze one-way clamp (flow-audit medium #1), and the opening guidance pulse
// (flow-audit enhancement #1).
import { describe, expect, it } from 'vitest';
import { FLOWER_INTRO, GAZE } from '../src/config';
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

    describe('opening guidance pulse (enhancement #1)', () => {
        it('should start at the default target so the first pulsed frame does not pop', () => {
            const flower = createFlowerProp();
            animateFlower(flower, 0.016, 0.016);
            expect(getFlowerTargetIntensity(flower)).toBeCloseTo(FLOWER_INTRO.PULSE_MAX, 2);
        });

        it('should sway the target across the PULSE_MIN..PULSE_MAX band during the pulse', () => {
            const flower = createFlowerProp();
            let minTarget = Infinity;
            let maxTarget = -Infinity;
            let t = 0;
            const steps = Math.round((FLOWER_INTRO.PULSE_DURATION - 1) / STEP);
            for (let i = 0; i < steps; i++) {
                t += STEP;
                animateFlower(flower, t, STEP);
                const target = getFlowerTargetIntensity(flower);
                minTarget = Math.min(minTarget, target);
                maxTarget = Math.max(maxTarget, target);
            }
            // Never leaves the promised band...
            expect(minTarget).toBeGreaterThanOrEqual(FLOWER_INTRO.PULSE_MIN - 1e-9);
            expect(maxTarget).toBeLessThanOrEqual(FLOWER_INTRO.PULSE_MAX + 1e-9);
            // ...and actually covers (almost) all of it.
            expect(minTarget).toBeLessThan(FLOWER_INTRO.PULSE_MIN + 0.05);
            expect(maxTarget).toBeGreaterThan(FLOWER_INTRO.PULSE_MAX - 0.05);
        });

        it('should settle back to the default target when the pulse expires', () => {
            const flower = createFlowerProp();
            const t = simulate(flower, FLOWER_INTRO.PULSE_DURATION + 0.5);
            expect(getFlowerTargetIntensity(flower)).toBe(0.5);

            // And stays put afterwards (no sway resumes).
            simulate(flower, 3.0, t);
            expect(getFlowerTargetIntensity(flower)).toBe(0.5);
            expect(getFlowerIntensity(flower)).toBeCloseTo(0.5, 1);
        });

        it('should exit the pulse the moment the player adjusts the intensity', () => {
            const flower = createFlowerProp();
            let t = simulate(flower, 2.0); // Mid-pulse

            setFlowerIntensity(flower, 0.8); // First deliberate adjustment
            expect(getFlowerTargetIntensity(flower)).toBe(0.8);

            // The player's value holds — the sway never writes again.
            t = simulate(flower, 2.0, t);
            expect(getFlowerTargetIntensity(flower)).toBe(0.8);
            simulate(flower, 2.0, t);
            expect(getFlowerIntensity(flower)).toBeCloseTo(0.8, 1);
        });

        it('should abort the pulse when gaze forcing begins and not resume after', () => {
            const flower = createFlowerProp();
            let t = simulate(flower, 1.0); // Mid-pulse

            forceFlowerIntensity(flower, true, 0.2);
            t = simulate(flower, 0.5, t);
            // The abort restores the pre-pulse baseline target immediately.
            expect(getFlowerTargetIntensity(flower)).toBe(0.5);

            forceFlowerIntensity(flower, false);
            // Past the recovery hold and the original pulse window: no sway.
            t = simulate(flower, GAZE.FLOWER_RECOVERY_DELAY + 0.5, t);
            expect(getFlowerTargetIntensity(flower)).toBe(0.5);
            simulate(flower, 3.0, t);
            expect(getFlowerIntensity(flower)).toBeCloseTo(0.5, 1);
        });

        it('should cancel the pulse on override (target pinned at max)', () => {
            const flower = createFlowerProp();
            const t = simulate(flower, 1.0); // Mid-pulse

            overrideFlowerIntensity(flower);
            expect(getFlowerTargetIntensity(flower)).toBe(1.0);

            simulate(flower, 1.0, t);
            expect(getFlowerTargetIntensity(flower)).toBe(1.0);
            expect(getFlowerIntensity(flower)).toBeCloseTo(1.0, 1);
        });
    });
});
