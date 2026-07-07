// World-space precipitation (weather batch): pure logic behind the falling
// layer and the ash-trace ground pool — the WeatherState -> drive mapping
// (mode / active fraction / fall speed / wind), the wind-tilt math the vertex
// shader realizes, the accumulator wrap, the baked per-instance attributes,
// and the ash pool's scheduling draws (spawn cadence, cap, recycle, keep-out,
// dissolve timing).

import type { WeatherState } from '../src/types';
import { describe, expect, it } from 'vitest';
import { PRECIPITATION } from '../src/config';
import { hash } from '../src/utils/hash';
import {
    ashDissolveLevel,
    AshTraceScheduler,
    traceAngle,
    traceBlockedByCrack,
    traceRadius,
    traceSize,
    traceSlot,
} from '../src/world/AshTraces';
import {
    bakeCellAttribute,
    computePrecipitationDrive,
    createPrecipitationDrive,
    dashTiltRadians,
    PRECIP_MODE,
    wrapAccum,
} from '../src/world/Precipitation';
import { riftLineXForWorldX, RoomType } from '../src/world/RoomConfig';
import { WEATHER_TYPES } from '../src/world/WeatherSystem';

const { RAIN, ASH, GALE_WIND, FOREWARN_FRACTION_MAX, TRACES } = PRECIPITATION;

/** A CLEAR WeatherState with overridable fields (the broadcast shape). */
function weatherState(overrides: Partial<WeatherState> = {}): WeatherState {
    return {
        weatherType: WEATHER_TYPES.CLEAR,
        weatherIntensity: 0,
        weatherTime: 0,
        weatherOnset: 0,
        weatherIsEvent: 0,
        forewarn: 0,
        upcomingType: WEATHER_TYPES.CLEAR,
        eventDirection: 0,
        aftermath: 0,
        lastEndedType: WEATHER_TYPES.CLEAR,
        eclipseProgress: 0,
        ...overrides,
    };
}

/** Fresh drive fed through computePrecipitationDrive (density defaults to 1). */
function drive(state: WeatherState, rainDensity = 1) {
    return computePrecipitationDrive(state, rainDensity, createPrecipitationDrive());
}

describe('computePrecipitationDrive (WeatherState -> falling layer)', () => {
    it('rests OFF with zero fraction and zero wind on plain CLEAR', () => {
        const d = drive(weatherState());
        expect(d.mode).toBe(PRECIP_MODE.OFF);
        expect(d.fraction).toBe(0);
        expect(d.windX).toBe(0);
        expect(d.windZ).toBe(0);
        // The velocity carrier never degenerates even when nothing falls.
        expect(d.fallSpeed).toBeGreaterThan(0);
    });

    it('stays OFF for STATIC, GLITCH and ECLIPSE (screen/world layers own them)', () => {
        for (const type of [WEATHER_TYPES.STATIC, WEATHER_TYPES.GLITCH, WEATHER_TYPES.ECLIPSE]) {
            const d = drive(weatherState({ weatherType: type, weatherIntensity: 1 }));
            expect(d.mode).toBe(PRECIP_MODE.OFF);
            expect(d.fraction).toBe(0);
        }
    });

    it('maps RAIN fraction and speed from intensity exactly', () => {
        const lo = drive(weatherState({ weatherType: WEATHER_TYPES.RAIN, weatherIntensity: 0 }));
        const hi = drive(weatherState({ weatherType: WEATHER_TYPES.RAIN, weatherIntensity: 1 }));
        expect(lo.mode).toBe(PRECIP_MODE.RAIN);
        expect(lo.fraction).toBeCloseTo(RAIN.FRACTION_BASE, 10);
        expect(hi.fraction).toBeCloseTo(RAIN.FRACTION_BASE + RAIN.FRACTION_SPAN, 10);
        expect(lo.fallSpeed).toBeCloseTo(RAIN.SPEED_BASE, 10);
        expect(hi.fallSpeed).toBeCloseTo(RAIN.SPEED_BASE + RAIN.SPEED_SPAN, 10);
        expect(hi.width).toBe(RAIN.WIDTH);
        expect(hi.length).toBe(RAIN.LENGTH);
    });

    it('multiplies RAIN fraction by the room rain flavor and only leans the speed', () => {
        const state = weatherState({ weatherType: WEATHER_TYPES.RAIN, weatherIntensity: 0.5 });
        const base = drive(state, 1);
        const downpour = drive(state, 2.5);
        const dry = drive(state, 0);
        // POLARIZED's 0 density: rain exists but nothing falls here.
        expect(dry.fraction).toBe(0);
        // INFO_OVERFLOW's 2.5: denser (clamped to 1) and only slightly faster.
        expect(downpour.fraction).toBe(Math.min(1, base.fraction * 2.5));
        expect(downpour.fallSpeed).toBeCloseTo(
            base.fallSpeed * (1 + 1.5 * RAIN.DENSITY_SPEED_LEAN),
            10,
        );
        expect(downpour.fallSpeed).toBeLessThan(base.fallSpeed * 2.5);
    });

    it('clamps the RAIN fraction to 1 at full downpour', () => {
        const d = drive(weatherState({ weatherType: WEATHER_TYPES.RAIN, weatherIntensity: 1 }), 2.5);
        expect(d.fraction).toBe(1);
    });

    it('decomposes the event heading into wind (RoomSky azimuth convention)', () => {
        // Heading 0 = +z; pi/2 = +x. Wind magnitude scales with intensity.
        const north = drive(weatherState({
            weatherType: WEATHER_TYPES.RAIN,
            weatherIntensity: 1,
            eventDirection: 0,
        }));
        expect(north.windX).toBeCloseTo(0, 10);
        expect(north.windZ).toBeCloseTo(RAIN.WIND, 10);
        const east = drive(weatherState({
            weatherType: WEATHER_TYPES.RAIN,
            weatherIntensity: 0.5,
            eventDirection: Math.PI / 2,
        }));
        expect(east.windX).toBeCloseTo(RAIN.WIND * 0.5, 10);
        expect(east.windZ).toBeCloseTo(0, 10);
    });

    it('maps ASHFALL to sparse slow motes with the ash footprint', () => {
        const d = drive(weatherState({ weatherType: WEATHER_TYPES.ASHFALL, weatherIntensity: 1 }));
        expect(d.mode).toBe(PRECIP_MODE.ASH);
        expect(d.fraction).toBeCloseTo(ASH.FRACTION_BASE + ASH.FRACTION_SPAN, 10);
        expect(d.fallSpeed).toBeCloseTo(ASH.SPEED_BASE + ASH.SPEED_SPAN, 10);
        expect(d.width).toBe(ASH.WIDTH);
        expect(d.length).toBe(ASH.LENGTH);
        // Sparser and slower than rain at the same intensity — settling noise.
        const rain = drive(weatherState({ weatherType: WEATHER_TYPES.RAIN, weatherIntensity: 1 }));
        expect(d.fraction).toBeLessThan(rain.fraction);
        expect(d.fallSpeed).toBeLessThan(rain.fallSpeed);
    });

    it('ignores the room rain flavor for ASHFALL', () => {
        const state = weatherState({ weatherType: WEATHER_TYPES.ASHFALL, weatherIntensity: 0.7 });
        expect(drive(state, 0).fraction).toBe(drive(state, 2.5).fraction);
    });

    it('gives GALE no particles of its own — pure exported wind', () => {
        const d = drive(weatherState({
            weatherType: WEATHER_TYPES.GALE,
            weatherIntensity: 1,
            eventDirection: Math.PI / 2,
        }));
        expect(d.mode).toBe(PRECIP_MODE.OFF);
        expect(d.fraction).toBe(0);
        expect(d.windX).toBeCloseTo(GALE_WIND, 10);
        expect(d.windZ).toBeCloseTo(0, 10);
    });

    it('shows a thin advance guard scaling with the forewarn ramp (RAIN)', () => {
        const half = drive(weatherState({
            forewarn: 0.5,
            upcomingType: WEATHER_TYPES.RAIN,
        }));
        expect(half.mode).toBe(PRECIP_MODE.RAIN);
        expect(half.fraction).toBeCloseTo(FOREWARN_FRACTION_MAX * 0.5, 10);
        const full = drive(weatherState({
            forewarn: 1,
            upcomingType: WEATHER_TYPES.RAIN,
        }));
        expect(full.fraction).toBeCloseTo(FOREWARN_FRACTION_MAX, 10);
        // The advance guard respects the room flavor too.
        expect(drive(weatherState({ forewarn: 1, upcomingType: WEATHER_TYPES.RAIN }), 0).fraction).toBe(0);
    });

    it('shows an ash advance guard with the ash footprint', () => {
        const d = drive(weatherState({
            forewarn: 1,
            upcomingType: WEATHER_TYPES.ASHFALL,
        }));
        expect(d.mode).toBe(PRECIP_MODE.ASH);
        expect(d.fraction).toBeCloseTo(FOREWARN_FRACTION_MAX, 10);
        expect(d.width).toBe(ASH.WIDTH);
        expect(d.fallSpeed).toBe(ASH.SPEED_BASE);
    });

    it('shows NO advance guard for non-falling upcoming types', () => {
        for (const type of [WEATHER_TYPES.STATIC, WEATHER_TYPES.GLITCH, WEATHER_TYPES.GALE]) {
            const d = drive(weatherState({ forewarn: 1, upcomingType: type }));
            expect(d.mode).toBe(PRECIP_MODE.OFF);
            expect(d.fraction).toBe(0);
        }
    });

    it('overwrites the reused drive object in full (allocation-free contract)', () => {
        const out = createPrecipitationDrive();
        computePrecipitationDrive(
            weatherState({ weatherType: WEATHER_TYPES.ASHFALL, weatherIntensity: 1, eventDirection: 1 }),
            1,
            out,
        );
        const returned = computePrecipitationDrive(weatherState(), 1, out);
        expect(returned).toBe(out);
        // Every ash-flavored field snapped back to the rest state.
        expect(out.mode).toBe(PRECIP_MODE.OFF);
        expect(out.fraction).toBe(0);
        expect(out.windX).toBe(0);
        expect(out.windZ).toBe(0);
        expect(out.width).toBe(RAIN.WIDTH);
        expect(out.length).toBe(RAIN.LENGTH);
        expect(out.fallSpeed).toBe(RAIN.SPEED_BASE);
    });
});

describe('dashTiltRadians (wind-tilt math the vertex shader realizes)', () => {
    it('is exactly 0 with no wind', () => {
        const d = drive(weatherState({ weatherType: WEATHER_TYPES.RAIN, weatherIntensity: 1, eventDirection: 0 }));
        d.windX = 0;
        d.windZ = 0;
        expect(dashTiltRadians(d)).toBe(0);
    });

    it('is 45 degrees when wind magnitude equals fall speed', () => {
        const d = createPrecipitationDrive();
        d.fallSpeed = 10;
        d.windX = 6;
        d.windZ = 8; // hypot = 10
        expect(dashTiltRadians(d)).toBeCloseTo(Math.PI / 4, 10);
    });

    it('grows monotonically with wind and shrinks with fall speed', () => {
        const d = createPrecipitationDrive();
        d.fallSpeed = 10;
        d.windX = 2;
        const gentle = dashTiltRadians(d);
        d.windX = 8;
        const shoved = dashTiltRadians(d);
        expect(shoved).toBeGreaterThan(gentle);
        d.fallSpeed = 20;
        expect(dashTiltRadians(d)).toBeLessThan(shoved);
    });
});

describe('wrapAccum (bounded accumulator)', () => {
    it('passes values inside the span through unchanged', () => {
        expect(wrapAccum(3.5, 10)).toBe(3.5);
        expect(wrapAccum(0, 10)).toBe(0);
    });

    it('wraps values at and above the span into [0, span)', () => {
        expect(wrapAccum(10, 10)).toBe(0);
        expect(wrapAccum(23.5, 10)).toBeCloseTo(3.5, 10);
    });

    it('wraps negative values into [0, span) (wind can blow backwards)', () => {
        expect(wrapAccum(-2.5, 10)).toBeCloseTo(7.5, 10);
    });
});

describe('bakeCellAttribute (per-instance bake)', () => {
    it('bakes count*4 floats, all in [0, 1)', () => {
        const arr = bakeCellAttribute(64);
        expect(arr.length).toBe(256);
        for (const v of arr) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('is deterministic and matches the salted hash streams', () => {
        const a = bakeCellAttribute(8);
        const b = bakeCellAttribute(8);
        expect(a).toEqual(b);
        const { CELL_X, CELL_Z, SEED, PHASE } = PRECIPITATION.SALTS;
        // The bake lands in a Float32Array: compare at float32 precision.
        expect(a[4]).toBe(Math.fround(hash(1, CELL_X)));
        expect(a[5]).toBe(Math.fround(hash(1, CELL_Z)));
        expect(a[6]).toBe(Math.fround(hash(1, SEED)));
        expect(a[7]).toBe(Math.fround(hash(1, PHASE)));
    });
});

describe('ashDissolveLevel (dissolve timing from the broadcast)', () => {
    it('is 1 while an ASHFALL event is live', () => {
        expect(ashDissolveLevel(weatherState({ weatherType: WEATHER_TYPES.ASHFALL }))).toBe(1);
    });

    it('tracks the aftermath decay after an ashfall ends', () => {
        const s = weatherState({ lastEndedType: WEATHER_TYPES.ASHFALL, aftermath: 0.4 });
        expect(ashDissolveLevel(s)).toBe(0.4);
        expect(ashDissolveLevel(weatherState({ lastEndedType: WEATHER_TYPES.ASHFALL, aftermath: 0 }))).toBe(0);
    });

    it('survives a transient glitch firing during the ashfall aftermath', () => {
        const s = weatherState({
            weatherType: WEATHER_TYPES.GLITCH,
            lastEndedType: WEATHER_TYPES.ASHFALL,
            aftermath: 0.6,
        });
        expect(ashDissolveLevel(s)).toBe(0.6);
    });

    it('ignores other events\' aftermaths (rain leaves no ash)', () => {
        const s = weatherState({ lastEndedType: WEATHER_TYPES.RAIN, aftermath: 0.9 });
        expect(ashDissolveLevel(s)).toBe(0);
    });
});

describe('ashTraceScheduler (spawn cadence)', () => {
    it('spawns nothing and clears its accumulator while inactive', () => {
        const s = new AshTraceScheduler();
        // Bank almost a whole spawn, then go inactive: the bank is wiped.
        s.update(0.9 / TRACES.RATE_MAX, 1, true);
        expect(s.update(1, 1, false)).toBe(0);
        expect(s.update(0.2 / TRACES.RATE_MAX, 1, true)).toBe(0);
    });

    it('accumulates RATE_MAX spawns per second at full intensity', () => {
        const s = new AshTraceScheduler();
        // 1/64 keeps every product binary-exact — no float drift in the sum.
        const dt = 1 / 64;
        let total = 0;
        for (let i = 0; i < 640; i++)
            total += s.update(dt, 1, true);
        // 10 simulated seconds at full rate.
        expect(total).toBe(Math.floor(TRACES.RATE_MAX * 10));
    });

    it('scales the cadence with intensity and spawns nothing at zero', () => {
        const half = new AshTraceScheduler();
        let total = 0;
        for (let i = 0; i < 640; i++)
            total += half.update(1 / 64, 0.5, true);
        expect(total).toBe(Math.floor(TRACES.RATE_MAX * 5));
        const idle = new AshTraceScheduler();
        for (let i = 0; i < 640; i++)
            expect(idle.update(1 / 64, 0, true)).toBe(0);
    });

    it('caps a pathological delta at MAX_PER_FRAME and clamps the carry-over', () => {
        const s = new AshTraceScheduler();
        // A giant hitch banks far more than one frame's worth...
        expect(s.update(100, 1, true)).toBe(TRACES.MAX_PER_FRAME);
        // ...but the carry-over is clamped: the drained bank pays out at most
        // MAX_PER_FRAME once more, then the burst is spent — never unbounded.
        expect(s.update(0, 1, true)).toBe(TRACES.MAX_PER_FRAME);
        expect(s.update(0, 1, true)).toBe(0);
    });
});

describe('trace placement draws (deterministic, bounded)', () => {
    it('recycles ring slots modulo the cap', () => {
        expect(traceSlot(0, TRACES.CAP)).toBe(0);
        expect(traceSlot(TRACES.CAP - 1, TRACES.CAP)).toBe(TRACES.CAP - 1);
        expect(traceSlot(TRACES.CAP, TRACES.CAP)).toBe(0);
        expect(traceSlot(TRACES.CAP * 3 + 5, TRACES.CAP)).toBe(5);
    });

    it('draws deterministic angles in [0, 2*pi)', () => {
        for (let n = 1; n <= 32; n++) {
            const a = traceAngle(n);
            expect(a).toBe(traceAngle(n));
            expect(a).toBeGreaterThanOrEqual(0);
            expect(a).toBeLessThan(Math.PI * 2);
        }
    });

    it('draws radii inside the placement ring', () => {
        for (let n = 1; n <= 32; n++) {
            const r = traceRadius(n);
            expect(r).toBeGreaterThanOrEqual(TRACES.RADIUS_MIN);
            expect(r).toBeLessThanOrEqual(TRACES.RADIUS);
        }
    });

    it('draws speck sizes inside the configured span', () => {
        for (let n = 1; n <= 32; n++) {
            const s = traceSize(n);
            expect(s).toBeGreaterThanOrEqual(TRACES.SIZE_MIN);
            expect(s).toBeLessThanOrEqual(TRACES.SIZE_MIN + TRACES.SIZE_SPAN);
        }
    });
});

describe('traceBlockedByCrack (FA rift keep-out)', () => {
    it('never blocks outside FORCED_ALIGNMENT', () => {
        for (const room of [RoomType.INFO_OVERFLOW, RoomType.IN_BETWEEN, RoomType.POLARIZED]) {
            const crack = riftLineXForWorldX(100);
            expect(traceBlockedByCrack(crack, room)).toBe(false);
        }
    });

    it('blocks inside the keep-out band around the rift line and not beyond', () => {
        const x = 100;
        const crack = riftLineXForWorldX(x);
        expect(traceBlockedByCrack(crack, RoomType.FORCED_ALIGNMENT)).toBe(true);
        expect(traceBlockedByCrack(crack + TRACES.CRACK_KEEPOUT * 0.5, RoomType.FORCED_ALIGNMENT)).toBe(true);
        // Just outside the band (still inside the same cluster's column).
        const outside = crack + TRACES.CRACK_KEEPOUT + 0.01;
        expect(Math.abs(outside - riftLineXForWorldX(outside)) >= TRACES.CRACK_KEEPOUT).toBe(true);
        expect(traceBlockedByCrack(outside, RoomType.FORCED_ALIGNMENT)).toBe(false);
    });
});
