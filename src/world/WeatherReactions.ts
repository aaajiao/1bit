// 1-bit Chimera Void - Weather Reactions (pure layer)
//
// The world reacts: weather is FELT because everything else responds. This
// file is the PURE mapping layer between the WeatherState broadcast and the
// behavioral consumers — how hard the gale blows (live intensity plus the
// half-strength aftermath residual), how the wind heading becomes a world
// vector, how the forewarn ramp quickens the uplink, and which near-seam
// buildings a GLITCH rupture leaves stuck in the other faction's language.
// black = the system, white = the self, dither = the friction between them;
// a storm is the system raising its voice, and these mappings are the world
// flinching. No THREE types, no side effects — everything here unit-tests in
// isolation (tests/WeatherReactions.test.ts). The per-frame distribution of
// these values lives in core/WeatherReactionsUpdater.
import type { WeatherState } from '../types';
import { WEATHER_REACTIONS } from '../config';
import { hash } from '../utils/hash';
import { WEATHER_TYPES } from './WeatherSystem';

/**
 * Live gale strength in [0,1]: the current intensity while a GALE runs,
 * exactly 0 otherwise (no residual). The FIGURES' lean consumes this one —
 * kin straighten when the storm ends; only the environment keeps ringing.
 * Null state (boot frame) reads as calm. Pure.
 */
export function liveGaleStrength(state: WeatherState | null): number {
    if (state === null || state.weatherType !== WEATHER_TYPES.GALE)
        return 0;
    return Math.max(0, Math.min(1, state.weatherIntensity));
}

/**
 * Environmental gale wind in [0,1]: the live intensity while the GALE runs,
 * then a half-strength residual tail (GALE.AFTERMATH_RESIDUAL x aftermath)
 * while the gale's aftermath decays — the wires keep swinging after the
 * shove. The tail re-arrives hard at the boundary (the 1-bit language: a
 * last gust, not a fade) and drains to exactly 0 with the window. Consumed
 * by cables, banners and the INFO record strips. Pure.
 */
export function galeWindStrength(state: WeatherState | null): number {
    const live = liveGaleStrength(state);
    if (live > 0)
        return live;
    if (state !== null && state.lastEndedType === WEATHER_TYPES.GALE && state.aftermath > 0)
        return WEATHER_REACTIONS.GALE.AFTERMATH_RESIDUAL * Math.min(1, state.aftermath);
    return 0;
}

/**
 * Signed sideways shear for the INFO record strips at a given wind: the
 * wind heading's x component (the same (sin, cos) azimuth convention as the
 * precipitation layer) times GALE.WATERFALL_SHEAR_MAX times strength. One
 * number for ONE shared uniform: strips on mirrored facades shear mirrored,
 * which still reads as one wind. Exactly 0 in calm. Pure.
 */
export function waterfallShearFor(windStrength: number, directionRad: number): number {
    const w = Math.max(0, Math.min(1, windStrength));
    if (w <= 0)
        return 0;
    return Math.sin(directionRad) * WEATHER_REACTIONS.GALE.WATERFALL_SHEAR_MAX * w;
}

/**
 * How many near-seam buildings a GLITCH rupture leaves held in the other
 * faction's language: hash-drawn in [COUNT_MIN, COUNT_MAX], seeded by the
 * event's own heading so the draw is deterministic per event. Pure.
 */
export function heldSwapCount(directionRad: number): number {
    const { COUNT_MIN, COUNT_MAX, SALTS } = WEATHER_REACTIONS.SEAM_HOLD;
    const span = COUNT_MAX - COUNT_MIN + 1;
    const draw = Math.floor(hash(SALTS.COUNT, directionRad * 512) * span);
    return COUNT_MIN + Math.min(span - 1, draw);
}

/**
 * Deterministic candidate pick n for the seam hold among `candidateCount`
 * stably-ordered candidates (the pickRebelIndex shape). Returns -1 when
 * there is no candidate; the caller resolves collisions between picks by
 * stepping to the next free slot. Pure.
 */
export function pickHeldShellIndex(n: number, candidateCount: number, directionRad: number): number {
    if (candidateCount <= 0)
        return -1;
    const draw = hash(n * 31 + WEATHER_REACTIONS.SEAM_HOLD.SALTS.PICK, directionRad * 512);
    return Math.min(candidateCount - 1, Math.floor(draw * candidateCount));
}
