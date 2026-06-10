// Tests for the 60s no-interaction flower-adjustment fallback hint
// (flow-audit enhancement #1): idle window, dismissal-on-first-adjustment,
// and the session-permanent dismissal semantics.
import { describe, expect, it } from 'vitest';
import { FLOWER_HINT } from '../src/config';
import { FlowerHintMechanic } from '../src/player/FlowerHintMechanic';

const STEP = 0.1; // Seconds per simulated frame

/** Advance the mechanic in fixed steps. */
function simulate(hint: FlowerHintMechanic, seconds: number): void {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i++) {
        hint.update(STEP);
    }
}

describe('flowerHintMechanic', () => {
    it('should stay hidden before the idle window elapses', () => {
        const hint = new FlowerHintMechanic();
        simulate(hint, FLOWER_HINT.IDLE_SECONDS - 1);
        expect(hint.getState().shouldShow).toBe(false);
    });

    it('should show after IDLE_SECONDS without any adjustment and stay visible', () => {
        const hint = new FlowerHintMechanic();
        simulate(hint, FLOWER_HINT.IDLE_SECONDS + 0.5);
        expect(hint.getState().shouldShow).toBe(true);

        // No display window: it stays up until the player adjusts.
        simulate(hint, 30);
        expect(hint.getState().shouldShow).toBe(true);
    });

    it('should never show when the player adjusts before the window elapses', () => {
        const hint = new FlowerHintMechanic();
        simulate(hint, 5);
        hint.notifyAdjusted();
        simulate(hint, FLOWER_HINT.IDLE_SECONDS * 2);
        expect(hint.getState().shouldShow).toBe(false);
        expect(hint.getState().hasBeenDismissed).toBe(true);
    });

    it('should dismiss permanently once the player adjusts after it showed', () => {
        const hint = new FlowerHintMechanic();
        simulate(hint, FLOWER_HINT.IDLE_SECONDS + 1);
        expect(hint.getState().shouldShow).toBe(true);

        hint.notifyAdjusted();
        expect(hint.getState().shouldShow).toBe(false);

        // More idle time never resurrects it this session.
        simulate(hint, FLOWER_HINT.IDLE_SECONDS * 2);
        expect(hint.getState().shouldShow).toBe(false);
    });

    it('should report the live state from update() itself', () => {
        const hint = new FlowerHintMechanic();
        let state = hint.update(FLOWER_HINT.IDLE_SECONDS);
        expect(state.shouldShow).toBe(true);
        hint.notifyAdjusted();
        state = hint.update(STEP);
        expect(state.shouldShow).toBe(false);
    });
});
