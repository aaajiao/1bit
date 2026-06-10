import type { AudioSystemInterface } from '../types';
// 1-bit Chimera Void - Sky Eye System
import * as THREE from 'three';
import { SKY_EYE_AWARENESS } from '../config';
import { removeAndDispose } from '../utils/dispose';
import { hash } from '../utils/hash';

interface RingUserData {
    speed?: number;
}

/** Constant salt for deterministic per-ring spin seeding (see createGeometry). */
const RING_SPIN_SALT = 7;

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
 * Per-frame awareness response of the eye to the player's state (flow-audit
 * break #4). All fields are effective values derived from the SkyEye base
 * constants and the SKY_EYE_AWARENESS config gains.
 */
export interface EyeAwareness {
    /** Effective follow lerp (tighter when the flower is bright) */
    followLerp: number;
    /** Effective leash distance (shorter when the flower is bright) */
    maxLag: number;
    /** Effective pupil tracking gain (stronger when the flower is bright) */
    pupilGain: number;
    /** Blink rate in blinks/second (raised by flower, suppressed by gaze) */
    blinkRate: number;
    /** Pupil scale (dilates while being gazed at — the stare-back) */
    pupilScale: number;
    /** Fraction of the pupil offset pulled to center while gazed at (0-1) */
    pupilCenterPull: number;
    /** Ring spin speed multiplier (accelerates while being gazed at) */
    ringSpeedMult: number;
}

/**
 * Derives the eye's awareness response from the player's flower intensity and
 * gaze intensity. A bright flower attracts the eye (tighter follow, stronger
 * pupil tracking, more blinking); being gazed at provokes a confrontational
 * stare-back (dilated centered pupil, suppressed blinking, faster rings).
 * Inputs are clamped to [0,1]. Mutates `out` in place (no per-frame
 * allocation). Pure; exported for testing.
 */
export function computeEyeAwareness(
    flowerIntensity: number,
    gazeIntensity: number,
    out: EyeAwareness,
): EyeAwareness {
    const f = Math.max(0, Math.min(1, flowerIntensity));
    const g = Math.max(0, Math.min(1, gazeIntensity));
    const a = SKY_EYE_AWARENESS;
    out.followLerp = SKY_EYE_FOLLOW_LERP * (1 + f * a.FOLLOW_LERP_FLOWER_GAIN);
    out.maxLag = SKY_EYE_MAX_LAG * (1 - f * a.MAX_LAG_FLOWER_SHRINK);
    out.pupilGain = SKY_EYE_PUPIL_GAIN * (1 + f * a.PUPIL_GAIN_FLOWER_GAIN);
    // Gaze fully suppresses blinking at intensity 1 — an unblinking stare-back.
    out.blinkRate = (a.BLINK_RATE_BASE + f * a.BLINK_RATE_FLOWER_GAIN) * (1 - g);
    out.pupilScale = 1 + g * a.PUPIL_DILATE_GAZE;
    out.pupilCenterPull = g;
    out.ringSpeedMult = 1 + g * (a.RING_SPEED_GAZE_MULT - 1);
    return out;
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
    // Reused awareness scratch (mutated by computeEyeAwareness; no per-frame alloc).
    private _awareness: EyeAwareness = {
        followLerp: SKY_EYE_FOLLOW_LERP,
        maxLag: SKY_EYE_MAX_LAG,
        pupilGain: SKY_EYE_PUPIL_GAIN,
        blinkRate: SKY_EYE_AWARENESS.BLINK_RATE_BASE,
        pupilScale: 1,
        pupilCenterPull: 0,
        ringSpeedMult: 1,
    };

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
            // Deterministic per-ring spin: hash() seeded by the fixed ring index
            // (and a constant salt) keeps each ring's speed stable across sessions
            // while preserving the original [-0.15, 0.15) range.
            (ring.userData as RingUserData) = { speed: (hash(i, RING_SPIN_SALT) - 0.5) * 0.3 };
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
     * @param flowerIntensity - 0-1 player flower intensity (bright = noticed)
     * @param gazeIntensity - 0-1 smoothed gaze intensity (stare-back response)
     */
    update(
        delta: number,
        playerPosition: THREE.Vector3,
        audio: AudioSystemInterface,
        flowerIntensity: number = 0,
        gazeIntensity: number = 0,
    ): void {
        const eyePos = this.group.position;

        // Awareness response (flow-audit break #4): a bright flower attracts the
        // eye; being gazed at provokes a stare-back. Neutral inputs (0, 0)
        // reproduce the original base constants exactly.
        const aw = computeEyeAwareness(flowerIntensity, gazeIntensity, this._awareness);

        // Damped follow: keep the eye overhead as the player explores the infinite
        // world, but never let it trail farther than the (awareness-tightened)
        // leash so it stays in view. The residual (player - eye) offset is what
        // the pupil tracks below.
        stepEyeFollow(eyePos, playerPosition.x, playerPosition.z, aw.followLerp, aw.maxLag);
        eyePos.y = SKY_EYE_HEIGHT;

        // Pupil tracking — follows the residual horizontal offset toward the
        // player; while being gazed at it pulls to center and dilates instead
        // (the eye stops scanning and looks straight back).
        if (this.pupil) {
            const dx = playerPosition.x - eyePos.x;
            const dz = playerPosition.z - eyePos.z;

            const maxOffset = 3;
            const track = 1 - aw.pupilCenterPull;
            const targetX = Math.max(-maxOffset, Math.min(maxOffset, dx * aw.pupilGain)) * track;
            const targetY = Math.max(-maxOffset, Math.min(maxOffset, dz * aw.pupilGain)) * track;

            this.pupil.position.lerp(this._targetVec.set(targetX, targetY, 0.1), 0.05);
            this.pupil.scale.setScalar(aw.pupilScale);
        }

        // Random blinking: blinkRate is blinks/SECOND, scaled by delta so the
        // cadence is frame-rate independent (~the old 0.001/frame at 60fps when
        // neutral); a bright flower blinks more, a direct gaze suppresses it.
        if (!this.isBlinking && Math.random() < aw.blinkRate * delta) {
            this.triggerBlink(audio);
        }

        this.updateBlink(delta);

        // Ring rotation (spins up while being gazed at)
        this.group.children.forEach((ring) => {
            const userData = ring.userData as RingUserData;
            if (userData.speed) {
                ring.rotation.z += userData.speed * aw.ringSpeedMult * delta;
                ring.rotation.x += userData.speed * 0.5 * aw.ringSpeedMult * delta;
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
