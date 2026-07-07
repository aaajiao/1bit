// 1-bit Chimera Void - Ash traces (precipitation's memory layer)
//
// During ASHFALL the settling noise leaves a record: small pale specks
// accumulate on the floor near the player — the system's fallout written
// onto the ground the self walks. When the event ends they do not vanish;
// they dissolve across the AFTERMATH window, per-pixel, each grain cell
// winking out on its own hard hash threshold — binary pixels progressively
// disappearing, never an alpha fade. The world remembers the storm exactly
// as long as the sky says it does (WeatherState.aftermath).
//
// POOL ANCHORING: a PLAYER-ANCHORED persistent pool (scene-rooted, world-
// positioned instances), NOT chunk-parented. Rationale: traces are bounded
// in TIME (they exist only through one ASHFALL + its aftermath, tens of
// seconds) and in COUNT (PRECIPITATION.TRACES.CAP recycled ring slots), and
// they only ever spawn within TRACES.RADIUS of the player — by construction
// inside the loaded 3x3 chunk window, so chunk unload can never strand a
// visible speck. Chunk-parenting would buy nothing (no cross-visit
// persistence is wanted — the aftermath IS the lifetime) and would cost a
// per-chunk mesh/material split, dispose-ordering coupling, and regeneration
// artifacts. One InstancedMesh at the scene root = one draw call, a hard
// CAP the pool can never grow past, and airtight disposal in exactly one
// place (dispose(), app teardown); room/scene transitions never touch it
// because the dissolve clock, not the world graph, owns its lifetime.
//
// Placement uses the FloorTile-decal z-fighting pattern (TRACES.LIFT epsilon
// + polygonOffset -1/-1, the FA_SHADOW/redaction-disc precedent), and a
// keep-out band around FORCED_ALIGNMENT rift lines so ash never floats over
// the abyss (the FA_SHADOW crack-keepout analogue).

import type { WeatherState } from '../types';
import * as THREE from 'three';
import { PRECIPITATION } from '../config';
import { hash } from '../utils/hash';
import { riftLineXForWorldX, RoomType } from './RoomConfig';
import { WEATHER_TYPES } from './WeatherSystem';

/**
 * The pool's dissolve level in [0, 1] from the weather broadcast: 1 while an
 * ASHFALL event is live (specks fully present), the decaying aftermath value
 * after one ends (per-pixel erosion), 0 otherwise. A transient glitch firing
 * during the aftermath leaves the residue untouched (weatherType flips to
 * GLITCH but lastEndedType/aftermath still carry the ashfall). Pure.
 */
export function ashDissolveLevel(state: WeatherState): number {
    if (state.weatherType === WEATHER_TYPES.ASHFALL)
        return 1;
    if (state.lastEndedType === WEATHER_TYPES.ASHFALL && state.aftermath > 0)
        return state.aftermath;
    return 0;
}

/**
 * Spawn cadence: accumulates fractional spawns at TRACES.RATE_MAX x intensity
 * per second and releases whole ones, at most MAX_PER_FRAME per frame (the
 * carry-over is clamped to the same bound so a pathological delta can never
 * bank a burst). Inactivity clears the accumulator. Pure logic, no THREE.
 */
export class AshTraceScheduler {
    private acc = 0;

    /**
     * @param delta - Frame delta (s).
     * @param intensity - Current weather intensity in [0, 1].
     * @param active - Whether an ASHFALL event is live.
     * @returns Number of traces to spawn this frame.
     */
    update(delta: number, intensity: number, active: boolean): number {
        if (!active) {
            this.acc = 0;
            return 0;
        }
        const { RATE_MAX, MAX_PER_FRAME } = PRECIPITATION.TRACES;
        this.acc += RATE_MAX * intensity * delta;
        const spawns = Math.min(Math.floor(this.acc), MAX_PER_FRAME);
        this.acc = Math.min(this.acc - spawns, MAX_PER_FRAME);
        return spawns;
    }
}

/** Ring-buffer slot for the n-th successful placement (recycles oldest). Pure. */
export function traceSlot(writeCounter: number, cap: number): number {
    return writeCounter % cap;
}

/** Deterministic placement angle (rad) for the n-th spawn draw. Pure. */
export function traceAngle(drawCounter: number): number {
    return hash(drawCounter, PRECIPITATION.TRACES.SALTS.ANGLE) * Math.PI * 2;
}

/**
 * Deterministic placement radius (m) for the n-th spawn draw: sqrt-shaped so
 * specks land area-uniform in the ring between RADIUS_MIN and RADIUS. Pure.
 */
export function traceRadius(drawCounter: number): number {
    const { RADIUS_MIN, RADIUS, SALTS } = PRECIPITATION.TRACES;
    return RADIUS_MIN + Math.sqrt(hash(drawCounter, SALTS.RADIUS)) * (RADIUS - RADIUS_MIN);
}

/** Deterministic speck footprint edge (m) for the n-th spawn draw. Pure. */
export function traceSize(drawCounter: number): number {
    const { SIZE_MIN, SIZE_SPAN, SALTS } = PRECIPITATION.TRACES;
    return SIZE_MIN + hash(drawCounter, SALTS.SIZE) * SIZE_SPAN;
}

/**
 * Whether a spawn at world x is blocked by a FORCED_ALIGNMENT rift line: ash
 * never settles inside TRACES.CRACK_KEEPOUT of the column's crack (there is
 * no floor there). Judged by the player's current room — a spawn offset can
 * straddle a cluster border, but the keep-out only matters where cracks
 * exist and the band comfortably covers the jagged edges. Pure.
 */
export function traceBlockedByCrack(worldX: number, roomType: RoomType): boolean {
    if (roomType !== RoomType.FORCED_ALIGNMENT)
        return false;
    return Math.abs(worldX - riftLineXForWorldX(worldX)) < PRECIPITATION.TRACES.CRACK_KEEPOUT;
}

const TRACE_VERTEX_SHADER = `
    attribute float aSeed;
    varying vec2 vUv;
    varying float vSeed;

    void main() {
        vUv = uv;
        vSeed = aSeed;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
    }
`;

const TRACE_FRAGMENT_SHADER = `
    uniform vec3 uColor;
    uniform float uDissolve;
    uniform float uGrain;
    uniform float uShapeFill;
    varying vec2 vUv;
    varying float vSeed;

    // In-shader analogue of utils/hash (RoomSky precedent).
    float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
        vec2 cell = floor(vUv * uGrain);
        // Irregular blot: a hashed subset of grain cells never exists.
        if (hash2(cell + vSeed * 57.31) > uShapeFill) discard;
        // Hard per-pixel dissolve: each surviving cell owns a threshold in
        // [0,1); as uDissolve decays 1 -> 0 across the aftermath, cells wink
        // out one by one — every pixel binary at all times, never a fade.
        if (hash2(cell + vSeed * 91.17) > uDissolve) discard;
        gl_FragColor = vec4(uColor, 1.0);
    }
`;

/**
 * The bounded, recycled ground pool. One InstancedMesh (one draw call); slots
 * start as zero matrices (invisible) and are written only on spawn frames.
 * See the file header for the anchoring contract.
 */
export class AshTraces {
    private readonly mesh: THREE.InstancedMesh;
    private readonly material: THREE.ShaderMaterial;
    private readonly scheduler = new AshTraceScheduler();

    // Monotone counters: draws seed deterministic placement (skipped spawns
    // still consume a draw), writes pick the recycled ring slot.
    private drawCounter = 0;
    private writeCounter = 0;
    // Whether any slot currently holds a (possibly dissolving) speck, so the
    // one-time pool clear runs exactly once per settled aftermath.
    private hasLive = false;

    // Spawn-time scratch (never touched on non-spawn frames).
    private readonly _pos = new THREE.Vector3();
    private readonly _quat = new THREE.Quaternion();
    private readonly _scale = new THREE.Vector3();
    private readonly _m4 = new THREE.Matrix4();
    private readonly _zero = new THREE.Matrix4().makeScale(0, 0, 0);

    constructor(scene: THREE.Scene) {
        const { CAP, GRAIN, SHAPE_FILL, SALTS } = PRECIPITATION.TRACES;

        // Flat orientation baked into the geometry (the ShadowCorrection
        // pattern) so instance matrices stay pure translate+scale.
        const geometry = new THREE.PlaneGeometry(1, 1);
        geometry.rotateX(-Math.PI / 2);
        const seeds = new Float32Array(CAP);
        for (let i = 0; i < CAP; i++)
            seeds[i] = hash(i, SALTS.SLOT_SEED);
        geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(1, 1, 1) },
                uDissolve: { value: 0 },
                uGrain: { value: GRAIN },
                uShapeFill: { value: SHAPE_FILL },
            },
            vertexShader: TRACE_VERTEX_SHADER,
            fragmentShader: TRACE_FRAGMENT_SHADER,
            // Depth-bias toward the camera, paired with the TRACES.LIFT
            // epsilon — the FloorTile-decal z-fighting pattern.
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
            fog: false,
        });

        this.mesh = new THREE.InstancedMesh(geometry, this.material, CAP);
        // InstancedMesh boots with ZERO matrices (not identity): every slot
        // is a degenerate invisible point until its first spawn write.
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // Specks scatter around the moving player; the pool is tiny, so skip
        // bounds bookkeeping and never cull.
        this.mesh.frustumCulled = false;
        scene.add(this.mesh);
    }

    /**
     * Drive the pool for this frame: spawn during ASHFALL, dissolve across
     * the aftermath, clear once fully settled. Allocation-free; the instance
     * buffer re-uploads only on frames that actually write slots.
     * @param delta - Frame delta (s), pause-gated upstream.
     * @param state - This frame's WeatherState broadcast.
     * @param playerPos - Player world position (spawn ring center).
     * @param roomType - Player's current room (FA crack keep-out).
     * @param isDay - Day phase: specks draw paper by day / ink by night so
     *   the global night inversion keeps them reading pale (RoomSky rule).
     */
    update(delta: number, state: WeatherState, playerPos: THREE.Vector3, roomType: RoomType, isDay: boolean): void {
        const level = ashDissolveLevel(state);
        const active = state.weatherType === WEATHER_TYPES.ASHFALL;

        const spawns = this.scheduler.update(delta, state.weatherIntensity, active);
        for (let n = 0; n < spawns; n++)
            this.spawnOne(playerPos, roomType);

        // A new ashfall breaking before the previous residue fully settled
        // simply recharges the surviving specks (uDissolve snaps back to 1):
        // fresh ash falling onto half-eroded traces. Once the level reaches
        // ZERO the pool is cleared exactly once, so no stale speck can
        // resurrect when a later event raises the dissolve again.
        if (level <= 0 && this.hasLive)
            this.clearAll();

        this.material.uniforms.uDissolve.value = level;
        (this.material.uniforms.uColor.value as THREE.Color).setScalar(isDay ? 1 : 0);
        // No live specks: skip the draw call entirely.
        this.mesh.visible = this.hasLive;
    }

    /** Place one speck (deterministic draw; FA crack keep-out may skip it). */
    private spawnOne(playerPos: THREE.Vector3, roomType: RoomType): void {
        const { CAP, LIFT } = PRECIPITATION.TRACES;
        this.drawCounter += 1;
        const angle = traceAngle(this.drawCounter);
        const radius = traceRadius(this.drawCounter);
        const x = playerPos.x + Math.sin(angle) * radius;
        const z = playerPos.z + Math.cos(angle) * radius;
        if (traceBlockedByCrack(x, roomType))
            return;

        const size = traceSize(this.drawCounter);
        this._pos.set(x, LIFT, z);
        this._scale.set(size, 1, size);
        this._m4.compose(this._pos, this._quat, this._scale);
        this.mesh.setMatrixAt(traceSlot(this.writeCounter, CAP), this._m4);
        this.writeCounter += 1;
        this.mesh.instanceMatrix.needsUpdate = true;
        this.hasLive = true;
    }

    /** Collapse every slot back to an invisible point (aftermath settled). */
    private clearAll(): void {
        for (let i = 0; i < PRECIPITATION.TRACES.CAP; i++)
            this.mesh.setMatrixAt(i, this._zero);
        this.mesh.instanceMatrix.needsUpdate = true;
        this.hasLive = false;
    }

    /** Remove the pool and free its geometry + material (app teardown). */
    dispose(): void {
        this.mesh.parent?.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.material.dispose();
        this.mesh.dispose();
    }
}
