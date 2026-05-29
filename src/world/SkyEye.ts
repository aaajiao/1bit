import type { AudioSystemInterface } from '../types';
// 1-bit Chimera Void - Sky Eye System
import * as THREE from 'three';
import { removeAndDispose } from '../utils/dispose';

interface RingUserData {
    speed?: number;
}

/** Height of the eye above the ground plane. */
export const SKY_EYE_HEIGHT = 120;
/** Max horizontal distance the eye may trail behind the player before being leashed. */
export const SKY_EYE_MAX_LAG = 60;
/** Per-frame easing factor for the damped follow. */
export const SKY_EYE_FOLLOW_LERP = 0.02;
/** How strongly the residual player offset deflects the pupil. */
export const SKY_EYE_PUPIL_GAIN = 0.1;

/**
 * Damped horizontal follow with a hard leash. Eases the eye toward the player,
 * then clamps so it never trails farther than `maxLag` — keeping the eye in view
 * across the infinite world while leaving a residual offset for the pupil to
 * track. Mutates `target` in place (no per-frame allocation). Pure; exported for
 * testing.
 */
export function stepEyeFollow(
    target: { x: number; z: number },
    playerX: number,
    playerZ: number,
    lerp: number = SKY_EYE_FOLLOW_LERP,
    maxLag: number = SKY_EYE_MAX_LAG,
): void {
    target.x += (playerX - target.x) * lerp;
    target.z += (playerZ - target.z) * lerp;
    const lagX = target.x - playerX;
    const lagZ = target.z - playerZ;
    const lag = Math.hypot(lagX, lagZ);
    if (lag > maxLag) {
        const k = maxLag / lag;
        target.x = playerX + lagX * k;
        target.z = playerZ + lagZ * k;
    }
}

/**
 * Giant eye floating in the sky, follows the player, blinks randomly
 */
export class SkyEye {
    private group: THREE.Group = new THREE.Group();
    private pupil: THREE.Mesh | null = null;
    private isBlinking: boolean = false;
    private blinkTimer: number = 0;
    private blinkPhase: 'none' | 'closing' | 'opening' = 'none';
    private preBlinkScaleY: number = 1;
    private _targetVec = new THREE.Vector3();
    private sharedMaterial: THREE.MeshBasicMaterial | null = null;

    constructor(scene: THREE.Scene) {
        this.createGeometry();

        // Position high in the sky, facing down
        this.group.position.set(0, SKY_EYE_HEIGHT, 0);
        this.group.rotation.x = -Math.PI / 2;
        this.group.renderOrder = 999;

        scene.add(this.group);
    }

    /**
     * Create the eye geometry
     */
    private createGeometry(): void {
        const mat = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
            fog: false, // Not affected by scene fog
        });
        // Single material shared across all 6 meshes; disposed once in dispose()
        this.sharedMaterial = mat;

        // Eye rings
        for (let i = 1; i <= 5; i++) {
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(i * 8, i * 8 + 1, 64),
                mat,
            );
            (ring.userData as RingUserData) = { speed: (Math.random() - 0.5) * 0.3 };
            this.group.add(ring);
        }

        // Pupil
        this.pupil = new THREE.Mesh(
            new THREE.CircleGeometry(5, 32),
            mat,
        );
        this.group.add(this.pupil);
    }

    /**
     * Update eye animation
     * @param delta - Delta time
     * @param playerPosition - Camera/player position
     * @param audio - Audio system for blink sound
     */
    update(delta: number, playerPosition: THREE.Vector3, audio: AudioSystemInterface): void {
        const eyePos = this.group.position;

        // Damped follow: keep the eye overhead as the player explores the infinite
        // world, but never let it trail farther than SKY_EYE_MAX_LAG so it stays in
        // view. The residual (player - eye) offset is what the pupil tracks below.
        stepEyeFollow(eyePos, playerPosition.x, playerPosition.z);
        eyePos.y = SKY_EYE_HEIGHT;

        // Pupil tracking — follows the residual horizontal offset toward the player
        if (this.pupil) {
            const dx = playerPosition.x - eyePos.x;
            const dz = playerPosition.z - eyePos.z;

            const maxOffset = 3;
            const targetX = Math.max(-maxOffset, Math.min(maxOffset, dx * SKY_EYE_PUPIL_GAIN));
            const targetY = Math.max(-maxOffset, Math.min(maxOffset, dz * SKY_EYE_PUPIL_GAIN));

            this.pupil.position.lerp(this._targetVec.set(targetX, targetY, 0.1), 0.05);
        }

        // Random blinking
        if (!this.isBlinking && Math.random() > 0.999) {
            this.triggerBlink(audio);
        }

        this.updateBlink(delta);

        // Ring rotation
        this.group.children.forEach((ring) => {
            const userData = ring.userData as RingUserData;
            if (userData.speed) {
                ring.rotation.z += userData.speed * delta;
                ring.rotation.x += userData.speed * 0.5 * delta;
            }
        });
    }

    /**
     * Trigger blink animation
     * @param audio - Audio system for sound
     */
    triggerBlink(audio: AudioSystemInterface): void {
        if (this.isBlinking)
            return;

        this.isBlinking = true;
        this.blinkPhase = 'closing';
        this.blinkTimer = 0;
        this.preBlinkScaleY = this.group.scale.y;

        if (audio)
            audio.playEyeBlink();
    }

    private updateBlink(delta: number): void {
        if (this.blinkPhase === 'closing') {
            this.group.scale.y = 0.05;
            this.blinkPhase = 'opening';
            this.blinkTimer = 0;
        }
        else if (this.blinkPhase === 'opening') {
            this.blinkTimer += delta;
            if (this.blinkTimer >= 0.15) {
                this.group.scale.y = this.preBlinkScaleY;
                this.blinkPhase = 'none';
                this.isBlinking = false;
            }
        }
    }

    /**
     * Cleanup resources
     */
    dispose(): void {
        this.blinkPhase = 'none';
        this.isBlinking = false;
        // The material is shared by all 6 meshes; dispose geometries only here,
        // then dispose the shared material exactly once to keep dispose idempotent.
        removeAndDispose(this.group, false, false);
        if (this.sharedMaterial) {
            this.sharedMaterial.dispose();
            this.sharedMaterial = null;
        }
    }
}
