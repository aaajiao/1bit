import type { OverrideDenialReason } from '../src/player/OverrideMechanic';
import { beforeEach, describe, expect, it } from 'vitest';
import { OVERRIDE } from '../src/config';
import { OverrideMechanic } from '../src/player/OverrideMechanic';
import { RoomType } from '../src/world/RoomConfig';

// Convenience: run an update assuming POLARIZED room + gazing unless overridden.
function poll(
    m: OverrideMechanic,
    delta: number,
    keyHeld: boolean,
    opts: {
        gazing?: boolean;
        room?: RoomType | null;
        forced?: boolean;
    } = {},
) {
    // Use `in` so an explicit `room: null` is honoured (?? would coerce null
    // to the POLARIZED default).
    const room = 'room' in opts ? (opts.room as RoomType | null) : RoomType.POLARIZED;
    return m.update(
        delta,
        keyHeld,
        opts.gazing ?? true,
        room,
        opts.forced ?? false,
    );
}

describe('overrideMechanic', () => {
    let m: OverrideMechanic;

    beforeEach(() => {
        m = new OverrideMechanic();
    });

    describe('initial state', () => {
        it('should start inactive, untriggered, no cooldown', () => {
            const s = m.getState();
            expect(s.isActive).toBe(false);
            expect(s.isTriggered).toBe(false);
            expect(s.holdDuration).toBe(0);
            expect(s.cooldownRemaining).toBe(0);
            expect(s.triggerThreshold).toBe(OVERRIDE.HOLD_THRESHOLD);
        });
    });

    describe('hold -> trigger -> cooldown state machine', () => {
        it('should activate on first key press but not yet trigger', () => {
            const s = poll(m, 0.1, true);
            expect(s.isActive).toBe(true);
            expect(s.isTriggered).toBe(false);
            expect(s.holdDuration).toBeCloseTo(0.1, 5);
        });

        it('should not trigger before the hold threshold is reached', () => {
            poll(m, 0.5, true);
            const s = poll(m, 0.4, true); // total 0.9 < 1.0
            expect(s.isActive).toBe(true);
            expect(s.isTriggered).toBe(false);
        });

        it('should trigger once hold duration reaches the threshold', () => {
            poll(m, 0.5, true);
            const s = poll(m, 0.5, true); // total 1.0 >= 1.0
            expect(s.isTriggered).toBe(true);
            expect(m.isTriggered()).toBe(true);
        });

        it('should fire onOverrideStart once and onOverrideTrigger once', () => {
            let starts = 0;
            let triggers = 0;
            m.setOnOverrideStart(() => starts++);
            m.setOnOverrideTrigger(() => triggers++);

            poll(m, 0.5, true);
            poll(m, 0.6, true); // crosses threshold
            poll(m, 0.6, true); // still held, already triggered

            expect(starts).toBe(1);
            expect(triggers).toBe(1);
        });

        it('should apply cooldown and fire onOverrideEnd when key released after trigger', () => {
            let ends = 0;
            m.setOnOverrideEnd(() => ends++);

            poll(m, 1.0, true); // trigger
            const released = poll(m, 0.016, false); // release

            expect(ends).toBe(1);
            expect(released.isActive).toBe(false);
            expect(released.isTriggered).toBe(false);
            expect(released.cooldownRemaining).toBeCloseTo(OVERRIDE.COOLDOWN, 5);
        });

        it('should not apply cooldown when released before triggering', () => {
            poll(m, 0.5, true); // active, not triggered
            const released = poll(m, 0.016, false);
            expect(released.isActive).toBe(false);
            expect(released.cooldownRemaining).toBe(0);
        });

        it('should block re-activation while cooldown is running', () => {
            poll(m, 1.0, true); // trigger
            poll(m, 0.016, false); // release -> cooldown = 3.0

            // Cooldown not elapsed: holding the key cannot re-activate.
            const s = poll(m, 0.5, true);
            expect(s.isActive).toBe(false);
            expect(s.isTriggered).toBe(false);
        });

        it('should allow re-activation after cooldown elapses', () => {
            poll(m, 1.0, true);
            poll(m, 0.016, false); // cooldown = 3.0

            // Drain the cooldown with the key NOT held.
            poll(m, 3.1, false);
            expect(m.getState().cooldownRemaining).toBeLessThanOrEqual(0);

            const s = poll(m, 0.1, true);
            expect(s.isActive).toBe(true);
        });

        it('should report hold progress clamped to 1', () => {
            poll(m, 0.5, true);
            expect(m.getHoldProgress()).toBeCloseTo(0.5, 5);
            poll(m, 2.0, true);
            expect(m.getHoldProgress()).toBe(1);
        });
    });

    describe('room gating', () => {
        it('should not activate outside the POLARIZED room', () => {
            const s = poll(m, 1.0, true, { room: RoomType.INFO_OVERFLOW });
            expect(s.isActive).toBe(false);
            expect(s.isTriggered).toBe(false);
        });

        it('should not activate when room is null', () => {
            const s = poll(m, 1.0, true, { room: null });
            expect(s.isActive).toBe(false);
        });

        it('should not activate when requiresGaze is true and not gazing', () => {
            const s = poll(m, 1.0, true, { gazing: false });
            expect(s.isActive).toBe(false);
        });

        it('should activate in POLARIZED while gazing', () => {
            const s = poll(m, 1.0, true, { room: RoomType.POLARIZED, gazing: true });
            expect(s.isActive).toBe(true);
            expect(s.isTriggered).toBe(true);
        });
    });

    describe('m3: color-inversion flash runs full duration on early key release', () => {
        it('should return 0 inversion before triggering', () => {
            poll(m, 0.5, true);
            expect(m.getColorInversionValue()).toBe(0);
        });

        it('should keep producing inversion after early key release via effectTimer', () => {
            // Trigger (hold to 1.0), then release immediately.
            poll(m, 1.0, true);
            expect(m.isTriggered()).toBe(true);

            poll(m, 0.016, false); // key released right after trigger
            expect(m.getState().isActive).toBe(false); // state machine reset

            // The flash continues: at FLASH_HOLD_END window it should be full (1).
            // effectTimer so far ~0.016; advance into the hold plateau.
            poll(m, OVERRIDE.FLASH_ON_DURATION, false); // ~0.116 total -> past on-ramp
            expect(m.getColorInversionValue()).toBeGreaterThan(0);

            // Push into the held plateau region.
            poll(m, 0.1, false); // ~0.216 total, between FLASH_ON_DURATION and FLASH_HOLD_END
            expect(m.getColorInversionValue()).toBe(1);
        });

        it('should ramp the flash on during FLASH_ON_DURATION', () => {
            poll(m, 1.0, true); // trigger, effectTimer = 0
            const v = m.getColorInversionValue(); // effectTimer 0 -> 0
            expect(v).toBe(0);
            poll(m, OVERRIDE.FLASH_ON_DURATION / 2, false); // mid on-ramp
            expect(m.getColorInversionValue()).toBeGreaterThan(0);
            expect(m.getColorInversionValue()).toBeLessThan(1);
        });

        it('should fade the flash off and end at zero after the full effect duration', () => {
            poll(m, 1.0, true); // trigger
            // Advance past the entire effect window with key released.
            poll(m, OVERRIDE.EFFECT_DURATION + 0.01, false);
            expect(m.getColorInversionValue()).toBe(0);
        });

        it('should keep the flash going even though the key was released early', () => {
            poll(m, 1.0, true); // trigger
            poll(m, 0.016, false); // release very early
            // Mid-effect (within FLASH_OFF window) inversion must still be > 0.
            poll(m, OVERRIDE.FLASH_HOLD_END, false); // into the fade-off region
            const v = m.getColorInversionValue();
            expect(v).toBeGreaterThan(0);
            expect(v).toBeLessThanOrEqual(1);
        });
    });

    describe('hint conditions', () => {
        it('should set gazeTimeMet after >5s of gazing', () => {
            poll(m, 3.0, false, { gazing: true });
            expect(m.getHintState().conditions.gazeTimeMet).toBe(false);
            poll(m, 2.5, false, { gazing: true }); // total 5.5 > 5
            expect(m.getHintState().conditions.gazeTimeMet).toBe(true);
        });

        it('should set forcedTwice after two rising edges of isFlowerForced', () => {
            // First forced edge.
            poll(m, 0.1, false, { gazing: false, forced: true });
            poll(m, 0.1, false, { gazing: false, forced: false }); // release
            expect(m.getHintState().conditions.forcedTwice).toBe(false);

            // Second forced edge.
            poll(m, 0.1, false, { gazing: false, forced: true });
            expect(m.getHintState().conditions.forcedTwice).toBe(true);
        });

        it('should show the hint in POLARIZED once both conditions met and not yet shown', () => {
            // Meet gaze time.
            poll(m, 6.0, false, { gazing: true });
            // Two forced edges.
            poll(m, 0.1, false, { gazing: true, forced: true });
            poll(m, 0.1, false, { gazing: true, forced: false });
            poll(m, 0.1, false, { gazing: true, forced: true });

            const hint = m.getHintState();
            expect(hint.conditions.gazeTimeMet).toBe(true);
            expect(hint.conditions.forcedTwice).toBe(true);
            expect(hint.shouldShow).toBe(true);
            expect(hint.hasBeenShown).toBe(false);
        });

        it('should not show the hint outside POLARIZED even when conditions are met', () => {
            poll(m, 6.0, false, { gazing: true, room: RoomType.IN_BETWEEN });
            poll(m, 0.1, false, { gazing: true, forced: true, room: RoomType.IN_BETWEEN });
            poll(m, 0.1, false, { gazing: true, forced: false, room: RoomType.IN_BETWEEN });
            poll(m, 0.1, false, { gazing: true, forced: true, room: RoomType.IN_BETWEEN });
            expect(m.getHintState().shouldShow).toBe(false);
        });

        it('should stop showing the hint once markHintShown is called', () => {
            poll(m, 6.0, false, { gazing: true });
            poll(m, 0.1, false, { gazing: true, forced: true });
            poll(m, 0.1, false, { gazing: true, forced: false });
            poll(m, 0.1, false, { gazing: true, forced: true });
            expect(m.getHintState().shouldShow).toBe(true);

            m.markHintShown();
            expect(m.getHintState().hasBeenShown).toBe(true);
            // A subsequent update must not re-show it.
            poll(m, 0.1, false, { gazing: true });
            expect(m.getHintState().shouldShow).toBe(false);
        });
    });

    describe('hint display window (flow-audit break #2)', () => {
        // Meet both hint conditions in POLARIZED; the display window starts on
        // the last poll (forcedTwice flips before updateHint within update()).
        function meetHintConditions(mech: OverrideMechanic): void {
            poll(mech, 6.0, false, { gazing: true });
            poll(mech, 0.1, false, { gazing: true, forced: true });
            poll(mech, 0.1, false, { gazing: true, forced: false });
            poll(mech, 0.1, false, { gazing: true, forced: true });
        }

        it('should keep the hint visible across updates within the window', () => {
            meetHintConditions(m);
            // Advance well into, but not past, HINT_DISPLAY_DURATION (10s).
            for (let i = 0; i < 5; i++) {
                poll(m, 1.0, false, { gazing: false });
                expect(m.getHintState().shouldShow).toBe(true);
            }
            expect(m.getHintState().hasBeenShown).toBe(false);
        });

        it('should keep showing while briefly stepping out of POLARIZED once started', () => {
            meetHintConditions(m);
            poll(m, 1.0, false, { gazing: false, room: RoomType.IN_BETWEEN });
            expect(m.getHintState().shouldShow).toBe(true);
        });

        it('should mark itself shown once the window elapses', () => {
            meetHintConditions(m);
            poll(m, OVERRIDE.HINT_DISPLAY_DURATION + 0.1, false, { gazing: false });
            expect(m.getHintState().shouldShow).toBe(false);
            expect(m.getHintState().hasBeenShown).toBe(true);
            // It must never come back this session.
            poll(m, 0.1, false, { gazing: true, forced: true });
            expect(m.getHintState().shouldShow).toBe(false);
        });

        it('should end the hint early on a successful override', () => {
            meetHintConditions(m);
            expect(m.getHintState().shouldShow).toBe(true);
            poll(m, 1.0, true); // hold to trigger
            expect(m.getHintState().shouldShow).toBe(false);
            expect(m.getHintState().hasBeenShown).toBe(true);
        });

        it('should mark the hint shown by any successful override, even before conditions', () => {
            poll(m, 1.0, true); // trigger with no hint conditions met
            expect(m.getHintState().hasBeenShown).toBe(true);
        });
    });

    describe('denied-input feedback (flow-audit break #2)', () => {
        let reasons: OverrideDenialReason[];

        beforeEach(() => {
            reasons = [];
            m.setOnOverrideDenied(reason => reasons.push(reason));
        });

        it('should fire wrong-room once per key press outside POLARIZED', () => {
            poll(m, 0.1, true, { room: RoomType.INFO_OVERFLOW });
            poll(m, 0.1, true, { room: RoomType.INFO_OVERFLOW }); // still held
            expect(reasons).toEqual(['wrong-room']);

            poll(m, 0.1, false, { room: RoomType.INFO_OVERFLOW }); // release
            poll(m, 0.1, true, { room: RoomType.INFO_OVERFLOW }); // new press
            expect(reasons).toEqual(['wrong-room', 'wrong-room']);
        });

        it('should fire no-gaze in POLARIZED when not gazing', () => {
            poll(m, 0.1, true, { gazing: false });
            expect(reasons).toEqual(['no-gaze']);
            expect(m.getActiveDenial()).toBe('no-gaze');
        });

        it('should fire cooldown in POLARIZED while the cooldown runs', () => {
            poll(m, 1.0, true); // trigger
            poll(m, 0.016, false); // release -> cooldown starts
            reasons.length = 0;

            poll(m, 0.1, true); // re-press during cooldown
            expect(reasons).toEqual(['cooldown']);
        });

        it('should not fire when activation succeeds', () => {
            poll(m, 0.1, true);
            expect(reasons).toEqual([]);
            expect(m.getActiveDenial()).toBeNull();
        });

        it('should clear the denial when the key is released', () => {
            poll(m, 0.1, true, { gazing: false });
            expect(m.getActiveDenial()).toBe('no-gaze');
            poll(m, 0.1, false, { gazing: false });
            expect(m.getActiveDenial()).toBeNull();
        });
    });

    describe('getFeedbackProgress (cooldown edge-pulse channel)', () => {
        it('should equal hold progress while the override is active', () => {
            poll(m, 0.5, true);
            expect(m.getFeedbackProgress()).toBeCloseTo(0.5, 5);
        });

        it('should expose a low-intensity pulse proportional to the remaining cooldown', () => {
            poll(m, 1.0, true); // trigger
            poll(m, 0.016, false); // release -> cooldownRemaining = COOLDOWN

            poll(m, 0.5, true); // held during cooldown; cooldown drains by 0.5
            const expected = OVERRIDE.COOLDOWN_FEEDBACK_MAX
                * (OVERRIDE.COOLDOWN - 0.5) / OVERRIDE.COOLDOWN;
            expect(m.getFeedbackProgress()).toBeCloseTo(expected, 5);
            expect(m.getFeedbackProgress()).toBeLessThanOrEqual(OVERRIDE.COOLDOWN_FEEDBACK_MAX);
        });

        it('should report 0 when the key is not held during cooldown', () => {
            poll(m, 1.0, true);
            poll(m, 0.016, false);
            poll(m, 0.5, false);
            expect(m.getFeedbackProgress()).toBe(0);
        });

        it('should report 0 for a wrong-room denial', () => {
            poll(m, 0.5, true, { room: RoomType.IN_BETWEEN });
            expect(m.getFeedbackProgress()).toBe(0);
        });
    });

    describe('reset', () => {
        it('should clear runtime state but preserve hasBeenShown', () => {
            poll(m, 6.0, false, { gazing: true });
            poll(m, 0.1, false, { gazing: true, forced: true });
            poll(m, 0.1, false, { gazing: true, forced: false });
            poll(m, 0.1, false, { gazing: true, forced: true });
            m.markHintShown();
            poll(m, 1.0, true); // trigger -> effect active

            m.reset();

            const s = m.getState();
            expect(s.isActive).toBe(false);
            expect(s.isTriggered).toBe(false);
            expect(s.holdDuration).toBe(0);
            expect(s.cooldownRemaining).toBe(0);
            expect(m.getColorInversionValue()).toBe(0);
            expect(m.getHintState().hasBeenShown).toBe(true);
        });
    });
});
