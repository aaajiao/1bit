// 1-bit Chimera Void - Chunk Manager
import * as THREE from 'three';
import { hash } from '../utils/hash';
import { getSharedAssets, SharedAssets } from './SharedAssets';
import { createFloorMaterial, createFloorMesh } from './FloorTile';
import { createBlocksBuilding, createSpikesBuilding, createFluidBuilding } from './BuildingFactory';
import { createTree } from './FloraFactory';
import { createDynamicCable, updateCableGeometry } from './CableSystem';
import type {
    Chunk,
    ChunkUserData,
    CableNode,
    DynamicCable,
    AnimatedObject,
    BuildingUserData,
} from '../types';

// Configuration
export const CHUNK_SIZE = 80;
export const RENDER_DISTANCE = 2;

/**
 * Manages chunk lifecycle and procedural generation
 */
export class ChunkManager {
    private activeChunks: Record<string, Chunk> = {};
    private chunkGroup: THREE.Group = new THREE.Group();
    private floorMaterial: THREE.MeshLambertMaterial;
    private assets: SharedAssets;

    constructor(scene: THREE.Scene) {
        this.floorMaterial = createFloorMaterial();
        this.assets = getSharedAssets();

        scene.add(this.chunkGroup);
    }

    /**
     * Update chunks based on camera position
     */
    update(camera: THREE.Camera): void {
        const cx = Math.floor(camera.position.x / CHUNK_SIZE);
        const cz = Math.floor(camera.position.z / CHUNK_SIZE);
        const activeKeys = new Set<string>();

        // Create new chunks within render distance
        for (let x = -RENDER_DISTANCE; x <= RENDER_DISTANCE; x++) {
            for (let z = -RENDER_DISTANCE; z <= RENDER_DISTANCE; z++) {
                const key = `${cx + x},${cz + z}`;
                activeKeys.add(key);
                if (!this.activeChunks[key]) {
                    this.createChunk(cx + x, cz + z);
                }
            }
        }

        // Remove chunks outside render distance
        for (const key in this.activeChunks) {
            if (!activeKeys.has(key)) {
                this.removeChunk(key);
            }
        }
    }

    /**
     * Create a new chunk at grid position
     */
    private createChunk(cx: number, cz: number): void {
        const chunk = new THREE.Group() as Chunk;
        chunk.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
        chunk.userData = {
            cables: [],
            buildings: [],
            animatedObjects: [],  // Pre-collected animated objects for optimization
        } as ChunkUserData;

        // Floor
        const floor = createFloorMesh(CHUNK_SIZE, this.floorMaterial);
        chunk.add(floor);

        // Buildings and nodes for cables
        const numBuildings = 3 + Math.floor(hash(cx, cz + 1) * 5);
        const nodes: CableNode[] = [];

        for (let i = 0; i < numBuildings; i++) {
            const bx = (hash(cx + i, cz) - 0.5) * (CHUNK_SIZE - 20);
            const bz = (hash(cx, cz + i) - 0.5) * (CHUNK_SIZE - 20);

            const buildGroup = new THREE.Group();
            buildGroup.position.set(bx, 0, bz);

            // Determine style
            const styleSeed = hash(i, cx);
            let style = 'BLOCKS';
            if (styleSeed > 0.9) style = 'FLUID';
            else if (styleSeed > 0.7) style = 'TREE';
            else if (styleSeed > 0.35) style = 'SPIKES';

            // Mobility settings
            let isMobile = false;
            if (style !== 'TREE') {
                isMobile = hash(i, i) > 0.3;
            }

            (buildGroup.userData as BuildingUserData) = {
                initialPos: buildGroup.position.clone(),
                wanderSpeed: 0.2 + hash(i, i) * 0.3,
                wanderRange: 2.0 + hash(i, cx) * 5.0,
                offset: hash(i, cz) * 100,
                isMobile: isMobile,
            };

            let maxHeight = 0;
            const params = { i, cx, cz, assets: this.assets };
            const animatedObjects = chunk.userData.animatedObjects;

            // Generate based on style
            if (style === 'TREE') {
                maxHeight = createTree(buildGroup, params, animatedObjects);
            } else if (style === 'FLUID') {
                maxHeight = createFluidBuilding(buildGroup, params, animatedObjects);
            } else if (style === 'SPIKES') {
                maxHeight = createSpikesBuilding(buildGroup, params);
            } else {
                maxHeight = createBlocksBuilding(buildGroup, params);
            }

            chunk.add(buildGroup);
            nodes.push({
                obj: buildGroup,
                topOffset: new THREE.Vector3(0, maxHeight, 0),
                isGround: false,
            });

            chunk.userData.buildings.push(buildGroup);
        }

        // Create cables between buildings
        this.createCables(chunk, nodes, cx, cz);

        this.activeChunks[`${cx},${cz}`] = chunk;
        this.chunkGroup.add(chunk);
    }

    /**
     * Create cables for a chunk
     */
    private createCables(chunk: Chunk, nodes: CableNode[], cx: number, cz: number): void {
        if (nodes.length < 1) return;

        // Cables between buildings
        if (nodes.length > 1) {
            for (let i = 0; i < nodes.length - 1; i++) {
                const startNode = nodes[i];
                const endNode = nodes[i + 1];
                const strands = 1 + (hash(i, cx) > 0.5 ? 1 : 0);

                for (let s = 0; s < strands; s++) {
                    const cable = createDynamicCable(startNode, endNode, {
                        droop: 5 + hash(i, s) * 10,
                        heavySag: hash(i, i) > 0.8,
                        offsetS: new THREE.Vector3(
                            (hash(s, i) - 0.5) * 2,
                            0,
                            (hash(i, s) - 0.5) * 2
                        ),
                        offsetE: new THREE.Vector3(
                            (hash(s, i + 1) - 0.5) * 2,
                            0,
                            (hash(i + 1, s) - 0.5) * 2
                        ),
                    });
                    chunk.add(cable.line);
                    chunk.userData.cables.push(cable);
                }
            }
        }

        // Dangling cables to ground
        for (let i = 0; i < nodes.length; i++) {
            if (hash(i, cx) > 0.6) {
                const startNode = nodes[i];
                const numDangles = 1 + Math.floor(hash(i, cz) * 2);

                for (let k = 0; k < numDangles; k++) {
                    const angle = hash(k, i) * Math.PI * 2;
                    const dist = 10 + hash(i, k) * 15;
                    const groundPos = startNode.obj.position.clone().add(
                        new THREE.Vector3(
                            Math.cos(angle) * dist,
                            0,
                            Math.sin(angle) * dist
                        )
                    );
                    groundPos.y = 0.1;

                    const groundNode: CableNode = {
                        obj: { position: groundPos },
                        topOffset: new THREE.Vector3(0, 0, 0),
                        isGround: true,
                    };

                    const cable = createDynamicCable(startNode, groundNode, {
                        droop: 2,
                        heavySag: false,
                        offsetS: new THREE.Vector3(
                            hash(k, i) - 0.5,
                            0,
                            hash(i, k) - 0.5
                        ),
                        offsetE: new THREE.Vector3(0, 0, 0),
                    });
                    chunk.add(cable.line);
                    chunk.userData.cables.push(cable);
                }
            }
        }
    }

    /**
     * Remove a chunk and clean up resources
     */
    private removeChunk(key: string): void {
        const chunk = this.activeChunks[key];
        if (chunk.userData.cables) {
            chunk.userData.cables.forEach((c: DynamicCable) => {
                if (c.line && c.line.geometry) {
                    c.line.geometry.dispose();
                }
            });
        }
        this.chunkGroup.remove(chunk);
        delete this.activeChunks[key];
    }

    /**
     * Animate all chunks (buildings, cables)
     * @param time - Current time in seconds
     * @param delta - Delta time in seconds
     */
    animate(time: number, delta: number): void {
        for (const key in this.activeChunks) {
            const chunk = this.activeChunks[key];

            // Animate buildings (mobile wandering)
            if (chunk.userData.buildings) {
                chunk.userData.buildings.forEach(group => {
                    const ud = group.userData as BuildingUserData;
                    if (ud.isMobile) {
                        const driftTime = time * ud.wanderSpeed + ud.offset;
                        group.position.x = ud.initialPos.x + Math.sin(driftTime) * ud.wanderRange;
                        group.position.z = ud.initialPos.z + Math.cos(driftTime * 0.7) * ud.wanderRange;
                        group.position.y = ud.initialPos.y + Math.sin(driftTime * 0.5) * 2.0;
                    }
                });
            }

            // Animate pre-collected objects (P0 optimization)
            if (chunk.userData.animatedObjects) {
                chunk.userData.animatedObjects.forEach((obj: AnimatedObject) => {
                    const ud = obj.userData;
                    if (!ud) return;

                    if (ud.animType === 'ROTATE_FLOAT' && ud.speed !== undefined) {
                        obj.rotation.x += ud.speed * delta;
                        obj.rotation.z += ud.speed * delta;
                    }
                    if (ud.animType === 'LIQUID_WOBBLE' && ud.baseScale && ud.speed !== undefined && ud.phase !== undefined) {
                        const s = Math.sin(time * ud.speed + ud.phase);
                        const sy = 1.0 + s * 0.15;
                        const sxz = 1.0 - s * 0.07;
                        obj.scale.set(
                            ud.baseScale.x * sxz,
                            ud.baseScale.y * sy,
                            ud.baseScale.z * sxz
                        );
                    }
                    if (ud.animType === 'BRANCH_SWAY' && ud.initialRotZ !== undefined && ud.speed !== undefined && ud.phase !== undefined && ud.rigidity !== undefined) {
                        const sway = Math.sin(time * ud.speed + ud.phase) * 0.05 * (1.0 / ud.rigidity);
                        obj.rotation.z = ud.initialRotZ + sway;
                        obj.rotation.y += Math.cos(time * 0.5 + ud.phase) * 0.002;
                    }
                    if (ud.animType === 'LEAF_FLUTTER' && ud.phase !== undefined) {
                        obj.rotation.x += Math.sin(time * 5.0 + ud.phase) * 0.05;
                        obj.rotation.z += Math.cos(time * 3.0 + ud.phase) * 0.05;
                    }
                    if (ud.isPlasma && obj.material?.emissive) {
                        const pulse = 0.5 + Math.sin(time * 2 + obj.position.x) * 0.5;
                        obj.material.emissive.setHSL(0, 0, pulse * 0.2);
                    }
                });
            }

            // Update cables
            if (chunk.userData.cables) {
                chunk.userData.cables.forEach((cable: DynamicCable) => {
                    updateCableGeometry(cable);
                });
            }
        }
    }
}
