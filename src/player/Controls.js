// 1-bit Chimera Void - Player Controls
import * as THREE from 'three';

/**
 * First-person keyboard + mouse controls
 */
export class Controls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        // Movement state
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.canJump = false;

        // Physics
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.prevTime = performance.now();

        // Configuration
        this.config = {
            speed: 60.0,
            jumpForce: 15,
            gravity: 9.8 * 3.0,
            friction: 10.0,
            groundHeight: 2.0,
            bobSpeed: 0.012,
            bobAmount: 0.15,
            mouseSensitivity: 0.002,
        };

        this.isLocked = false;

        this._bindEvents();
    }

    /**
     * Bind keyboard and mouse events
     * @private
     */
    _bindEvents() {
        document.addEventListener('keydown', this._onKeyDown.bind(this));
        document.addEventListener('keyup', this._onKeyUp.bind(this));
        document.addEventListener('mousemove', this._onMouseMove.bind(this));
        document.addEventListener('click', this._onClick.bind(this));
        document.addEventListener('pointerlockchange', this._onPointerLockChange.bind(this));
    }

    _onKeyDown(e) {
        switch (e.code) {
            case 'KeyW': this.moveForward = true; break;
            case 'KeyA': this.moveLeft = true; break;
            case 'KeyS': this.moveBackward = true; break;
            case 'KeyD': this.moveRight = true; break;
            case 'Space':
                if (this.canJump) {
                    this.velocity.y += this.config.jumpForce;
                    this.canJump = false;
                }
                break;
        }
    }

    _onKeyUp(e) {
        switch (e.code) {
            case 'KeyW': this.moveForward = false; break;
            case 'KeyA': this.moveLeft = false; break;
            case 'KeyS': this.moveBackward = false; break;
            case 'KeyD': this.moveRight = false; break;
        }
    }

    _onMouseMove(e) {
        if (!this.isLocked) return;

        this.camera.rotation.y -= e.movementX * this.config.mouseSensitivity;
        this.camera.rotation.x -= e.movementY * this.config.mouseSensitivity;
        this.camera.rotation.x = Math.max(
            -Math.PI / 2,
            Math.min(Math.PI / 2, this.camera.rotation.x)
        );
    }

    _onClick() {
        this.domElement.requestPointerLock();
    }

    _onPointerLockChange() {
        this.isLocked = document.pointerLockElement === this.domElement;

        // Toggle UI
        const ui = document.getElementById('ui');
        if (ui) {
            ui.classList.toggle('hidden', this.isLocked);
        }
    }

    /**
     * Update controls and apply movement
     * @param {number} time - Current time in ms
     * @returns {boolean} Whether player is moving
     */
    update(time) {
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
     * @returns {{x: number, z: number}}
     */
    getPosition() {
        return {
            x: Math.round(this.camera.position.x),
            z: Math.round(this.camera.position.z),
        };
    }

    /**
     * Cleanup event listeners
     */
    dispose() {
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('click', this._onClick);
        document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    }
}
