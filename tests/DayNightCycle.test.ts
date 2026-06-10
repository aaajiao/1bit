import type { DayNightContext } from '../src/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAMEPLAY } from '../src/config';
import { RunStatsCollector } from '../src/stats/RunStatsCollector';
import { DayNightCycle } from '../src/world/DayNightCycle';

// Duck-typed context covering everything DayNightCycle touches; cast through
// unknown so the test stays free of real Three.js objects (pure-logic policy).
function makeContext(): { context: DayNightContext; uniforms: { invertColors: { value: boolean } }; onSunset: ReturnType<typeof vi.fn> } {
    const uniforms = { invertColors: { value: false } };
    const onSunset = vi.fn();
    const context = {
        scene: {
            background: { setHex: vi.fn() },
            fog: { color: { setHex: vi.fn() } },
        },
        shaderQuad: { material: { uniforms } },
        audio: { playDayNightTransition: vi.fn(), playEyeBlink: vi.fn() },
        weather: { forceWeather: vi.fn() },
        onSunset,
    } as unknown as DayNightContext;
    return { context, uniforms, onSunset };
}

// Step the cycle with exact binary deltas (0.5 = 2^-1) so accumulated play
// time hits cycle boundaries without float drift.
const STEP = 0.5;

function advance(cycle: DayNightCycle, context: DayNightContext, seconds: number): void {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i++) {
        cycle.update(STEP, context);
    }
}

describe('dayNightCycle play clock', () => {
    beforeEach(() => {
        // 11/12 keeps every random branch quiet (no eclipse, no forced weather)
        // and re-randomizes cycleDuration to 240 + (11/12)*120 = 350 at dawn.
        vi.spyOn(Math, 'random').mockReturnValue(11 / 12);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does not fire sunset on the first frame regardless of wall-clock time before play', () => {
        const { context, onSunset } = makeContext();
        const cycle = new DayNightCycle();
        // The cycle has no absolute-time input: a long stay on the start screen
        // (no update calls) contributes nothing, and the first played frame
        // only advances by its own delta.
        cycle.update(0.1, context);
        expect(onSunset).not.toHaveBeenCalled();
    });

    it('fires sunset only after half a cycle (150s) of accumulated play time', () => {
        const { context, onSunset, uniforms } = makeContext();
        const cycle = new DayNightCycle();

        advance(cycle, context, 149.5);
        expect(onSunset).not.toHaveBeenCalled();
        expect(uniforms.invertColors.value).toBe(false);

        advance(cycle, context, STEP); // crosses 150s
        expect(onSunset).toHaveBeenCalledTimes(1);
        expect(uniforms.invertColors.value).toBe(true); // night inverts the palette
    });

    it('keeps the phase continuous at dawn when cycleDuration is re-randomized', () => {
        const { context, onSunset, uniforms } = makeContext();
        const cycle = new DayNightCycle();

        // Sunset at 150s, dawn at 300s; the new cycle is 350s long.
        advance(cycle, context, 310);
        expect(onSunset).toHaveBeenCalledTimes(1); // no spurious sunset right after dawn
        expect(uniforms.invertColors.value).toBe(false); // back to day

        // Second sunset lands half the NEW cycle after dawn: 300 + 175 = 475s.
        advance(cycle, context, 474.5 - 310);
        expect(onSunset).toHaveBeenCalledTimes(1);
        advance(cycle, context, STEP);
        expect(onSunset).toHaveBeenCalledTimes(2);
    });

    it('runs the eclipse on play time via a countdown, then restores day inversion', () => {
        const { context, uniforms } = makeContext();
        const cycle = new DayNightCycle();

        // First frame: trigger the eclipse (random below the 0.03*delta rate),
        // then a 10 + 0.5*20 = 20s duration; afterwards stay quiet.
        const random = Math.random as ReturnType<typeof vi.fn>;
        random.mockReturnValueOnce(0.0001).mockReturnValueOnce(0.5);

        cycle.update(STEP, context);
        expect(uniforms.invertColors.value).toBe(true);

        advance(cycle, context, 10);
        expect(uniforms.invertColors.value).toBe(true); // still mid-eclipse

        advance(cycle, context, 10);
        expect(uniforms.invertColors.value).toBe(false); // 20s of play elapsed
    });
});

describe('sunset snapshot minimum-duration gate', () => {
    it('rejects runs shorter than the configured threshold', () => {
        const collector = new RunStatsCollector();
        collector.update(GAMEPLAY.MIN_RUN_DURATION_FOR_SNAPSHOT - 1, 0.5, false, 0, null, 0, false, false);
        expect(collector.hasMinimumSnapshotDuration()).toBe(false);
    });

    it('accepts runs at or above the threshold and resets with the run', () => {
        const collector = new RunStatsCollector();
        collector.update(GAMEPLAY.MIN_RUN_DURATION_FOR_SNAPSHOT, 0.5, false, 0, null, 0, false, false);
        expect(collector.hasMinimumSnapshotDuration()).toBe(true);

        collector.reset();
        expect(collector.hasMinimumSnapshotDuration()).toBe(false);
    });
});
