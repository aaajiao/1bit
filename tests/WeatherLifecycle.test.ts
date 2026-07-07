// Weather core (weather-system overhaul, foundation): lifecycle phases
// (forewarn -> onset -> aftermath), the three new types (ASHFALL/GALE/ECLIPSE),
// the eclipse scheduler, and the behavior -> weather bias (mirror layer 4).

import type { WeatherState } from '../src/types';
import type { BehaviorProfile } from '../src/world/RoomConfig';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WEATHER_BEHAVIOR_BIAS, WEATHER_ECLIPSE, WEATHER_LIFECYCLE, WEATHER_TYPE_TUNING } from '../src/config';
import { hash } from '../src/utils/hash';
import {
    biasedWeatherWeights,
    DEFAULT_WEATHER_WEIGHTS,
    ROOM_WEATHER_WEIGHTS,
    RoomType,
    weatherCooldownScale,
} from '../src/world/RoomConfig';
import {
    pickWeatherFromWeights,
    screenWeatherType,
    WEATHER_TYPES,
    WeatherSystem,
} from '../src/world/WeatherSystem';

const NEUTRAL_PROFILE: BehaviorProfile = {
    avgFlower: 0.5, // inside the flower deadzone (the boot default)
    gazeRatio: 0,
    overrideActivity: 0,
    crackAffinity: 0,
};

const BRIGHT_LOUD_PROFILE: BehaviorProfile = {
    avgFlower: 1, // blazing flower: full expression drive
    gazeRatio: 0.2,
    overrideActivity: 1, // loud resistance
    crackAffinity: 0,
};

const DIM_STILL_PROFILE: BehaviorProfile = {
    avgFlower: 0, // suppressed flower: full settle drive
    gazeRatio: 0,
    overrideActivity: 0,
    crackAffinity: 0,
};

describe('weatherLifecycle', () => {
    beforeEach(() => {
        // Pin Math.random so the constructor cooldown (45s) and every
        // RNG-driven draw are deterministic (same convention as
        // WeatherSystem.test.ts). Individual tests override where needed.
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('screenWeatherType (screen-safety mapping)', () => {
        it('passes the legacy overlay types through unchanged', () => {
            expect(screenWeatherType(WEATHER_TYPES.CLEAR)).toBe(WEATHER_TYPES.CLEAR);
            expect(screenWeatherType(WEATHER_TYPES.STATIC)).toBe(WEATHER_TYPES.STATIC);
            expect(screenWeatherType(WEATHER_TYPES.RAIN)).toBe(WEATHER_TYPES.RAIN);
            expect(screenWeatherType(WEATHER_TYPES.GLITCH)).toBe(WEATHER_TYPES.GLITCH);
        });

        it('collapses every world-space type to CLEAR (no screen overlay)', () => {
            // The DitherShader gates ALL weather work behind weatherType > 0
            // and branches on 1/2/3 only — CLEAR parks every branch.
            expect(screenWeatherType(WEATHER_TYPES.ASHFALL)).toBe(WEATHER_TYPES.CLEAR);
            expect(screenWeatherType(WEATHER_TYPES.GALE)).toBe(WEATHER_TYPES.CLEAR);
            expect(screenWeatherType(WEATHER_TYPES.ECLIPSE)).toBe(WEATHER_TYPES.CLEAR);
        });
    });

    describe('pickWeatherFromWeights (pure rotation pick)', () => {
        it('returns null when every weight is zero', () => {
            expect(pickWeatherFromWeights(0.5, { static: 0, rain: 0, glitch: 0, ashfall: 0, gale: 0 })).toBeNull();
        });

        it('reproduces the historical 3-type bands when the new weights are zero', () => {
            const legacy = { static: 1, rain: 1, glitch: 1, ashfall: 0, gale: 0 };
            expect(pickWeatherFromWeights(0, legacy)).toBe(WEATHER_TYPES.STATIC);
            expect(pickWeatherFromWeights(0.34, legacy)).toBe(WEATHER_TYPES.RAIN);
            expect(pickWeatherFromWeights(0.67, legacy)).toBe(WEATHER_TYPES.GLITCH);
            // Top of the range still lands in the last NON-EMPTY band.
            expect(pickWeatherFromWeights(0.999999, legacy)).toBe(WEATHER_TYPES.GLITCH);
        });

        it('maps the five equal default bands in rotation order', () => {
            expect(pickWeatherFromWeights(0.1, DEFAULT_WEATHER_WEIGHTS)).toBe(WEATHER_TYPES.STATIC);
            expect(pickWeatherFromWeights(0.3, DEFAULT_WEATHER_WEIGHTS)).toBe(WEATHER_TYPES.RAIN);
            expect(pickWeatherFromWeights(0.5, DEFAULT_WEATHER_WEIGHTS)).toBe(WEATHER_TYPES.GLITCH);
            expect(pickWeatherFromWeights(0.7, DEFAULT_WEATHER_WEIGHTS)).toBe(WEATHER_TYPES.ASHFALL);
            expect(pickWeatherFromWeights(0.9, DEFAULT_WEATHER_WEIGHTS)).toBe(WEATHER_TYPES.GALE);
        });

        it('never returns ECLIPSE (it does not rotate)', () => {
            for (let r = 0; r < 1; r += 0.01) {
                const picked = pickWeatherFromWeights(r, DEFAULT_WEATHER_WEIGHTS);
                expect(picked).not.toBe(WEATHER_TYPES.ECLIPSE);
                expect(picked).not.toBe(WEATHER_TYPES.CLEAR);
            }
        });
    });

    describe('forewarn phase', () => {
        // With random pinned at 0.5 the constructor cooldown is 45s; stepping
        // 0.5s frames, the draw fires at cooldown 15 (frame 60) and the event
        // breaks at cooldown 0 (frame 90).
        function collectRun(frames: number, delta = 0.5): WeatherState[] {
            const sys = new WeatherSystem();
            const states: WeatherState[] = [];
            for (let i = 1; i <= frames; i++)
                states.push(sys.update(delta, i * delta));
            return states;
        }

        it('stays silent until the cooldown enters the forewarn window', () => {
            const states = collectRun(59);
            for (const s of states) {
                expect(s.forewarn).toBe(0);
                expect(s.upcomingType).toBe(WEATHER_TYPES.CLEAR);
            }
        });

        it('ramps 0 -> 1 across the window, naming the upcoming type', () => {
            const states = collectRun(90);
            // Frame 60: the event is drawn, ramp begins at 0.
            expect(states[59].upcomingType).toBe(WEATHER_TYPES.GLITCH);
            expect(states[59].forewarn).toBe(0);
            // Mid-window (cooldown 7.5 of the 15s window): ramp at 0.5.
            expect(states[74].forewarn).toBeCloseTo(0.5, 9);
            // Monotone non-decreasing until the event breaks.
            for (let i = 60; i < 89; i++)
                expect(states[i].forewarn).toBeGreaterThanOrEqual(states[i - 1].forewarn);
            // Frame 90: the event starts — forewarn hands over to onset.
            expect(states[89].weatherType).toBe(WEATHER_TYPES.GLITCH);
            expect(states[89].weatherOnset).toBe(1);
            expect(states[89].weatherIsEvent).toBe(1);
            expect(states[89].forewarn).toBe(0);
            expect(states[89].upcomingType).toBe(WEATHER_TYPES.CLEAR);
        });

        it('draws the event direction from the hash salt, stable across the arc', () => {
            const expected = hash(1, WEATHER_LIFECYCLE.DIRECTION_SALT) * Math.PI * 2;
            const states = collectRun(120);
            // Announced during forewarn...
            expect(states[74].eventDirection).toBeCloseTo(expected, 12);
            // ...and unchanged while the event runs.
            expect(states[89].eventDirection).toBeCloseTo(expected, 12);
            expect(states[119].eventDirection).toBeCloseTo(expected, 12);
        });

        it('draws a fresh deterministic direction for the second event', () => {
            // Event 1: frames 90-150 (30s duration); cooldown 60 after; the
            // second draw fires at frame 240 (cooldown 15 again).
            const states = collectRun(245);
            const second = hash(2, WEATHER_LIFECYCLE.DIRECTION_SALT) * Math.PI * 2;
            expect(states[241].upcomingType).toBe(WEATHER_TYPES.GLITCH);
            expect(states[241].eventDirection).toBeCloseTo(second, 12);
            expect(second).not.toBeCloseTo(hash(1, WEATHER_LIFECYCLE.DIRECTION_SALT) * Math.PI * 2, 6);
        });

        it('reproduces the identical direction sequence in a parallel system', () => {
            const a = collectRun(90);
            const b = collectRun(90);
            expect(a[89].eventDirection).toBe(b[89].eventDirection);
        });

        it('keeps the announced draw through a forced transient glitch (eclipse flash)', () => {
            const sys = new WeatherSystem(); // cooldown 45
            let state: WeatherState = sys.update(0.5, 0.5);
            for (let i = 2; i <= 74; i++)
                state = sys.update(0.5, i * 0.5);
            expect(state.upcomingType).toBe(WEATHER_TYPES.GLITCH);
            const announcedForewarn = state.forewarn;
            const announcedDirection = state.eventDirection;
            expect(announcedForewarn).toBeGreaterThan(0);

            // The solar-eclipse flash: DayNightCycle forces a 0.5s TRANSIENT
            // glitch. Transients bypass the forewarn arc exactly as they
            // bypass onset — the omen must hold, never snap to 0.
            sys.forceWeather('glitch', 0.5);
            state = sys.update(0.2, 37.2);
            expect(state.weatherType).toBe(WEATHER_TYPES.GLITCH);
            expect(state.weatherIsEvent).toBe(0);
            expect(state.upcomingType).toBe(WEATHER_TYPES.GLITCH);
            expect(state.forewarn).toBeCloseTo(announcedForewarn, 9);
            expect(state.eventDirection).toBeCloseTo(announcedDirection, 12);

            // The flash passes; the SAME draw (not a redraw) still breaks
            // with its original heading once the cooldown expires.
            state = sys.update(0.4, 37.6);
            expect(state.weatherType).toBe(WEATHER_TYPES.CLEAR);
            expect(state.upcomingType).toBe(WEATHER_TYPES.GLITCH);
            for (let i = 1; i <= 16; i++)
                state = sys.update(0.5, 37.6 + i * 0.5);
            expect(state.weatherType).toBe(WEATHER_TYPES.GLITCH);
            expect(state.weatherIsEvent).toBe(1);
            expect(state.eventDirection).toBeCloseTo(announcedDirection, 12);
        });

        it('drops the announced draw when a REAL state is forced over it', () => {
            const sys = new WeatherSystem(); // cooldown 45
            let state: WeatherState = sys.update(0.5, 0.5);
            for (let i = 2; i <= 74; i++)
                state = sys.update(0.5, i * 0.5);
            expect(state.upcomingType).toBe(WEATHER_TYPES.GLITCH);

            sys.forceWeather('static', 5);
            state = sys.update(0.5, 37.5);
            expect(state.weatherType).toBe(WEATHER_TYPES.STATIC);
            expect(state.forewarn).toBe(0);
            expect(state.upcomingType).toBe(WEATHER_TYPES.CLEAR);
        });
    });

    describe('aftermath phase', () => {
        it('broadcasts 1 -> 0 over the window after a real event ends', () => {
            const sys = new WeatherSystem();
            sys.forceWeather('static', 5);
            let state = sys.update(0.5, 0);
            // Run the forced event to its end (elapsed reaches 5 at frame 10).
            for (let i = 2; i <= 10; i++)
                state = sys.update(0.5, i * 0.5);
            expect(state.weatherType).toBe(WEATHER_TYPES.CLEAR);
            expect(state.aftermath).toBe(1);
            expect(state.lastEndedType).toBe(WEATHER_TYPES.STATIC);

            // Decays linearly and monotonically to exactly 0.
            let prev = state.aftermath;
            const framesToZero = Math.ceil(WEATHER_LIFECYCLE.AFTERMATH_SECONDS / 0.5);
            for (let i = 1; i <= framesToZero; i++) {
                state = sys.update(0.5, 5 + i * 0.5);
                expect(state.aftermath).toBeLessThanOrEqual(prev);
                prev = state.aftermath;
            }
            expect(state.aftermath).toBe(0);
            // The residue names what passed even after it fades.
            expect(state.lastEndedType).toBe(WEATHER_TYPES.STATIC);
        });

        it('orders the arc forewarn -> onset -> aftermath for a natural event', () => {
            const sys = new WeatherSystem();
            let sawForewarn = false;
            let sawOnset = false;
            let sawAftermath = false;
            for (let i = 1; i <= 160; i++) {
                const s = sys.update(0.5, i * 0.5);
                if (s.forewarn > 0 && !sawForewarn) {
                    expect(sawOnset).toBe(false);
                    expect(sawAftermath).toBe(false);
                    sawForewarn = true;
                }
                if (s.weatherOnset > 0 && !sawOnset) {
                    expect(sawForewarn).toBe(true);
                    expect(sawAftermath).toBe(false);
                    sawOnset = true;
                }
                if (s.aftermath > 0 && !sawAftermath) {
                    expect(sawForewarn).toBe(true);
                    expect(sawOnset).toBe(true);
                    sawAftermath = true;
                }
            }
            expect(sawForewarn && sawOnset && sawAftermath).toBe(true);
        });

        it('lets transient ambient glitches bypass forewarn and aftermath', () => {
            const r = vi.spyOn(Math, 'random');
            r.mockReturnValue(0.5);
            const sys = new WeatherSystem(); // cooldown = 45
            sys.update(0.1, 0);

            // Fire a transient glitch (0.001 < 0.12 * 0.016) — never announced.
            r.mockReturnValue(0.001);
            const glitching = sys.update(0.016, 1);
            expect(glitching.weatherType).toBe(WEATHER_TYPES.GLITCH);
            expect(glitching.forewarn).toBe(0);
            expect(glitching.weatherOnset).toBe(0);

            // Let the ~0.1s flicker end: no aftermath, no named residue.
            r.mockReturnValue(0.5);
            const after = sys.update(0.2, 2);
            expect(after.weatherType).toBe(WEATHER_TYPES.CLEAR);
            expect(after.aftermath).toBe(0);
            expect(after.lastEndedType).toBe(WEATHER_TYPES.CLEAR);
        });
    });

    describe('eclipse scheduler', () => {
        it('runs a forced eclipse as a real, screen-silent, progress-broadcast event', () => {
            const sys = new WeatherSystem();
            sys.forceWeather('eclipse', 10);
            const state = sys.update(0.5, 0);
            expect(state.weatherType).toBe(WEATHER_TYPES.ECLIPSE);
            expect(state.weatherIsEvent).toBe(1);
            expect(state.eclipseProgress).toBeCloseTo(0.05, 9);
            // The screen never sees it.
            expect(screenWeatherType(state.weatherType)).toBe(WEATHER_TYPES.CLEAR);
        });

        it('pauses the rotation while the eclipse runs and restores its cooldown after', () => {
            const sys = new WeatherSystem(); // rotation cooldown = 45
            sys.forceWeather('eclipse', 100); // far longer than the cooldown
            let maxProgress = 0;
            let state: WeatherState = sys.update(1, 0);
            for (let i = 2; i <= 99; i++) {
                state = sys.update(1, i);
                // No rotation event may interleave: the sky belongs to the eclipse.
                expect(state.weatherType).toBe(WEATHER_TYPES.ECLIPSE);
                maxProgress = Math.max(maxProgress, state.eclipseProgress);
            }
            expect(maxProgress).toBeGreaterThanOrEqual(0.98);

            // Frame 100: the eclipse ends and leaves a real aftermath.
            state = sys.update(1, 100);
            expect(state.weatherType).toBe(WEATHER_TYPES.CLEAR);
            expect(state.eclipseProgress).toBe(0);
            expect(state.aftermath).toBe(1);
            expect(state.lastEndedType).toBe(WEATHER_TYPES.ECLIPSE);

            // The rotation resumes where it stood: the 45s cooldown captured
            // at eclipse start expires 45 frames later (a redraw at the pinned
            // 0.5 would have been 60s — restoration is observable).
            for (let i = 101; i <= 144; i++) {
                state = sys.update(1, i);
                expect(state.weatherType).toBe(WEATHER_TYPES.CLEAR);
            }
            state = sys.update(1, 145);
            expect(state.weatherType).toBe(WEATHER_TYPES.GLITCH);
        });

        it('holds off before the minimum session time, then waits out an in-progress event', () => {
            // Pinned 0.5 rotation timeline (0.5s frames): events at t=45-75,
            // 135-165, 225-255. The first eclipse is due at t=240 — mid-event —
            // so it must wait for the 225-255 event to run its FULL length and
            // fire right after, at t~255.5.
            const sys = new WeatherSystem();
            let firstEclipseAt = -1;
            let eventFrames = 0;
            for (let i = 1; i <= 560; i++) {
                const t = i * 0.5;
                const s = sys.update(0.5, t);
                if (s.weatherType === WEATHER_TYPES.ECLIPSE && firstEclipseAt < 0)
                    firstEclipseAt = t;
                if (s.weatherType === WEATHER_TYPES.GLITCH && t >= 225 && t <= 255)
                    eventFrames++;
                if (s.weatherType !== WEATHER_TYPES.ECLIPSE)
                    expect(s.eclipseProgress).toBe(0);
            }
            // Never before the FIRST_MIN_SECONDS gate...
            expect(firstEclipseAt).toBeGreaterThanOrEqual(WEATHER_ECLIPSE.FIRST_MIN_SECONDS);
            // ...and only after the in-progress event completed at t=255.
            expect(firstEclipseAt).toBeGreaterThan(255);
            expect(firstEclipseAt).toBeLessThan(257);
            // The interrupted-by-nothing event kept its full 30s duration.
            expect(eventFrames * 0.5).toBeCloseTo(30, 0);
        });

        it('schedules the next eclipse a full interval after the last', () => {
            // At the pinned 0.5 draw the interval is 480 + 0.5 * 420 = 690s;
            // the first eclipse starts at t~255.5, so the second becomes due
            // at t~945.5 (and the sky there is clear on this timeline).
            const sys = new WeatherSystem();
            const eclipseStarts: number[] = [];
            let inEclipse = false;
            for (let i = 1; i <= 2000; i++) {
                const t = i * 0.5;
                const s = sys.update(0.5, t);
                if (s.weatherType === WEATHER_TYPES.ECLIPSE && !inEclipse)
                    eclipseStarts.push(t);
                inEclipse = s.weatherType === WEATHER_TYPES.ECLIPSE;
            }
            expect(eclipseStarts.length).toBe(2);
            const gap = eclipseStarts[1] - eclipseStarts[0];
            expect(gap).toBeGreaterThanOrEqual(WEATHER_ECLIPSE.INTERVAL_RANGE[0]);
            expect(gap).toBeLessThanOrEqual(WEATHER_ECLIPSE.INTERVAL_RANGE[1]);
        });
    });

    describe('behavior bias (mirror layer 4)', () => {
        it('returns the input table untouched for a null profile', () => {
            expect(biasedWeatherWeights(DEFAULT_WEATHER_WEIGHTS, null)).toBe(DEFAULT_WEATHER_WEIGHTS);
            expect(weatherCooldownScale(null)).toBe(1);
        });

        it('is bit-identical for a neutral profile', () => {
            const biased = biasedWeatherWeights(DEFAULT_WEATHER_WEIGHTS, NEUTRAL_PROFILE);
            expect(biased).toBe(DEFAULT_WEATHER_WEIGHTS);
            expect(weatherCooldownScale(NEUTRAL_PROFILE)).toBe(1);
        });

        it('leans bright/loud play toward storms and shorter calms (max +-30%)', () => {
            const w = ROOM_WEATHER_WEIGHTS[RoomType.IN_BETWEEN];
            const b = biasedWeatherWeights(w, BRIGHT_LOUD_PROFILE);
            const up = 1 + WEATHER_BEHAVIOR_BIAS.MAX_WEIGHT_SHIFT;
            const down = 1 - WEATHER_BEHAVIOR_BIAS.MAX_WEIGHT_SHIFT;
            expect(b.static).toBeCloseTo(w.static * up, 12);
            expect(b.rain).toBeCloseTo(w.rain * up, 12);
            expect(b.glitch).toBeCloseTo(w.glitch * up, 12);
            expect(b.gale).toBeCloseTo(w.gale * up, 12);
            expect(b.ashfall).toBeCloseTo(w.ashfall * down, 12);
            expect(weatherCooldownScale(BRIGHT_LOUD_PROFILE))
                .toBeCloseTo(1 - WEATHER_BEHAVIOR_BIAS.MAX_COOLDOWN_SHIFT, 12);
        });

        it('leans dim/still play toward ASHFALL and longer calms', () => {
            const w = DEFAULT_WEATHER_WEIGHTS;
            const b = biasedWeatherWeights(w, DIM_STILL_PROFILE);
            expect(b.ashfall).toBeCloseTo(w.ashfall * (1 + WEATHER_BEHAVIOR_BIAS.MAX_WEIGHT_SHIFT), 12);
            expect(b.static).toBeCloseTo(w.static * (1 - WEATHER_BEHAVIOR_BIAS.MAX_WEIGHT_SHIFT), 12);
            expect(weatherCooldownScale(DIM_STILL_PROFILE))
                .toBeCloseTo(1 + WEATHER_BEHAVIOR_BIAS.MAX_COOLDOWN_SHIFT, 12);
        });

        it('never shifts beyond the clamp even for out-of-contract profiles', () => {
            const extreme: BehaviorProfile = { avgFlower: -5, gazeRatio: 9, overrideActivity: -2, crackAffinity: 7 };
            const b = biasedWeatherWeights(DEFAULT_WEATHER_WEIGHTS, extreme);
            for (const key of ['static', 'rain', 'glitch', 'ashfall', 'gale'] as const) {
                expect(b[key]).toBeGreaterThanOrEqual(DEFAULT_WEATHER_WEIGHTS[key] * (1 - WEATHER_BEHAVIOR_BIAS.MAX_WEIGHT_SHIFT) - 1e-12);
                expect(b[key]).toBeLessThanOrEqual(DEFAULT_WEATHER_WEIGHTS[key] * (1 + WEATHER_BEHAVIOR_BIAS.MAX_WEIGHT_SHIFT) + 1e-12);
            }
            const scale = weatherCooldownScale(extreme);
            expect(scale).toBeGreaterThanOrEqual(1 - WEATHER_BEHAVIOR_BIAS.MAX_COOLDOWN_SHIFT);
            expect(scale).toBeLessThanOrEqual(1 + WEATHER_BEHAVIOR_BIAS.MAX_COOLDOWN_SHIFT);
        });

        it('preserves the room signature: storm types shift by ONE shared multiplier', () => {
            const w = ROOM_WEATHER_WEIGHTS[RoomType.INFO_OVERFLOW];
            const b = biasedWeatherWeights(w, BRIGHT_LOUD_PROFILE);
            // RAIN stays exactly 6x STATIC — the lean never rewrites the room.
            expect(b.rain / b.static).toBeCloseTo(w.rain / w.static, 12);
            expect(b.rain / b.glitch).toBeCloseTo(w.rain / w.glitch, 12);
        });

        it('drives the system identically for null and neutral profiles', () => {
            const a = new WeatherSystem();
            const b = new WeatherSystem();
            const sa = a.update(61, 61, null, null);
            const sb = b.update(61, 61, null, NEUTRAL_PROFILE);
            expect(sb).toEqual(sa);
        });

        it('shortens the observed calm between events under bright/loud play', () => {
            // Both systems run the same forced 5s event; the bright profile
            // scales the post-event cooldown draw (60s at the pinned 0.5) by
            // 0.7 -> 42s, so its next storm breaks ~18s earlier.
            function framesToNextEvent(profile: BehaviorProfile | null): number {
                const sys = new WeatherSystem();
                sys.forceWeather('static', 5);
                for (let i = 1; i <= 200; i++) {
                    const s = sys.update(1, i, null, profile);
                    if (i > 5 && s.weatherType !== WEATHER_TYPES.CLEAR)
                        return i;
                }
                return -1;
            }
            const bright = framesToNextEvent(BRIGHT_LOUD_PROFILE);
            const unbiased = framesToNextEvent(null);
            expect(bright).toBe(47); // 5s event + 42s biased cooldown
            expect(unbiased).toBe(65); // 5s event + 60s unbiased cooldown
        });
    });

    describe('new rotation types (per-type tuning)', () => {
        it('keeps ASHFALL gentle: intensity scaled and clamped below the ceiling', () => {
            const r = vi.spyOn(Math, 'random');
            r.mockReturnValue(0.7); // constructor cooldown 51; pick 3.5 -> ASHFALL
            const sys = new WeatherSystem();
            let state = sys.update(61, 61);
            expect(state.weatherType).toBe(WEATHER_TYPES.ASHFALL);
            // Profile draw 0.6 + 0.7*0.4 = 0.88, scaled by 0.6 -> 0.528 (inside
            // the [0.2, 0.7] clamp). Ramp long enough to converge.
            for (let i = 0; i < 200; i++)
                state = sys.update(0.1, 62 + i * 0.1);
            expect(state.weatherType).toBe(WEATHER_TYPES.ASHFALL);
            expect(state.weatherIntensity).toBeCloseTo(0.528, 2);
            expect(state.weatherIntensity).toBeLessThanOrEqual(WEATHER_TYPE_TUNING.ASHFALL.INTENSITY_MAX);
        });

        it('stretches ASHFALL duration by its tuning scale', () => {
            const r = vi.spyOn(Math, 'random');
            r.mockReturnValue(0.7);
            const sys = new WeatherSystem();
            let state = sys.update(61, 61);
            expect(state.weatherType).toBe(WEATHER_TYPES.ASHFALL);
            // Untuned draw would be 15 + 0.7*30 = 36s; ASHFALL lingers 1.5x -> 54s.
            let active = 0.5; // the starting frame counts
            for (let i = 1; i <= 130 && state.weatherType !== WEATHER_TYPES.CLEAR; i++) {
                state = sys.update(0.5, 61 + i * 0.5);
                if (state.weatherType !== WEATHER_TYPES.CLEAR)
                    active += 0.5;
            }
            expect(active).toBeCloseTo(36 * WEATHER_TYPE_TUNING.ASHFALL.DURATION_SCALE, 0);
        });

        it('shortens GALE by its tuning scale at full room intensity', () => {
            const r = vi.spyOn(Math, 'random');
            r.mockReturnValue(0.999); // pick 4.995 -> GALE
            const sys = new WeatherSystem();
            let state = sys.update(61, 61);
            expect(state.weatherType).toBe(WEATHER_TYPES.GALE);
            // Untuned draw ~45s; GALE hits harder and shorter: ~33.7s.
            let active = 0.5;
            for (let i = 1; i <= 100 && state.weatherType !== WEATHER_TYPES.CLEAR; i++) {
                state = sys.update(0.5, 61 + i * 0.5);
                if (state.weatherType !== WEATHER_TYPES.CLEAR)
                    active += 0.5;
            }
            expect(active).toBeGreaterThan(30);
            expect(active).toBeLessThan(36);
        });

        it('keeps the tuning table shaped for its design intent', () => {
            // ASHFALL lingers and never storms; GALE is brisk and full-strength.
            expect(WEATHER_TYPE_TUNING.ASHFALL.DURATION_SCALE).toBeGreaterThan(1);
            expect(WEATHER_TYPE_TUNING.ASHFALL.INTENSITY_MAX).toBeLessThanOrEqual(0.7);
            expect(WEATHER_TYPE_TUNING.GALE.DURATION_SCALE).toBeLessThan(1);
            expect(WEATHER_TYPE_TUNING.GALE.INTENSITY_MAX).toBeLessThanOrEqual(1);
        });
    });

    describe('state shape and bounds (new fields)', () => {
        it('always returns the extended WeatherState shape', () => {
            const sys = new WeatherSystem();
            const state = sys.update(0.016, 0);
            expect(state).toHaveProperty('forewarn');
            expect(state).toHaveProperty('upcomingType');
            expect(state).toHaveProperty('eventDirection');
            expect(state).toHaveProperty('aftermath');
            expect(state).toHaveProperty('lastEndedType');
            expect(state).toHaveProperty('eclipseProgress');
        });

        it('keeps every broadcast scalar in bounds across a long random run', () => {
            vi.restoreAllMocks();
            const sys = new WeatherSystem();
            const valid = new Set<number>(Object.values(WEATHER_TYPES));
            let t = 0;
            for (let i = 0; i < 8000; i++) {
                t += 0.1;
                const s = sys.update(0.1, t);
                expect(s.forewarn).toBeGreaterThanOrEqual(0);
                expect(s.forewarn).toBeLessThanOrEqual(1);
                expect(s.aftermath).toBeGreaterThanOrEqual(0);
                expect(s.aftermath).toBeLessThanOrEqual(1);
                expect(s.eclipseProgress).toBeGreaterThanOrEqual(0);
                expect(s.eclipseProgress).toBeLessThanOrEqual(1);
                expect(s.eventDirection).toBeGreaterThanOrEqual(0);
                expect(s.eventDirection).toBeLessThan(Math.PI * 2);
                expect(valid.has(s.weatherType)).toBe(true);
                expect(valid.has(s.upcomingType)).toBe(true);
                expect(valid.has(s.lastEndedType)).toBe(true);
            }
        });
    });
});
