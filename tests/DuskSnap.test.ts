import type { DayNightContext, WeatherState } from '../src/types';
import type { DarkenableScene } from '../src/world/EclipseDarkening';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DUSK_SNAP, SUNSET_FORESHADOW, WEATHER_ECLIPSE } from '../src/config';
import { DayNightCycle } from '../src/world/DayNightCycle';
import { duskFlickerValue, DuskSnapSequencer, presentedBlend } from '../src/world/DuskSnap';
import { EclipseDarkening, eclipseTransitDepth } from '../src/world/EclipseDarkening';
import { lerpRoomShaderConfig, ROOM_CONFIGS, RoomType } from '../src/world/RoomConfig';
import { WEATHER_TYPES } from '../src/world/WeatherSystem';

describe('presentedBlend (the dusk refusal curve)', () => {
    it('is the exact identity at hardness 0', () => {
        for (let i = 0; i <= 20; i++) {
            const b = i / 20;
            expect(presentedBlend(b, 0)).toBe(b);
        }
    });

    it('is a hard step at the halfway point at hardness 1', () => {
        expect(presentedBlend(0, 1)).toBe(0);
        expect(presentedBlend(0.49, 1)).toBe(0);
        expect(presentedBlend(0.5, 1)).toBe(1);
        expect(presentedBlend(0.51, 1)).toBe(1);
        expect(presentedBlend(1, 1)).toBe(1);
    });

    it('emits ONLY 0 or 1 at hardness 1 — no gray survives', () => {
        for (let i = 0; i <= 100; i++) {
            const out = presentedBlend(i / 100, 1);
            expect(out === 0 || out === 1).toBe(true);
        }
    });

    it('mixes linearly toward the step at partial hardness', () => {
        // mix(0.25, step=0, 0.5) and mix(0.75, step=1, 0.5).
        expect(presentedBlend(0.25, 0.5)).toBeCloseTo(0.125, 10);
        expect(presentedBlend(0.75, 0.5)).toBeCloseTo(0.875, 10);
    });

    it('is monotonic in blend for any fixed hardness', () => {
        for (const h of [0, 0.3, 0.7, 1]) {
            let prev = -Infinity;
            for (let i = 0; i <= 100; i++) {
                const out = presentedBlend(i / 100, h);
                expect(out).toBeGreaterThanOrEqual(prev);
                prev = out;
            }
        }
    });

    it('clamps out-of-range inputs instead of extrapolating', () => {
        expect(presentedBlend(-0.5, 0)).toBe(0);
        expect(presentedBlend(1.5, 0)).toBe(1);
        // hardness below 0 behaves as 0; above 1 behaves as 1.
        expect(presentedBlend(0.4, -1)).toBe(0.4);
        expect(presentedBlend(0.4, 2)).toBe(0);
        expect(presentedBlend(0.6, 2)).toBe(1);
    });
});

describe('duskHardness room chain', () => {
    it('is 1 in POLARIZED — the only room that refuses dusk', () => {
        expect(ROOM_CONFIGS[RoomType.POLARIZED].shader.duskHardness).toBe(1);
    });

    it('is 0 in every other room — dusk blends everywhere else', () => {
        expect(ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader.duskHardness).toBe(0);
        expect(ROOM_CONFIGS[RoomType.FORCED_ALIGNMENT].shader.duskHardness).toBe(0);
        expect(ROOM_CONFIGS[RoomType.IN_BETWEEN].shader.duskHardness).toBe(0);
    });

    it('rides the room-transition lerp like every other scalar', () => {
        const from = ROOM_CONFIGS[RoomType.IN_BETWEEN].shader;
        const to = ROOM_CONFIGS[RoomType.POLARIZED].shader;
        expect(lerpRoomShaderConfig(from, to, 0).duskHardness).toBe(from.duskHardness);
        expect(lerpRoomShaderConfig(from, to, 1).duskHardness).toBeCloseTo(to.duskHardness, 9);
        expect(lerpRoomShaderConfig(from, to, 0.5).duskHardness)
            .toBeCloseTo((from.duskHardness + to.duskHardness) / 2, 9);
    });
});

describe('duskSnapSequencer (snap-moment flicker)', () => {
    it('passes a smooth ramp through untouched (never arms)', () => {
        const seq = new DuskSnapSequencer();
        // A real 60fps dusk moves ~delta/LEAD_SECONDS per frame — far below
        // the jump threshold; use a coarse 0.02 step to be generous.
        for (let b = 0; b <= 1.0001; b += 0.02)
            expect(seq.update(b)).toBeCloseTo(b, 10);
    });

    it('stutters old/new for FLICKER_FRAMES on a hard upward jump, then settles', () => {
        const seq = new DuskSnapSequencer();
        expect(seq.update(0)).toBe(0);
        // Snap frame + the countdown: old/new alternation on the RoomSky
        // parity (odd frames-left = old pole), settling on the new pole.
        const outputs = [seq.update(1), seq.update(1), seq.update(1), seq.update(1)];
        expect(DUSK_SNAP.FLICKER_FRAMES).toBe(3); // parity contract below assumes odd 3
        expect(outputs).toEqual([0, 1, 0, 1]);
        // Settled thereafter.
        expect(seq.update(1)).toBe(1);
    });

    it('never arms on the falling edge (the sunset collapse owns its own swap)', () => {
        const seq = new DuskSnapSequencer();
        seq.update(0);
        seq.update(1);
        seq.update(1);
        seq.update(1);
        seq.update(1); // flicker fully drained
        expect(seq.update(0)).toBe(0); // ramp collapses at sunset: clean drop
        expect(seq.update(0)).toBe(0);
    });

    it('flicker parity: odd frames-left show the old pole, even the new', () => {
        expect(duskFlickerValue(3, 0, 1)).toBe(0);
        expect(duskFlickerValue(2, 0, 1)).toBe(1);
        expect(duskFlickerValue(1, 0, 1)).toBe(0);
        expect(duskFlickerValue(0, 0, 1)).toBe(1);
    });
});

describe('dusk refusal never touches the day/night state machine', () => {
    beforeEach(() => {
        // 11/12 keeps every DayNightCycle random branch quiet (no legacy
        // solar eclipse, no forced weather) — the DayNightCycle.test.ts trick.
        vi.spyOn(Math, 'random').mockReturnValue(11 / 12);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** Minimal weather broadcast slice the eclipse depth curve reads. */
    function state(weatherType: number, eclipseProgress: number): Pick<WeatherState, 'weatherType' | 'eclipseProgress'> {
        return { weatherType, eclipseProgress };
    }

    function makeCycleContext(): { context: DayNightContext; onSunset: ReturnType<typeof vi.fn>; scene: DarkenableScene } {
        const scene = {
            background: new THREE.Color(0x888888),
            fog: { color: new THREE.Color(0x888888) },
        } as unknown as DarkenableScene;
        const onSunset = vi.fn();
        const context = {
            scene,
            shaderQuad: { material: { uniforms: { invertColors: { value: false } } } },
            audio: { playDayNightTransition: vi.fn(), playEyeBlink: vi.fn() },
            weather: { forceWeather: vi.fn() },
            onSunset,
        } as unknown as DayNightContext;
        return { context, onSunset, scene };
    }

    it('a hardness-1 snap mid-eclipse fires the sunset path exactly once', () => {
        const { context, onSunset, scene } = makeCycleContext();
        const cycle = new DayNightCycle();
        const darkening = new EclipseDarkening(scene);
        const seq = new DuskSnapSequencer();

        const STEP = 0.5;
        const presentedLog: number[] = [];
        const present = (): void => {
            presentedLog.push(seq.update(
                presentedBlend(cycle.getSunsetForeshadow(SUNSET_FORESHADOW.LEAD_SECONDS), 1),
            ));
        };

        // Walk the day to just before its 150s sunset, eclipse-free; the
        // dusk window (last 30s) is in flight, presented at full hardness.
        for (let t = 0; t < 145; t += STEP) {
            cycle.update(STEP, context);
            present();
        }

        // The eclipse transit now spans the sunset — the StatsSunsetUpdater
        // order exactly: cycle step, darkening compose, dusk presentation.
        const steps = Math.round(WEATHER_ECLIPSE.DURATION_SECONDS / STEP);
        for (let i = 1; i <= steps; i++) {
            cycle.update(STEP, context);
            darkening.apply(eclipseTransitDepth(state(WEATHER_TYPES.ECLIPSE, i / steps)));
            present();
        }
        darkening.apply(eclipseTransitDepth(state(WEATHER_TYPES.CLEAR, 0)));

        // The LOGICAL machine fired once, from its own clock alone: the
        // hard presentation snap neither caused, doubled, nor delayed it.
        expect(onSunset).toHaveBeenCalledTimes(1);
        expect(cycle.isDaytime()).toBe(false);

        // And the presentation refused every gray: only 0 or 1 was ever
        // shown, with exactly one settled day->dusk snap before the sunset
        // collapse (the flicker stutters across the snap by design).
        expect(presentedLog.every(v => v === 0 || v === 1)).toBe(true);
        expect(presentedLog[0]).toBe(0);
        expect(presentedLog[presentedLog.length - 1]).toBe(0);
        const firstOne = presentedLog.indexOf(1);
        expect(firstOne).toBeGreaterThan(0);
        // The ramp crossed 0.5 at 135s of the 150s half-cycle.
        expect(firstOne * STEP).toBeGreaterThanOrEqual(135 - 1);
    });
});
