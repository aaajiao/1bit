// The world reacts (weather batch): pure logic behind the GALE behaviors,
// the forewarn omens and the aftermath traces — wind strength mappings, the
// figure attitude ladder's omen rungs and lean/facing math, the cable/uplink
// multiplier mappings, the record-strip shear, and the aftermath trace
// scheduling draws (puddle spots, shadow jitter, seam-hold picks).

import type { WeatherState } from '../src/types';
import { describe, expect, it } from 'vitest';
import { WEATHER_REACTIONS } from '../src/config';
import { uplinkForewarnScale, uplinkPulseSpeed, windTrembleAmplitude } from '../src/world/CableSystem';
import {
    figureAttitude,
    forewarnFacingYaw,
    galeLeanPitch,
    galeLeanRoll,
} from '../src/world/FigureSystem';
import { puddleSpot } from '../src/world/RainGlyphPuddles';
import { shadowJitterOffset } from '../src/world/ShadowAftermath';
import {
    galeWindStrength,
    heldSwapCount,
    liveGaleStrength,
    pickHeldShellIndex,
    waterfallShearFor,
} from '../src/world/WeatherReactions';
import { WEATHER_TYPES } from '../src/world/WeatherSystem';

const { GALE, FOREWARN, PUDDLES, SHADOW_JITTER, SEAM_HOLD } = WEATHER_REACTIONS;

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

describe('gale wind strength (liveGaleStrength / galeWindStrength)', () => {
    it('is exactly 0 on the boot frame (null broadcast)', () => {
        expect(liveGaleStrength(null)).toBe(0);
        expect(galeWindStrength(null)).toBe(0);
    });

    it('is exactly 0 for every non-GALE live type', () => {
        for (const type of Object.values(WEATHER_TYPES)) {
            if (type === WEATHER_TYPES.GALE)
                continue;
            const s = weatherState({ weatherType: type, weatherIntensity: 0.8 });
            expect(liveGaleStrength(s)).toBe(0);
            expect(galeWindStrength(s)).toBe(0);
        }
    });

    it('tracks the live intensity (clamped) while the gale runs', () => {
        const s = weatherState({ weatherType: WEATHER_TYPES.GALE, weatherIntensity: 0.65 });
        expect(liveGaleStrength(s)).toBeCloseTo(0.65, 10);
        expect(galeWindStrength(s)).toBeCloseTo(0.65, 10);
        expect(liveGaleStrength(weatherState({ weatherType: WEATHER_TYPES.GALE, weatherIntensity: 7 }))).toBe(1);
    });

    it('carries the half-strength residual only into the GALE aftermath (environment channel)', () => {
        const tail = weatherState({ lastEndedType: WEATHER_TYPES.GALE, aftermath: 0.8 });
        expect(galeWindStrength(tail)).toBeCloseTo(GALE.AFTERMATH_RESIDUAL * 0.8, 10);
        // The figures' channel deliberately drops the residual: kin straighten.
        expect(liveGaleStrength(tail)).toBe(0);
        // Another storm's aftermath carries no wind at all.
        expect(galeWindStrength(weatherState({ lastEndedType: WEATHER_TYPES.RAIN, aftermath: 0.8 }))).toBe(0);
    });

    it('drains to exactly 0 with the aftermath window', () => {
        expect(galeWindStrength(weatherState({ lastEndedType: WEATHER_TYPES.GALE, aftermath: 0 }))).toBe(0);
    });
});

describe('gale multiplier mappings (cables / banners / strips / uplink)', () => {
    it('windTrembleAmplitude is identity at calm and scales by BANNER_AMP_GAIN at full wind', () => {
        expect(windTrembleAmplitude(0.08, 0)).toBeCloseTo(0.08, 12);
        expect(windTrembleAmplitude(0.08, 1)).toBeCloseTo(0.08 * (1 + GALE.BANNER_AMP_GAIN), 12);
        // Clamped: an over-unit wind never over-multiplies.
        expect(windTrembleAmplitude(0.08, 5)).toBeCloseTo(0.08 * (1 + GALE.BANNER_AMP_GAIN), 12);
    });

    it('uplinkForewarnScale is exactly 1 with nothing announced and 1+gain at full ramp', () => {
        expect(uplinkForewarnScale(0)).toBe(1);
        expect(uplinkForewarnScale(1)).toBeCloseTo(1 + FOREWARN.UPLINK_RATE_GAIN, 12);
        expect(uplinkForewarnScale(-2)).toBe(1);
        expect(uplinkForewarnScale(3)).toBeCloseTo(1 + FOREWARN.UPLINK_RATE_GAIN, 12);
        // The multiplier composes with the existing speed mapping: base speed
        // times scale quickens, never reshapes, the boost curve.
        expect(uplinkPulseSpeed(0.5) * uplinkForewarnScale(1))
            .toBeGreaterThan(uplinkPulseSpeed(0.5));
    });

    it('waterfallShearFor is 0 in calm and signed by the wind heading x component', () => {
        expect(waterfallShearFor(0, 1.2)).toBe(0);
        // Heading +x (sin = 1): full positive shear at full wind.
        expect(waterfallShearFor(1, Math.PI / 2)).toBeCloseTo(GALE.WATERFALL_SHEAR_MAX, 10);
        // Heading -x: mirrored sign.
        expect(waterfallShearFor(1, -Math.PI / 2)).toBeCloseTo(-GALE.WATERFALL_SHEAR_MAX, 10);
        // Half wind halves the magnitude.
        expect(waterfallShearFor(0.5, Math.PI / 2)).toBeCloseTo(GALE.WATERFALL_SHEAR_MAX / 2, 10);
    });
});

describe('figureAttitude — the omen rungs of the ONE ladder', () => {
    it('keeps the legacy behavior exactly when the omen flags default', () => {
        expect(figureAttitude(true, true, true, true)).toBe('PRESSED');
        expect(figureAttitude(false, true, true, false)).toBe('ECLIPSE_FACE_PLAYER');
        expect(figureAttitude(false, true, false, false)).toBe('ECLIPSE_LOOK_UP');
        expect(figureAttitude(false, false, false, true)).toBe('RESONANCE');
        expect(figureAttitude(false, false, false, false)).toBe('IDLE');
    });

    it('ranks press-down > eclipse > gale lean > forewarn > resonance > idle', () => {
        // Suppression wins over everything, storms included.
        expect(figureAttitude(true, false, false, false, true, true)).toBe('PRESSED');
        // The transit outranks the wind.
        expect(figureAttitude(false, true, false, false, true, true)).toBe('ECLIPSE_LOOK_UP');
        // The live storm outranks its announcement and the resonance.
        expect(figureAttitude(false, false, false, true, true, true)).toBe('GALE_LEAN');
        // The announcement outranks resonance...
        expect(figureAttitude(false, false, false, true, false, true)).toBe('FOREWARN_FACE');
        // ...and yields to nothing below it.
        expect(figureAttitude(false, false, false, false, false, true)).toBe('FOREWARN_FACE');
    });
});

describe('gale lean components (galeLeanPitch / galeLeanRoll)', () => {
    const LEAN = 0.1;

    it('braces backward (negative pitch, no roll) when the wind blows along the facing', () => {
        expect(galeLeanPitch(1.3, 1.3, LEAN)).toBeCloseTo(-LEAN, 10);
        expect(galeLeanRoll(1.3, 1.3, LEAN)).toBeCloseTo(0, 10);
    });

    it('leans forward into a head-on wind', () => {
        expect(galeLeanPitch(Math.PI, 0, LEAN)).toBeCloseTo(LEAN, 10);
        expect(galeLeanRoll(Math.PI, 0, LEAN)).toBeCloseTo(0, 10);
    });

    it('rolls (no pitch) under a crosswind, mirrored by side', () => {
        expect(galeLeanPitch(Math.PI / 2, 0, LEAN)).toBeCloseTo(0, 10);
        expect(galeLeanRoll(Math.PI / 2, 0, LEAN)).toBeCloseTo(LEAN, 10);
        expect(galeLeanRoll(-Math.PI / 2, 0, LEAN)).toBeCloseTo(-LEAN, 10);
    });

    it('preserves the tilt magnitude for every relative heading', () => {
        for (let rel = 0; rel < Math.PI * 2; rel += Math.PI / 7) {
            const p = galeLeanPitch(rel, 0, LEAN);
            const r = galeLeanRoll(rel, 0, LEAN);
            expect(Math.sqrt(p * p + r * r)).toBeCloseTo(LEAN, 10);
        }
    });

    it('is zero at zero lean (the calm rest)', () => {
        // == comparison: 0 and -0 are the same rest angle.
        expect(galeLeanPitch(0.7, 2.1, 0) === 0).toBe(true);
        expect(galeLeanRoll(0.7, 2.1, 0) === 0).toBe(true);
    });
});

describe('forewarnFacingYaw (turn toward the announced storm)', () => {
    it('keeps the resting yaw (mod 2pi) at ramp 0', () => {
        const twoPi = Math.PI * 2;
        expect(forewarnFacingYaw(1.1, 0.4, 0)).toBeCloseTo(1.1, 10);
        // A negative rest yaw comes back wrapped — the same physical angle.
        const wrapped = forewarnFacingYaw(-Math.PI / 2, 0.4, 0);
        expect(((wrapped + Math.PI / 2) % twoPi + twoPi) % twoPi).toBeCloseTo(0, 10);
    });

    it('faces square upwind (heading + pi) at full ramp', () => {
        const twoPi = Math.PI * 2;
        const yaw = forewarnFacingYaw(0.3, 1.0, 1);
        const target = (1.0 + Math.PI) % twoPi;
        expect(yaw).toBeCloseTo(target, 10);
    });

    it('turns monotonically along the shortest arc as the ramp grows', () => {
        // rest 0, storm heading 0 -> target PI; the quarter ramp turns a
        // quarter of the arc.
        expect(forewarnFacingYaw(0, 0, 0.25)).toBeCloseTo(Math.PI * 0.25, 10);
        expect(forewarnFacingYaw(0, 0, 0.5)).toBeCloseTo(Math.PI * 0.5, 10);
        // Ramp clamped.
        expect(forewarnFacingYaw(0, 0, 4)).toBeCloseTo(Math.PI, 10);
    });
});

describe('puddleSpot (INFO after RAIN — the pooled records)', () => {
    it('draws every field inside its config band', () => {
        for (let stamp = 1; stamp <= 4; stamp++) {
            for (let k = 0; k < PUDDLES.COUNT; k++) {
                const spot = puddleSpot(stamp, k, 2.4);
                expect(spot.angle).toBeGreaterThanOrEqual(0);
                expect(spot.angle).toBeLessThan(Math.PI * 2);
                expect(spot.radius).toBeGreaterThanOrEqual(PUDDLES.RADIUS_MIN);
                expect(spot.radius).toBeLessThanOrEqual(PUDDLES.RADIUS_MAX);
                expect(spot.size).toBeGreaterThanOrEqual(PUDDLES.SIZE_MIN);
                expect(spot.size).toBeLessThanOrEqual(PUDDLES.SIZE_MIN + PUDDLES.SIZE_SPAN);
                expect(spot.spin).toBeGreaterThanOrEqual(0);
                expect(spot.spin).toBeLessThan(Math.PI * 2);
            }
        }
    });

    it('is deterministic per (stamp, k, direction) and varies across stamps', () => {
        expect(puddleSpot(3, 1, 0.9)).toEqual(puddleSpot(3, 1, 0.9));
        const a = puddleSpot(1, 0, 0.9);
        const b = puddleSpot(2, 0, 0.9);
        expect(a.angle === b.angle && a.radius === b.radius).toBe(false);
    });
});

describe('shadowJitterOffset (FA after STATIC — the shivering correction)', () => {
    it('is exactly 0 once the aftermath drains (the bit-exact re-tidy)', () => {
        expect(shadowJitterOffset(120, 3, SHADOW_JITTER.SALTS.X, 0)).toBe(0);
        expect(shadowJitterOffset(120, 3, SHADOW_JITTER.SALTS.Z, -1)).toBe(0);
    });

    it('stays inside +-AMPLITUDE and scales down with the aftermath', () => {
        for (let step = 0; step < 40; step++) {
            const full = shadowJitterOffset(step, 2, SHADOW_JITTER.SALTS.X, 1);
            const half = shadowJitterOffset(step, 2, SHADOW_JITTER.SALTS.X, 0.5);
            expect(Math.abs(full)).toBeLessThanOrEqual(SHADOW_JITTER.AMPLITUDE);
            expect(half).toBeCloseTo(full / 2, 10);
        }
    });

    it('is deterministic per (step, k) and re-draws across steps', () => {
        expect(shadowJitterOffset(7, 1, SHADOW_JITTER.SALTS.X, 1))
            .toBe(shadowJitterOffset(7, 1, SHADOW_JITTER.SALTS.X, 1));
        const draws = new Set<number>();
        for (let step = 0; step < 16; step++)
            draws.add(shadowJitterOffset(step, 1, SHADOW_JITTER.SALTS.X, 1));
        expect(draws.size).toBeGreaterThan(8); // stepped, not frozen
    });
});

describe('seam-hold selection (POLARIZED after GLITCH)', () => {
    it('holds a count inside [COUNT_MIN, COUNT_MAX], deterministic per heading', () => {
        for (let i = 0; i < 24; i++) {
            const dir = (i / 24) * Math.PI * 2;
            const count = heldSwapCount(dir);
            expect(count).toBeGreaterThanOrEqual(SEAM_HOLD.COUNT_MIN);
            expect(count).toBeLessThanOrEqual(SEAM_HOLD.COUNT_MAX);
            expect(heldSwapCount(dir)).toBe(count);
        }
    });

    it('draws both hold counts somewhere across headings (the band is live)', () => {
        const counts = new Set<number>();
        for (let i = 0; i < 64; i++)
            counts.add(heldSwapCount((i / 64) * Math.PI * 2));
        expect(counts.has(SEAM_HOLD.COUNT_MIN)).toBe(true);
        expect(counts.has(SEAM_HOLD.COUNT_MAX)).toBe(true);
    });

    it('picks in-bounds candidate indices, deterministic per (n, heading)', () => {
        expect(pickHeldShellIndex(0, 0, 1)).toBe(-1);
        for (let n = 0; n < 4; n++) {
            for (const size of [1, 2, 7, 23]) {
                const idx = pickHeldShellIndex(n, size, 2.1);
                expect(idx).toBeGreaterThanOrEqual(0);
                expect(idx).toBeLessThan(size);
                expect(pickHeldShellIndex(n, size, 2.1)).toBe(idx);
            }
        }
    });
});
