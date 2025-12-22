// Physics Configuration
// All physics-related constants in one place for easy tuning

import type { ControlsConfig } from '../types';

/**
 * Default player physics configuration
 */
export const PHYSICS_CONFIG: ControlsConfig = {
    speed: 60.0,
    jumpForce: 15,
    gravity: 9.8 * 3.0, // 29.4
    friction: 10.0,
    groundHeight: 2.0,
    bobSpeed: 0.012,
    bobAmount: 0.15,
    mouseSensitivity: 0.002,
    maxJumps: 2,
};

/**
 * Rift-specific physics (used in FORCED_ALIGNMENT room)
 */
export const RIFT_PHYSICS = {
    /** Low gravity for slow falling into rift */
    fallGravity: 5.0,
    /** Height threshold that triggers respawn */
    respawnHeight: -150,
    /** Safe distance from crack center to spawn */
    safeSpawnDistance: 3.5,
    /** Width of the crack (half-width from center) */
    crackHalfWidth: 2,
};

/**
 * Override mechanic timing
 */
export const OVERRIDE_CONFIG = {
    /** Seconds to hold before triggering */
    holdDuration: 3.0,
    /** Pitch threshold (degrees) to count as "looking up" */
    pitchThreshold: 45,
};
