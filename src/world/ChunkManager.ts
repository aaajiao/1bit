import type {
    BuildingUserData,
    CableNode,
    Chunk,
    ChunkUserData,
    DynamicCable,
} from '../types';
import type { RoomShaderConfig } from './RoomConfig';
import type { SharedAssets } from './SharedAssets';
// 1-bit Chimera Void - Chunk Manager
import * as THREE from 'three';
import { hash } from '../utils/hash';
import { createBlocksBuilding, createFluidBuilding, createSpikesBuilding } from './BuildingFactory';
import { createDynamicCable } from './CableSystem';
import { animateChunk } from './ChunkAnimator';
import { createCrackedFloorMesh, createFloorMaterial, createFloorMesh, createMoireFloorMesh } from './FloorTile';
import { createTree } from './FloraFactory';
import { getRoomTypeFromPosition, lerpRoomShaderConfig, ROOM_CONFIGS, RoomType } from './RoomConfig';
import { getSharedAssets } from './SharedAssets';

// Configuration
export const CHUNK_SIZE = 80;
export const RENDER_DISTANCE = 2;

/**
 * Extended chunk user data with room type
 */
interface ExtendedChunkUserData extends ChunkUserData {
    roomType: RoomType;
}

/**
 * Manages chunk lifecycle and procedural generation
 */
export class ChunkManager {
    private activeChunks: Record<string, Chunk> = {};
    private chunkGroup: THREE.Group = new THREE.Group();
    private floorMaterial: THREE.MeshLambertMaterial;
    private assets: SharedAssets;

    // Current room state
    private currentRoomType: RoomType = RoomType.INFO_OVERFLOW;
    private previousRoomType: RoomType = RoomType.INFO_OVERFLOW;
    private roomTransitionProgress: number = 1.0; // 1.0 = fully transitioned
    private roomTransitionSpeed: number = 2.0; // Transition over 0.5 seconds

    // Shader config for current room (interpolated during transitions)
    private currentShaderConfig: RoomShaderConfig;

    constructor(scene: THREE.Scene) {
        this.floorMaterial = createFloorMaterial();
        this.assets = getSharedAssets();
        this.currentShaderConfig = { ...ROOM_CONFIGS[RoomType.INFO_OVERFLOW].shader };

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

        // Assign room type based on position
        const roomType = getRoomTypeFromPosition(cx, cz);

        chunk.userData = {
            cables: [],
            buildings: [],
            animatedObjects: [], // Pre-collected animated objects for optimization
            roomType,
        } as ExtendedChunkUserData;

        // Floor - select type based on room
        // Floor - select type based on room
        let floor: THREE.Object3D;
        if (roomType === RoomType.FORCED_ALIGNMENT) {
            const crackedSystem = createCrackedFloorMesh(CHUNK_SIZE, this.floorMaterial);
            floor = crackedSystem.group;

            // Store fog system for animation
            if (crackedSystem.fog) {
                // We'll store it in userData.fogSystem (requires type update or loose typing)
                (chunk.userData as any).fogSystem = crackedSystem.fog;
            }
        }
        else if (roomType === RoomType.IN_BETWEEN) {
            floor = createMoireFloorMesh(CHUNK_SIZE, this.floorMaterial);
        }
        else {
            floor = createFloorMesh(CHUNK_SIZE, this.floorMaterial);
        }
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
            if (styleSeed > 0.9)
                style = 'FLUID';
            else if (styleSeed > 0.7)
                style = 'TREE';
            else if (styleSeed > 0.35)
                style = 'SPIKES';

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
                isMobile,
            };

            let maxHeight = 0;
            const params = { i, cx, cz, assets: this.assets };
            const animatedObjects = chunk.userData.animatedObjects;

            // Generate based on style
            if (style === 'TREE') {
                maxHeight = createTree(buildGroup, params, animatedObjects);
            }
            else if (style === 'FLUID') {
                maxHeight = createFluidBuilding(buildGroup, params, animatedObjects);
            }
            else if (style === 'SPIKES') {
                maxHeight = createSpikesBuilding(buildGroup, params);
            }
            else {
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
        if (nodes.length < 1)
            return;

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
                            (hash(i, s) - 0.5) * 2,
                        ),
                        offsetE: new THREE.Vector3(
                            (hash(s, i + 1) - 0.5) * 2,
                            0,
                            (hash(i + 1, s) - 0.5) * 2,
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
                            Math.sin(angle) * dist,
                        ),
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
                            hash(i, k) - 0.5,
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
        // Animate all chunks (delegated to ChunkAnimator)
        for (const key in this.activeChunks) {
            animateChunk(this.activeChunks[key], time, delta);
        }

        // Update room transition
        if (this.roomTransitionProgress < 1.0) {
            this.roomTransitionProgress += delta * this.roomTransitionSpeed;
            if (this.roomTransitionProgress >= 1.0) {
                this.roomTransitionProgress = 1.0;
            }

            // Interpolate shader config
            const fromConfig = ROOM_CONFIGS[this.previousRoomType].shader;
            const toConfig = ROOM_CONFIGS[this.currentRoomType].shader;
            this.currentShaderConfig = lerpRoomShaderConfig(
                fromConfig,
                toConfig,
                this.roomTransitionProgress,
            );
        }
    }

    /**
     * Get the room type at the player's current position
     */
    getCurrentRoomType(): RoomType {
        return this.currentRoomType;
    }

    /**
     * Get the current shader configuration (interpolated during transitions)
     */
    getCurrentShaderConfig(): RoomShaderConfig {
        return { ...this.currentShaderConfig };
    }

    /**
     * Update current room based on player position
     * Should be called from main update loop
     */
    updatePlayerRoom(playerX: number, playerZ: number): void {
        const cx = Math.floor(playerX / CHUNK_SIZE);
        const cz = Math.floor(playerZ / CHUNK_SIZE);
        const key = `${cx},${cz}`;

        const chunk = this.activeChunks[key];
        if (chunk) {
            const chunkData = chunk.userData as ExtendedChunkUserData;
            const newRoomType = chunkData.roomType;

            if (newRoomType !== this.currentRoomType) {
                // Start room transition
                this.previousRoomType = this.currentRoomType;
                this.currentRoomType = newRoomType;
                this.roomTransitionProgress = 0.0;
            }
        }
    }

    /**
     * Check if currently in a room transition
     */
    isInTransition(): boolean {
        return this.roomTransitionProgress < 1.0;
    }

    /**
     * Get room config for current room
     */
    getCurrentRoomConfig() {
        return ROOM_CONFIGS[this.currentRoomType];
    }

    /**
     * Get distance to nearest cable for audio proximity
     * Returns distance in meters (Infinity if no cables)
     */
    getDistanceToNearestCable(playerPos: THREE.Vector3): number {
        let minDistance = Infinity;

        // Optimization: only check chunks near the player
        const cx = Math.floor(playerPos.x / CHUNK_SIZE);
        const cz = Math.floor(playerPos.z / CHUNK_SIZE);

        for (let x = -1; x <= 1; x++) {
            for (let z = -1; z <= 1; z++) {
                const key = `${cx + x},${cz + z}`;
                const chunk = this.activeChunks[key];
                if (!chunk || !chunk.userData.cables)
                    continue;

                // Check cables in this chunk
                for (const cable of chunk.userData.cables) {
                    if (!cable.line)
                        continue;

                    // Approximate distance to the line segment
                    // Simple check against midpoint first
                    const start = cable.startNode.obj.position.clone().add(cable.startNode.topOffset);
                    const end = cable.endNode.obj.position.clone().add(cable.endNode.topOffset);
                    const mid = start.clone().lerp(end, 0.5);

                    if (playerPos.distanceToSquared(mid) > 2500)
                        continue; // Skip far cables (>50m)

                    // Accurate distance to segment
                    const line = new THREE.Line3(start, end);
                    const closestPoint = new THREE.Vector3();
                    line.closestPointToPoint(playerPos, false, closestPoint);
                    const dist = playerPos.distanceTo(closestPoint);

                    if (dist < minDistance) {
                        minDistance = dist;
                    }

                    // Also check dynamic points? (Too expensive, the straight line approximation is usually good enough for "audio hum")
                    // If heavy sag, maybe check the sag point
                    if (cable.options.heavySag) {
                        // Very rough approximation of sag point height (usually much lower)
                        const sagPoint = mid.clone();
                        sagPoint.y -= cable.options.droop;
                        const sagDist = playerPos.distanceTo(sagPoint);
                        if (sagDist < minDistance)
                            minDistance = sagDist;
                    }
                }
            }
        }

        return minDistance;
    }
}
