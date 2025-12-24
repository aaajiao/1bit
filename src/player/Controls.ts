import type { ControlsConfig, PlayerPosition } from '../types';
// 1-bit Chimera Void - Player Controls
import * as THREE from 'three';
import { PHYSICS_CONFIG } from '../config';

/**
 * First-person keyboard + mouse controls
 * Supports both Pointer Lock (desktop) and touch/trackpad fallback (iPad)
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

    // Configuration (imported from config module)
    private config: ControlsConfig = { ...PHYSICS_CONFIG };

    // Dynamic ground level (can be changed per-frame for crack detection)
    private currentGroundLevel: number = 2.0;

    private isLocked: boolean = false;

    // iPad/touch fallback mode
    private useTouchFallback: boolean = false;
    private isActive: boolean = false; // For touch mode: game is active
    private lastPointerX: number = -1; // -1 means not initialized
    private lastPointerY: number = -1;
    private isTouching: boolean = false; // For touch screen drag

    // Bound event handlers (arrow functions for proper 'this' binding)
    private handleKeyDown = (e: KeyboardEvent): void => this.onKeyDown(e);
    private handleKeyUp = (e: KeyboardEvent): void => this.onKeyUp(e);
    private handleMouseMove = (e: MouseEvent): void => this.onMouseMove(e);
    private handleClick = (e: MouseEvent): void => this.onClick(e);
    private handlePointerLockChange = (): void => this.onPointerLockChange();
    private handleWheel = (e: WheelEvent): void => this.onWheel(e);

    // Touch/trackpad event handlers
    private handleTouchStart = (e: TouchEvent): void => this.onTouchStart(e);
    private handleTouchMove = (e: TouchEvent): void => this.onTouchMove(e);
    private handleTouchEnd = (): void => this.onTouchEnd();
    private handlePointerDown = (e: PointerEvent): void => this.onPointerDown(e);
    private handlePointerMove = (e: PointerEvent): void => this.onPointerMove(e);
    private handlePointerUp = (): void => this.onPointerUp();

    constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
        this.camera = camera;
        this.domElement = domElement;

        // Check if Pointer Lock is supported
        this.useTouchFallback = !('requestPointerLock' in document.body);

        this.bindEvents();
    }

    /**
     * Bind keyboard and mouse events
     */
    private bindEvents(): void {
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
        document.addEventListener('wheel', this.handleWheel, { passive: false });

        if (this.useTouchFallback) {
            // iPad/touch mode: use touch and pointer events
            document.addEventListener('touchstart', this.handleTouchStart, { passive: false });
            document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
            document.addEventListener('touchend', this.handleTouchEnd);
            document.addEventListener('pointerdown', this.handlePointerDown);
            document.addEventListener('pointermove', this.handlePointerMove);
            document.addEventListener('pointerup', this.handlePointerUp);
            document.addEventListener('click', this.handleClick);
        }
        else {
            // Desktop mode: use Pointer Lock
            document.addEventListener('mousemove', this.handleMouseMove);
            document.addEventListener('click', this.handleClick);
            document.addEventListener('pointerlockchange', this.handlePointerLockChange);
        }
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
        if (!this.isLocked)
            return;

        e.preventDefault();

        // Scroll up = increase intensity, scroll down = decrease
        const delta = -Math.sign(e.deltaY) * 0.1;
        this.adjustFlowerIntensity(delta);
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.isLocked)
            return;

        this.camera.rotation.y -= e.movementX * this.config.mouseSensitivity;
        this.camera.rotation.x -= e.movementY * this.config.mouseSensitivity;
        this.camera.rotation.x = Math.max(
            -Math.PI / 2,
            Math.min(Math.PI / 2, this.camera.rotation.x),
        );
    }

    private onClick(e?: MouseEvent): void {
        if (this.useTouchFallback) {
            // iPad mode: activate controls and hide UI
            // Note: cursor cannot be hidden on iPadOS (system limitation)
            this.isActive = true;
            this.isLocked = true;

            // Initialize pointer position from click to avoid initial jump
            if (e) {
                this.lastPointerX = e.clientX;
                this.lastPointerY = e.clientY;
            }

            // Hide UI
            const ui = document.getElementById('ui');
            if (ui) {
                ui.classList.add('hidden');
            }
        }
        else {
            // Desktop mode: request pointer lock
            this.domElement.requestPointerLock();
        }
    }

    private onPointerLockChange(): void {
        this.isLocked = document.pointerLockElement === this.domElement;

        // Toggle UI
        const ui = document.getElementById('ui');
        if (ui) {
            ui.classList.toggle('hidden', this.isLocked);
        }
    }

    // ========== Touch/Trackpad handlers for iPad ==========

    private onTouchStart(e: TouchEvent): void {
        if (!this.isActive)
            return;

        // Touch screen: require drag
        if (e.touches.length === 1) {
            this.isTouching = true;
            this.lastPointerX = e.touches[0].clientX;
            this.lastPointerY = e.touches[0].clientY;
        }
    }

    private onTouchMove(e: TouchEvent): void {
        if (!this.isActive || !this.isTouching)
            return;

        if (e.touches.length === 1) {
            e.preventDefault();

            const touch = e.touches[0];
            const deltaX = touch.clientX - this.lastPointerX;
            const deltaY = touch.clientY - this.lastPointerY;

            this.applyLookDelta(deltaX, deltaY);

            this.lastPointerX = touch.clientX;
            this.lastPointerY = touch.clientY;
        }
    }

    private onTouchEnd(): void {
        this.isTouching = false;
    }

    private onPointerDown(e: PointerEvent): void {
        // Initialize position on first pointer interaction
        if (this.lastPointerX < 0) {
            this.lastPointerX = e.clientX;
            this.lastPointerY = e.clientY;
        }
    }

    private onPointerMove(e: PointerEvent): void {
        if (!this.isActive)
            return;

        // Trackpad/mouse: move without clicking (like desktop pointer lock)
        if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
            // Skip if not initialized
            if (this.lastPointerX < 0) {
                this.lastPointerX = e.clientX;
                this.lastPointerY = e.clientY;
                return;
            }

            const deltaX = e.clientX - this.lastPointerX;
            const deltaY = e.clientY - this.lastPointerY;

            this.applyLookDelta(deltaX, deltaY);

            // Edge wrapping: reset position when cursor reaches screen edge
            // This allows continuous rotation without getting stuck
            const margin = 50;
            const w = window.innerWidth;
            const h = window.innerHeight;

            if (e.clientX <= margin || e.clientX >= w - margin ||
                e.clientY <= margin || e.clientY >= h - margin) {
                // Reset to center for next frame
                this.lastPointerX = w / 2;
                this.lastPointerY = h / 2;
            }
            else {
                this.lastPointerX = e.clientX;
                this.lastPointerY = e.clientY;
            }
        }
    }

    private onPointerUp(): void {
        // No-op for trackpad mode
    }

    /**
     * Apply camera rotation from delta movement
     */
    private applyLookDelta(deltaX: number, deltaY: number): void {
        // Use a slightly higher sensitivity for touch
        const sensitivity = this.config.mouseSensitivity * 1.5;

        this.camera.rotation.y -= deltaX * sensitivity;
        this.camera.rotation.x -= deltaY * sensitivity;
        this.camera.rotation.x = Math.max(
            -Math.PI / 2,
            Math.min(Math.PI / 2, this.camera.rotation.x),
        );
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

        // Ground collision - use dynamic ground level
        if (camera.position.y < this.currentGroundLevel) {
            velocity.y = 0;
            camera.position.y = this.currentGroundLevel;
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
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
        document.removeEventListener('wheel', this.handleWheel);
        document.removeEventListener('click', this.handleClick);

        if (this.useTouchFallback) {
            // Touch mode cleanup
            document.removeEventListener('touchstart', this.handleTouchStart);
            document.removeEventListener('touchmove', this.handleTouchMove);
            document.removeEventListener('touchend', this.handleTouchEnd);
            document.removeEventListener('pointerdown', this.handlePointerDown);
            document.removeEventListener('pointermove', this.handlePointerMove);
            document.removeEventListener('pointerup', this.handlePointerUp);
        }
        else {
            // Desktop mode cleanup
            document.removeEventListener('mousemove', this.handleMouseMove);
            document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
        }
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

    /**
     * Set dynamic ground level for crack detection
     * @param y - Ground height (use negative for abyss)
     */
    setGroundLevel(y: number): void {
        this.currentGroundLevel = y;
    }

    /**
     * Get current ground level
     */
    getGroundLevel(): number {
        return this.currentGroundLevel;
    }

    /**
     * Teleport player to specific position and reset velocity
     */
    teleport(position: { x?: number; y?: number; z?: number }): void {
        if (position.x !== undefined)
            this.camera.position.x = position.x;
        if (position.y !== undefined)
            this.camera.position.y = position.y;
        if (position.z !== undefined)
            this.camera.position.z = position.z;

        this.velocity.set(0, 0, 0);
    }

    /**
     * Set gravity dynamically
     * @param g - New gravity value
     */
    setGravity(g: number): void {
        this.config.gravity = g;
    }
}
