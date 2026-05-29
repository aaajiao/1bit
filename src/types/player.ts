// Player-related types (Controls, Hands, etc.)
import type * as THREE from 'three';

// ===== Controls =====

export interface ControlsConfig {
    speed: number;
    jumpForce: number;
    gravity: number;
    friction: number;
    groundHeight: number;
    bobSpeed: number;
    bobAmount: number;
    mouseSensitivity: number;
    maxJumps: number;
}

export interface PlayerPosition {
    x: number;
    z: number;
}

/**
 * Display-oriented [SHIFT]-resistance hint shown on the HUD.
 * Derived by main from OverrideMechanic.OverrideHint (shouldShow -> visible,
 * plus the resolved hint text). Kept as a small display contract so the HUD
 * stays decoupled from the mechanic's internal state.
 */
export interface OverrideHintDisplay {
    text: string;
    visible: boolean;
}

// ===== Finger & Hand Model =====

export interface FingerStructure {
    root: THREE.Group;
    s1: THREE.Mesh | THREE.Group;
    s2: THREE.Group;
    s3: THREE.Group;
    length?: number;
}

export interface ThumbStructure {
    root: THREE.Group;
    s1: THREE.Group;
    s2: THREE.Group;
}
