import type { ControlsConfig, PlayerPosition } from '../types';
// 1-bit Chimera Void - Player Controls
import * as THREE from 'three';
import { INPUT, PHYSICS_CONFIG } from '../config';

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

    // Touch fallback mode (Android/iPad — flow-audit break #9)
    private useTouchFallback: boolean = false;
    private pointerLockSupported: boolean = false;
    private hasTouch: boolean = false;
    private isActive: boolean = false; // For touch mode: game is active
    private lastPointerX: number = -1; // -1 means not initialized
    private lastPointerY: number = -1;

    // Dual-zone touch input: a left-half drag is a virtual joystick (movement),
    // a right-half drag is look. Touches are tracked by identifier so both
    // zones work simultaneously (flow-audit break #9: iPad could look but
    // never move).
    private moveTouchId: number | null = null;
    private lookTouchId: number | null = null;
    private moveTouchOriginX: number = 0;
    private moveTouchOriginY: number = 0;
    private touchMoveX: number = 0; // analog strafe in [-1, 1]
    private touchMoveZ: number = 0; // analog forward in [-1, 1]

    // Minimal flower-intensity entry for touch devices (+/- buttons).
    private flowerButtons: HTMLElement | null = null;

    // Bound event handlers (arrow functions for proper 'this' binding)
    private handleKeyDown = (e: KeyboardEvent): void => this.onKeyDown(e);
    private handleKeyUp = (e: KeyboardEvent): void => this.onKeyUp(e);
    private handleMouseMove = (e: MouseEvent): void => this.onMouseMove(e);
    private handleClick = (e: MouseEvent): void => this.onClick(e);
    private handlePointerLockChange = (): void => this.onPointerLockChange();
    private handleWheel = (e: WheelEvent): void => this.onWheel(e);
    // Reset held keys when the window loses focus / becomes hidden, so keys
    // don't stick after focus loss (M2).
    private handleBlur = (): void => this.resetInputState();
    private handleVisibilityChange = (): void => {
        if (document.hidden) {
            this.resetInputState();
        }
    };

    // Touch/trackpad event handlers
    private handleTouchStart = (e: TouchEvent): void => this.onTouchStart(e);
    private handleTouchMove = (e: TouchEvent): void => this.onTouchMove(e);
    private handleTouchEnd = (e: TouchEvent): void => this.onTouchEnd(e);
    private handlePointerDown = (e: PointerEvent): void => this.onPointerDown(e);
    private handlePointerMove = (e: PointerEvent): void => this.onPointerMove(e);
    private handlePointerUp = (): void => this.onPointerUp();

    constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
        this.camera = camera;
        this.domElement = domElement;

        // Touch-device detection (flow-audit break #9): a coarse PRIMARY
        // pointer is the reliable signal. Android Chrome exposes
        // requestPointerLock but the call is a silent no-op there, so the old
        // capability sniff (`'requestPointerLock' in document.body`) routed
        // Android to a permanently-paused desktop path. Touch-screen laptops
        // (fine primary pointer) keep the desktop pointer-lock path.
        this.pointerLockSupported = 'requestPointerLock' in document.body;
        const coarsePrimary = typeof window.matchMedia === 'function'
            && window.matchMedia('(pointer: coarse)').matches;
        this.useTouchFallback = coarsePrimary || !this.pointerLockSupported;
        this.hasTouch = 'ontouchstart' in window
            || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);

        this.bindEvents();
        this.setupStartScreen();
    }

    /**
     * Bind keyboard and mouse events
     */
    private bindEvents(): void {
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
        document.addEventListener('wheel', this.handleWheel, { passive: false });
        // Reset held keys on focus loss / tab hide so movement doesn't stick (M2)
        window.addEventListener('blur', this.handleBlur);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);

        if (this.useTouchFallback) {
            // Touch mode (Android/iPad): use touch and pointer events
            document.addEventListener('touchstart', this.handleTouchStart, { passive: false });
            document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
            document.addEventListener('touchend', this.handleTouchEnd);
            document.addEventListener('touchcancel', this.handleTouchEnd);
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

    /**
     * Match the start screen to the input device (flow-audit break #9):
     * swap the keyboard instructions for touch ones in touch-fallback mode,
     * surface an explicit "keyboard & mouse required" warning when neither
     * pointer lock nor touch exists (no more dead "click to enter" entries),
     * and create the touch flower-intensity buttons.
     */
    private setupStartScreen(): void {
        document.getElementById('controls-desktop')
            ?.classList
            .toggle('hidden', this.useTouchFallback);
        document.getElementById('controls-touch')
            ?.classList
            .toggle('hidden', !this.useTouchFallback);

        if (!this.pointerLockSupported && !this.hasTouch) {
            document.getElementById('input-warning')?.classList.remove('hidden');
        }

        if (this.useTouchFallback) {
            this.createFlowerButtons();
        }
    }

    /**
     * Minimal flower-intensity entry for touch devices: two small +/- buttons
     * bottom-right (the wheel/Q-E equivalents). Hidden until the game starts.
     */
    private createFlowerButtons(): void {
        const container = document.createElement('div');
        container.id = 'touch-flower-controls';
        container.classList.add('hidden');

        const makeButton = (label: string, step: number): void => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            const onPress = (e: Event): void => {
                // Keep button taps out of the drag/look/start handlers.
                e.stopPropagation();
                e.preventDefault();
                this.adjustFlowerIntensity(step);
            };
            // preventDefault in touchstart suppresses the synthetic click, so
            // touch devices fire once; mouse-driven taps use the click path.
            btn.addEventListener('touchstart', onPress, { passive: false });
            btn.addEventListener('click', onPress);
            container.appendChild(btn);
        };

        makeButton('−', -INPUT.FLOWER_STEP);
        makeButton('+', INPUT.FLOWER_STEP);

        document.body.appendChild(container);
        this.flowerButtons = container;
    }

    /**
     * Reset all movement flags and the override key state.
     * Used by the isLocked guards and the blur/visibilitychange handlers (H3, M2).
     */
    private resetInputState(): void {
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.overrideKeyHeld = false;
        // Release the touch joystick/look drags too (focus loss mid-drag).
        this.moveTouchId = null;
        this.lookTouchId = null;
        this.touchMoveX = 0;
        this.touchMoveZ = 0;
    }

    private onKeyDown(e: KeyboardEvent): void {
        // Ignore input while the game is behind the start/pause menu so WASD/
        // Space/Q-E/Shift don't act when the pointer isn't locked (H3).
        if (!this.isLocked) {
            this.resetInputState();
            return;
        }

        switch (e.code) {
            case 'KeyW': this.moveForward = true; break;
            case 'KeyA': this.moveLeft = true; break;
            case 'KeyS': this.moveBackward = true; break;
            case 'KeyD': this.moveRight = true; break;
            case 'KeyQ':
                this.adjustFlowerIntensity(-INPUT.FLOWER_STEP);
                break;
            case 'KeyE':
                this.adjustFlowerIntensity(INPUT.FLOWER_STEP);
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
        // Ignore input while the game is behind the start/pause menu and clear
        // any movement that may have been latched (H3).
        if (!this.isLocked) {
            this.resetInputState();
            return;
        }

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
        const delta = -Math.sign(e.deltaY) * INPUT.FLOWER_STEP;
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
            // Touch mode: activate controls and hide UI
            // Note: cursor cannot be hidden on iPadOS (system limitation)
            this.isActive = true;
            this.isLocked = true;

            // Initialize pointer position from click to avoid initial jump
            if (e) {
                this.lastPointerX = e.clientX;
                this.lastPointerY = e.clientY;
            }

            // Hide UI, reveal the touch flower controls
            const ui = document.getElementById('ui');
            if (ui) {
                ui.classList.add('hidden');
            }
            this.flowerButtons?.classList.remove('hidden');
        }
        else {
            // Desktop mode: request pointer lock (with rejection retry)
            this.requestPointerLockSafe(true);
        }
    }

    /**
     * Request pointer lock, swallowing the rejection that browsers raise
     * during the ~1.25s post-ESC cooldown (flow-audit medium #15). When
     * `retry` is set, re-request once after the cooldown window — the click's
     * transient user activation (~5s) still covers the retry.
     */
    private requestPointerLockSafe(retry: boolean): void {
        let result: Promise<void> | undefined;
        try {
            // Some engines return void rather than a promise — hence the cast.
            result = this.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
        }
        catch {
            result = undefined;
        }
        if (result && typeof result.catch === 'function') {
            result.catch(() => {
                if (retry) {
                    window.setTimeout(() => {
                        if (!this.isLocked) {
                            this.requestPointerLockSafe(false);
                        }
                    }, INPUT.POINTER_LOCK_RETRY_MS);
                }
            });
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

    // ========== Dual-zone touch handlers (flow-audit break #9) ==========
    // Left half-screen drag = virtual joystick (movement); right half-screen
    // drag = look. One touch per zone, tracked by identifier.

    private onTouchStart(e: TouchEvent): void {
        if (!this.isActive)
            return;

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const isLeftHalf = touch.clientX < window.innerWidth / 2;
            if (isLeftHalf && this.moveTouchId === null) {
                this.moveTouchId = touch.identifier;
                this.moveTouchOriginX = touch.clientX;
                this.moveTouchOriginY = touch.clientY;
            }
            else if (!isLeftHalf && this.lookTouchId === null) {
                this.lookTouchId = touch.identifier;
                this.lastPointerX = touch.clientX;
                this.lastPointerY = touch.clientY;
            }
        }
    }

    private onTouchMove(e: TouchEvent): void {
        if (!this.isActive)
            return;
        e.preventDefault();

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === this.moveTouchId) {
                // Virtual joystick: offset from the drag origin maps to analog
                // movement axes, clamped at the joystick radius.
                const radius = INPUT.TOUCH_JOYSTICK_RADIUS_PX;
                this.touchMoveX = THREE.MathUtils.clamp(
                    (touch.clientX - this.moveTouchOriginX) / radius,
                    -1,
                    1,
                );
                // Dragging UP (clientY decreasing) moves forward.
                this.touchMoveZ = THREE.MathUtils.clamp(
                    (this.moveTouchOriginY - touch.clientY) / radius,
                    -1,
                    1,
                );
            }
            else if (touch.identifier === this.lookTouchId) {
                this.applyLookDelta(
                    touch.clientX - this.lastPointerX,
                    touch.clientY - this.lastPointerY,
                );
                this.lastPointerX = touch.clientX;
                this.lastPointerY = touch.clientY;
            }
        }
    }

    private onTouchEnd(e: TouchEvent): void {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === this.moveTouchId) {
                this.moveTouchId = null;
                this.touchMoveX = 0;
                this.touchMoveZ = 0;
            }
            else if (touch.identifier === this.lookTouchId) {
                this.lookTouchId = null;
            }
        }
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

            this.lastPointerX = e.clientX;
            this.lastPointerY = e.clientY;
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
        const sensitivity = this.config.mouseSensitivity * INPUT.TOUCH_LOOK_SENSITIVITY_MULT;

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
        // Clamp delta to avoid huge physics steps after a tab/focus stall (M1).
        const delta = Math.min((time - this.prevTime) / 1000, 0.1);
        this.prevTime = time;

        const { config, velocity, direction, camera } = this;

        // Friction
        velocity.x -= velocity.x * config.friction * delta;
        velocity.z -= velocity.z * config.friction * delta;
        velocity.y -= config.gravity * delta;

        // Don't apply movement input while behind the start/pause menu (H3).
        // Friction/gravity/ground collision still run so physics stays stable.
        const movementEnabled = this.isLocked;

        // Direction: digital keyboard axes plus the analog touch joystick
        // (flow-audit break #9). Normalize only above unit length so keyboard
        // diagonals behave as before while gentle joystick deflections keep
        // their analog magnitude.
        direction.z = movementEnabled
            ? Number(this.moveForward) - Number(this.moveBackward) + this.touchMoveZ
            : 0;
        direction.x = movementEnabled
            ? Number(this.moveRight) - Number(this.moveLeft) + this.touchMoveX
            : 0;
        if (direction.lengthSq() > 1) {
            direction.normalize();
        }

        // Apply movement
        if (movementEnabled && direction.z !== 0) {
            velocity.z -= direction.z * config.speed * delta;
        }
        if (movementEnabled && direction.x !== 0) {
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
        const isMoving = movementEnabled
            && (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight
                || this.touchMoveX !== 0 || this.touchMoveZ !== 0);
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
        window.removeEventListener('blur', this.handleBlur);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);

        if (this.useTouchFallback) {
            // Touch mode cleanup
            document.removeEventListener('touchstart', this.handleTouchStart);
            document.removeEventListener('touchmove', this.handleTouchMove);
            document.removeEventListener('touchend', this.handleTouchEnd);
            document.removeEventListener('touchcancel', this.handleTouchEnd);
            document.removeEventListener('pointerdown', this.handlePointerDown);
            document.removeEventListener('pointermove', this.handlePointerMove);
            document.removeEventListener('pointerup', this.handlePointerUp);
            // Remove the touch flower buttons (their listeners go with them).
            this.flowerButtons?.remove();
            this.flowerButtons = null;
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
