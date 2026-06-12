// World-related types (Chunks, Cables, Weather, etc.)
import type * as THREE from 'three';

// ===== Day/Night System =====

import type { RoomType } from '../world/RoomConfig';
import type { AudioSystemInterface } from './audio';

// ===== Building & Generation =====

export interface BuildingParams {
    i: number;
    cx: number;
    cz: number;
    assets: SharedAssets;
    roomType?: RoomType;
}

export interface SharedAssets {
    // Materials
    matSolid: THREE.MeshLambertMaterial;
    matDark: THREE.MeshLambertMaterial;
    matWire: THREE.MeshBasicMaterial;
    matPlasma: THREE.MeshLambertMaterial;
    matTreeBark: THREE.MeshLambertMaterial;
    matFlowerStem: THREE.MeshLambertMaterial;
    matFlowerPetal: THREE.MeshPhongMaterial;
    matFlowerCore: THREE.MeshStandardMaterial;
    matLiquid: THREE.MeshPhongMaterial;
    // Phase 4 sub-palette tints (shared greyscale Lambert singletons)
    subTints: THREE.MeshLambertMaterial[];
    // Geometries
    boxGeo: THREE.BoxGeometry;
    blobGeo: THREE.IcosahedronGeometry;
    sphereGeo: THREE.SphereGeometry;
    knotGeo: THREE.TorusKnotGeometry;
    coneGeo: THREE.ConeGeometry;
    tetraGeo: THREE.TetrahedronGeometry;
    cylinderGeo: THREE.CylinderGeometry;
    // Phase 4 sub-palette geometries (shared primitive singletons)
    tallBoxGeo: THREE.BoxGeometry;
    octaGeo: THREE.OctahedronGeometry;
    hiCylinderGeo: THREE.CylinderGeometry;
    dispose: () => void;
}

// ===== Animation Types =====

export type AnimationType
    = | 'ROTATE_FLOAT'
        | 'LIQUID_WOBBLE'
        | 'BRANCH_SWAY'
        | 'LEAF_FLUTTER'
        | 'PETAL_BREATHE'
        | 'SEPAL_FLOAT'
        | 'DUST_ORBIT';

export interface AnimatedObjectUserData {
    animType?: AnimationType;
    speed?: number;
    phase?: number;
    baseScale?: THREE.Vector3;
    initialRotZ?: number;
    rigidity?: number;
    isPlasma?: boolean;
    axis?: THREE.Vector3;
    baseRotX?: number;
}

export interface AnimatedObject extends THREE.Object3D {
    userData: AnimatedObjectUserData;
    material?: THREE.Material & { emissive?: THREE.Color };
}

// ===== Cable System =====

export interface CableNode {
    obj: { position: THREE.Vector3 };
    topOffset: THREE.Vector3;
    isGround: boolean;
}

export interface CableOptions {
    droop: number;
    heavySag: boolean;
    offsetS: THREE.Vector3;
    offsetE: THREE.Vector3;
    /**
     * Optional mid-point tremble (FA rift banner cables): a sinusoidal y
     * oscillation of the Bezier control point, a pure function of the time
     * passed to updateCableGeometry. Absent on ordinary cables (no cost).
     */
    tremble?: {
        /** Oscillation amplitude (m). */
        amplitude: number;
        /** Angular speed (rad/s). */
        speed: number;
        /** Per-cable phase offset (rad) so banners do not quiver in lockstep. */
        phase: number;
    };
}

export interface CableCache {
    pStart: THREE.Vector3;
    pEnd: THREE.Vector3;
    mid: THREE.Vector3;
}

export interface DynamicCable {
    line: THREE.Line;
    startNode: CableNode;
    endNode: CableNode;
    options: CableOptions;
    segments: number;
    _cache: CableCache;
}

// ===== Chunk System =====

export interface BuildingUserData {
    initialPos: THREE.Vector3;
    wanderSpeed: number;
    wanderRange: number;
    offset: number;
    isMobile: boolean;
}

/**
 * A flicker group is a small set of pre-built variant child meshes parented to
 * one building fragment. The animator toggles exactly one visible at a time on
 * a deterministic interval (INFO_OVERFLOW only) — NEVER rebuilding geometry.
 */
export interface FlickerGroup {
    /** The variant meshes; all share pooled geometry/material (no new disposables). */
    variants: THREE.Object3D[];
    /** Deterministic per-group phase offset (seconds) so groups desync. */
    phase: number;
    /** The variant index currently shown, to avoid redundant visibility writes. */
    current: number;
}

export interface ChunkUserData {
    cables: DynamicCable[];
    buildings: THREE.Group[];
    animatedObjects: AnimatedObject[];
    fogSystem?: THREE.InstancedMesh;
    roomType?: RoomType;
    /**
     * INFO_OVERFLOW building-flicker groups (Phase 4). Present only on a capped
     * subset of fragments in INFO_OVERFLOW chunks; absent elsewhere.
     */
    flickerGroups?: FlickerGroup[];
}

export interface Chunk extends THREE.Group {
    userData: ChunkUserData;
}

// ===== Weather System =====

export interface WeatherState {
    weatherType: number;
    weatherIntensity: number;
    weatherTime: number;
    /**
     * Onset broadcast: 1 -> 0 linear decay over ONSET_SECONDS after a real
     * weather event starts (STATIC/RAIN/full-length GLITCH, incl. forced
     * static/rain). Always 0 for transient ambient glitches and CLEAR.
     * Drives the "weather just started" screen flash + audio swell.
     */
    weatherOnset: number;
    /**
     * 1 while a REAL weather event is active (STATIC/RAIN/full-length
     * GLITCH, incl. forced static/rain), 0 for transient ambient glitches
     * and CLEAR. Unlike weatherOnset it stays 1 for the event's whole
     * duration — it gates effects reserved for real events (e.g. the
     * POLARIZED full-screen invert strikes) that transients must not fire.
     */
    weatherIsEvent: number;
}

// Cooldown/duration/intensity ranges moved to per-room profiles
// (ROOM_WEATHER_PROFILES in world/RoomConfig.ts); only the cross-room
// tuning knobs remain here.
export interface WeatherConfig {
    transitionSpeed: number;
    glitchChance: number; // Ambient glitch rate per second (scaled by delta, frame-rate independent)
}

export interface WeatherSystemInterface {
    update: (delta: number, time: number, roomType?: RoomType | null) => WeatherState;
    forceWeather: (type: string, duration?: number) => void;
}

export interface DayNightContext {
    scene: THREE.Scene;
    shaderQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    audio: AudioSystemInterface;
    weather: WeatherSystemInterface;
    /**
     * Sunset (day -> night) hook. Return true when a settlement snapshot was
     * shown — DayNightCycle then skips its forced-static weather roll so the
     * snapshot's visual language stays distinct (flow-audit enhancement #9).
     */
    onSunset?: () => boolean | void;
}
