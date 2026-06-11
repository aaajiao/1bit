// 1-bit Chimera Void - Flower Hint Mechanic
// 60s no-interaction fallback hint (flow-audit enhancement #1, second half of
// the "no tutorial" discoverability chain): if the player never adjusts the
// flower's intensity, a minimal "[scroll]" line fades in on the HUD. The
// first deliberate adjustment dismisses it for the session — mirroring the
// OverrideMechanic hint's keep-shown-across-runs precedent.

import { FLOWER_HINT } from '../config';

/**
 * Flower fallback-hint state
 */
export interface FlowerHintState {
    shouldShow: boolean; // Whether to show the hint
    hasBeenDismissed: boolean; // Player adjusted at least once this session
}

/**
 * Idle-timer state machine for the flower-adjustment fallback hint.
 * Driven by play-time delta (main gates updates while paused), so time on
 * the start/pause screen never counts toward the idle window.
 */
export class FlowerHintMechanic {
    private idleTimer = 0;
    private dismissed = false;

    /**
     * Advance the idle timer.
     * @param delta - Delta time in seconds (play time)
     */
    update(delta: number): FlowerHintState {
        if (!this.dismissed) {
            this.idleTimer += delta;
        }
        return this.getState();
    }

    /**
     * The player adjusted the flower intensity (wheel / Q-E / touch buttons):
     * the hint is no longer needed this session.
     */
    notifyAdjusted(): void {
        this.dismissed = true;
    }

    /**
     * Get current hint state. Once the idle window elapses the hint stays
     * visible until the first adjustment dismisses it (it IS the dismissal
     * trigger — there is no separate display window).
     */
    getState(): FlowerHintState {
        return {
            shouldShow: !this.dismissed && this.idleTimer >= FLOWER_HINT.IDLE_SECONDS,
            hasBeenDismissed: this.dismissed,
        };
    }
}
