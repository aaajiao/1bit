// Chunk Animation Logic
// Extracted from ChunkManager for better separation of concerns

import type { AnimatedObject, BuildingUserData, Chunk, DynamicCable } from '../types';
import * as THREE from 'three';
import { updateCableGeometry } from './CableSystem';

/**
 * Animate a single chunk's objects
 * @param chunk - The chunk to animate
 * @param time - Current time in seconds
 * @param delta - Delta time in seconds
 */
export function animateChunk(chunk: Chunk, time: number, delta: number): void {
    // Animate buildings (mobile wandering)
    if (chunk.userData.buildings) {
        animateBuildings(chunk.userData.buildings, time);
    }

    // Animate pre-collected objects (P0 optimization)
    if (chunk.userData.animatedObjects) {
        animateObjects(chunk.userData.animatedObjects, time, delta);
    }

    // Update cables
    if (chunk.userData.cables) {
        chunk.userData.cables.forEach((cable: DynamicCable) => {
            updateCableGeometry(cable);
        });
    }

    // Animate fog system for cracked floors
    animateFogSystem(chunk, delta);
}

/**
 * Animate mobile buildings (wandering motion)
 */
function animateBuildings(buildings: THREE.Group[], time: number): void {
    buildings.forEach((group) => {
        const ud = group.userData as BuildingUserData;
        if (ud.isMobile) {
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
function animateObjects(objects: AnimatedObject[], time: number, delta: number): void {
    objects.forEach((obj: AnimatedObject) => {
        const ud = obj.userData;
        if (!ud)
            return;

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
    const fogSystem = (chunk.userData as any).fogSystem as THREE.InstancedMesh;
    if (!fogSystem || !fogSystem.userData.speeds)
        return;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (let i = 0; i < fogSystem.count; i++) {
        fogSystem.getMatrixAt(i, matrix);
        matrix.decompose(position, rotation, scale);

        // Move up
        const speed = fogSystem.userData.speeds[i];
        position.y += speed * delta;

        // Reset if too high
        if (position.y > 2.0) {
            position.y = -160.0;
            position.x += (Math.random() - 0.5) * 0.5;
            position.z += (Math.random() - 0.5) * 0.5;
        }

        matrix.compose(position, rotation, scale);
        fogSystem.setMatrixAt(i, matrix);
    }
    fogSystem.instanceMatrix.needsUpdate = true;
}
