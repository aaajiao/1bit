import type { AudioSystemInterface } from '../types';
import type { RoomType } from '../world/RoomConfig';
import type { FlowerHintState } from './FlowerHintMechanic';
import type { OverrideHint } from './OverrideMechanic';
import * as THREE from 'three';
import { Controls } from './Controls';
import { FlowerHintMechanic } from './FlowerHintMechanic';
import { forceFlowerIntensity, getFlowerIntensity, getFlowerTargetIntensity, overrideFlowerIntensity, setFlowerIntensity } from './FlowerProp';
import { GazeMechanic } from './GazeMechanic';
import { HandsModel } from './HandsModel';
import { OverrideMechanic } from './OverrideMechanic';

export interface PlayerContext {
    currentRoomType: RoomType;
    /**
     * Sky-eye world position (flow-audit enhancement #13): attenuates the
     * gaze intensity by view direction so discipline only lands while the
     * eye is roughly in frame. Omit/null => no attenuation (legacy).
     * One frame stale by design (the eye updates after the player in the
     * fixed frame order) — negligible for the slow-drifting eye.
     */
    eyePosition?: { x: number; y: number; z: number } | null;
}

export interface PlayerState {
    position: THREE.Vector3;
    isMoving: boolean;
    isGazing: boolean;
    gazeIntensity: number;
    /** First-crossing pulse for the 45° threshold marker line (0-1, decaying) */
    gazeThresholdPulse: number;
    pitch: number;
    overrideActive: boolean;
    overrideTriggered: boolean;
    overrideProgress: number;
    flowerIntensity: number;
    isShiftHeld: boolean;
}

export class PlayerManager {
    public controls: Controls;
    public hands: HandsModel;
    public gaze: GazeMechanic;
    public override: OverrideMechanic;
    public flowerHint: FlowerHintMechanic;

    // Cache for state
    private currentState: PlayerState;

    // Cached position to avoid per-frame allocations
    private _cachedPosition = new THREE.Vector3();

    // Remaining seconds of action dulling (sunset-snapshot ritual,
    // flow-audit enhancement #9). Play time: decremented in update(), which
    // main.ts gates while paused.
    private actionLockTimer = 0;

    constructor(
        camera: THREE.PerspectiveCamera,
        domElement: HTMLElement,
        private audio: AudioSystemInterface,
    ) {
        // Initialize subsystems
        this.controls = new Controls(camera, domElement);
        this.hands = new HandsModel(camera);
        this.gaze = new GazeMechanic(camera);
        this.override = new OverrideMechanic();
        this.flowerHint = new FlowerHintMechanic();

        // Initialize state
        this.currentState = {
            position: new THREE.Vector3(),
            isMoving: false,
            isGazing: false,
            gazeIntensity: 0,
            gazeThresholdPulse: 0,
            pitch: 0,
            overrideActive: false,
            overrideTriggered: false,
            overrideProgress: 0,
            flowerIntensity: 0.5,
            isShiftHeld: false,
        };

        this.setupCallbacks();
    }

    private setupCallbacks(): void {
        // Gaze mechanic
        this.gaze.setOnGazeStart(() => {
            this.audio.playGazeStartPulse();
        });

        // Override mechanic
        this.override.setOnOverrideTrigger(() => {
            this.audio.playOverrideTear();
            // Force flower to max intensity
            const flower = this.hands.getFlower();
            if (flower) {
                overrideFlowerIntensity(flower);
            }
        });

        // Tiered failure feedback (flow-audit break #2):
        // - 'no-gaze' (POLARIZED, not gazing): a very light low thud — "wrong
        //   direction" — once per key press.
        // - 'cooldown' is fed back visually via getFeedbackProgress (edge pulse).
        // - 'wrong-room' stays silent by design (only POLARIZED permits revolt).
        this.override.setOnOverrideDenied((reason) => {
            if (reason === 'no-gaze') {
                this.audio.playOverrideDeniedThud();
            }
        });

        // Flower intensity control via scroll wheel / Q-E / touch buttons.
        // The confirm tone is event-driven from the player's input (flow-audit
        // medium #6): the old per-frame threshold detection never fired at
        // >=30fps and has been removed from AudioController.
        this.controls.setOnFlowerIntensityChange((intensity) => {
            const flower = this.hands.getFlower();
            if (flower) {
                setFlowerIntensity(flower, intensity);
            }
            this.audio.playFlowerChangeTone(intensity);
            // First deliberate adjustment dismisses the 60s fallback hint
            // for the session (flow-audit enhancement #1).
            this.flowerHint.notifyAdjusted();
        });

        // Jump audio
        this.controls.setOnJump((isDoubleJump) => {
            if (isDoubleJump) {
                this.audio.playDoubleJump();
            }
            else {
                this.audio.playJump();
            }
        });
    }

    /**
     * Set initial spawn position
     */
    public setSpawnPosition(x: number, y: number, z: number): void {
        this.controls.teleport({ x, y, z });
    }

    /**
     * Teleport player to specific position
     */
    public teleport(x: number, y: number, z: number): void {
        this.controls.teleport({ x, y, z });
    }

    /**
     * Get current position (returns cached Vector3, do not modify)
     */
    public getPosition(): THREE.Vector3 {
        return this._cachedPosition.copy(this.controls.getCamera().position);
    }

    /**
     * Get the last computed flower intensity in [0,1]. Reflects the most recent
     * update() (one frame stale if read before update), which is fine for the
     * slow INFO_OVERFLOW flicker cadence that consumes it.
     */
    public getFlowerIntensity(): number {
        return this.currentState.flowerIntensity;
    }

    /**
     * Set ground level for physics
     */
    public setGroundLevel(level: number): void {
        this.controls.setGroundLevel(level);
    }

    /**
     * Set gravity scaling
     */
    public setGravity(gravity: number): void {
        this.controls.setGravity(gravity);
    }

    /**
     * Dull the player's ACTIONS (movement, jump, flower adjust, override)
     * for `seconds` of play time — used while the sunset snapshot lands so an
     * accidental input can't stomp the settlement (flow-audit enhancement
     * #9). Look stays live; overlapping calls keep the longer window.
     */
    public suppressActions(seconds: number): void {
        this.actionLockTimer = Math.max(this.actionLockTimer, seconds);
    }

    /**
     * Update all player systems
     */
    public update(delta: number, time: number, context: PlayerContext): PlayerState {
        // 0. Advance the action-dulling window (snapshot ritual) and sync it
        // into Controls before any input is consumed this frame.
        if (this.actionLockTimer > 0) {
            this.actionLockTimer = Math.max(0, this.actionLockTimer - delta);
        }
        this.controls.setActionsSuppressed(this.actionLockTimer > 0);

        // 1. Update controls (movement)
        const isMoving = this.controls.update(time * 1000); // Controls expects ms

        // Footstep audio
        if (isMoving && this.controls.canJump) {
            this.audio.playFootstep();
        }

        // 2. Update gaze (direction-checked against the sky eye when provided)
        const gazeState = this.gaze.update(delta, context.eyePosition ?? null);

        // Update audio gaze filter
        this.audio.updateGaze(gazeState.isGazing, gazeState.gazeIntensity);

        // 3. Flower Logic
        const flower = this.hands.getFlower();
        let flowerIntensity = 0.5;

        if (flower) {
            // Force flower intensity based on gaze.
            // While the override effect is active, override is authoritative and
            // holds the flower at max — skip gaze-forcing so the "blaze to full"
            // payoff is not overwritten and decayed back down (H4).
            const isGazing = gazeState.isGazing;
            if (this.override.isTriggered()) {
                forceFlowerIntensity(flower, false);
            }
            else {
                // One-way clamp (flow-audit medium #1): gaze only ever
                // suppresses the flower, never raises it — a player who keeps
                // the flower dim (target below the forced curve) stays dim.
                const forced = Math.min(
                    this.gaze.calculateForcedFlowerIntensity(),
                    getFlowerTargetIntensity(flower),
                );
                forceFlowerIntensity(flower, isGazing, forced);
            }

            // Get current intensity
            flowerIntensity = getFlowerIntensity(flower);

            // Update flower audio based on intensity
            this.audio.updateFlowerAudio(flowerIntensity);
        }

        // 4. Update Override Mechanic
        const isShiftHeld = this.controls.isOverrideKeyHeld();
        const overrideState = this.override.update(
            delta,
            isShiftHeld,
            gazeState.isGazing,
            context.currentRoomType,
            gazeState.isGazing && flowerIntensity < 0.3,
        );

        // 5. Advance the 60s no-interaction fallback-hint idle timer
        // (flow-audit enhancement #1). Play time only: main gates this whole
        // update while paused.
        this.flowerHint.update(delta);

        // 6. Update Hands
        this.hands.animate(delta, isMoving, time * 1000);

        // Update cached state (reuse position object)
        this.currentState.position.copy(this.controls.getCamera().position);
        this.currentState.isMoving = isMoving;
        this.currentState.isGazing = gazeState.isGazing;
        this.currentState.gazeIntensity = gazeState.gazeIntensity;
        this.currentState.gazeThresholdPulse = this.gaze.getThresholdPulse();
        this.currentState.pitch = this.gaze.getPitch();
        this.currentState.overrideActive = overrideState.isActive;
        this.currentState.overrideTriggered = overrideState.isTriggered;
        // Feedback progress = hold progress while active, plus the low-intensity
        // cooldown-denial pulse while the key is held during cooldown (break #2).
        this.currentState.overrideProgress = this.override.getFeedbackProgress();
        this.currentState.flowerIntensity = flowerIntensity;
        this.currentState.isShiftHeld = isShiftHeld;

        return this.currentState;
    }

    /**
     * Get the simplified color inversion value from override mechanic
     */
    public getColorInversionValue(): number {
        return this.override.getColorInversionValue();
    }

    /**
     * Raw-bypass crash-frame value (enhancement #4) for the uRawBypass
     * uniform: 1 for ~0.1s right after the override triggers.
     */
    public getRawBypassValue(): number {
        return this.override.getRawBypassValue();
    }

    /**
     * Sustained-hold feedback (enhancement #5) for the uOverrideSustain
     * uniform: 1 while the key stays held past the trigger, fast decay after.
     */
    public getOverrideSustain(): number {
        return this.override.getSustainValue();
    }

    /**
     * Accumulated per-run resistance residue (enhancement #6) for the
     * uMisregister channel. Cleared at sunset via resetOverrideResidue().
     */
    public getOverrideResidue(): number {
        return this.override.getMisregisterResidue();
    }

    /**
     * Clear the per-run resistance residue (enhancement #6) — called by the
     * sunset settlement, where the run ends and the world forgets.
     */
    public resetOverrideResidue(): void {
        this.override.resetResidue();
    }

    /**
     * Get the override hint state (delegates to OverrideMechanic).
     * Hint state is kept live each frame by the override update path; the
     * display window is owned by the mechanic itself (flow-audit break #2),
     * so callers just render `shouldShow` — no external marking needed.
     */
    public getOverrideHintState(): OverrideHint {
        return this.override.getHintState();
    }

    /**
     * Get the flower-adjustment fallback-hint state (flow-audit enhancement
     * #1). Same rendering contract as the override hint: callers just render
     * `shouldShow` — the mechanic owns the idle window and the dismissal.
     */
    public getFlowerHintState(): FlowerHintState {
        return this.flowerHint.getState();
    }

    /**
     * Cleanup resources
     */
    public dispose(): void {
        this.controls.dispose();
        this.hands.dispose();
    }
}
