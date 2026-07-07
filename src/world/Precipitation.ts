// 1-bit Chimera Void - World-space precipitation (the falling layer)
//
// Weather stops being a screen overlay and becomes something that falls
// BETWEEN the player and the world: black = the system, white = the self,
// dither = the friction between them — and precipitation is the system's
// output physically entering the player's space. RAIN is signal shed as
// short hard dashes; ASHFALL is noise settling out of the air as sparse
// slow motes; GALE never shows itself — it is pure wind, felt only through
// what it does to whatever else is falling.
//
// Discipline: strict 1-bit. Instances pop in/out on hard seed thresholds
// against the live active fraction (never a fade), the far rim drops whole
// dashes via discard (never alpha), and inactive instances collapse to
// zero-size points in the vertex shader — every pixel is binary at all times.
//
// One InstancedMesh + one dedicated ShaderMaterial (the RoomSky/CableShader
// precedent — the DitherShader's 6-site uniform chain is deliberately
// untouched), ONE draw call regardless of instance count. Per-instance
// attributes (wrap-box cell, activation seed, phase) are baked once at
// construction from utils/hash; ALL motion is computed in the vertex shader
// from a handful of uniforms. The mesh rides a camera-following group (the
// RoomSky x/z-follow precedent) but instances are WORLD-anchored inside a
// wrap box around the player — they hold their world position and recycle
// across the far edge, so walking gives true parallax instead of an aquarium
// glued to the camera. Per-frame CPU cost is a dozen uniform writes.
//
// Driven from core/PrecipitationUpdater (the DataWaterfallUpdater wiring
// precedent); the pure WeatherState -> drive mapping lives here for tests.

import type { WeatherState } from '../types';
import * as THREE from 'three';
import { PRECIPITATION } from '../config';
import { hash } from '../utils/hash';
import { WEATHER_TYPES } from './WeatherSystem';

/** Falling-layer modes consumed by the shader's uMode. */
export const PRECIP_MODE = {
    /** Nothing falls (CLEAR/STATIC/GLITCH/ECLIPSE, and GALE — pure wind). */
    OFF: 0,
    /** Hard vertical dashes, fast, tilted by wind. */
    RAIN: 1,
    /** Sparse slow motes, drifting down with lateral wander. */
    ASH: 2,
} as const;

/**
 * The per-frame drive: everything the falling layer needs, derived purely
 * from the current WeatherState (+ the room's rain flavor). One instance is
 * allocated by the updater and mutated in place — per-frame allocation-free.
 */
export interface PrecipitationDrive {
    /** PRECIP_MODE value. */
    mode: number;
    /** Active instance fraction in [0, 1] (hard per-seed threshold). */
    fraction: number;
    /**
     * Downward fall speed (m/s); stays non-zero even when OFF so the
     * shader's velocity normalize never degenerates.
     */
    fallSpeed: number;
    /**
     * Horizontal wind (m/s) from the event's heading — tilts dashes and
     * streams motes sideways.
     */
    windX: number;
    windZ: number;
    /** Particle quad width / length (m) for the current mode. */
    width: number;
    length: number;
}

/** Fresh drive at the neutral rest state (see computePrecipitationDrive). */
export function createPrecipitationDrive(): PrecipitationDrive {
    return {
        mode: PRECIP_MODE.OFF,
        fraction: 0,
        fallSpeed: PRECIPITATION.RAIN.SPEED_BASE,
        windX: 0,
        windZ: 0,
        width: PRECIPITATION.RAIN.WIDTH,
        length: PRECIPITATION.RAIN.LENGTH,
    };
}

function clamp01(x: number): number {
    return Math.max(0, Math.min(1, x));
}

/**
 * Map the current WeatherState to the falling-layer drive. Pure; mutates and
 * returns `out` so the per-frame path allocates nothing.
 *
 * - RAIN: active fraction and fall speed scale with intensity; the room's
 *   rain flavor (RoomConfig weatherRainDensity — INFO_OVERFLOW's 2.5 data
 *   downpour, POLARIZED's 0) multiplies the fraction and leans the speed.
 * - ASHFALL: sparse and slow; its own heading gives a gentle drift wind.
 * - GALE: NO own particles — the shove is exported as pure wind.
 * - Forewarn (CLEAR + a drawn rotation event): a thin advance guard of the
 *   UPCOMING type's particles, a few percent scaling with the ramp — the
 *   world announces what is coming before it breaks.
 * - Everything else (STATIC/GLITCH/ECLIPSE/plain CLEAR): off.
 *
 * @param state - This frame's WeatherState broadcast.
 * @param rainDensity - The player's room weatherRainDensity flavor (>= 0).
 * @param out - Reused drive object, overwritten in full.
 */
export function computePrecipitationDrive(
    state: WeatherState,
    rainDensity: number,
    out: PrecipitationDrive,
): PrecipitationDrive {
    const { RAIN, ASH, GALE_WIND, FOREWARN_FRACTION_MAX } = PRECIPITATION;

    // Neutral rest state (also the OFF carrier for wind-only weather).
    out.mode = PRECIP_MODE.OFF;
    out.fraction = 0;
    out.fallSpeed = RAIN.SPEED_BASE;
    out.windX = 0;
    out.windZ = 0;
    out.width = RAIN.WIDTH;
    out.length = RAIN.LENGTH;

    // Event heading -> unit wind direction (same azimuth convention as
    // RoomSky's celestialDiscDirection: 0 = +z, increasing toward +x).
    const dirX = Math.sin(state.eventDirection);
    const dirZ = Math.cos(state.eventDirection);
    const k = state.weatherIntensity;

    if (state.weatherType === WEATHER_TYPES.RAIN) {
        out.mode = PRECIP_MODE.RAIN;
        out.fraction = clamp01((RAIN.FRACTION_BASE + RAIN.FRACTION_SPAN * k) * rainDensity);
        out.fallSpeed = (RAIN.SPEED_BASE + RAIN.SPEED_SPAN * k)
            * (1 + (rainDensity - 1) * RAIN.DENSITY_SPEED_LEAN);
        out.windX = dirX * RAIN.WIND * k;
        out.windZ = dirZ * RAIN.WIND * k;
    }
    else if (state.weatherType === WEATHER_TYPES.ASHFALL) {
        out.mode = PRECIP_MODE.ASH;
        out.fraction = clamp01(ASH.FRACTION_BASE + ASH.FRACTION_SPAN * k);
        out.fallSpeed = ASH.SPEED_BASE + ASH.SPEED_SPAN * k;
        out.windX = dirX * ASH.WIND * k;
        out.windZ = dirZ * ASH.WIND * k;
        out.width = ASH.WIDTH;
        out.length = ASH.LENGTH;
    }
    else if (state.weatherType === WEATHER_TYPES.GALE) {
        // The directional shove: no particles of its own, only wind.
        out.windX = dirX * GALE_WIND * k;
        out.windZ = dirZ * GALE_WIND * k;
    }
    else if (state.weatherType === WEATHER_TYPES.CLEAR && state.forewarn > 0) {
        // Advance guard of the announced event (only the falling types show
        // one; an upcoming STATIC/GLITCH/GALE announces through other layers).
        if (state.upcomingType === WEATHER_TYPES.RAIN) {
            out.mode = PRECIP_MODE.RAIN;
            out.fraction = clamp01(FOREWARN_FRACTION_MAX * state.forewarn * rainDensity);
            out.windX = dirX * RAIN.WIND * state.forewarn;
            out.windZ = dirZ * RAIN.WIND * state.forewarn;
        }
        else if (state.upcomingType === WEATHER_TYPES.ASHFALL) {
            out.mode = PRECIP_MODE.ASH;
            out.fraction = clamp01(FOREWARN_FRACTION_MAX * state.forewarn);
            out.fallSpeed = ASH.SPEED_BASE;
            out.windX = dirX * ASH.WIND * state.forewarn;
            out.windZ = dirZ * ASH.WIND * state.forewarn;
            out.width = ASH.WIDTH;
            out.length = ASH.LENGTH;
        }
    }

    return out;
}

/**
 * Tilt (radians off vertical) the shader realizes for a dash: the vertex
 * shader aligns the dash's long axis with normalize(windX, -fallSpeed,
 * windZ), so the tilt is exactly atan(|wind| / fallSpeed). Pure; the tests'
 * window into the wind-tilt math the GPU runs.
 */
export function dashTiltRadians(drive: PrecipitationDrive): number {
    return Math.atan2(Math.hypot(drive.windX, drive.windZ), drive.fallSpeed);
}

/**
 * Wrap an accumulator into [0, span) — continuous integration with bounded
 * float magnitude (see PRECIPITATION.ACCUM_WRAP). Pure.
 */
export function wrapAccum(value: number, span: number): number {
    return value - Math.floor(value / span) * span;
}

/**
 * Bake the per-instance attribute block, once at construction: wrap-box cell
 * x/z (fractions of BOX_SIZE), activation seed, vertical/wander phase — all
 * from utils/hash on distinct salts, so the cloud is deterministic within a
 * session. Pure.
 */
export function bakeCellAttribute(count: number): Float32Array {
    const { CELL_X, CELL_Z, SEED, PHASE } = PRECIPITATION.SALTS;
    const arr = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
        arr[i * 4] = hash(i, CELL_X);
        arr[i * 4 + 1] = hash(i, CELL_Z);
        arr[i * 4 + 2] = hash(i, SEED);
        arr[i * 4 + 3] = hash(i, PHASE);
    }
    return arr;
}

const PRECIP_VERTEX_SHADER = `
    attribute vec4 aCell; // cell x01, cell z01, activation seed, phase
    uniform float uTime;
    uniform float uMode;
    uniform float uFraction;
    uniform float uFall;
    uniform vec2 uDrift;
    uniform vec2 uCenter;
    uniform vec2 uSize;
    uniform vec3 uVelocity;
    uniform float uBoxSize;
    uniform float uHeight;
    uniform float uSpeedJitter;
    uniform float uWanderAmp;
    uniform float uWanderFreq;
    varying float vSeed;
    varying float vDistFrac;

    void main() {
        // Hard activation gate: seeds under the live fraction exist, the rest
        // collapse to zero-size points (degenerate triangles, no fragments).
        float active = step(aCell.z, uFraction) * step(0.5, uMode);

        // Per-instance fall-rate jitter around 1 (columns desync; in-shader
        // hash reuse of the seed, decorrelated from the activation order).
        float jitter = 1.0 + (fract(aCell.z * 61.7) - 0.5) * uSpeedJitter;

        // Vertical wrap: the CPU-integrated fall distance cycles the column
        // (integrating keeps intensity ramps from teleporting particles).
        float y = mod(aCell.w * uHeight - uFall * jitter, uHeight);

        // Horizontal: world-anchored cell + integrated wind drift, wrapped
        // into the box around the player — a particle keeps its world x/z
        // until it recycles across the far edge (parallax, not aquarium).
        vec2 base = aCell.xy * uBoxSize + uDrift;
        vec2 rel = mod(base - uCenter, uBoxSize) - 0.5 * uBoxSize;

        // Ash wander: hard lateral sway, position only — never a fade.
        float isAsh = step(1.5, uMode);
        rel.x += sin(uTime * uWanderFreq + aCell.w * 6.2831853) * uWanderAmp * isAsh;

        vSeed = aCell.z;
        vDistFrac = length(rel) / (0.5 * uBoxSize);

        // The group already sits at the player's x/z, so rel/y ARE local.
        vec3 center = (modelMatrix * vec4(rel.x, y, rel.y, 1.0)).xyz;

        // Dash frame: long axis along the fall velocity (wind tilts it),
        // width axis screen-facing (epsilon keeps the cross well-defined when
        // looking straight down a streak); ash swaps to a camera-aligned
        // square mote.
        vec3 axisLong = normalize(uVelocity);
        vec3 viewDir = normalize(center - cameraPosition);
        vec3 axisSide = normalize(cross(viewDir, axisLong) + vec3(1e-4, 0.0, 0.0));
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 ax = mix(axisSide, camRight, isAsh);
        vec3 ay = mix(axisLong, camUp, isAsh);

        vec3 world = center + (ax * position.x * uSize.x + ay * position.y * uSize.y) * active;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    }
`;

const PRECIP_FRAGMENT_SHADER = `
    uniform vec3 uColor;
    uniform float uEdgeInner;
    varying float vSeed;
    varying float vDistFrac;

    // In-shader analogue of utils/hash (RoomSky precedent): purely visual,
    // deterministic per seed, no JS-side salt consumed.
    float hash1(float n) {
        return fract(sin(n * 12.9898) * 43758.5453);
    }

    void main() {
        // Hard dithered rim: each instance owns a hashed cutoff radius
        // between uEdgeInner and 1.0 of the wrap radius — past it ALL its
        // pixels drop. Discard, never alpha: every surviving pixel is on.
        float cut = mix(uEdgeInner, 1.0, hash1(vSeed * 291.7));
        if (vDistFrac > cut) discard;
        gl_FragColor = vec4(uColor, 1.0);
    }
`;

/**
 * The falling layer. One InstancedMesh in a camera-following group; see the
 * file header for the design contract. update() is allocation-free (scalar
 * and vector uniform writes only) regardless of instance count.
 */
export class Precipitation {
    private readonly group: THREE.Group;
    private readonly mesh: THREE.InstancedMesh;
    private readonly material: THREE.ShaderMaterial;

    // CPU-side integrals (delta-driven, so pause-gated with the update
    // phase): wander clock, fall distance, wind drift. Time and fall wrap at
    // ACCUM_WRAP — one hard reshuffle frame per wrap. Time wraps every
    // ~34 min; fall advances at drive.fallSpeed (never below the rain-pace
    // OFF carrier, ~13-22 m/s) so it wraps every ~1.5-3 min — visible only
    // if a wrap lands mid-rain, and imperceptible under the dither even
    // then. The drift wraps at BOX_SIZE, which the shader's mod folds
    // seamlessly (no reshuffle at all).
    private time = 0;
    private fall = 0;
    private driftX = 0;
    private driftZ = 0;

    constructor(scene: THREE.Scene) {
        const geometry = new THREE.PlaneGeometry(1, 1);
        geometry.setAttribute(
            'aCell',
            new THREE.InstancedBufferAttribute(bakeCellAttribute(PRECIPITATION.COUNT), 4),
        );

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uMode: { value: PRECIP_MODE.OFF },
                uFraction: { value: 0 },
                uFall: { value: 0 },
                uDrift: { value: new THREE.Vector2(0, 0) },
                uCenter: { value: new THREE.Vector2(0, 0) },
                uSize: { value: new THREE.Vector2(PRECIPITATION.RAIN.WIDTH, PRECIPITATION.RAIN.LENGTH) },
                uVelocity: { value: new THREE.Vector3(0, -PRECIPITATION.RAIN.SPEED_BASE, 0) },
                uColor: { value: new THREE.Color(0, 0, 0) },
                // Set-once volume knobs (all tunables live in PRECIPITATION).
                uBoxSize: { value: PRECIPITATION.BOX_SIZE },
                uHeight: { value: PRECIPITATION.HEIGHT },
                uSpeedJitter: { value: PRECIPITATION.SPEED_JITTER },
                uWanderAmp: { value: PRECIPITATION.ASH.WANDER_AMP },
                uWanderFreq: { value: PRECIPITATION.ASH.WANDER_FREQ },
                uEdgeInner: { value: PRECIPITATION.EDGE_INNER },
            },
            vertexShader: PRECIP_VERTEX_SHADER,
            fragmentShader: PRECIP_FRAGMENT_SHADER,
            // Opaque hard pixels; dashes face the camera by construction but
            // the winding can flip with the view, so draw both sides.
            side: THREE.DoubleSide,
            fog: false,
        });

        this.mesh = new THREE.InstancedMesh(geometry, this.material, PRECIPITATION.COUNT);
        // The shader ignores instanceMatrix entirely (all placement is
        // attribute + uniform math), so the zero-initialized matrices are
        // never uploaded past the first frame and never touched again.
        // The wrap volume always surrounds the camera — never cull it.
        this.mesh.frustumCulled = false;

        this.group = new THREE.Group();
        this.group.add(this.mesh);
        scene.add(this.group);
    }

    /**
     * Drive the falling layer for this frame.
     * @param delta - Frame delta (s), pause-gated upstream.
     * @param drive - This frame's drive (computePrecipitationDrive output).
     * @param playerPos - Player world position (wrap volume re-centers on x/z).
     * @param isDay - DayNightCycle day phase: dashes draw ink by day / paper
     *   by night and motes the reverse, so composed with the DitherShader's
     *   global night inversion every mark keeps its final polarity (dark
     *   dashes stay dark, pale ash stays pale) — the RoomSky palette rule.
     */
    update(delta: number, drive: PrecipitationDrive, playerPos: THREE.Vector3, isDay: boolean): void {
        this.time = wrapAccum(this.time + delta, PRECIPITATION.ACCUM_WRAP);
        this.fall = wrapAccum(this.fall + drive.fallSpeed * delta, PRECIPITATION.ACCUM_WRAP);
        this.driftX = wrapAccum(this.driftX + drive.windX * delta, PRECIPITATION.BOX_SIZE);
        this.driftZ = wrapAccum(this.driftZ + drive.windZ * delta, PRECIPITATION.BOX_SIZE);

        // Follow on x/z only: the volume stays on the world's vertical datum
        // (floor plane y=0) so columns never bob with jumps or the rift fall.
        this.group.position.set(playerPos.x, 0, playerPos.z);

        // Nothing falls: skip the draw call entirely (hard off, not faded).
        this.mesh.visible = drive.fraction > 0;

        const u = this.material.uniforms;
        u.uTime.value = this.time;
        u.uFall.value = this.fall;
        (u.uDrift.value as THREE.Vector2).set(this.driftX, this.driftZ);
        (u.uCenter.value as THREE.Vector2).set(playerPos.x, playerPos.z);
        u.uMode.value = drive.mode;
        u.uFraction.value = drive.fraction;
        (u.uSize.value as THREE.Vector2).set(drive.width, drive.length);
        (u.uVelocity.value as THREE.Vector3).set(drive.windX, -drive.fallSpeed, drive.windZ);
        // Polarity: motes are paper marks, dashes are ink marks; night swaps
        // the drawn value so the global inversion restores the final look.
        const paperMark = drive.mode === PRECIP_MODE.ASH;
        (u.uColor.value as THREE.Color).setScalar(paperMark === isDay ? 1 : 0);
    }

    /** Remove the layer and free its geometry + material (app teardown). */
    dispose(): void {
        this.group.parent?.remove(this.group);
        this.mesh.geometry.dispose();
        this.material.dispose();
        this.mesh.dispose();
    }
}
