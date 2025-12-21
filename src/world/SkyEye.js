// 1-bit Chimera Void - Sky Eye System
import * as THREE from 'three';

/**
 * Giant eye floating in the sky, tracks player, blinks randomly
 */
export class SkyEye {
    constructor(scene) {
        this.group = new THREE.Group();
        this.pupil = null;
        this.isBlinking = false;

        this._createGeometry();

        // Position high in the sky, facing down
        this.group.position.set(0, 120, 0);
        this.group.rotation.x = -Math.PI / 2;
        this.group.renderOrder = 999;

        scene.add(this.group);
    }

    /**
     * Create the eye geometry
     * @private
     */
    _createGeometry() {
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
            fog: false,  // Not affected by scene fog
        });

        // Eye rings
        for (let i = 1; i <= 5; i++) {
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(i * 8, i * 8 + 1, 64),
                mat
            );
            ring.userData = { speed: (Math.random() - 0.5) * 0.3 };
            this.group.add(ring);
        }

        // Pupil
        this.pupil = new THREE.Mesh(
            new THREE.CircleGeometry(5, 32),
            mat
        );
        this.group.add(this.pupil);
    }

    /**
     * Update eye animation
     * @param {number} delta - Delta time
     * @param {THREE.Vector3} playerPosition - Camera/player position
     * @param {AudioSystem} audio - Audio system for blink sound
     */
    update(delta, playerPosition, audio) {
        // Pupil tracking
        if (this.pupil) {
            const eyePos = this.group.position;
            const dx = playerPosition.x - eyePos.x;
            const dz = playerPosition.z - eyePos.z;

            const maxOffset = 3;
            const targetX = Math.max(-maxOffset, Math.min(maxOffset, dx * 0.02));
            const targetY = Math.max(-maxOffset, Math.min(maxOffset, dz * 0.02));

            this.pupil.position.lerp(new THREE.Vector3(targetX, targetY, 0.1), 0.05);
        }

        // Random blinking
        if (!this.isBlinking && Math.random() > 0.999) {
            this.triggerBlink(audio);
        }

        // Ring rotation
        this.group.children.forEach(ring => {
            if (ring.userData.speed) {
                ring.rotation.z += ring.userData.speed * delta;
                ring.rotation.x += ring.userData.speed * 0.5 * delta;
            }
        });
    }

    /**
     * Trigger blink animation
     * @param {AudioSystem} audio - Audio system for sound
     */
    triggerBlink(audio) {
        if (this.isBlinking) return;

        this.isBlinking = true;
        const originalScaleY = this.group.scale.y;

        // Play sound
        if (audio) audio.playEyeBlink();

        // Close eye
        setTimeout(() => {
            this.group.scale.y = 0.05;
        }, 0);

        // Open eye
        setTimeout(() => {
            this.group.scale.y = originalScaleY;
            this.isBlinking = false;
        }, 150);
    }
}
