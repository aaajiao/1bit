import { describe, expect, it } from 'vitest';
import {
    faSideNoiseDensity,
    infoOverflowJitterForIntensity,
    noiseDensityForIntensity,
    ROOM_CONFIGS,
    RoomType,
} from '../src/world/RoomConfig';
import { RoomTransition } from '../src/world/RoomTransition';

/**
 * Flow-audit C1 #1 — freeze-from transition semantics:
 * - mid-transition retreats/redirects freeze the CURRENT on-screen config as
 *   the from-snapshot (no single-frame pop back toward a static baseline);
 * - the reactive per-room deltas (INFO_OVERFLOW flower noise/jitter,
 *   FORCED_ALIGNMENT side asymmetry) are baked into the blend output, so they
 *   are frozen on exit and eased in on entry instead of popping.
 */
const SPEED = 2; // 0.5s transitions, independent of the config default

describe('roomTransition (freeze-from shader blend)', () => {
    it('starts settled on the initial room static config', () => {
        const rt = new RoomTransition(RoomType.IN_BETWEEN, SPEED);
        expect(rt.isInTransition()).toBe(false);
        expect(rt.getTargetRoom()).toBe(RoomType.IN_BETWEEN);
        expect(rt.getConfig()).toEqual(ROOM_CONFIGS[RoomType.IN_BETWEEN].shader);
    });

    it('settles exactly on a non-reactive room config after the transition time', () => {
        const rt = new RoomTransition(RoomType.IN_BETWEEN, SPEED);
        rt.beginTransition(RoomType.POLARIZED);
        expect(rt.isInTransition()).toBe(true);
        rt.update(0.6, 0, 0); // 0.6 * SPEED = 1.2 >= 1 -> settled
        expect(rt.isInTransition()).toBe(false);
        expect(rt.getConfig()).toEqual(ROOM_CONFIGS[RoomType.POLARIZED].shader);
    });

    it('blends at the documented midpoint halfway through', () => {
        const rt = new RoomTransition(RoomType.IN_BETWEEN, SPEED);
        rt.beginTransition(RoomType.POLARIZED);
        const out = rt.update(0.25, 0, 0); // progress 0.5
        const from = ROOM_CONFIGS[RoomType.IN_BETWEEN].shader;
        const to = ROOM_CONFIGS[RoomType.POLARIZED].shader;
        expect(out.uNoiseDensity).toBeCloseTo((from.uNoiseDensity + to.uNoiseDensity) / 2, 9);
        expect(out.uContrast).toBeCloseTo((from.uContrast + to.uContrast) / 2, 9);
        expect(out.inkColor[0]).toBeCloseTo((from.inkColor[0] + to.inkColor[0]) / 2, 9);
        expect(out.paperColor[2]).toBeCloseTo((from.paperColor[2] + to.paperColor[2]) / 2, 9);
    });

    it('tracks the live reactive INFO_OVERFLOW target at steady state', () => {
        const rt = new RoomTransition(RoomType.INFO_OVERFLOW, SPEED);
        const dim = rt.update(0.016, 0.1, 0);
        expect(dim.uNoiseDensity).toBeCloseTo(noiseDensityForIntensity(0.1), 9);
        expect(dim.uTemporalJitter).toBeCloseTo(infoOverflowJitterForIntensity(0.1), 9);
        // The flower brightens; steady state follows the reactive target exactly.
        const bright = rt.update(0.016, 1, 0);
        expect(bright.uNoiseDensity).toBeCloseTo(noiseDensityForIntensity(1), 9);
        expect(bright.uTemporalJitter).toBeCloseTo(infoOverflowJitterForIntensity(1), 9);
        expect(rt.isInTransition()).toBe(false);
    });

    it('tracks the FORCED_ALIGNMENT side asymmetry at steady state', () => {
        const rt = new RoomTransition(RoomType.FORCED_ALIGNMENT, SPEED);
        const out = rt.update(0.016, 0, 20);
        expect(out.uNoiseDensity).toBeCloseTo(faSideNoiseDensity(20), 9);
        // Moving across the crack retargets the side value frame by frame.
        const moved = rt.update(0.016, 0, -20);
        expect(moved.uNoiseDensity).toBeCloseTo(faSideNoiseDensity(-20), 9);
    });

    it('freezes the mid-blend state on a retreat: no pop back toward the abandoned target', () => {
        const rt = new RoomTransition(RoomType.IN_BETWEEN, SPEED);
        rt.beginTransition(RoomType.POLARIZED);
        const mid = { ...rt.update(0.125, 0, 0) }; // progress 0.25
        // Immediate retreat across the boundary (boundary probing).
        rt.beginTransition(RoomType.IN_BETWEEN);
        const out = rt.update(1e-6, 0, 0);
        // Continuous: the first frame after the retreat shows (essentially)
        // the frozen mid-blend state — the OLD behavior restarted the lerp
        // from the POLARIZED static baseline (~87-percentage-point pop).
        expect(out.uNoiseDensity).toBeCloseTo(mid.uNoiseDensity, 4);
        expect(out.uContrast).toBeCloseTo(mid.uContrast, 4);
        expect(out.inkColor[1]).toBeCloseTo(mid.inkColor[1], 4);
        expect(Math.abs(out.uNoiseDensity - ROOM_CONFIGS[RoomType.POLARIZED].shader.uNoiseDensity))
            .toBeGreaterThan(0.4);
        // ...and it glides back home from there.
        rt.update(1, 0, 0);
        expect(rt.getConfig()).toEqual(ROOM_CONFIGS[RoomType.IN_BETWEEN].shader);
    });

    it('stays continuous when a third room interrupts mid-transition', () => {
        const rt = new RoomTransition(RoomType.POLARIZED, SPEED);
        rt.update(1, 0, 0);
        rt.beginTransition(RoomType.IN_BETWEEN);
        const mid = { ...rt.update(0.125, 0, 0) };
        rt.beginTransition(RoomType.FORCED_ALIGNMENT);
        const out = rt.update(1e-6, 0, 0);
        expect(out.uNoiseDensity).toBeCloseTo(mid.uNoiseDensity, 4);
        expect(out.uScanIntensity).toBeCloseTo(mid.uScanIntensity, 4);
        expect(out.uMisregister).toBeCloseTo(mid.uMisregister, 4);
    });

    it('freezes the INFO_OVERFLOW reactive delta into the exit snapshot', () => {
        const rt = new RoomTransition(RoomType.INFO_OVERFLOW, SPEED);
        rt.update(1, 1, 0); // settle with a blazing flower: noise 1.0, jitter 0.9
        rt.beginTransition(RoomType.IN_BETWEEN);
        const out = rt.update(1e-6, 1, 0);
        // The OLD delta-on-top wiring zeroed the delta the instant the room
        // flipped, popping back to the 0.85/0.6 static baseline.
        expect(out.uNoiseDensity).toBeCloseTo(noiseDensityForIntensity(1), 4);
        expect(out.uTemporalJitter).toBeCloseTo(infoOverflowJitterForIntensity(1), 4);
    });

    it('freezes the FORCED_ALIGNMENT side delta into the exit snapshot', () => {
        const rt = new RoomTransition(RoomType.FORCED_ALIGNMENT, SPEED);
        rt.update(1, 0, 20); // settle on the broken-right side
        rt.beginTransition(RoomType.POLARIZED);
        const out = rt.update(1e-6, 0, 20);
        expect(out.uNoiseDensity).toBeCloseTo(faSideNoiseDensity(20), 4);
    });

    it('eases reactive deltas IN on entry instead of popping them', () => {
        const rt = new RoomTransition(RoomType.IN_BETWEEN, SPEED);
        rt.update(1, 1, 0); // settled on the IN_BETWEEN baseline (0.65)
        rt.beginTransition(RoomType.INFO_OVERFLOW);
        const first = rt.update(1e-6, 1, 0);
        // First frame inside INFO_OVERFLOW still shows the IN_BETWEEN value...
        expect(first.uNoiseDensity)
            .toBeCloseTo(ROOM_CONFIGS[RoomType.IN_BETWEEN].shader.uNoiseDensity, 4);
        // ...and reaches the flower-reactive target once settled.
        rt.update(1, 1, 0);
        expect(rt.getConfig().uNoiseDensity).toBeCloseTo(noiseDensityForIntensity(1), 9);
    });

    it('stays settled (and exact) under repeated updates', () => {
        const rt = new RoomTransition(RoomType.POLARIZED, SPEED);
        for (let i = 0; i < 10; i++) {
            rt.update(0.016, 0.5, 7);
        }
        expect(rt.isInTransition()).toBe(false);
        expect(rt.getConfig()).toEqual(ROOM_CONFIGS[RoomType.POLARIZED].shader);
    });

    it('getConfig returns the latest update output and getTargetRoom the blend target', () => {
        const rt = new RoomTransition(RoomType.IN_BETWEEN, SPEED);
        rt.beginTransition(RoomType.POLARIZED);
        const out = rt.update(0.1, 0, 0);
        expect(rt.getConfig()).toBe(out);
        expect(rt.getTargetRoom()).toBe(RoomType.POLARIZED);
    });

    it('ignores a beginTransition to the room it is already targeting', () => {
        const rt = new RoomTransition(RoomType.IN_BETWEEN, SPEED);
        rt.beginTransition(RoomType.POLARIZED);
        rt.update(0.25, 0, 0); // progress 0.5
        rt.beginTransition(RoomType.POLARIZED); // no-op: must NOT restart
        rt.update(0.25, 0, 0); // progress 1.0 -> settled
        expect(rt.isInTransition()).toBe(false);
        expect(rt.getConfig()).toEqual(ROOM_CONFIGS[RoomType.POLARIZED].shader);
    });
});
