// Chunk Animation Logic
// Extracted from ChunkManager for better separation of concerns

import type { AnimatedObject, BuildingUserData, Chunk, DynamicCable, FlickerGroup } from '../types';
import * as THREE from 'three';
import { WORLD } from '../config/constants';
import { updateCableGeometry } from './CableSystem';
import { refreshIntervalForIntensity, RoomType } from './RoomConfig';

// Squared LOD thresholds (compared against squared distances to avoid sqrt)
const ANIMATION_FULL_DISTANCE_SQ = WORLD.ANIMATION_FULL_DISTANCE * WORLD.ANIMATION_FULL_DISTANCE;
const ANIMATION_LOD_DISTANCE_SQ = WORLD.ANIMATION_LOD_DISTANCE * WORLD.ANIMATION_LOD_DISTANCE;

// Module-scoped scratch objects reused across frames (avoid per-frame allocation)
const _fogMatrix = new THREE.Matrix4();
const _fogPosition = new THREE.Vector3();
const _fogRotation = new THREE.Quaternion();
const _fogScale = new THREE.Vector3();
const _worldPos = new THREE.Vector3();

/**
 * Animate a single chunk's objects
 * @param chunk - The chunk to animate
 * @param time - Current time in seconds
 * @param delta - Delta time in seconds
 * @param cameraPosition - Optional camera world position. When provided,
 *   per-object animation is gated by distance using the WORLD LOD thresholds.
 *   When omitted (default), every object is animated (legacy behavior).
 * @param flowerIntensity - Optional flower intensity in [0,1] driving the
 *   INFO_OVERFLOW building-flicker refresh rate (defaults to a neutral 0.5).
 */
export function animateChunk(
    chunk: Chunk,
    time: number,
    delta: number,
    cameraPosition?: THREE.Vector3,
    flowerIntensity: number = 0.5,
): void {
    // Animate buildings (mobile wandering)
    if (chunk.userData.buildings) {
        animateBuildings(chunk.userData.buildings, time, cameraPosition);
    }

    // Animate pre-collected objects (P0 optimization)
    if (chunk.userData.animatedObjects) {
        animateObjects(chunk.userData.animatedObjects, time, delta, cameraPosition);
    }

    // Update cables (time drives the rift banners' mid-point tremble)
    if (chunk.userData.cables) {
        chunk.userData.cables.forEach((cable: DynamicCable) => {
            updateCableGeometry(cable, time);
        });
    }

    // Animate fog system for cracked floors
    animateFogSystem(chunk, delta);

    // INFO_OVERFLOW building flicker: toggle pre-built variant visibility only.
    // Gated to INFO_OVERFLOW chunks that actually carry flicker groups.
    if (chunk.userData.roomType === RoomType.INFO_OVERFLOW && chunk.userData.flickerGroups) {
        animateFlicker(chunk.userData.flickerGroups, time, flowerIntensity, cameraPosition);
    }
}

/**
 * INFO_OVERFLOW building flicker. For each flicker group, computes the active
 * variant index from a deterministic interval (keyed off flower intensity via
 * INFO_OVERFLOW_REFRESH_MAP) plus the group's stable phase, then toggles
 * .visible so exactly one variant shows. NEVER rebuilds geometry (variants are
 * pre-built, sharing pooled geo/material). Redundant visibility writes are
 * skipped via the cached `current` index. LOD-gated by the first variant's
 * world position so distant chunks stop toggling.
 */
function animateFlicker(
    groups: FlickerGroup[],
    time: number,
    flowerIntensity: number,
    cameraPosition?: THREE.Vector3,
): void {
    // Interval is shared across all groups this frame (depends only on intensity).
    const interval = refreshIntervalForIntensity(flowerIntensity);
    if (interval <= 0)
        return;

    for (const group of groups) {
        const variants = group.variants;
        if (variants.length < 2)
            continue;

        // LOD: skip flicker for groups beyond the LOD distance (anchor = v0).
        const distSq = distanceSqToCamera(variants[0], cameraPosition);
        if (distSq !== null && distSq > ANIMATION_LOD_DISTANCE_SQ)
            continue;

        // Deterministic step index from time + per-group phase, wrapped to the
        // variant count. No hash() in this loop — phase was precomputed at build.
        const step = Math.floor((time + group.phase) / interval);
        const next = ((step % variants.length) + variants.length) % variants.length;
        if (next === group.current)
            continue;

        variants[group.current].visible = false;
        variants[next].visible = true;
        group.current = next;
    }
}

/**
 * Returns the squared world-space distance from an object to the camera,
 * or null when no camera position is supplied (so callers skip LOD gating).
 */
function distanceSqToCamera(obj: THREE.Object3D, cameraPosition?: THREE.Vector3): number | null {
    if (!cameraPosition)
        return null;
    obj.getWorldPosition(_worldPos);
    return _worldPos.distanceToSquared(cameraPosition);
}

/**
 * Animate mobile buildings (wandering motion)
 */
function animateBuildings(buildings: THREE.Group[], time: number, cameraPosition?: THREE.Vector3): void {
    buildings.forEach((group) => {
        const ud = group.userData as BuildingUserData;
        if (ud.isMobile) {
            // LOD: skip wandering for buildings beyond the LOD distance
            const distSq = distanceSqToCamera(group, cameraPosition);
            if (distSq !== null && distSq > ANIMATION_LOD_DISTANCE_SQ)
                return;

            const driftTime = time * ud.wanderSpeed + ud.offset;
            group.position.x = ud.initialPos.x + Math.sin(driftTime) * ud.wanderRange;
            group.position.z = ud.initialPos.z + Math.cos(driftTime * 0.7) * ud.wanderRange;
            group.position.y = ud.initialPos.y + Math.sin(driftTime * 0.5) * 2.0;
        }
    });
}

/**
 * Animate individual objects based on their animation type
 */
function animateObjects(objects: AnimatedObject[], time: number, delta: number, cameraPosition?: THREE.Vector3): void {
    objects.forEach((obj: AnimatedObject) => {
        const ud = obj.userData;
        if (!ud)
            return;

        // LOD: gate animation by distance when a camera position is supplied.
        // Beyond the LOD distance the object is left static; within the full
        // distance it always animates. Between the two it animates on alternate
        // frames (cheap temporal decimation) keyed off the object's id.
        const distSq = distanceSqToCamera(obj, cameraPosition);
        if (distSq !== null) {
            if (distSq > ANIMATION_LOD_DISTANCE_SQ)
                return;
            if (distSq > ANIMATION_FULL_DISTANCE_SQ && (obj.id + Math.floor(time * 60)) % 2 !== 0)
                return;
        }

        switch (ud.animType) {
            case 'ROTATE_FLOAT':
                if (ud.speed !== undefined) {
                    obj.rotation.x += ud.speed * delta;
                    obj.rotation.z += ud.speed * delta;
                }
                break;

            case 'LIQUID_WOBBLE':
                if (ud.baseScale && ud.speed !== undefined && ud.phase !== undefined) {
                    const s = Math.sin(time * ud.speed + ud.phase);
                    const sy = 1.0 + s * 0.15;
                    const sxz = 1.0 - s * 0.07;
                    obj.scale.set(
                        ud.baseScale.x * sxz,
                        ud.baseScale.y * sy,
                        ud.baseScale.z * sxz,
                    );
                }
                break;

            case 'BRANCH_SWAY':
                if (ud.initialRotZ !== undefined && ud.speed !== undefined && ud.phase !== undefined && ud.rigidity !== undefined) {
                    const sway = Math.sin(time * ud.speed + ud.phase) * 0.05 * (1.0 / ud.rigidity);
                    obj.rotation.z = ud.initialRotZ + sway;
                    obj.rotation.y += Math.cos(time * 0.5 + ud.phase) * 0.002;
                }
                break;

            case 'LEAF_FLUTTER':
                if (ud.phase !== undefined) {
                    obj.rotation.x += Math.sin(time * 5.0 + ud.phase) * 0.05;
                    obj.rotation.z += Math.cos(time * 3.0 + ud.phase) * 0.05;
                }
                break;
        }

        // Plasma emissive pulsing
        if (ud.isPlasma && obj.material?.emissive) {
            const pulse = 0.5 + Math.sin(time * 2 + obj.position.x) * 0.5;
            obj.material.emissive.setHSL(0, 0, pulse * 0.2);
        }
    });
}

/**
 * Animate fog particles for cracked floors
 */
function animateFogSystem(chunk: Chunk, delta: number): void {
    const fogSystem = chunk.userData.fogSystem;
    if (!fogSystem || !fogSystem.userData.speeds)
        return;

    // Per-instance recycle ceilings + shared reset floor written by
    // createAbyssFog (FA_RIFT.FOG heights in the mesh's local frame): dense
    // particles recycle at the dense-band top, leakers ride on to the column
    // top. The legacy fallbacks keep any topYs-less fog mesh cycling sanely.
    const topYs: number[] | undefined = fogSystem.userData.topYs;
    const resetY: number = fogSystem.userData.resetY ?? -160.0;

    for (let i = 0; i < fogSystem.count; i++) {
        fogSystem.getMatrixAt(i, _fogMatrix);
        _fogMatrix.decompose(_fogPosition, _fogRotation, _fogScale);

        // Move up
        const speed = fogSystem.userData.speeds[i];
        _fogPosition.y += speed * delta;

        // Reset once past this instance's own ceiling. The horizontal nudge must
        // stay deterministic, but this is a per-frame hot loop over up to 400
        // instances, so hash() is too costly here. Instead derive a cheap stable
        // per-instance offset from the already deterministic per-instance speed
        // (seeded via hash-RNG at creation) using plain trig — no allocation,
        // no hash() call. Mapped to ~[-0.25, 0.25).
        if (_fogPosition.y > (topYs ? topYs[i] : 2.0)) {
            _fogPosition.y = resetY;
            _fogPosition.x += Math.sin(speed * 12.9898) * 0.25;
            _fogPosition.z += Math.cos(speed * 78.233) * 0.25;
        }

        _fogMatrix.compose(_fogPosition, _fogRotation, _fogScale);
        fogSystem.setMatrixAt(i, _fogMatrix);
    }
    fogSystem.instanceMatrix.needsUpdate = true;
}
