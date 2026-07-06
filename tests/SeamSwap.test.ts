import { describe, expect, it } from 'vitest';
import {
    POLARIZED_SEAM_SWAP,
    seamBandFactor,
    seamFlickerDuty,
    seamSwapActive,
} from '../src/world/RoomConfig';

// Pure gating math for the POLARIZED seam language-swap: band factor from the
// player's distance to the seam, the duty curve, and the per-building flicker
// decision. No THREE, no allocation — the same knobs the ChunkManager pass uses.

describe('seamSwap gating', () => {
    describe('seamBandFactor', () => {
        it('is 1 exactly on the seam', () => {
            expect(seamBandFactor(40, 40, 6)).toBe(1);
        });

        it('is 0 at and beyond the band edge (both sides)', () => {
            expect(seamBandFactor(46, 40, 6)).toBe(0);
            expect(seamBandFactor(34, 40, 6)).toBe(0);
            expect(seamBandFactor(100, 40, 6)).toBe(0);
        });

        it('eases linearly from center to edge, symmetric in sign', () => {
            // Half way (3m of a 6m band) -> 0.5 on either side.
            expect(seamBandFactor(43, 40, 6)).toBeCloseTo(0.5, 12);
            expect(seamBandFactor(37, 40, 6)).toBeCloseTo(0.5, 12);
        });

        it('never disturbs faction identity far from the seam', () => {
            // A neighbouring column's seam is CHUNK_SIZE away; well outside ±6m.
            expect(seamBandFactor(0, 80, POLARIZED_SEAM_SWAP.PLAYER_BAND)).toBe(0);
        });

        it('defaults the band half-width to PLAYER_BAND', () => {
            const seamX = 0;
            const atDefaultEdge = seamBandFactor(POLARIZED_SEAM_SWAP.PLAYER_BAND, seamX);
            expect(atDefaultEdge).toBe(0);
            expect(seamBandFactor(0, seamX)).toBe(1);
        });
    });

    describe('seamFlickerDuty', () => {
        it('is 0 at the band edge (band factor 0)', () => {
            expect(seamFlickerDuty(0, 0.5)).toBe(0);
        });

        it('reaches maxDuty at the seam center (band factor 1)', () => {
            expect(seamFlickerDuty(1, 0.5)).toBe(0.5);
        });

        it('scales linearly between edge and center', () => {
            expect(seamFlickerDuty(0.5, 0.5)).toBeCloseTo(0.25, 12);
        });

        it('clamps the band factor into [0,1]', () => {
            expect(seamFlickerDuty(-1, 0.5)).toBe(0);
            expect(seamFlickerDuty(2, 0.5)).toBe(0.5);
        });

        it('defaults maxDuty to POLARIZED_SEAM_SWAP.MAX_DUTY', () => {
            expect(seamFlickerDuty(1)).toBe(POLARIZED_SEAM_SWAP.MAX_DUTY);
        });
    });

    describe('seamSwapActive', () => {
        it('is always off at duty 0 (outside the band, faction whole)', () => {
            for (let t = 0; t < 5; t += 0.13)
                expect(seamSwapActive(t, 0.2, 0, 0.5)).toBe(false);
        });

        it('is always on at duty >= 1', () => {
            for (let t = 0; t < 5; t += 0.13)
                expect(seamSwapActive(t, 0.2, 1, 0.5)).toBe(true);
        });

        it('is on for the first duty fraction of each cycle', () => {
            const period = 0.5;
            const duty = 0.5;
            // Phase 0: on in [0, 0.25) of the period, off in [0.25, 0.5).
            expect(seamSwapActive(0.0, 0, duty, period)).toBe(true);
            expect(seamSwapActive(0.2, 0, duty, period)).toBe(true);
            expect(seamSwapActive(0.3, 0, duty, period)).toBe(false);
            expect(seamSwapActive(0.45, 0, duty, period)).toBe(false);
            // Next cycle repeats.
            expect(seamSwapActive(0.5, 0, duty, period)).toBe(true);
        });

        it('desyncs two buildings by phase at the same time', () => {
            const period = 0.5;
            const duty = 0.5;
            // At t=0.3 phase 0 is off; a phase that shifts the cycle can be on.
            expect(seamSwapActive(0.3, 0, duty, period)).toBe(false);
            expect(seamSwapActive(0.3, 0.6, duty, period)).toBe(true);
        });

        it('is deterministic and frame-rate independent (same inputs agree)', () => {
            const a = seamSwapActive(1.234, 0.37, 0.3, 0.5);
            const b = seamSwapActive(1.234, 0.37, 0.3, 0.5);
            expect(a).toBe(b);
        });

        it('handles a negative phase wrap without changing the duty window', () => {
            // A phase of -0.4 wraps to 0.6; must match the explicit 0.6 case.
            expect(seamSwapActive(0.3, -0.4, 0.5, 0.5))
                .toBe(seamSwapActive(0.3, 0.6, 0.5, 0.5));
        });

        it('defaults the period to POLARIZED_SEAM_SWAP.FLICKER_PERIOD', () => {
            const period = POLARIZED_SEAM_SWAP.FLICKER_PERIOD;
            expect(seamSwapActive(0, 0, 0.5)).toBe(seamSwapActive(0, 0, 0.5, period));
        });
    });
});
