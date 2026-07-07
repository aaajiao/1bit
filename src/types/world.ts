// World-related types (Chunks, Cables, Weather, etc.)
import type * as THREE from 'three';

// ===== Day/Night System =====

import type { BehaviorProfile, RoomType } from '../world/RoomConfig';
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

/**
 * A seam shell is the counterpart-faction overlay of one near-seam POLARIZED
 * building: clone meshes carrying the OTHER faction's material (wireframe on a
 * solid 'us' building, solid on a wireframe 'them' building), sharing pooled
 * geometry so they add no GPU data. Hidden by default; the seam-swap pass hard-
 * toggles their .visible so us/them flickers into each other on the seam line.
 */
export interface SeamShell {
    /** Counterpart-language meshes (shared geometry + shared counterpart material). */
    meshes: THREE.Object3D[];
    /** Deterministic per-building phase (cycle fraction) so shells desync. */
    phase: number;
    /** Last visibility written, to skip redundant .visible writes. */
    current: boolean;
    /**
     * GLITCH-aftermath hold (weather reactions): while true the shell stays
     * forced visible — the building is stuck in the other faction's language
     * — outranking the live seam-swap duty until
     * ChunkManager.releaseHeldSeamShells clears it. Absent/false on every
     * shell the aftermath never touched (the live pass behaves identically).
     */
    held?: boolean;
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
    /**
     * POLARIZED near-seam counterpart shells (scene-richness). Present only on
     * buildings within POLARIZED_SEAM_SWAP.BUILDING_REACH of a POLARIZED chunk's
     * seam; absent in every other room.
     */
    seamShells?: SeamShell[];
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
    /**
     * Forewarn broadcast (weather lifecycle): 0 -> 1 ramp across
     * WEATHER_LIFECYCLE.FOREWARN_SECONDS while the next real rotation event
     * is drawn but not yet started — the world senses the storm coming.
     * Always 0 for transient ambient glitches (they are never announced).
     */
    forewarn: number;
    /**
     * WEATHER_TYPES value of the announced event while forewarn > 0;
     * CLEAR (0) when nothing is scheduled.
     */
    upcomingType: number;
    /**
     * Heading of the current (or announced) real event in radians, hash-drawn
     * once per event and stable across its whole forewarn -> aftermath arc
     * (GALE blows somewhere; ASHFALL drifts from it). Only meaningful while
     * forewarn / weatherIsEvent / aftermath says an event is in play.
     */
    eventDirection: number;
    /**
     * Aftermath broadcast (weather lifecycle): 1 -> 0 decay across
     * WEATHER_LIFECYCLE.AFTERMATH_SECONDS after a real event ends — the
     * residue the storm leaves behind. Always 0 after transient glitches.
     */
    aftermath: number;
    /** WEATHER_TYPES value of the last real event that ended (CLEAR before any). */
    lastEndedType: number;
    /**
     * 0 -> 1 progress of a running ECLIPSE (WEATHER_ECLIPSE scheduler),
     * exactly 0 outside one. The screen shader never sees the eclipse — this
     * is the world systems' channel.
     */
    eclipseProgress: number;
}

// Cooldown/duration/intensity ranges moved to per-room profiles
// (ROOM_WEATHER_PROFILES in world/RoomConfig.ts); only the cross-room
// tuning knobs remain here.
export interface WeatherConfig {
    transitionSpeed: number;
    glitchChance: number; // Ambient glitch rate per second (scaled by delta, frame-rate independent)
}

export interface WeatherSystemInterface {
    update: (delta: number, time: number, roomType?: RoomType | null, profile?: BehaviorProfile | null) => WeatherState;
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
