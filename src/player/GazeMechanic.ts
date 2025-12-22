// 1-bit Chimera Void - Gaze Mechanic
// Detects when player looks at the Sky Eye and triggers disciplinary response

import * as THREE from 'three';

/**
 * Gaze state information
 */
export interface GazeState {
    isGazing: boolean;          // Currently looking at sky eye
    gazeIntensity: number;      // 0-1, how directly looking (based on pitch)
    gazeDuration: number;       // How long currently gazing (seconds)
    totalGazeTime: number;      // Total gaze time this session
    gazeEvents: number;         // Number of times started gazing
}

/**
 * Gaze mechanic configuration
 */
export interface GazeConfig {
    pitchThreshold: number;     // Pitch angle to trigger gaze (radians, ~45°)
    maxPitch: number;           // Maximum pitch (looking straight up)
    intensityCurve: number;     // How quickly intensity ramps up
}

/**
 * Manages gaze detection and response
 */
export class GazeMechanic {
    private camera: THREE.PerspectiveCamera;
    private config: GazeConfig;
    private state: GazeState;
    private wasGazingLastFrame: boolean = false;

    // Callbacks for gaze events
    private onGazeStart: (() => void) | null = null;
    private onGazeEnd: (() => void) | null = null;
    private onGazeUpdate: ((intensity: number) => void) | null = null;

    constructor(camera: THREE.PerspectiveCamera) {
        this.camera = camera;

        this.config = {
            pitchThreshold: Math.PI / 4,  // 45 degrees
            maxPitch: Math.PI / 2,        // 90 degrees (straight up)
            intensityCurve: 2.0,          // Quadratic curve
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
     */
    update(delta: number): GazeState {
        // Get camera pitch (rotation.x in YXZ order)
        // Positive pitch = looking up, negative = looking down
        const pitch = this.camera.rotation.x;

        // Check if looking above threshold (positive pitch = looking up)
        const isGazing = pitch > this.config.pitchThreshold;

        // Calculate intensity (0 at threshold, 1 at max pitch)
        let gazeIntensity = 0;
        if (isGazing) {
            const normalizedPitch = (pitch - this.config.pitchThreshold) /
                (this.config.maxPitch - this.config.pitchThreshold);
            gazeIntensity = Math.pow(
                Math.min(1, normalizedPitch),
                1 / this.config.intensityCurve
            );
        }

        // Update state
        this.state.isGazing = isGazing;
        this.state.gazeIntensity = gazeIntensity;

        // Track gaze events
        if (isGazing && !this.wasGazingLastFrame) {
            this.state.gazeEvents++;
            this.state.gazeDuration = 0;
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
    }

    /**
     * Calculate forced flower intensity based on gaze
     * Returns value between 0.1 (full gaze) and 1.0 (no gaze)
     */
    calculateForcedFlowerIntensity(): number {
        if (!this.state.isGazing) {
            return 1.0; // No forcing when not gazing
        }
        // Intensity forces flower down: 0 intensity = 0.5 flower, 1 intensity = 0.1 flower
        return 0.1 + (1 - this.state.gazeIntensity) * 0.4;
    }
}
