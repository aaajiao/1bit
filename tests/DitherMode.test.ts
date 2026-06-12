import { describe, expect, it } from 'vitest';
import {
    cloneRoomShaderConfig,
    DITHER_MODE,
    dominantDitherMode,
    lerpRoomShaderConfig,
    ROOM_CONFIGS,
    RoomType,
} from '../src/world/RoomConfig';
import { RoomTransition } from '../src/world/RoomTransition';

/**
 * F5 "每房间抖动图案" — per-room dither pattern identity + the categorical
 * crossfade rules: pattern ids are NEVER numerically lerped; transitions
 * blend the two patterns' OUTPUTS via the (from, to, blend) triple.
 */
describe('dITHER_MODE table', () => {
    it('has four distinct integer ids', () => {
        const ids = Object.values(DITHER_MODE);
        expect(ids.length).toBe(4);
        expect(new Set(ids).size).toBe(4);
        for (const id of ids) {
            expect(Number.isInteger(id)).toBe(true);
            expect(id).toBeGreaterThanOrEqual(0);
            expect(id).toBeLessThanOrEqual(3);
        }
    });

    it('bAYER is 0 — the inert default of materials that predate the uniform', () => {
        expect(DITHER_MODE.BAYER).toBe(0);
    });
});

describe('per-room pattern identity', () => {
    it('assigns each room its documented pattern', () => {
        expect(ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader.ditherMode).toBe(DITHER_MODE.BLUE_NOISE);
        expect(ROOM_CONFIGS[RoomType.IN_BETWEEN].shader.ditherMode).toBe(DITHER_MODE.DUAL_CONFLICT);
        expect(ROOM_CONFIGS[RoomType.FORCED_ALIGNMENT].shader.ditherMode).toBe(DITHER_MODE.MIRROR_BAYER);
        expect(ROOM_CONFIGS[RoomType.POLARIZED].shader.ditherMode).toBe(DITHER_MODE.BAYER);
    });

    it('every static room config carries the settled identity triple', () => {
        for (const room of Object.values(RoomType)) {
            const shader = ROOM_CONFIGS[room].shader;
            expect(shader.ditherModeFrom).toBe(shader.ditherMode);
            expect(shader.ditherModeBlend).toBe(1);
            const valid = new Set<number>(Object.values(DITHER_MODE));
            expect(valid.has(shader.ditherMode)).toBe(true);
        }
    });

    it('pOLARIZED stays pure: zero dithering means the pattern is moot', () => {
        const shader = ROOM_CONFIGS[RoomType.POLARIZED].shader;
        // The hard-threshold branch (uNoiseDensity < 0.01) never samples a
        // pattern, so every dithering perturbation must read 0 here.
        expect(shader.uNoiseDensity).toBe(0);
        expect(shader.uTemporalJitter).toBe(0);
        expect(shader.uScanIntensity).toBe(0);
        expect(shader.uMisregister).toBe(0);
        expect(shader.uGlitchAmount).toBe(0);
    });
});

describe('dominantDitherMode', () => {
    const base = ROOM_CONFIGS[RoomType.POLARIZED].shader;

    it('returns the to-side at blend >= 0.5 and the from-side below', () => {
        const mid = {
            ...cloneRoomShaderConfig(base),
            ditherMode: DITHER_MODE.BLUE_NOISE,
            ditherModeFrom: DITHER_MODE.MIRROR_BAYER,
        };
        expect(dominantDitherMode({ ...mid, ditherModeBlend: 0.5 })).toBe(DITHER_MODE.BLUE_NOISE);
        expect(dominantDitherMode({ ...mid, ditherModeBlend: 1 })).toBe(DITHER_MODE.BLUE_NOISE);
        expect(dominantDitherMode({ ...mid, ditherModeBlend: 0.49 })).toBe(DITHER_MODE.MIRROR_BAYER);
        expect(dominantDitherMode({ ...mid, ditherModeBlend: 0 })).toBe(DITHER_MODE.MIRROR_BAYER);
    });
});

describe('lerpRoomShaderConfig — categorical pattern crossfade', () => {
    const from = ROOM_CONFIGS[RoomType.IN_BETWEEN].shader; // DUAL_CONFLICT
    const to = ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader; // BLUE_NOISE

    it('mid-blend: crossfades from the from-side pattern toward the target pattern', () => {
        const r = lerpRoomShaderConfig(from, to, 0.3);
        expect(r.ditherModeFrom).toBe(DITHER_MODE.DUAL_CONFLICT);
        expect(r.ditherMode).toBe(DITHER_MODE.BLUE_NOISE);
        expect(r.ditherModeBlend).toBeCloseTo(0.3, 9);
    });

    it('never interpolates the ids themselves', () => {
        for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
            const r = lerpRoomShaderConfig(from, to, t);
            const valid = new Set<number>(Object.values(DITHER_MODE));
            expect(valid.has(r.ditherMode)).toBe(true);
            expect(valid.has(r.ditherModeFrom)).toBe(true);
            expect(Number.isInteger(r.ditherMode)).toBe(true);
            expect(Number.isInteger(r.ditherModeFrom)).toBe(true);
        }
    });

    it('passes the endpoint triples through identically at t<=0 / t>=1', () => {
        expect(lerpRoomShaderConfig(from, to, 0)).toEqual(from);
        const atOne = lerpRoomShaderConfig(from, to, 1);
        expect(atOne.ditherMode).toBe(to.ditherMode);
        expect(atOne.ditherModeFrom).toBe(to.ditherModeFrom);
        expect(atOne.ditherModeBlend).toBe(to.ditherModeBlend);
        expect(lerpRoomShaderConfig(from, to, -2)).toEqual(from);
        const clamped = lerpRoomShaderConfig(from, to, 5);
        expect(clamped.ditherMode).toBe(to.ditherMode);
        expect(clamped.ditherModeBlend).toBe(1);
    });

    it('collapses a frozen mid-blend from-snapshot to its dominant pattern', () => {
        const target = ROOM_CONFIGS[RoomType.FORCED_ALIGNMENT].shader; // MIRROR_BAYER
        // Snapshot frozen early in a DUAL_CONFLICT -> BLUE_NOISE transition:
        // dominant side is still the old DUAL_CONFLICT.
        const early = lerpRoomShaderConfig(from, to, 0.3);
        expect(lerpRoomShaderConfig(early, target, 0.5).ditherModeFrom).toBe(DITHER_MODE.DUAL_CONFLICT);
        // Snapshot frozen late: the incoming BLUE_NOISE already dominates.
        const late = lerpRoomShaderConfig(from, to, 0.7);
        expect(lerpRoomShaderConfig(late, target, 0.5).ditherModeFrom).toBe(DITHER_MODE.BLUE_NOISE);
    });

    it('cloneRoomShaderConfig preserves the triple', () => {
        const mid = lerpRoomShaderConfig(from, to, 0.4);
        const clone = cloneRoomShaderConfig(mid);
        expect(clone.ditherMode).toBe(mid.ditherMode);
        expect(clone.ditherModeFrom).toBe(mid.ditherModeFrom);
        expect(clone.ditherModeBlend).toBe(mid.ditherModeBlend);
    });
});

describe('roomTransition carries the pattern crossfade end to end', () => {
    const SPEED = 2; // 0.5s transitions

    it('starts settled on the initial room pattern', () => {
        const rt = new RoomTransition(RoomType.IN_BETWEEN, SPEED);
        const out = rt.update(1 / 60, 0.5, 0);
        expect(out.ditherMode).toBe(DITHER_MODE.DUAL_CONFLICT);
        expect(out.ditherModeFrom).toBe(DITHER_MODE.DUAL_CONFLICT);
        expect(out.ditherModeBlend).toBe(1);
    });

    it('ramps the output blend with the transition progress', () => {
        const rt = new RoomTransition(RoomType.IN_BETWEEN, SPEED);
        rt.update(1 / 60, 0.5, 0);
        rt.beginTransition(RoomType.INFO_OVERFLOW);
        const mid = rt.update(0.25, 0.5, 0); // progress 0.5
        expect(mid.ditherModeFrom).toBe(DITHER_MODE.DUAL_CONFLICT);
        expect(mid.ditherMode).toBe(DITHER_MODE.BLUE_NOISE);
        expect(mid.ditherModeBlend).toBeCloseTo(0.5, 9);
    });

    it('settles on the new room identity triple after the transition', () => {
        const rt = new RoomTransition(RoomType.IN_BETWEEN, SPEED);
        rt.beginTransition(RoomType.INFO_OVERFLOW);
        const out = rt.update(0.6, 0.5, 0); // progress 1.2 -> settled
        expect(out.ditherMode).toBe(DITHER_MODE.BLUE_NOISE);
        expect(out.ditherModeFrom).toBe(DITHER_MODE.BLUE_NOISE);
        expect(out.ditherModeBlend).toBe(1);
    });
});
