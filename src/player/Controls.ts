// 1-bit Chimera Void - Player Controls
import * as THREE from 'three';
import type { ControlsConfig, PlayerPosition } from '../types';

/**
 * First-person keyboard + mouse controls
 */
export class Controls {
    private camera: THREE.PerspectiveCamera;
    private domElement: HTMLElement;

    // Movement state
    private moveForward: boolean = false;
    private moveBackward: boolean = false;
    private moveLeft: boolean = false;
    private moveRight: boolean = false;
    public canJump: boolean = false;

    // Override/Resistance state
    private overrideKeyHeld: boolean = false;
    private overrideKeyCode: string = 'ShiftLeft'; // Default to left shift

    // Flower intensity control via scroll wheel
    private targetFlowerIntensity: number = 0.5;
    private onFlowerIntensityChange: ((intensity: number) => void) | null = null;

    // Jump state
    private jumpCount: number = 0;
    private onJump: ((isDoubleJump: boolean) => void) | null = null;

    // Physics
    private velocity: THREE.Vector3 = new THREE.Vector3();
    private direction: THREE.Vector3 = new THREE.Vector3();
    private prevTime: number = performance.now();

    // Configuration
    private config: ControlsConfig = {
        speed: 60.0,
        jumpForce: 15,
        gravity: 9.8 * 3.0,
        friction: 10.0,
        groundHeight: 2.0,
        bobSpeed: 0.012,
        bobAmount: 0.15,
        mouseSensitivity: 0.002,
        maxJumps: 2,
    };

    private isLocked: boolean = false;

    // Bound event handlers for cleanup
    private boundOnKeyDown: (e: KeyboardEvent) => void;
    private boundOnKeyUp: (e: KeyboardEvent) => void;
    private boundOnMouseMove: (e: MouseEvent) => void;
    private boundOnClick: () => void;
    private boundOnPointerLockChange: () => void;
    private boundOnWheel: (e: WheelEvent) => void;

    constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
        this.camera = camera;
        this.domElement = domElement;

        // Bind handlers
        this.boundOnKeyDown = this.onKeyDown.bind(this);
        this.boundOnKeyUp = this.onKeyUp.bind(this);
        this.boundOnMouseMove = this.onMouseMove.bind(this);
        this.boundOnClick = this.onClick.bind(this);
        this.boundOnPointerLockChange = this.onPointerLockChange.bind(this);
        this.boundOnWheel = this.onWheel.bind(this);

        this.bindEvents();
    }

    /**
     * Bind keyboard and mouse events
     */
    private bindEvents(): void {
        document.addEventListener('keydown', this.boundOnKeyDown);
        document.addEventListener('keyup', this.boundOnKeyUp);
        document.addEventListener('mousemove', this.boundOnMouseMove);
        document.addEventListener('click', this.boundOnClick);
        document.addEventListener('pointerlockchange', this.boundOnPointerLockChange);
        document.addEventListener('wheel', this.boundOnWheel, { passive: false });
    }

    private onKeyDown(e: KeyboardEvent): void {
        switch (e.code) {
            case 'KeyW': this.moveForward = true; break;
            case 'KeyA': this.moveLeft = true; break;
            case 'KeyS': this.moveBackward = true; break;
            case 'KeyD': this.moveRight = true; break;
            case 'KeyQ':
                this.adjustFlowerIntensity(-0.1);
                break;
            case 'KeyE':
                this.adjustFlowerIntensity(0.1);
                break;
            case 'Space':
                if (this.canJump || this.jumpCount < this.config.maxJumps) {
                    // Determine if this is a double jump (air jump)
                    const isDoubleJump = !this.canJump && this.jumpCount > 0;

                    // Reset vertical velocity for consistent air jumps
                    if (!this.canJump) {
                        this.velocity.y = 0;
                    }

                    this.velocity.y += this.config.jumpForce;
                    this.canJump = false;
                    this.jumpCount++;

                    // Trigger jump audio callback
                    if (this.onJump) {
                        this.onJump(isDoubleJump);
                    }
                }
                break;
        }
        // Override key (Shift or Space when not jumping)
        if (e.code === this.overrideKeyCode || e.code === 'ShiftRight') {
            this.overrideKeyHeld = true;
        }
    }

    private onKeyUp(e: KeyboardEvent): void {
        switch (e.code) {
            case 'KeyW': this.moveForward = false; break;
            case 'KeyA': this.moveLeft = false; break;
            case 'KeyS': this.moveBackward = false; break;
            case 'KeyD': this.moveRight = false; break;
        }
        // Override key release
        if (e.code === this.overrideKeyCode || e.code === 'ShiftRight') {
            this.overrideKeyHeld = false;
        }
    }

    /**
     * Helper to adjust flower intensity
     */
    private adjustFlowerIntensity(delta: number): void {
        this.targetFlowerIntensity = Math.max(0, Math.min(1, this.targetFlowerIntensity + delta));
        if (this.onFlowerIntensityChange) {
            this.onFlowerIntensityChange(this.targetFlowerIntensity);
        }
    }

    /**
     * Handle scroll wheel for flower intensity control
     */
    private onWheel(e: WheelEvent): void {
        if (!this.isLocked) return;

        e.preventDefault();

        // Scroll up = increase intensity, scroll down = decrease
        const delta = -Math.sign(e.deltaY) * 0.1;
        this.adjustFlowerIntensity(delta);
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.isLocked) return;

        this.camera.rotation.y -= e.movementX * this.config.mouseSensitivity;
        this.camera.rotation.x -= e.movementY * this.config.mouseSensitivity;
        this.camera.rotation.x = Math.max(
            -Math.PI / 2,
            Math.min(Math.PI / 2, this.camera.rotation.x)
        );
    }

    private onClick(): void {
        this.domElement.requestPointerLock();
    }

    private onPointerLockChange(): void {
        this.isLocked = document.pointerLockElement === this.domElement;

        // Toggle UI
        const ui = document.getElementById('ui');
        if (ui) {
            ui.classList.toggle('hidden', this.isLocked);
        }
    }

    /**
     * Update controls and apply movement
     * @param time - Current time in ms
     * @returns Whether player is moving
     */
    update(time: number): boolean {
        const delta = (time - this.prevTime) / 1000;
        this.prevTime = time;

        const { config, velocity, direction, camera } = this;

        // Friction
        velocity.x -= velocity.x * config.friction * delta;
        velocity.z -= velocity.z * config.friction * delta;
        velocity.y -= config.gravity * delta;

        // Direction
        direction.z = Number(this.moveForward) - Number(this.moveBackward);
        direction.x = Number(this.moveRight) - Number(this.moveLeft);
        direction.normalize();

        // Apply movement
        if (this.moveForward || this.moveBackward) {
            velocity.z -= direction.z * config.speed * delta;
        }
        if (this.moveLeft || this.moveRight) {
            velocity.x += direction.x * config.speed * delta;
        }

        camera.translateX(velocity.x * delta);
        camera.translateZ(velocity.z * delta);
        camera.position.y += velocity.y * delta;

        // Ground collision
        if (camera.position.y < config.groundHeight) {
            velocity.y = 0;
            camera.position.y = config.groundHeight;
            this.canJump = true;
            this.jumpCount = 0;
        }

        // Head bob
        const isMoving = this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
        if (isMoving && this.canJump) {
            camera.position.y += Math.sin(time * config.bobSpeed) * config.bobAmount;
        }

        return isMoving;
    }

    /**
     * Get current position for display
     */
    getPosition(): PlayerPosition {
        return {
            x: Math.round(this.camera.position.x),
            z: Math.round(this.camera.position.z),
        };
    }

    /**
     * Cleanup event listeners
     */
    dispose(): void {
        document.removeEventListener('keydown', this.boundOnKeyDown);
        document.removeEventListener('keyup', this.boundOnKeyUp);
        document.removeEventListener('mousemove', this.boundOnMouseMove);
        document.removeEventListener('click', this.boundOnClick);
        document.removeEventListener('pointerlockchange', this.boundOnPointerLockChange);
        document.removeEventListener('wheel', this.boundOnWheel);
    }

    /**
     * Check if override key is currently held
     */
    isOverrideKeyHeld(): boolean {
        return this.overrideKeyHeld;
    }

    /**
     * Get target flower intensity (from scroll wheel)
     */
    getTargetFlowerIntensity(): number {
        return this.targetFlowerIntensity;
    }

    /**
     * Set callback for flower intensity changes
     */
    setOnFlowerIntensityChange(callback: (intensity: number) => void): void {
        this.onFlowerIntensityChange = callback;
    }

    /**
     * Get camera reference for external use (e.g., gaze detection)
     */
    getCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }

    /**
     * Check if pointer is locked (game is active)
     */
    isPointerLocked(): boolean {
        return this.isLocked;
    }

    /**
     * Set callback for jump events
     * @param callback - Called with isDoubleJump boolean
     */
    setOnJump(callback: (isDoubleJump: boolean) => void): void {
        this.onJump = callback;
    }
}
