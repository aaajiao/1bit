import { PERFORMANCE } from '../config';

/**
 * Render-loop clock: clamped frame delta + elapsed seconds. The first tick
 * (and the first tick after reset()) seeds the previous-time reference so
 * the initial delta is never inflated by page-load or pause time, and every
 * delta is clamped (PERFORMANCE.MAX_FRAME_DELTA) so a stall can't produce a
 * huge physics/animation step (M1).
 */
export class FrameClock {
    /** Clamped frame delta (s); valid after tick(). */
    delta = 0;
    /** Elapsed time since page load (s); valid after tick(). */
    t = 0;

    private prevTime = 0;
    private hasPrevTime = false;

    /** Advance the clock one frame. */
    tick(now: number = performance.now()): void {
        if (!this.hasPrevTime) {
            this.prevTime = now;
            this.hasPrevTime = true;
        }
        this.delta = Math.min((now - this.prevTime) / 1000, PERFORMANCE.MAX_FRAME_DELTA);
        this.prevTime = now;
        this.t = now * 0.001;
    }

    /** Forget the previous tick (PauseController resume / tab return — M1). */
    reset(): void {
        this.hasPrevTime = false;
    }
}
