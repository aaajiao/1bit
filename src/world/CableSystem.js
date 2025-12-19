// 1-bit Chimera Void - Cable System
import * as THREE from 'three';
import { CableShader } from '../shaders/DitherShader.js';

// Shared shader material for all cables
let cableShaderMat = null;

/**
 * Get or create the cable shader material
 * @returns {THREE.ShaderMaterial}
 */
export function getCableMaterial() {
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
 * @param {number} time - Current time in seconds
 */
export function updateCableTime(time) {
    if (cableShaderMat) {
        cableShaderMat.uniforms.time.value = time;
    }
}

/**
 * Creates a dynamic cable between two nodes
 * @param {Object} startNode - Start node with position
 * @param {Object} endNode - End node with position
 * @param {Object} options - Cable options (droop, heavySag, offsets)
 * @returns {Object} Cable object with line, nodes, options, and cache
 */
export function createDynamicCable(startNode, endNode, options) {
    const segments = 12;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((segments + 1) * 3);
    const distances = new Float32Array(segments + 1);

    // Random seed per cable - same value for all vertices in this cable
    const randomSeeds = new Float32Array(segments + 1);
    const cableSeed = Math.random();
    for (let i = 0; i <= segments; i++) {
        randomSeeds[i] = cableSeed;
    }

    geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3)
    );
    geometry.setAttribute(
        'lineDistance',
        new THREE.BufferAttribute(distances, 1)
    );
    geometry.setAttribute(
        'randomSeed',
        new THREE.BufferAttribute(randomSeeds, 1)
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
        }
    };
}

/**
 * Update cable geometry based on node positions
 * @param {Object} cable - Cable object
 */
export function updateCableGeometry(cable) {
    const { startNode, endNode, options, segments, _cache } = cable;

    // Use cached vectors instead of creating new ones
    const pStart = _cache.pStart;
    const pEnd = _cache.pEnd;
    const mid = _cache.mid;

    // Calculate start position
    if (startNode.isGround) {
        pStart.copy(startNode.obj.position).add(options.offsetS);
    } else {
        pStart.copy(startNode.obj.position)
            .add(startNode.topOffset)
            .add(options.offsetS);
    }

    // Calculate end position
    if (endNode.isGround) {
        pEnd.copy(endNode.obj.position).add(options.offsetE);
    } else {
        pEnd.copy(endNode.obj.position)
            .add(endNode.topOffset)
            .add(options.offsetE);
    }

    // Calculate midpoint with droop
    mid.addVectors(pStart, pEnd).multiplyScalar(0.5);
    const dist = pStart.distanceTo(pEnd);
    let currentDroop = Math.max(0, options.droop - dist * 0.1);
    if (options.heavySag) currentDroop += 20;
    mid.y -= currentDroop;

    // Update positions and lineDistance arrays
    const positions = cable.line.geometry.attributes.position.array;
    const distances = cable.line.geometry.attributes.lineDistance.array;
    let idx = 0;
    let totalDist = 0;

    // First point
    positions[idx++] = pStart.x;
    positions[idx++] = pStart.y;
    positions[idx++] = pStart.z;
    distances[0] = 0;

    let prevX = pStart.x, prevY = pStart.y, prevZ = pStart.z;

    // Bezier curve interpolation
    for (let j = 1; j <= segments; j++) {
        const t = j / segments;
        const x = (1 - t) * (1 - t) * pStart.x + 2 * (1 - t) * t * mid.x + t * t * pEnd.x;
        const y = (1 - t) * (1 - t) * pStart.y + 2 * (1 - t) * t * mid.y + t * t * pEnd.y;
        const z = (1 - t) * (1 - t) * pStart.z + 2 * (1 - t) * t * mid.z + t * t * pEnd.z;
        const clampedY = Math.max(0.1, y);

        // Calculate segment distance for lineDistance attribute
        const dx = x - prevX, dy = clampedY - prevY, dz = z - prevZ;
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
