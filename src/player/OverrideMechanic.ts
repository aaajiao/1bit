// 1-bit Chimera Void - Override Mechanic
// Resistance mechanism: holding override key while gazing forces flower to maximum intensity

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

    // Callbacks
    private onOverrideStart: (() => void) | null = null;
    private onOverrideTrigger: (() => void) | null = null;
    private onOverrideEnd: (() => void) | null = null;

    constructor() {
        this.config = {
            holdThreshold: 1.0, // 1 second hold
            effectDuration: 0.5, // 0.5 second effect
            cooldown: 3.0, // 3 second cooldown
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
        this.updateHint(currentRoom);

        // Check if override is allowed in current room
        const inAllowedRoom = currentRoom !== null
            && this.config.allowedRooms.includes(currentRoom);

        // Check if override can be active
        const canActivate = inAllowedRoom
            && this.state.cooldownRemaining <= 0
            && (!this.config.requiresGaze || isGazing);

        // Handle key press
        if (isKeyHeld && canActivate) {
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
                if (this.onOverrideTrigger) {
                    this.onOverrideTrigger();
                }
            }
        }
        else {
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

        return this.getState();
    }

    /**
     * Update hint visibility based on conditions
     */
    private updateHint(currentRoom: RoomType | null): void {
        // Only show hint in allowed rooms
        const inAllowedRoom = currentRoom !== null
            && this.config.allowedRooms.includes(currentRoom);

        // Show hint if conditions met and not already shown
        this.hint.shouldShow = inAllowedRoom
            && !this.hint.hasBeenShown
            && this.hint.conditions.gazeTimeMet
            && this.hint.conditions.forcedTwice;

        // Mark as shown once displayed (external code should call markHintShown)
    }

    /**
     * Mark hint as shown (call when hint is displayed to user)
     */
    markHintShown(): void {
        this.hint.hasBeenShown = true;
        this.hint.shouldShow = false;
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
        // Keep hint.hasBeenShown for subsequent runs
    }

    /**
     * Calculate shader color inversion value for override effect
     * Returns 0-1 for smooth flash effect
     */
    getColorInversionValue(): number {
        if (!this.state.isTriggered)
            return 0;

        // Flash effect: quick on, slower off
        const effectProgress = Math.min(1, this.state.holdDuration - this.config.holdThreshold);
        if (effectProgress < 0.1) {
            // Quick flash on
            return effectProgress / 0.1;
        }
        else if (effectProgress < 0.3) {
            // Hold
            return 1;
        }
        else if (effectProgress < 0.5) {
            // Fade off
            return 1 - (effectProgress - 0.3) / 0.2;
        }
        return 0;
    }
}
