import type { AudioSystemInterface } from '../types';
import type { RoomType } from '../world/RoomConfig';
import * as THREE from 'three';
import { Controls } from './Controls';
import { forceFlowerIntensity, getFlowerIntensity, overrideFlowerIntensity, setFlowerIntensity } from './FlowerProp';
import { GazeMechanic } from './GazeMechanic';
import { HandsModel } from './HandsModel';
import { OverrideMechanic } from './OverrideMechanic';

export interface PlayerContext {
    currentRoomType: RoomType;
}

export interface PlayerState {
    position: THREE.Vector3;
    isMoving: boolean;
    isGazing: boolean;
    gazeIntensity: number;
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

    // Cache for state
    private currentState: PlayerState;

    // Cached position to avoid per-frame allocations
    private _cachedPosition = new THREE.Vector3();

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

        // Initialize state
        this.currentState = {
            position: new THREE.Vector3(),
            isMoving: false,
            isGazing: false,
            gazeIntensity: 0,
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

        // Flower intensity control via scroll wheel
        this.controls.setOnFlowerIntensityChange((intensity) => {
            const flower = this.hands.getFlower();
            if (flower) {
                setFlowerIntensity(flower, intensity);
            }
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
     * Update all player systems
     */
    public update(delta: number, time: number, context: PlayerContext): PlayerState {
        // 1. Update controls (movement)
        const isMoving = this.controls.update(time * 1000); // Controls expects ms

        // Footstep audio
        if (isMoving && this.controls.canJump) {
            this.audio.playFootstep();
        }

        // 2. Update gaze
        const gazeState = this.gaze.update(delta);

        // Update audio gaze filter
        this.audio.updateGaze(gazeState.isGazing, gazeState.gazeIntensity);

        // 3. Flower Logic
        const flower = this.hands.getFlower();
        let flowerIntensity = 0.5;

        if (flower) {
            // Force flower intensity based on gaze
            const isGazing = gazeState.isGazing;
            forceFlowerIntensity(flower, isGazing, this.gaze.calculateForcedFlowerIntensity());

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

        // 5. Update Hands
        this.hands.animate(delta, isMoving, time * 1000);

        // Update cached state (reuse position object)
        this.currentState.position.copy(this.controls.getCamera().position);
        this.currentState.isMoving = isMoving;
        this.currentState.isGazing = gazeState.isGazing;
        this.currentState.gazeIntensity = gazeState.gazeIntensity;
        this.currentState.pitch = this.gaze.getPitch();
        this.currentState.overrideActive = overrideState.isActive;
        this.currentState.overrideTriggered = overrideState.isTriggered;
        this.currentState.overrideProgress = this.override.getHoldProgress();
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
     * Cleanup resources
     */
    public dispose(): void {
        this.controls.dispose();
        this.hands.dispose();
    }
}
