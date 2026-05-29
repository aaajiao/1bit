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

// NOTE: The former OVERRIDE_CONFIG (holdDuration=3.0, pitchThreshold=45) was
// removed. The single source of truth for override-hold timing is now
// OVERRIDE.HOLD_THRESHOLD (1.0s) and OVERRIDE.* in config/constants.ts,
// which is the value actually consumed by player/OverrideMechanic.ts.
