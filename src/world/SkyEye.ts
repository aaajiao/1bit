import type { AudioSystemInterface } from '../types';
// 1-bit Chimera Void - Sky Eye System
import * as THREE from 'three';
import { removeAndDispose } from '../utils/dispose';

interface RingUserData {
    speed?: number;
}

/**
 * Giant eye floating in the sky, tracks player, blinks randomly
 */
export class SkyEye {
    private group: THREE.Group = new THREE.Group();
    private pupil: THREE.Mesh | null = null;
    private isBlinking: boolean = false;
    private blinkTimer: number = 0;
    private blinkPhase: 'none' | 'closing' | 'opening' = 'none';
    private preBlinkScaleY: number = 1;
    private _targetVec = new THREE.Vector3();

    constructor(scene: THREE.Scene) {
        this.createGeometry();

        // Position high in the sky, facing down
        this.group.position.set(0, 120, 0);
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
        // Pupil tracking
        if (this.pupil) {
            const eyePos = this.group.position;
            const dx = playerPosition.x - eyePos.x;
            const dz = playerPosition.z - eyePos.z;

            const maxOffset = 3;
            const targetX = Math.max(-maxOffset, Math.min(maxOffset, dx * 0.02));
            const targetY = Math.max(-maxOffset, Math.min(maxOffset, dz * 0.02));

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
        removeAndDispose(this.group);
    }
}
