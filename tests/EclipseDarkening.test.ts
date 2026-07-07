import type { DayNightContext, WeatherState } from '../src/types';
import type { DarkenableScene } from '../src/world/EclipseDarkening';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eclipseLowpassHz } from '../src/audio/AudioController';
import { AUDIO_MASTER, ECLIPSE_AUDIO, ECLIPSE_DARKENING, WEATHER_ECLIPSE } from '../src/config';
import { DayNightCycle } from '../src/world/DayNightCycle';
import { EclipseDarkening, eclipseTransitDepth } from '../src/world/EclipseDarkening';
import { WEATHER_TYPES } from '../src/world/WeatherSystem';

/** Minimal weather broadcast slice the depth curve reads. */
function state(weatherType: number, eclipseProgress: number): Pick<WeatherState, 'weatherType' | 'eclipseProgress'> {
    return { weatherType, eclipseProgress };
}

/** A darkening-visible scene: real colors, no real THREE.Scene. */
function makeScene(hex: number): { scene: DarkenableScene; bg: THREE.Color; fogColor: THREE.Color } {
    const bg = new THREE.Color(hex);
    const fogColor = new THREE.Color(hex);
    const scene = { background: bg, fog: { color: fogColor } } as unknown as DarkenableScene;
    return { scene, bg, fogColor };
}

describe('eclipseTransitDepth (the transit curve)', () => {
    it('is exactly 0 on the boot frame (null broadcast)', () => {
        expect(eclipseTransitDepth(null)).toBe(0);
    });

    it('is exactly 0 for every non-eclipse weather type', () => {
        for (const type of Object.values(WEATHER_TYPES)) {
            if (type === WEATHER_TYPES.ECLIPSE)
                continue;
            expect(eclipseTransitDepth(state(type, 0.5))).toBe(0);
        }
    });

    it('rises to 1 at mid-transit and returns to 0 as the disc sets', () => {
        expect(eclipseTransitDepth(state(WEATHER_TYPES.ECLIPSE, 0))).toBe(0);
        expect(eclipseTransitDepth(state(WEATHER_TYPES.ECLIPSE, 0.5))).toBeCloseTo(1, 10);
        expect(eclipseTransitDepth(state(WEATHER_TYPES.ECLIPSE, 1))).toBeCloseTo(0, 10);
        // Deepest at mid-transit: strictly deeper than the quarter points.
        const quarter = eclipseTransitDepth(state(WEATHER_TYPES.ECLIPSE, 0.25));
        expect(quarter).toBeGreaterThan(0);
        expect(quarter).toBeLessThan(1);
        expect(eclipseTransitDepth(state(WEATHER_TYPES.ECLIPSE, 0.75))).toBeCloseTo(quarter, 10);
    });

    it('clamps out-of-range progress instead of going negative', () => {
        expect(eclipseTransitDepth(state(WEATHER_TYPES.ECLIPSE, -0.5))).toBe(0);
        expect(eclipseTransitDepth(state(WEATHER_TYPES.ECLIPSE, 1.5))).toBeCloseTo(0, 10);
    });
});

describe('eclipseDarkening compose/restore', () => {
    it('writes nothing at all outside a transit (steady state is free)', () => {
        const { scene, bg, fogColor } = makeScene(0x888888);
        const copySpy = vi.spyOn(bg, 'copy');
        new EclipseDarkening(scene).apply(0);
        expect(copySpy).not.toHaveBeenCalled();
        expect(bg.getHex()).toBe(0x888888);
        expect(fogColor.getHex()).toBe(0x888888);
    });

    it('darkens background AND fog toward the night target, deepest at mid-transit', () => {
        const { scene, bg, fogColor } = makeScene(0x888888);
        const darkening = new EclipseDarkening(scene);

        darkening.apply(eclipseTransitDepth(state(WEATHER_TYPES.ECLIPSE, 0.25)));
        const quarter = bg.r;
        darkening.apply(eclipseTransitDepth(state(WEATHER_TYPES.ECLIPSE, 0.5)));
        const mid = bg.r;

        const base = new THREE.Color(0x888888);
        const target = new THREE.Color(ECLIPSE_DARKENING.TARGET_HEX);
        expect(mid).toBeLessThan(quarter); // deeper at mid-transit
        expect(mid).toBeGreaterThan(target.r * 0.99); // never below the target
        expect(quarter).toBeLessThan(base.r); // already darkening at a quarter
        expect(fogColor.r).toBeCloseTo(mid, 10); // fog follows the background
    });

    it('restores the base color bit-exactly after a full transit', () => {
        const { scene, bg } = makeScene(0x888888);
        const darkening = new EclipseDarkening(scene);
        const steps = 20;
        for (let i = 0; i <= steps; i++)
            darkening.apply(eclipseTransitDepth(state(WEATHER_TYPES.ECLIPSE, i / steps)));
        // Transit over: the CLEAR broadcast composes depth 0 -> exact base.
        darkening.apply(eclipseTransitDepth(state(WEATHER_TYPES.CLEAR, 0)));
        expect(bg.getHex()).toBe(0x888888);
        expect(bg.equals(new THREE.Color(0x888888))).toBe(true);
    });

    it('re-bases on an external write mid-transit (a sunset during the eclipse)', () => {
        const { scene, bg } = makeScene(0x888888);
        const darkening = new EclipseDarkening(scene);
        darkening.apply(0.7);
        // DayNightCycle transition lands mid-eclipse: a new base color.
        bg.setHex(0x222222);
        darkening.apply(0.7);
        const darkenedNight = new THREE.Color(0x222222)
            .lerp(new THREE.Color(ECLIPSE_DARKENING.TARGET_HEX), 0.7 * ECLIPSE_DARKENING.DEPTH_MAX);
        expect(bg.getHex()).toBe(darkenedNight.getHex());
        // And the restore lands on the NIGHT color, not the old day base.
        darkening.apply(0);
        expect(bg.getHex()).toBe(0x222222);
    });
});

describe('eclipse never touches the day/night state machine (critical contract)', () => {
    beforeEach(() => {
        // 11/12 keeps every DayNightCycle random branch quiet (no legacy
        // solar eclipse, no forced weather) — the DayNightCycle.test.ts trick.
        vi.spyOn(Math, 'random').mockReturnValue(11 / 12);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function makeCycleContext(scene: DarkenableScene): { context: DayNightContext; onSunset: ReturnType<typeof vi.fn>; uniforms: { invertColors: { value: boolean } } } {
        const uniforms = { invertColors: { value: false } };
        const onSunset = vi.fn();
        const context = {
            scene,
            shaderQuad: { material: { uniforms } },
            audio: { playDayNightTransition: vi.fn(), playEyeBlink: vi.fn() },
            weather: { forceWeather: vi.fn() },
            onSunset,
        } as unknown as DayNightContext;
        return { context, onSunset, uniforms };
    }

    it('a full eclipse cycle never flips isDaytime and never enters the sunset path', () => {
        const { scene, bg } = makeScene(0x888888);
        const { context, onSunset, uniforms } = makeCycleContext(scene);
        const cycle = new DayNightCycle();
        const darkening = new EclipseDarkening(scene);

        // Run the WHOLE eclipse duration through both systems side by side —
        // exactly the StatsSunsetUpdater order (cycle first, compose after).
        const STEP = 0.5;
        const steps = Math.round(WEATHER_ECLIPSE.DURATION_SECONDS / STEP);
        for (let i = 1; i <= steps; i++) {
            cycle.update(STEP, context);
            darkening.apply(eclipseTransitDepth(state(WEATHER_TYPES.ECLIPSE, i / steps)));
            expect(cycle.isDaytime()).toBe(true); // the day never flips
        }
        darkening.apply(eclipseTransitDepth(state(WEATHER_TYPES.CLEAR, 0)));

        expect(onSunset).not.toHaveBeenCalled(); // sunset path never entered
        expect(uniforms.invertColors.value).toBe(false); // no night inversion
        expect(cycle.getSunsetForeshadow(30)).toBe(0); // no foreshadow leak
        expect(bg.getHex()).toBe(0x888888); // world restored bit-exactly
    });

    it('a real sunset mid-eclipse still fires exactly once, from the cycle alone', () => {
        const { scene, bg } = makeScene(0x888888);
        const { context, onSunset } = makeCycleContext(scene);
        const cycle = new DayNightCycle();
        const darkening = new EclipseDarkening(scene);

        // Walk the cycle to just before its own 150s sunset, eclipse-free.
        const STEP = 0.5;
        for (let t = 0; t < 145; t += STEP)
            cycle.update(STEP, context);

        // The eclipse now spans the sunset. The transition still fires ONCE
        // (the cycle's own clock — darkening neither causes nor delays it)
        // and its night color becomes the new darkening base.
        const steps = Math.round(WEATHER_ECLIPSE.DURATION_SECONDS / STEP);
        for (let i = 1; i <= steps; i++) {
            cycle.update(STEP, context);
            darkening.apply(eclipseTransitDepth(state(WEATHER_TYPES.ECLIPSE, i / steps)));
        }
        darkening.apply(eclipseTransitDepth(state(WEATHER_TYPES.CLEAR, 0)));

        expect(onSunset).toHaveBeenCalledTimes(1);
        expect(cycle.isDaytime()).toBe(false);
        // Restored to the cycle's own night color (nightIntensity boots at
        // 0.5 => 0x11 + 0x11 = 0x22 gray), not the pre-eclipse day color.
        expect(bg.getHex()).toBe(0x222222);
    });
});

describe('eclipseLowpassHz (audio darkening cutoff)', () => {
    it('lifts the ceiling entirely at depth 0', () => {
        expect(eclipseLowpassHz(0)).toBe(Infinity);
        expect(eclipseLowpassHz(-1)).toBe(Infinity);
    });

    it('reaches the config floor at full depth and clamps beyond', () => {
        expect(eclipseLowpassHz(1)).toBeCloseTo(ECLIPSE_AUDIO.lowpassFloorHz, 6);
        expect(eclipseLowpassHz(2)).toBeCloseTo(ECLIPSE_AUDIO.lowpassFloorHz, 6);
    });

    it('interpolates in log-frequency space (equal octaves per depth step)', () => {
        const geoMean = Math.sqrt(AUDIO_MASTER.gazeFilterOpen * ECLIPSE_AUDIO.lowpassFloorHz);
        expect(eclipseLowpassHz(0.5)).toBeCloseTo(geoMean, 6);
        // Monotone: deeper transit, duller world.
        expect(eclipseLowpassHz(0.25)).toBeGreaterThan(eclipseLowpassHz(0.75));
    });
});
