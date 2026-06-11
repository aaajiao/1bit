import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomType } from '../src/world/RoomConfig';
import { WEATHER_TYPES, WeatherSystem } from '../src/world/WeatherSystem';

describe('weatherSystem', () => {
    let weather: WeatherSystem;

    beforeEach(() => {
        // Pin Math.random so the constructor's initial cooldown and any
        // RNG-driven branches are deterministic for each test. Individual
        // tests override this with vi.spyOn where they need specific draws.
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        weather = new WeatherSystem();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('initial state', () => {
        it('should start in CLEAR weather with zero intensity', () => {
            // No glitch (0.5 >> the per-second glitch threshold 0.12*0.016 ~ 0.0019)
            // and cooldown not yet elapsed, so a tiny update keeps us clear.
            const state = weather.update(0.016, 1.0);
            expect(state.weatherType).toBe(WEATHER_TYPES.CLEAR);
            expect(state.weatherIntensity).toBe(0);
        });

        it('should report the time passed into update as weatherTime', () => {
            const state = weather.update(0.016, 42.5);
            expect(state.weatherTime).toBe(42.5);
        });
    });

    describe('state shape and bounds', () => {
        it('should always return the WeatherState shape', () => {
            const state = weather.update(0.016, 0);
            expect(state).toHaveProperty('weatherType');
            expect(state).toHaveProperty('weatherIntensity');
            expect(state).toHaveProperty('weatherTime');
        });

        it('should keep intensity clamped within [0, 1] across many random steps', () => {
            // Let the real RNG drive the machine through cooldown/weather/glitch
            // for a long simulated run; intensity must never escape [0, 1].
            vi.restoreAllMocks();
            const sys = new WeatherSystem();
            let t = 0;
            for (let i = 0; i < 20000; i++) {
                t += 0.05;
                const state = sys.update(0.05, t);
                expect(state.weatherIntensity).toBeGreaterThanOrEqual(0);
                expect(state.weatherIntensity).toBeLessThanOrEqual(1);
                expect(Object.values(WEATHER_TYPES)).toContain(state.weatherType);
            }
        });

        it('should never produce a weatherType outside the defined set', () => {
            const valid = new Set<number>(Object.values(WEATHER_TYPES));
            for (let i = 0; i < 200; i++) {
                const state = weather.update(0.1, i * 0.1);
                expect(valid.has(state.weatherType)).toBe(true);
            }
        });
    });

    describe('forceWeather (deterministic public API)', () => {
        it('should switch to STATIC when forced', () => {
            weather.forceWeather('static', 30);
            const state = weather.update(0.016, 0);
            expect(state.weatherType).toBe(WEATHER_TYPES.STATIC);
        });

        it('should switch to RAIN when forced', () => {
            weather.forceWeather('rain', 30);
            const state = weather.update(0.016, 0);
            expect(state.weatherType).toBe(WEATHER_TYPES.RAIN);
        });

        it('should switch to GLITCH when forced', () => {
            weather.forceWeather('glitch', 30);
            const state = weather.update(0.016, 0);
            expect(state.weatherType).toBe(WEATHER_TYPES.GLITCH);
        });

        it('should fall back to CLEAR for an unknown weather name', () => {
            weather.forceWeather('blizzard', 30);
            const state = weather.update(0.016, 0);
            expect(state.weatherType).toBe(WEATHER_TYPES.CLEAR);
        });

        it('should reset intensity to 0 when forcing CLEAR', () => {
            // First ramp some intensity with an active weather...
            weather.forceWeather('static', 30);
            for (let i = 0; i < 30; i++)
                weather.update(0.1, i * 0.1);
            expect(weather.update(0.1, 3).weatherIntensity).toBeGreaterThan(0);

            // ...then forcing CLEAR must drop intensity back to zero immediately.
            weather.forceWeather('clear');
            const state = weather.update(0.016, 5);
            expect(state.weatherType).toBe(WEATHER_TYPES.CLEAR);
            expect(state.weatherIntensity).toBe(0);
        });
    });

    describe('intensity ramping (natural RNG-driven events)', () => {
        // Real (non-forced) STATIC/RAIN events do NOT snap intensity to full;
        // they ramp it smoothly toward a target in [0.6, 1.0]. We drive that
        // path deterministically by pinning Math.random.

        // Start a natural STATIC/RAIN event with intensity still ~0 and elapsed
        // still tiny, by draining the cooldown in small steps and breaking the
        // instant weather becomes active. r drives type/duration/target.
        function startNaturalWeather(r: number): WeatherSystem {
            const draw = vi.spyOn(Math, 'random');
            draw.mockReturnValue(r); // r >> per-second glitch threshold (0.12*0.01), so no ambient glitch
            const sys = new WeatherSystem(); // cooldown = 30 + r*30 (<= 60)
            for (let i = 0; i < 7000; i++) {
                const s = sys.update(0.01, i * 0.01);
                if (s.weatherType !== WEATHER_TYPES.CLEAR)
                    break;
            }
            return sys;
        }

        it('should ramp intensity up smoothly toward the target while active', () => {
            // r = 0.5 -> target = 0.6 + 0.5*0.4 = 0.8, duration = 30 (no fade yet)
            const sys = startNaturalWeather(0.5);
            const baseline = sys.update(0.1, 100).weatherIntensity;
            const s2 = sys.update(0.1, 100.1).weatherIntensity;
            const s3 = sys.update(0.1, 100.2).weatherIntensity;

            // Strictly increasing toward the 0.8 target, never exceeding it.
            expect(baseline).toBeLessThan(0.8);
            expect(s2).toBeGreaterThan(baseline);
            expect(s3).toBeGreaterThan(s2);
            expect(s3).toBeLessThanOrEqual(0.8 + 1e-9);
        });

        it('should follow the documented smoothing step exactly', () => {
            // intensity += (target - intensity) * transitionSpeed(0.5) * delta * 5
            // We read the running intensity, take one step, and verify the delta.
            const sys = startNaturalWeather(0.5); // target 0.8
            const before = sys.update(0.05, 200).weatherIntensity;
            const after = sys.update(0.1, 200.05).weatherIntensity;
            const expectedAfter = before + (0.8 - before) * 0.5 * 0.1 * 5;
            expect(after).toBeCloseTo(expectedAfter, 6);
        });

        it('should asymptotically approach its target intensity over time', () => {
            // r = 0.999 -> target = 0.6 + 0.999*0.4 ~ 0.9996, duration ~ 45
            const sys = startNaturalWeather(0.999);
            let last = 0;
            // Many small steps drive intensity toward the ~0.9996 target while
            // staying inside the ~45s duration (no fade-out yet).
            for (let i = 0; i < 120; i++)
                last = sys.update(0.05, 300 + i * 0.05).weatherIntensity;
            expect(last).toBeGreaterThan(0.9);
            expect(last).toBeLessThanOrEqual(1);
        });

        it('should snap forced (non-clear) weather to full intensity instantly', () => {
            // The forceWeather path is "instant-on" so short scripted events
            // (e.g. the eclipse glitch) are immediately visible.
            weather.forceWeather('static', 30);
            const state = weather.update(0.016, 0);
            expect(state.weatherType).toBe(WEATHER_TYPES.STATIC);
            expect(state.weatherIntensity).toBe(1);
        });

        it('should set forced glitch intensity to full immediately', () => {
            weather.forceWeather('glitch', 0.5);
            const state = weather.update(0.016, 0);
            expect(state.weatherType).toBe(WEATHER_TYPES.GLITCH);
            expect(state.weatherIntensity).toBe(1);
        });
    });

    describe('weather lifecycle / transitions', () => {
        it('should fade intensity back toward 0 in the final 2 seconds of a real event', () => {
            // Drive a natural event: r = 0.5 -> RAIN, duration = 30, target 0.8.
            // The fade-out branch fires only for durations > 2 once
            // elapsed > duration - 2 (i.e. elapsed > 28s here).
            const draw = vi.spyOn(Math, 'random');
            draw.mockReturnValue(0.5);
            const sys = new WeatherSystem();
            // Drain the cooldown in small steps, breaking the instant weather
            // starts so intensity is still ~0 and elapsed is tiny.
            for (let i = 0; i < 7000; i++) {
                if (sys.update(0.01, i * 0.01).weatherType !== WEATHER_TYPES.CLEAR)
                    break;
            }

            // Ramp up for ~10s (elapsed well below the 28s fade threshold).
            let peak = 0;
            for (let i = 0; i < 100; i++)
                peak = sys.update(0.1, 100 + i * 0.1).weatherIntensity;
            expect(peak).toBeGreaterThan(0.5);

            // Advance elapsed past duration - 2 so the target collapses to 0.
            // Stay below the full 30s duration so the event is still active.
            let falling = peak;
            for (let i = 0; i < 185; i++)
                falling = sys.update(0.1, 200 + i * 0.1).weatherIntensity;

            // Still the same active event, but intensity has dropped (fade-out).
            expect(falling).toBeLessThan(peak);
        });

        it('should return to CLEAR once the duration elapses', () => {
            weather.forceWeather('static', 5);
            let state = weather.update(0.016, 0);
            expect(state.weatherType).toBe(WEATHER_TYPES.STATIC);

            // Advance well past the 5s duration.
            for (let i = 0; i < 100; i++)
                state = weather.update(0.1, i * 0.1);

            expect(state.weatherType).toBe(WEATHER_TYPES.CLEAR);
            expect(state.weatherIntensity).toBe(0);
        });

        it('should trigger a random weather event when cooldown expires', () => {
            // random 0.5 -> startRandomWeather picks types[floor(0.5*3)] = index 1
            // of [STATIC, RAIN, GLITCH] = RAIN, duration 30, target ~ 0.8.
            // First advance enough to drain the initial cooldown (45 at random 0.5).
            let state = weather.update(0.016, 0);
            expect(state.weatherType).toBe(WEATHER_TYPES.CLEAR);

            for (let i = 0; i < 1000; i++) {
                state = weather.update(0.1, i * 0.1);
                if (state.weatherType !== WEATHER_TYPES.CLEAR)
                    break;
            }
            // After cooldown drains a non-clear weather starts (any of the three
            // rotation types). With random pinned at 0.5 this is deterministically RAIN.
            expect([
                WEATHER_TYPES.STATIC,
                WEATHER_TYPES.RAIN,
                WEATHER_TYPES.GLITCH,
            ]).toContain(state.weatherType);
            expect(state.weatherType).toBe(WEATHER_TYPES.RAIN);
        });

        it('should pick the weather type deterministically from the RNG draw (3-way rotation)', () => {
            // The rotation is [STATIC, RAIN, GLITCH], so floor(random()*3) selects:
            //   0     -> index 0 -> STATIC
            //   0.5   -> index 1 -> RAIN
            //   0.999 -> index 2 -> GLITCH
            // One large update() drains the constructor cooldown (<= 60s) and fires
            // the trigger in a single frame. (For these draws an ambient glitch also
            // fires first, but startRandomWeather runs last and wins the frame.)
            const cases: Array<[number, number]> = [
                [0, WEATHER_TYPES.STATIC],
                [0.5, WEATHER_TYPES.RAIN],
                [0.999, WEATHER_TYPES.GLITCH],
            ];
            const r = vi.spyOn(Math, 'random');
            for (const [draw, expected] of cases) {
                r.mockReturnValue(draw);
                const sys = new WeatherSystem(); // cooldown = 30 + draw*30 (<= 60)
                const state = sys.update(61, 61);
                expect(state.weatherType, `draw ${draw}`).toBe(expected);
            }
        });

        it('should trigger a glitch during clear weather when the RNG draw is below the per-second threshold', () => {
            const r = vi.spyOn(Math, 'random');
            r.mockReturnValue(0.5); // constructor cooldown
            const sys = new WeatherSystem();

            // Threshold this frame = glitchChance(0.12) * delta(0.016) ~ 0.00192,
            // and the pinned draw 0.001 < 0.00192, so a transient glitch fires.
            r.mockReturnValue(0.001);
            const state = sys.update(0.016, 1.0);
            expect(state.weatherType).toBe(WEATHER_TYPES.GLITCH);
            expect(state.weatherIntensity).toBe(1); // glitch is instant-on
        });

        it('should scale the ambient glitch rate by delta (frame-rate independent)', () => {
            // glitchChance is a per-second rate (0.12) applied as random() < 0.12*delta,
            // so the SAME pinned draw triggers a glitch on a long frame but not a short
            // one — proving the threshold tracks delta instead of being per-frame fixed.
            const r = vi.spyOn(Math, 'random');

            r.mockReturnValue(0.5); // constructor cooldown
            const longFrame = new WeatherSystem();
            r.mockReturnValue(0.001);
            // 0.12 * 0.016 = 0.00192 > 0.001 -> glitch fires
            expect(longFrame.update(0.016, 1).weatherType).toBe(WEATHER_TYPES.GLITCH);

            r.mockReturnValue(0.5);
            const shortFrame = new WeatherSystem();
            r.mockReturnValue(0.001);
            // 0.12 * 0.004 = 0.00048 < 0.001 -> no glitch, stays clear
            expect(shortFrame.update(0.004, 1).weatherType).toBe(WEATHER_TYPES.CLEAR);
        });

        it('should not start a second random weather while one is already active', () => {
            // Start a forced weather, then ensure cooldown-based triggering does not
            // override the active weather type on subsequent frames.
            weather.forceWeather('rain', 50);
            for (let i = 0; i < 30; i++) {
                const state = weather.update(0.1, i * 0.1);
                expect(state.weatherType).toBe(WEATHER_TYPES.RAIN);
            }
        });
    });

    describe('room-weighted selection (flow-audit medium #3)', () => {
        // Drains the constructor cooldown (<= 60s at the pinned constructor draw)
        // in one frame so startRandomWeather fires with the given RNG draw and room.
        function triggerWithDraw(draw: number, room: RoomType | null): number {
            const r = vi.spyOn(Math, 'random');
            r.mockReturnValue(0.5); // constructor cooldown = 45
            const sys = new WeatherSystem();
            r.mockReturnValue(draw);
            return sys.update(61, 61, room).weatherType;
        }

        it('should never start STATIC or RAIN in POLARIZED — only GLITCH survives', () => {
            for (const draw of [0, 0.2, 0.5, 0.8, 0.999]) {
                expect(triggerWithDraw(draw, RoomType.POLARIZED), `draw ${draw}`)
                    .toBe(WEATHER_TYPES.GLITCH);
            }
        });

        it('should bias INFO_OVERFLOW toward RAIN on draws that pick other types by default', () => {
            // Default rotation (equal thirds): 0.3 -> STATIC, 0.7 -> GLITCH.
            expect(triggerWithDraw(0.3, null)).toBe(WEATHER_TYPES.STATIC);
            expect(triggerWithDraw(0.7, null)).toBe(WEATHER_TYPES.GLITCH);
            // INFO_OVERFLOW weights (1/6/1, total 8): both draws land in the
            // wide RAIN band [1/8, 7/8).
            expect(triggerWithDraw(0.3, RoomType.INFO_OVERFLOW)).toBe(WEATHER_TYPES.RAIN);
            expect(triggerWithDraw(0.7, RoomType.INFO_OVERFLOW)).toBe(WEATHER_TYPES.RAIN);
        });

        it('should keep the edge bands of the INFO_OVERFLOW rotation reachable', () => {
            // INFO weights 1/6/1 (total 8): STATIC below 1/8, GLITCH at/above 7/8.
            expect(triggerWithDraw(0.05, RoomType.INFO_OVERFLOW)).toBe(WEATHER_TYPES.STATIC);
            expect(triggerWithDraw(0.95, RoomType.INFO_OVERFLOW)).toBe(WEATHER_TYPES.GLITCH);
        });

        it('should preserve the historical equal-thirds mapping when no room is given', () => {
            const cases: Array<[number, number]> = [
                [0, WEATHER_TYPES.STATIC],
                [0.5, WEATHER_TYPES.RAIN],
                [0.999, WEATHER_TYPES.GLITCH],
            ];
            for (const [draw, expected] of cases) {
                expect(triggerWithDraw(draw, null), `draw ${draw}`).toBe(expected);
            }
        });

        it('should never cut short weather already in progress when the room changes', () => {
            weather.forceWeather('rain', 50);
            // Walking into POLARIZED (which blocks RAIN selection) must not
            // interrupt the in-progress rain — weighting affects selection only.
            for (let i = 0; i < 30; i++) {
                const state = weather.update(0.1, i * 0.1, RoomType.POLARIZED);
                expect(state.weatherType).toBe(WEATHER_TYPES.RAIN);
            }
        });
    });
});
