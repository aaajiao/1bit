// 1-bit Chimera Void - Override Mechanic
// Resistance mechanism: holding override key while gazing forces flower to maximum intensity

import { OVERRIDE } from '../config';
import { RoomType } from '../world/RoomConfig';

/**
 * Override state information
 */
export interface OverrideState {
    isActive: boolean; // Currently overriding
    holdDuration: number; // How long held (seconds)
    triggerThreshold: number; // Required hold time to trigger
    isTriggered: boolean; // Has triggered the override effect
    cooldownRemaining: number; // Cooldown before can trigger again
}

/**
 * Override mechanic configuration
 */
export interface OverrideConfig {
    holdThreshold: number; // Seconds to hold before triggering
    effectDuration: number; // How long the override effect lasts
    cooldown: number; // Seconds before can trigger again
    requiresGaze: boolean; // Must be gazing to trigger
    allowedRooms: RoomType[]; // Rooms where override works
}

/**
 * Override hint state
 */
export interface OverrideHint {
    shouldShow: boolean; // Whether to show the hint
    hasBeenShown: boolean; // Whether hint has been shown this session
    conditions: {
        gazeTimeMet: boolean; // Player has gazed > 5 seconds
        forcedTwice: boolean; // Flower forced down >= 2 times
    };
}

/**
 * Why a held override key produced no override (flow-audit break #2).
 * - 'cooldown': right room, but the post-trigger cooldown is still running
 *   (fed back visually via getFeedbackProgress / the edge-pulse channel).
 * - 'no-gaze': right room, but the player is not gazing (audio thud).
 * - 'wrong-room': resistance only works in POLARIZED (kept silent by design).
 */
export type OverrideDenialReason = 'cooldown' | 'no-gaze' | 'wrong-room';

/**
 * Manages the override/resistance mechanic
 */
export class OverrideMechanic {
    private config: OverrideConfig;
    private state: OverrideState;
    private hint: OverrideHint;

    // Tracking for hint conditions
    private totalGazeTime: number = 0;
    private forcedDownCount: number = 0;
    private wasForced: boolean = false;

    // Effect timer: advanced by delta once the override triggers, regardless of
    // key state, so the color-inversion flash plays for its full duration even
    // if the key is released early (M3).
    private effectTimer: number = 0;
    private effectActive: boolean = false;

    // Hint display window (flow-audit break #2): once the conditions are first
    // met the hint stays visible while this counts down, instead of being
    // marked shown the same frame it appears.
    private hintVisibleTimer: number = 0;

    // Denial feedback (flow-audit break #2): why the held key is doing nothing.
    // Non-null only while the key is held without the override activating.
    private activeDenial: OverrideDenialReason | null = null;
    private wasKeyHeld: boolean = false;

    // Callbacks
    private onOverrideStart: (() => void) | null = null;
    private onOverrideTrigger: (() => void) | null = null;
    private onOverrideEnd: (() => void) | null = null;
    private onOverrideDenied: ((reason: OverrideDenialReason) => void) | null = null;

    constructor() {
        this.config = {
            holdThreshold: OVERRIDE.HOLD_THRESHOLD, // 1 second hold (live value 1.0)
            effectDuration: OVERRIDE.EFFECT_DURATION, // 0.5 second effect
            cooldown: OVERRIDE.COOLDOWN, // 3 second cooldown
            requiresGaze: true, // Must be gazing
            allowedRooms: [RoomType.POLARIZED], // Only in POLARIZED room
        };

        this.state = {
            isActive: false,
            holdDuration: 0,
            triggerThreshold: this.config.holdThreshold,
            isTriggered: false,
            cooldownRemaining: 0,
        };

        this.hint = {
            shouldShow: false,
            hasBeenShown: false,
            conditions: {
                gazeTimeMet: false,
                forcedTwice: false,
            },
        };
    }

    /**
     * Set callback for when override key is first pressed
     */
    setOnOverrideStart(callback: () => void): void {
        this.onOverrideStart = callback;
    }

    /**
     * Set callback for when override triggers (hold threshold met)
     */
    setOnOverrideTrigger(callback: () => void): void {
        this.onOverrideTrigger = callback;
    }

    /**
     * Set callback for when override ends
     */
    setOnOverrideEnd(callback: () => void): void {
        this.onOverrideEnd = callback;
    }

    /**
     * Set callback fired once per key press when the override key is pressed
     * but the override cannot activate (flow-audit break #2). The reason
     * tells the caller which feedback tier applies.
     */
    setOnOverrideDenied(callback: (reason: OverrideDenialReason) => void): void {
        this.onOverrideDenied = callback;
    }

    /**
     * Update override mechanic
     * @param delta - Delta time in seconds
     * @param isKeyHeld - Is override key currently held
     * @param isGazing - Is player currently gazing at sky eye
     * @param currentRoom - Current room type
     * @param isFlowerForced - Is flower being forced down by gaze
     */
    update(
        delta: number,
        isKeyHeld: boolean,
        isGazing: boolean,
        currentRoom: RoomType | null,
        isFlowerForced: boolean,
    ): OverrideState {
        // Update cooldown
        if (this.state.cooldownRemaining > 0) {
            this.state.cooldownRemaining -= delta;
        }

        // Advance the effect timer regardless of key state so the color-inversion
        // flash plays for its full duration even on early key release (M3).
        if (this.effectActive) {
            this.effectTimer += delta;
            if (this.effectTimer >= this.config.effectDuration) {
                this.effectActive = false;
            }
        }

        // Track gaze time for hint
        if (isGazing) {
            this.totalGazeTime += delta;
            if (this.totalGazeTime > 5.0) {
                this.hint.conditions.gazeTimeMet = true;
            }
        }

        // Track forced down count for hint
        if (isFlowerForced && !this.wasForced) {
            this.forcedDownCount++;
            if (this.forcedDownCount >= 2) {
                this.hint.conditions.forcedTwice = true;
            }
        }
        this.wasForced = isFlowerForced;

        // Update hint visibility
        this.updateHint(currentRoom, delta);

        // Check if override is allowed in current room
        const inAllowedRoom = currentRoom !== null
            && this.config.allowedRooms.includes(currentRoom);

        // Check if override can be active
        const canActivate = inAllowedRoom
            && this.state.cooldownRemaining <= 0
            && (!this.config.requiresGaze || isGazing);

        // Handle key press
        if (isKeyHeld && canActivate) {
            this.activeDenial = null;

            // Start override if not already active
            if (!this.state.isActive) {
                this.state.isActive = true;
                this.state.holdDuration = 0;
                this.state.isTriggered = false;
                if (this.onOverrideStart) {
                    this.onOverrideStart();
                }
            }

            // Accumulate hold time
            this.state.holdDuration += delta;

            // Check for trigger
            if (!this.state.isTriggered && this.state.holdDuration >= this.config.holdThreshold) {
                this.state.isTriggered = true;
                // Start the independent effect timer that drives the flash for its
                // full duration regardless of when the key is released (M3).
                this.effectTimer = 0;
                this.effectActive = true;
                // A successful resistance ends the teaching moment: the hint is
                // no longer needed this session (flow-audit break #2).
                this.markHintShown();
                if (this.onOverrideTrigger) {
                    this.onOverrideTrigger();
                }
            }
        }
        else {
            // Denied input feedback (flow-audit break #2): classify WHY a held
            // key is doing nothing, and fire the callback once per key press.
            if (isKeyHeld) {
                this.activeDenial = this.classifyDenial(inAllowedRoom, isGazing);
                if (!this.wasKeyHeld && this.onOverrideDenied) {
                    this.onOverrideDenied(this.activeDenial);
                }
            }
            else {
                this.activeDenial = null;
            }

            // Key released or not allowed
            if (this.state.isActive) {
                // Apply cooldown if was triggered
                if (this.state.isTriggered) {
                    this.state.cooldownRemaining = this.config.cooldown;
                }

                this.state.isActive = false;
                this.state.holdDuration = 0;
                this.state.isTriggered = false;

                if (this.onOverrideEnd) {
                    this.onOverrideEnd();
                }
            }
        }
        this.wasKeyHeld = isKeyHeld;

        return this.getState();
    }

    /**
     * Classify why a held override key cannot activate. Priority: room first
     * (outside POLARIZED nothing applies), then cooldown, then gaze.
     */
    private classifyDenial(inAllowedRoom: boolean, isGazing: boolean): OverrideDenialReason {
        if (!inAllowedRoom)
            return 'wrong-room';
        if (this.state.cooldownRemaining > 0)
            return 'cooldown';
        if (this.config.requiresGaze && !isGazing)
            return 'no-gaze';
        // Unreachable while canActivate mirrors these checks; safest default.
        return 'no-gaze';
    }

    /**
     * Update hint visibility based on conditions (flow-audit break #2).
     *
     * The first time all conditions line up in an allowed room, a display
     * window of OVERRIDE.HINT_DISPLAY_DURATION starts. The hint stays visible
     * until the window elapses (or the player succeeds at an override, which
     * calls markHintShown directly) — it is NOT marked shown the frame it
     * appears. Once the window started, briefly stepping across a chunk seam
     * does not snatch the hint away.
     */
    private updateHint(currentRoom: RoomType | null, delta: number): void {
        // Only start showing the hint in allowed rooms
        const inAllowedRoom = currentRoom !== null
            && this.config.allowedRooms.includes(currentRoom);

        if (
            !this.hint.hasBeenShown
            && this.hintVisibleTimer <= 0
            && inAllowedRoom
            && this.hint.conditions.gazeTimeMet
            && this.hint.conditions.forcedTwice
        ) {
            this.hintVisibleTimer = OVERRIDE.HINT_DISPLAY_DURATION;
        }

        if (!this.hint.hasBeenShown && this.hintVisibleTimer > 0) {
            this.hintVisibleTimer -= delta;
            this.hint.shouldShow = true;
            if (this.hintVisibleTimer <= 0) {
                this.markHintShown();
            }
        }
        else {
            this.hint.shouldShow = false;
        }
    }

    /**
     * Mark hint as shown (the display window elapsed, or the player already
     * succeeded at an override and no longer needs teaching)
     */
    markHintShown(): void {
        this.hint.hasBeenShown = true;
        this.hint.shouldShow = false;
        this.hintVisibleTimer = 0;
    }

    /**
     * Get current override state
     */
    getState(): OverrideState {
        return { ...this.state };
    }

    /**
     * Get hint state
     */
    getHintState(): OverrideHint {
        return { ...this.hint };
    }

    /**
     * Check if override is currently active
     */
    isActive(): boolean {
        return this.state.isActive;
    }

    /**
     * Check if override has triggered
     */
    isTriggered(): boolean {
        return this.state.isTriggered;
    }

    /**
     * Get hold progress (0-1)
     */
    getHoldProgress(): number {
        return Math.min(1, this.state.holdDuration / this.config.holdThreshold);
    }

    /**
     * Value for the uOverrideProgress edge-pulse shader channel (0-1).
     *
     * While the override is active this is the hold progress (unchanged
     * behavior). While the key is held during cooldown it is a LOW-intensity
     * pulse proportional to the remaining cooldown, so the denial reads as
     * "not yet" instead of dead silence (flow-audit break #2). 0 otherwise.
     */
    getFeedbackProgress(): number {
        if (this.state.isActive)
            return this.getHoldProgress();
        if (this.activeDenial === 'cooldown' && this.config.cooldown > 0) {
            const remaining = Math.max(0, this.state.cooldownRemaining);
            return OVERRIDE.COOLDOWN_FEEDBACK_MAX * (remaining / this.config.cooldown);
        }
        return 0;
    }

    /**
     * Get the current denial reason (null while idle or overriding).
     */
    getActiveDenial(): OverrideDenialReason | null {
        return this.activeDenial;
    }

    /**
     * Reset mechanic state
     */
    reset(): void {
        this.state = {
            isActive: false,
            holdDuration: 0,
            triggerThreshold: this.config.holdThreshold,
            isTriggered: false,
            cooldownRemaining: 0,
        };
        this.totalGazeTime = 0;
        this.forcedDownCount = 0;
        this.wasForced = false;
        this.effectTimer = 0;
        this.effectActive = false;
        this.hintVisibleTimer = 0;
        this.activeDenial = null;
        this.wasKeyHeld = false;
        // Keep hint.hasBeenShown for subsequent runs
    }

    /**
     * Calculate shader color inversion value for override effect
     * Returns 0-1 for smooth flash effect
     */
    getColorInversionValue(): number {
        // Driven by the independent effect timer (M3) so the flash plays for its
        // full duration even when the override key is released early.
        if (!this.effectActive)
            return 0;

        // Flash effect: quick on, slower off
        const effectProgress = this.effectTimer;
        if (effectProgress < OVERRIDE.FLASH_ON_DURATION) {
            // Quick flash on
            return effectProgress / OVERRIDE.FLASH_ON_DURATION;
        }
        else if (effectProgress < OVERRIDE.FLASH_HOLD_END) {
            // Hold
            return 1;
        }
        else if (effectProgress < OVERRIDE.FLASH_OFF_END) {
            // Fade off
            return 1 - (effectProgress - OVERRIDE.FLASH_HOLD_END)
                / (OVERRIDE.FLASH_OFF_END - OVERRIDE.FLASH_HOLD_END);
        }
        return 0;
    }
}
