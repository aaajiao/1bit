// 1-bit Chimera Void - Gaze Mechanic
// Detects when player looks at the Sky Eye and triggers disciplinary response

import type * as THREE from 'three';
import { GAZE, GAZE_VISUAL } from '../config';

/**
 * Gaze state information
 */
export interface GazeState {
    isGazing: boolean; // Currently looking at sky eye
    gazeIntensity: number; // 0-1, how directly looking (based on pitch)
    gazeDuration: number; // How long currently gazing (seconds)
    totalGazeTime: number; // Total gaze time this session
    gazeEvents: number; // Number of times started gazing
}

/**
 * Gaze mechanic configuration
 */
export interface GazeConfig {
    pitchThreshold: number; // Pitch angle to trigger gaze (radians, ~45°)
    maxPitch: number; // Maximum pitch (looking straight up)
    intensityCurve: number; // How quickly intensity ramps up
}

/** Minimal point shape for the eye position (THREE.Vector3 satisfies it). */
export interface Point3 {
    x: number;
    y: number;
    z: number;
}

/**
 * Direction-attenuation factor for the gaze intensity (flow-audit enhancement
 * #13): the dot product between the camera's forward direction and the unit
 * vector from the camera to the sky eye, clamped to [0,1] — 1 when looking
 * straight at the eye, fading as it leaves the view, hard 0 once the eye is
 * behind the view plane (dot < 0). Discipline only lands while the eye is
 * roughly in frame, so the punishment's attribution is legible.
 *
 * The camera forward is derived analytically for the game's YXZ rotation
 * order with zero roll (the Controls contract). Pure; exported for testing.
 *
 * @param camPos - Camera world position.
 * @param yaw - Camera rotation.y (radians).
 * @param pitch - Camera rotation.x (radians).
 * @param eyePos - Sky-eye world position.
 */
export function gazeDirectionFactor(
    camPos: Point3,
    yaw: number,
    pitch: number,
    eyePos: Point3,
): number {
    const dx = eyePos.x - camPos.x;
    const dy = eyePos.y - camPos.y;
    const dz = eyePos.z - camPos.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6)
        return 1; // degenerate: eye exactly on the camera — no attenuation

    // Forward = R_y(yaw) * R_x(pitch) * (0,0,-1) with roll 0 (YXZ order).
    const cosPitch = Math.cos(pitch);
    const fx = -Math.sin(yaw) * cosPitch;
    const fy = Math.sin(pitch);
    const fz = -Math.cos(yaw) * cosPitch;

    const dot = (fx * dx + fy * dy + fz * dz) / len;
    return dot < 0 ? 0 : Math.min(1, dot);
}

/**
 * Manages gaze detection and response
 */
export class GazeMechanic {
    private camera: THREE.PerspectiveCamera;
    private config: GazeConfig;
    private state: GazeState;
    private wasGazingLastFrame: boolean = false;

    // First-crossing pulse for the 45° threshold marker line (flow-audit
    // enhancement #2): fires once per session, decays over
    // GAZE_VISUAL.PITCH_LINE_PULSE_DURATION seconds.
    private hasCrossedThreshold: boolean = false;
    private thresholdPulse: number = 0;

    // Callbacks for gaze events
    private onGazeStart: (() => void) | null = null;
    private onGazeEnd: (() => void) | null = null;
    private onGazeUpdate: ((intensity: number) => void) | null = null;

    constructor(camera: THREE.PerspectiveCamera) {
        this.camera = camera;

        this.config = {
            pitchThreshold: GAZE.PITCH_THRESHOLD, // 45 degrees (Math.PI / 4)
            maxPitch: GAZE.MAX_PITCH, // 90 degrees (straight up)
            intensityCurve: GAZE.INTENSITY_CURVE, // Quadratic curve
        };

        this.state = {
            isGazing: false,
            gazeIntensity: 0,
            gazeDuration: 0,
            totalGazeTime: 0,
            gazeEvents: 0,
        };
    }

    /**
     * Set callback for when gaze starts
     */
    setOnGazeStart(callback: () => void): void {
        this.onGazeStart = callback;
    }

    /**
     * Set callback for when gaze ends
     */
    setOnGazeEnd(callback: () => void): void {
        this.onGazeEnd = callback;
    }

    /**
     * Set callback for gaze intensity updates
     */
    setOnGazeUpdate(callback: (intensity: number) => void): void {
        this.onGazeUpdate = callback;
    }

    /**
     * Update gaze detection
     * @param delta - Delta time in seconds
     * @param eyePosition - Optional sky-eye world position (flow-audit
     *   enhancement #13). When provided, gazeIntensity is attenuated by the
     *   camera-to-eye direction factor (zero once the eye is behind the view
     *   plane) so discipline only lands while the eye is roughly in frame.
     *   The pitch threshold remains the sole isGazing determinant.
     */
    update(delta: number, eyePosition: Point3 | null = null): GazeState {
        // Get camera pitch (rotation.x in YXZ order)
        // Positive pitch = looking up, negative = looking down
        const pitch = this.camera.rotation.x;

        // Check if looking above threshold (positive pitch = looking up)
        const isGazing = pitch > this.config.pitchThreshold;

        // Calculate intensity (0 at threshold, 1 at max pitch)
        let gazeIntensity = 0;
        if (isGazing) {
            const normalizedPitch = (pitch - this.config.pitchThreshold)
                / (this.config.maxPitch - this.config.pitchThreshold);
            gazeIntensity = Math.min(1, normalizedPitch) ** (1 / this.config.intensityCurve);

            // Direction attenuation (enhancement #13): scale by how directly
            // the camera faces the eye; no eye position => legacy behavior.
            if (eyePosition) {
                gazeIntensity *= gazeDirectionFactor(
                    this.camera.position,
                    this.camera.rotation.y,
                    pitch,
                    eyePosition,
                );
            }
        }

        // Update state
        this.state.isGazing = isGazing;
        this.state.gazeIntensity = gazeIntensity;

        // Decay the first-crossing pulse (before trigger detection, so the
        // frame that crosses the threshold reports the full 1.0 pulse).
        if (this.thresholdPulse > 0) {
            this.thresholdPulse = Math.max(
                0,
                this.thresholdPulse - delta / GAZE_VISUAL.PITCH_LINE_PULSE_DURATION,
            );
        }

        // Track gaze events
        if (isGazing && !this.wasGazingLastFrame) {
            this.state.gazeEvents++;
            this.state.gazeDuration = 0;
            // First time over the 45° threshold this session: short pulse on
            // the threshold marker line.
            if (!this.hasCrossedThreshold) {
                this.hasCrossedThreshold = true;
                this.thresholdPulse = 1.0;
            }
            if (this.onGazeStart) {
                this.onGazeStart();
            }
        }

        if (!isGazing && this.wasGazingLastFrame) {
            if (this.onGazeEnd) {
                this.onGazeEnd();
            }
        }

        // Track duration
        if (isGazing) {
            this.state.gazeDuration += delta;
            this.state.totalGazeTime += delta;
            if (this.onGazeUpdate) {
                this.onGazeUpdate(gazeIntensity);
            }
        }

        this.wasGazingLastFrame = isGazing;

        return this.getState();
    }

    /**
     * Get current gaze state
     */
    getState(): GazeState {
        return { ...this.state };
    }

    /**
     * Get current pitch angle
     */
    getPitch(): number {
        return this.camera.rotation.x;
    }

    /**
     * Check if currently gazing
     */
    isGazing(): boolean {
        return this.state.isGazing;
    }

    /**
     * Get gaze intensity (0-1)
     */
    getIntensity(): number {
        return this.state.gazeIntensity;
    }

    /**
     * Get the first-crossing threshold pulse (1.0 at the moment the 45°
     * threshold is crossed for the first time this session, decaying to 0
     * over GAZE_VISUAL.PITCH_LINE_PULSE_DURATION). Drives the marker-line
     * flash in DitherShader.
     */
    getThresholdPulse(): number {
        return this.thresholdPulse;
    }

    /**
     * Reset gaze statistics
     */
    reset(): void {
        this.state = {
            isGazing: false,
            gazeIntensity: 0,
            gazeDuration: 0,
            totalGazeTime: 0,
            gazeEvents: 0,
        };
        this.wasGazingLastFrame = false;
        this.hasCrossedThreshold = false;
        this.thresholdPulse = 0;
    }

    /**
     * Calculate forced flower intensity based on gaze
     * Returns FLOWER_FORCED_START at the threshold crossing (gaze intensity 0)
     * down to FLOWER_MIN_INTENSITY at full gaze, or 1.0 when not gazing.
     * NOTE: callers should clamp against the player's own target intensity so
     * gaze only ever suppresses the flower (see PlayerManager).
     */
    calculateForcedFlowerIntensity(): number {
        if (!this.state.isGazing) {
            return 1.0; // No forcing when not gazing
        }
        // Intensity forces flower down:
        // 0 intensity = FLOWER_FORCED_START, 1 intensity = FLOWER_MIN_INTENSITY
        return GAZE.FLOWER_MIN_INTENSITY
            + (1 - this.state.gazeIntensity) * (GAZE.FLOWER_FORCED_START - GAZE.FLOWER_MIN_INTENSITY);
    }
}
