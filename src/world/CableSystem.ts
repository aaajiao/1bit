import type { CableNode, CableOptions, DynamicCable } from '../types';
// 1-bit Chimera Void - Cable System
import * as THREE from 'three';
import { CABLE_UPLINK } from '../config';
import { CableShader } from '../shaders/DitherShader';
import { hash } from '../utils/hash';

// Shared shader material for all cables
let cableShaderMat: THREE.ShaderMaterial | null = null;

// Shared uplink material (scene-richness batch): swapped onto cables near a
// bright player so hard 1-bit dashes march toward the sky eye. Self-contained
// here — deliberately NOT a DitherShader uniform (that would need the 6-site
// wiring chain); this is an object-level material effect only.
let cableUplinkMat: THREE.ShaderMaterial | null = null;

/**
 * Normalizes the player's flower intensity into an uplink "boost" in [0,1]:
 * exactly 0 at or below the threshold (cables stay static), ramping linearly
 * to 1 at full brightness. Above the threshold the boost drives both pulse
 * speed and dash density — the brighter the flower, the harder the wires
 * report it to the eye. Input clamped to [0,1]. Pure; exported for testing.
 */
export function uplinkFlowerBoost(
    flowerIntensity: number,
    threshold: number = CABLE_UPLINK.FLOWER_THRESHOLD,
): number {
    const f = Math.max(0, Math.min(1, flowerIntensity));
    if (f <= threshold)
        return 0;
    const denom = 1 - threshold;
    if (denom <= 0)
        return 1;
    return Math.min(1, (f - threshold) / denom);
}

/**
 * Direction the pulses travel along a cable, as a sign for the lineDistance
 * parametrization (+1 = toward the end vertex, -1 = toward the start vertex).
 * The sky eye has no fixed world anchor — it leashes to the player, always
 * roughly overhead — so "toward the eye" resolves to "up and away": pulses
 * climb toward the HIGHER endpoint of each cable. Ties resolve to +1.
 * Pure; exported for testing.
 */
export function uplinkDirectionSign(startY: number, endY: number): number {
    return endY >= startY ? 1 : -1;
}

/**
 * Pulse travel speed (dash cycles/second) for a given boost — linear from
 * SPEED_BASE at the threshold to SPEED_BASE+SPEED_GAIN at full brightness.
 * Boost clamped to [0,1]. Pure; exported for testing.
 */
export function uplinkPulseSpeed(boost: number): number {
    const b = Math.max(0, Math.min(1, boost));
    return CABLE_UPLINK.SPEED_BASE + b * CABLE_UPLINK.SPEED_GAIN;
}

/**
 * Dash density (dashes per meter) for a given boost — linear from DENSITY_BASE
 * at the threshold to DENSITY_BASE+DENSITY_GAIN at full brightness. Boost
 * clamped to [0,1]. Pure; exported for testing.
 */
export function uplinkDashDensity(boost: number): number {
    const b = Math.max(0, Math.min(1, boost));
    return CABLE_UPLINK.DENSITY_BASE + b * CABLE_UPLINK.DENSITY_GAIN;
}

/**
 * Get or create the cable shader material
 */
export function getCableMaterial(): THREE.ShaderMaterial {
    if (!cableShaderMat) {
        cableShaderMat = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color: { value: new THREE.Color(0x000000) },
                pulseColor: { value: new THREE.Color(0x555555) },
            },
            vertexShader: CableShader.vertexShader,
            fragmentShader: CableShader.fragmentShader,
            transparent: true,
        });
    }
    return cableShaderMat;
}

/**
 * Update cable shader time uniform
 * @param time - Current time in seconds
 */
export function updateCableTime(time: number): void {
    if (cableShaderMat) {
        cableShaderMat.uniforms.time.value = time;
    }
}

/**
 * Dispose the shared cable shader material and reset the singleton.
 * Must be called exactly once during teardown (e.g. ChunkManager.dispose()).
 * Subsequent calls to getCableMaterial() will lazily recreate it.
 */
export function disposeCableMaterial(): void {
    if (cableShaderMat) {
        cableShaderMat.dispose();
        cableShaderMat = null;
    }
}

/**
 * Get or lazily create the shared uplink material. Renders hard 1-bit dashes
 * (no soft glow, no alpha fade) marching along each cable toward its higher
 * endpoint. Direction is per-cable via the `uplinkDir` vertex attribute baked
 * in createDynamicCable; speed/density are global uniforms driven per frame by
 * updateCableUplinkUniforms.
 */
export function getCableUplinkMaterial(): THREE.ShaderMaterial {
    if (!cableUplinkMat) {
        cableUplinkMat = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                speed: { value: CABLE_UPLINK.SPEED_BASE },
                density: { value: CABLE_UPLINK.DENSITY_BASE },
                duty: { value: CABLE_UPLINK.DASH_DUTY },
                color: { value: new THREE.Color(0x000000) },
                pulseColor: { value: new THREE.Color(0xCCCCCC) },
            },
            vertexShader: `
                attribute float lineDistance;
                attribute float uplinkDir;
                varying float vLineDistance;
                varying float vUplinkDir;
                void main() {
                    vLineDistance = lineDistance;
                    vUplinkDir = uplinkDir;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float speed;
                uniform float density;
                uniform float duty;
                uniform vec3 color;
                uniform vec3 pulseColor;
                varying float vLineDistance;
                varying float vUplinkDir;
                void main() {
                    // Hard 1-bit dashes marching toward the higher endpoint (the
                    // eye): a dash crest of fract(k*x - v*t) travels in +x, so the
                    // per-cable sign flips it toward the higher end. step() keeps it
                    // strictly on/off — the dither pass owns the only softness.
                    float wave = fract(vLineDistance * density - time * speed * vUplinkDir);
                    float dash = step(1.0 - duty, wave);
                    gl_FragColor = vec4(mix(color, pulseColor, dash), 1.0);
                }
            `,
        });
    }
    return cableUplinkMat;
}

/**
 * Drive the shared uplink material's global uniforms for this frame. Speed and
 * density scale with the boost (uplinkPulseSpeed / uplinkDashDensity). No-op
 * until the material exists (first cable swap creates it), so a bright frame
 * with no cable in range costs nothing.
 * @param time - Elapsed seconds (marches the dash phase).
 * @param boost - Uplink boost in [0,1] (uplinkFlowerBoost).
 */
export function updateCableUplinkUniforms(time: number, boost: number): void {
    if (!cableUplinkMat)
        return;
    const u = cableUplinkMat.uniforms;
    u.time.value = time;
    u.speed.value = uplinkPulseSpeed(boost);
    u.density.value = uplinkDashDensity(boost);
}

/**
 * Swap a single cable between the static base material and the animated uplink
 * material. Identity-guarded so redundant frames cost nothing. Both materials
 * are module-shared singletons — never dispose them per cable.
 * @param cable - The cable to (un)light.
 * @param active - True to show the marching uplink dashes; false to restore the
 *   static base cable shimmer.
 */
export function setCableUplinkActive(cable: DynamicCable, active: boolean): void {
    const target = active ? getCableUplinkMaterial() : getCableMaterial();
    if (cable.line.material !== target)
        cable.line.material = target;
}

/**
 * Dispose the shared uplink material and reset the singleton. Called once at
 * teardown (ChunkManager.dispose), alongside disposeCableMaterial. Subsequent
 * getCableUplinkMaterial() calls lazily recreate it.
 */
export function disposeCableUplinkMaterial(): void {
    if (cableUplinkMat) {
        cableUplinkMat.dispose();
        cableUplinkMat = null;
    }
}

/**
 * Creates a dynamic cable between two nodes
 * @param startNode - Start node with position
 * @param endNode - End node with position
 * @param options - Cable options (droop, heavySag, offsets)
 */
export function createDynamicCable(
    startNode: CableNode,
    endNode: CableNode,
    options: CableOptions,
): DynamicCable {
    const segments = 12;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((segments + 1) * 3);
    const distances = new Float32Array(segments + 1);

    // Deterministic seed per cable - same value for all vertices in this cable.
    // Derived from the start node's grounded position so the same node pair always
    // yields the same sway phase (hash() is the project's seeded RNG, see utils/hash).
    const randomSeeds = new Float32Array(segments + 1);
    const cableSeed = hash(
        Math.round(startNode.obj.position.x),
        Math.round(startNode.obj.position.z),
    );
    for (let i = 0; i <= segments; i++) {
        randomSeeds[i] = cableSeed;
    }

    // Per-cable uplink direction (scene-richness batch): +1/-1 baked once at
    // creation so the uplink dashes always climb toward the HIGHER endpoint
    // ("up and away" toward the leashing, always-overhead eye). Endpoint heights
    // mirror updateCableGeometry (ground vs. top offset, plus the y offsets), so
    // the sign matches the geometry the pulse rides on. Same value on every
    // vertex; the base cable shader simply ignores this extra attribute.
    const startY = (startNode.isGround
        ? startNode.obj.position.y
        : startNode.obj.position.y + startNode.topOffset.y) + options.offsetS.y;
    const endY = (endNode.isGround
        ? endNode.obj.position.y
        : endNode.obj.position.y + endNode.topOffset.y) + options.offsetE.y;
    const uplinkDirs = new Float32Array(segments + 1);
    uplinkDirs.fill(uplinkDirectionSign(startY, endY));

    geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
        'lineDistance',
        new THREE.BufferAttribute(distances, 1),
    );
    geometry.setAttribute(
        'randomSeed',
        new THREE.BufferAttribute(randomSeeds, 1),
    );
    geometry.setAttribute(
        'uplinkDir',
        new THREE.BufferAttribute(uplinkDirs, 1),
    );

    const line = new THREE.Line(geometry, getCableMaterial());
    line.frustumCulled = false;

    return {
        line,
        startNode,
        endNode,
        options,
        segments,
        // Pre-allocated cache to avoid per-frame allocations
        _cache: {
            pStart: new THREE.Vector3(),
            pEnd: new THREE.Vector3(),
            mid: new THREE.Vector3(),
        },
    };
}

/**
 * Update cable geometry based on node positions
 * @param cable - Cable object
 * @param time - Current time in seconds; drives the optional mid-point
 *   tremble (FA rift banners). Defaults to 0 (static control point).
 */
export function updateCableGeometry(cable: DynamicCable, time: number = 0): void {
    const { startNode, endNode, options, segments, _cache } = cable;

    // Use cached vectors instead of creating new ones
    const pStart = _cache.pStart;
    const pEnd = _cache.pEnd;
    const mid = _cache.mid;

    // Calculate start position
    if (startNode.isGround) {
        pStart.copy(startNode.obj.position).add(options.offsetS);
    }
    else {
        pStart.copy(startNode.obj.position)
            .add(startNode.topOffset)
            .add(options.offsetS);
    }

    // Calculate end position
    if (endNode.isGround) {
        pEnd.copy(endNode.obj.position).add(options.offsetE);
    }
    else {
        pEnd.copy(endNode.obj.position)
            .add(endNode.topOffset)
            .add(options.offsetE);
    }

    // Calculate midpoint with droop
    mid.addVectors(pStart, pEnd).multiplyScalar(0.5);
    const dist = pStart.distanceTo(pEnd);
    let currentDroop = Math.max(0, options.droop - dist * 0.1);
    if (options.heavySag)
        currentDroop += 20;
    mid.y -= currentDroop;

    // Optional mid-point tremble (FA rift banners): a small sinusoidal y
    // oscillation of the curve's control point — taut cables quiver rather
    // than sway. Pure function of absolute time, so it is frame-rate
    // independent; ordinary cables carry no tremble and skip this entirely.
    if (options.tremble) {
        const { amplitude, speed, phase } = options.tremble;
        mid.y += Math.sin(time * speed + phase) * amplitude;
    }

    // Update positions and lineDistance arrays
    const positions = (cable.line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const distances = (cable.line.geometry.attributes.lineDistance as THREE.BufferAttribute).array as Float32Array;
    let idx = 0;
    let totalDist = 0;

    // First point
    positions[idx++] = pStart.x;
    positions[idx++] = pStart.y;
    positions[idx++] = pStart.z;
    distances[0] = 0;

    let prevX = pStart.x; let prevY = pStart.y; let prevZ = pStart.z;

    // Bezier curve interpolation
    for (let j = 1; j <= segments; j++) {
        const t = j / segments;
        const x = (1 - t) * (1 - t) * pStart.x + 2 * (1 - t) * t * mid.x + t * t * pEnd.x;
        const y = (1 - t) * (1 - t) * pStart.y + 2 * (1 - t) * t * mid.y + t * t * pEnd.y;
        const z = (1 - t) * (1 - t) * pStart.z + 2 * (1 - t) * t * mid.z + t * t * pEnd.z;
        const clampedY = Math.max(0.1, y);

        // Calculate segment distance for lineDistance attribute
        const dx = x - prevX; const dy = clampedY - prevY; const dz = z - prevZ;
        totalDist += Math.sqrt(dx * dx + dy * dy + dz * dz);
        distances[j] = totalDist;

        positions[idx++] = x;
        positions[idx++] = clampedY;
        positions[idx++] = z;

        prevX = x;
        prevY = clampedY;
        prevZ = z;
    }

    cable.line.geometry.attributes.position.needsUpdate = true;
    cable.line.geometry.attributes.lineDistance.needsUpdate = true;
}
