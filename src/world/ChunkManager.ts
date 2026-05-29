import type {
    BuildingUserData,
    CableNode,
    Chunk,
    ChunkUserData,
    DynamicCable,
    FlickerGroup,
} from '../types';
import type { RoomShaderConfig } from './RoomConfig';
import type { SharedAssets } from './SharedAssets';
// 1-bit Chimera Void - Chunk Manager
import * as THREE from 'three';
import { ROOM_TRANSITION, WORLD } from '../config/constants';
import { disposeObject3D } from '../utils/dispose';
import { hash } from '../utils/hash';
import { createBlocksBuilding, createFluidBuilding, createSpikesBuilding } from './BuildingFactory';
import { createDynamicCable, disposeCableMaterial } from './CableSystem';
import { animateChunk } from './ChunkAnimator';
import { createCrackedFloorMesh, createFloorMaterial, createFloorMesh, createInfoFloorMesh, createMoireFloorMesh, createSeamFloorMesh, disposeFloorPool } from './FloorTile';
import { createTree } from './FloraFactory';
import { getRoomTypeFromPosition, lerpRoomShaderConfig, ROOM_CONFIGS, RoomType } from './RoomConfig';
import {
    anomalyAt,
    applyLayout,
    biomeAt,
    biomeDensityFactor,
    biomeScaleFactor,
    chunkBuildingCount,
    layoutAt,
    polarizedFaction,
    selectBuildingStyle,
    snapToGrid,
    subPaletteIndex,
} from './RoomGeneration';
import { getSharedAssets } from './SharedAssets';

// Configuration (sourced from centralized constants; re-exported for consumers)
export const CHUNK_SIZE = WORLD.CHUNK_SIZE;
export const RENDER_DISTANCE = WORLD.RENDER_DISTANCE;

// Distinct integer salts for IN_BETWEEN z-fight ghost seeding, kept decorrelated
// from the position/style hashes drawn for the same building.
const GHOST_COUNT_SALT = 307;
const GHOST_X_SALT = 311;
const GHOST_Y_SALT = 313;
const GHOST_Z_SALT = 317;

// Phase 4 salts (decorrelated from every prior per-chunk draw).
const SUBTINT_GATE_SALT = 907; // which fragments take a sub-palette tint
const FLICKER_GATE_SALT = 1009; // which fragments get a flicker group
const FLICKER_PHASE_SALT = 1013; // per-group desync phase
const FLICKER_VARIANT_SALT = 1019; // per-variant geometry/scale pick

// INFO_OVERFLOW building-flicker tuning.
const FLICKER_MAX_GROUPS_PER_CHUNK = 4; // cap subset so the toggle stays cheap
const FLICKER_VARIANTS_PER_GROUP = 3; // 2-3 pre-built variants per group

// Anomaly tuning. Counts/scales are tweaked but capped so a giant landmark
// never animates hundreds of fragments at full rate (LOD still gates them).
const ANOMALY_COLOSSUS_SCALE = 4.5;
const ANOMALY_SPIKE_GRID_SIDE = 4; // 4x4 = 16 spikes max
const ANOMALY_TREE_RING_COUNT = 7;

/**
 * Extended chunk user data with room type
 */
interface ExtendedChunkUserData extends ChunkUserData {
    roomType: RoomType;
    /**
     * Per-chunk unique materials (and their textures) that must be disposed
     * explicitly on chunk removal, since disposeObject3D skips materials to
     * protect shared assets like the floor material.
     */
    disposables: THREE.Material[];
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
    private roomTransitionSpeed: number = ROOM_TRANSITION.TRANSITION_SPEED; // 2.0 -> transition over 0.5 seconds

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
            disposables: [],
        } as ExtendedChunkUserData;

        const chunkData = chunk.userData as ExtendedChunkUserData;

        // Phase 4 world-scale variety, sampled once per chunk. Biome is the broad
        // substrate (macro-rhythm: nudges density/scale), layout is per-chunk
        // composition, and anomaly is the very-rare landmark swap. roomType stays
        // the dominant overlay (it still dictates building STYLE below).
        const biome = biomeAt(cx, cz);
        const layoutMode = layoutAt(cx, cz, roomType);

        // Floor - select type based on room
        let floor: THREE.Object3D;
        if (roomType === RoomType.FORCED_ALIGNMENT) {
            const crackedSystem = createCrackedFloorMesh(CHUNK_SIZE, this.floorMaterial, 4, cx, cz);
            floor = crackedSystem.group;
            chunkData.disposables.push(...crackedSystem.disposables);

            // Store fog system for animation
            if (crackedSystem.fog) {
                // We'll store it in userData.fogSystem (requires type update or loose typing)
                chunk.userData.fogSystem = crackedSystem.fog;
            }
        }
        else if (roomType === RoomType.IN_BETWEEN) {
            const moireSystem = createMoireFloorMesh(CHUNK_SIZE, this.floorMaterial);
            floor = moireSystem.group;
            chunkData.disposables.push(...moireSystem.disposables);
        }
        else if (roomType === RoomType.INFO_OVERFLOW) {
            // Pooled glyph/dot-matrix material picked by hash(cx,cz). The material
            // is module-shared, so nothing is added to chunkData.disposables.
            floor = createInfoFloorMesh(CHUNK_SIZE, cx, cz);
        }
        else if (roomType === RoomType.POLARIZED) {
            // Split-halves floor + module-shared seam line at local x=0. Both
            // halves reuse the shared floor material and the seam uses a shared
            // material, so nothing is added to chunkData.disposables.
            floor = createSeamFloorMesh(CHUNK_SIZE, this.floorMaterial);
        }
        else {
            floor = createFloorMesh(CHUNK_SIZE, this.floorMaterial);
        }
        chunk.add(floor);

        // RARE ANOMALY: a very small fraction of chunks (~1.5%) are swapped for a
        // landmark instead of the normal building loop. Cables still follow the
        // resulting nodes. Anomalies use existing factories with capped counts so
        // a giant never animates hundreds of fragments at full rate (LOD gates).
        const anomaly = anomalyAt(cx, cz, roomType);
        if (anomaly) {
            const anomalyNodes = this.buildAnomaly(chunk, anomaly, cx, cz, roomType, biome);
            this.createCables(chunk, anomalyNodes, cx, cz);
            this.activeChunks[`${cx},${cz}`] = chunk;
            this.chunkGroup.add(chunk);
            return;
        }

        // Buildings and nodes for cables. Count is room-skewed with a sparse
        // gate (some chunks become clearings/landmarks). Returning 0 is safe:
        // createCables guards nodes.length<1 and the floor renders independently.
        // Biome nudges the POPULATED count multiplicatively without ever turning
        // a clearing into a populated chunk (a 0/1 result is left untouched).
        const baseCount = chunkBuildingCount(cx, cz, roomType);
        const numBuildings = baseCount <= 1
            ? baseCount
            : Math.max(1, Math.round(baseCount * biomeDensityFactor(biome)));
        const nodes: CableNode[] = [];

        // Per-chunk composition: half-extent the raw positions are bounded to.
        const layoutHalf = (CHUNK_SIZE - 20) / 2;
        // INFO_OVERFLOW flicker groups accumulate here (capped subset).
        const flickerGroups = roomType === RoomType.INFO_OVERFLOW
            ? (chunkData.flickerGroups = [])
            : null;

        // FORCED_ALIGNMENT grid occupancy: at most one building per snapped cell.
        const occupiedCells = roomType === RoomType.FORCED_ALIGNMENT ? new Set<string>() : null;

        for (let i = 0; i < numBuildings; i++) {
            const rawX = (hash(cx + i, cz) - 0.5) * (CHUNK_SIZE - 20);
            const rawZ = (hash(cx, cz + i) - 0.5) * (CHUNK_SIZE - 20);

            // LAYOUT MODE: compose the raw scattered position (cluster / axial
            // street / scatter). SCATTER returns the raw position unchanged, so
            // scatter chunks reproduce the pre-Phase-4 placement exactly. Runs
            // BEFORE the FORCED_ALIGNMENT grid snap and POLARIZED pole skew so
            // those room rules still win (room is the dominant overlay).
            const composed = applyLayout(layoutMode, rawX, rawZ, cx, cz, i, layoutHalf);
            let bx = composed.x;
            let bz = composed.z;

            // FORCED_ALIGNMENT: quantize to an 8-unit grid; skip occupied cells
            // BEFORE pushing to nodes/buildings so the arrays stay consistent.
            if (occupiedCells) {
                bx = snapToGrid(bx);
                bz = snapToGrid(bz);
                const cellKey = `${bx},${bz}`;
                if (occupiedCells.has(cellKey))
                    continue;
                occupiedCells.add(cellKey);
            }

            // POLARIZED faction split: skew each building toward the +X or -X
            // half and pick a filled 'us' (solid) vs hollow 'them' (wire)
            // material. Count is unchanged so cable node indices stay valid.
            let faction: ReturnType<typeof polarizedFaction> | null = null;
            if (roomType === RoomType.POLARIZED) {
                faction = polarizedFaction(cx, cz, i);
                // Push toward the faction pole, clamped within chunk bounds.
                const halfBound = (CHUNK_SIZE - 20) / 2;
                const skew = faction.pole * (halfBound * 0.5);
                bx = Math.max(-halfBound, Math.min(halfBound, Math.abs(bx) * faction.pole + skew));
            }

            const buildGroup = new THREE.Group();
            buildGroup.position.set(bx, 0, bz);

            // Determine style (room-skewed cutoffs).
            const styleSeed = hash(i, cx);
            const style = selectBuildingStyle(styleSeed, roomType);

            // Mobility settings. FORCED_ALIGNMENT is regimented: never mobile,
            // zero rotation (the grid must read as a fixed institutional grid).
            let isMobile = false;
            if (style !== 'TREE') {
                isMobile = hash(i, i) > 0.3;
            }
            if (roomType === RoomType.FORCED_ALIGNMENT) {
                isMobile = false;
            }

            (buildGroup.userData as BuildingUserData) = {
                initialPos: buildGroup.position.clone(),
                wanderSpeed: 0.2 + hash(i, i) * 0.3,
                wanderRange: 2.0 + hash(i, cx) * 5.0,
                offset: hash(i, cz) * 100,
                isMobile,
            };

            let maxHeight = 0;
            const params = { i, cx, cz, assets: this.assets, roomType };
            const animatedObjects = chunk.userData.animatedObjects;
            const disposables = chunkData.disposables;

            // Generate based on style
            if (style === 'TREE') {
                maxHeight = createTree(buildGroup, params, animatedObjects, disposables);
            }
            else if (style === 'FLUID') {
                maxHeight = createFluidBuilding(buildGroup, params, animatedObjects, disposables);
            }
            else if (style === 'SPIKES') {
                maxHeight = createSpikesBuilding(buildGroup, params);
            }
            else {
                maxHeight = createBlocksBuilding(buildGroup, params);
            }

            // FORCED_ALIGNMENT: force zero rotation so the grid reads rigid.
            if (roomType === RoomType.FORCED_ALIGNMENT) {
                buildGroup.rotation.y = 0;
            }

            // POLARIZED: post-traverse meshes and reassign the faction material
            // (solid 'us' vs wire 'them'). Both are shared assets, so no new
            // disposables are added; factories stay untouched.
            if (faction) {
                const factionMaterial = faction.solid ? this.assets.matSolid : this.assets.matWire;
                buildGroup.traverse((obj) => {
                    if ((obj as THREE.Mesh).isMesh) {
                        (obj as THREE.Mesh).material = factionMaterial;
                    }
                });
            }

            // IN_BETWEEN: spawn sub-millimetre coplanar "ghost" clones of the
            // first 1-2 fragment meshes. logarithmicDepthBuffer is OFF so the
            // coplanar faces shimmer (z-fight) on their own — no per-frame cost.
            // Clones reuse the SAME shared geometry+material, so disposeObject3D
            // frees them via traversal and NO new disposables are needed.
            if (roomType === RoomType.IN_BETWEEN) {
                this.addZFightGhosts(buildGroup, cx, cz, i);
            }

            // SUB-PALETTE: nudge a subset of the building's meshes to a shared
            // greyscale tint, biased per biome. Shared singleton material => no
            // new disposables, no per-instance allocation. Skipped under faction
            // override (POLARIZED) so the us/them material split is not undone.
            if (!faction) {
                this.applySubPalette(buildGroup, biome, cx, cz, i);
            }

            // BIOME SCALE: a gentle uniform nudge to the whole group (OVERGROWN
            // taller, SPARSE shrunken). Applied last so cable attachment uses the
            // scaled height. FORCED_ALIGNMENT stays RIGID-biomed (factor ~1) to
            // protect the institutional grid read.
            const scaleFactor = biomeScaleFactor(biome);
            if (scaleFactor !== 1.0) {
                buildGroup.scale.setScalar(scaleFactor);
                maxHeight *= scaleFactor;
            }

            // INFO_OVERFLOW buildingFlicker: on a CAPPED subset of fragments,
            // pre-build 2-3 hash-seeded variant child meshes (shared geo/material)
            // and let the animator toggle .visible — NEVER rebuilding geometry.
            if (flickerGroups && flickerGroups.length < FLICKER_MAX_GROUPS_PER_CHUNK
                && hash(i + FLICKER_GATE_SALT, cx) > 0.55) {
                this.addFlickerGroup(buildGroup, flickerGroups, cx, cz, i);
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
     * IN_BETWEEN z-fight ghosts. Clones the first 1-2 mesh children of a built
     * group with a sub-millimetre, hash-seeded positional offset. The clones
     * reuse the SAME shared geometry and material (THREE.Mesh.clone() is a
     * shallow copy that shares both), so they add zero allocations and are
     * freed by disposeObject3D's traversal — NO new disposables. The tiny
     * offset makes the coplanar faces shimmer because logarithmicDepthBuffer
     * is OFF. Static: no per-frame cost (clones are not pushed to animatedObjects).
     *
     * @param buildGroup - The freshly built building group.
     * @param cx - Chunk X coordinate (deterministic seed).
     * @param cz - Chunk Z coordinate (deterministic seed).
     * @param i - Building index within the chunk (deterministic seed).
     */
    private addZFightGhosts(buildGroup: THREE.Group, cx: number, cz: number, i: number): void {
        // Snapshot the current mesh children (we mutate the group while iterating).
        const meshChildren: THREE.Mesh[] = [];
        for (const child of buildGroup.children) {
            if ((child as THREE.Mesh).isMesh) {
                meshChildren.push(child as THREE.Mesh);
                if (meshChildren.length >= 2)
                    break;
            }
        }

        // 1 or 2 ghosts, deterministic by seed.
        const ghostCount = hash(i + GHOST_COUNT_SALT, cx) > 0.5 ? 2 : 1;
        const limit = Math.min(ghostCount, meshChildren.length);

        for (let g = 0; g < limit; g++) {
            const source = meshChildren[g];
            // Mesh.clone() shares geometry + material (shallow) — no new GPU data.
            const ghost = source.clone();
            // Sub-millimetre offset: ~[-0.0005, 0.0005) on each axis.
            ghost.position.set(
                source.position.x + (hash(g + GHOST_X_SALT, cz) - 0.5) * 0.001,
                source.position.y + (hash(g + GHOST_Y_SALT, cx) - 0.5) * 0.001,
                source.position.z + (hash(g + GHOST_Z_SALT, cz + cx) - 0.5) * 0.001,
            );
            buildGroup.add(ghost);
        }
    }

    /**
     * SUB-PALETTE tint. Reassigns the material of a hash-seeded subset of the
     * group's mesh children to one of the shared greyscale tints in SharedAssets,
     * biased per biome. The tint is a SHARED singleton (never cloned), so this
     * adds no per-instance allocation and NO new disposables (disposeObject3D
     * skips materials; the shared tints are freed once in assets.dispose()).
     *
     * @param buildGroup - The freshly built building group.
     * @param biome - The chunk's biome (drives the tint bias).
     * @param cx - Chunk X coordinate (deterministic seed).
     * @param cz - Chunk Z coordinate (deterministic seed).
     * @param i - Building index within the chunk (deterministic seed).
     */
    private applySubPalette(buildGroup: THREE.Group, biome: ReturnType<typeof biomeAt>, cx: number, cz: number, i: number): void {
        const tintIdx = subPaletteIndex(biome, cx, cz);
        const tint = this.assets.subTints[tintIdx];
        if (!tint)
            return;

        // Only a per-building fraction of fragments take the tint (decorrelated
        // hash) so the building keeps texture rather than becoming flat. Wire
        // meshes are left alone so the wireframe read survives.
        let f = 0;
        buildGroup.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh)
                return;
            const isWire = (mesh.material as THREE.MeshBasicMaterial)?.wireframe === true;
            if (!isWire && hash(i + f + SUBTINT_GATE_SALT, cx + cz) > 0.5) {
                mesh.material = tint;
            }
            f++;
        });
    }

    /**
     * INFO_OVERFLOW buildingFlicker. Picks one mesh child of the group and
     * parents 2-3 pre-built variant meshes to its parent at the same position;
     * the source mesh becomes variant 0 (left visible), the rest start hidden.
     * Variants reuse SHARED geometry+material (different geo/scale per variant),
     * so there is NO new GPU data and NO new disposables — disposeObject3D frees
     * the variant meshes via traversal. The animator toggles which one is
     * .visible on a deterministic interval; geometry is NEVER rebuilt.
     *
     * @param buildGroup - The freshly built building group.
     * @param flickerGroups - The chunk's capped flicker-group accumulator.
     * @param cx - Chunk X coordinate (deterministic seed).
     * @param cz - Chunk Z coordinate (deterministic seed).
     * @param i - Building index within the chunk (deterministic seed).
     */
    private addFlickerGroup(
        buildGroup: THREE.Group,
        flickerGroups: FlickerGroup[],
        cx: number,
        cz: number,
        i: number,
    ): void {
        // Find the first mesh child to anchor the flicker variants on.
        let anchor: THREE.Mesh | null = null;
        for (const child of buildGroup.children) {
            if ((child as THREE.Mesh).isMesh) {
                anchor = child as THREE.Mesh;
                break;
            }
        }
        if (!anchor)
            return;

        // Variant 0 is the existing mesh (already visible). Build 1-2 more from
        // shared sub-palette geometries; they sit at the anchor's transform and
        // start hidden. All share pooled geometry + the anchor's material.
        const variants: THREE.Object3D[] = [anchor];
        const geos = [this.assets.tallBoxGeo, this.assets.octaGeo, this.assets.hiCylinderGeo];

        for (let v = 1; v < FLICKER_VARIANTS_PER_GROUP; v++) {
            const geo = geos[Math.floor(hash(i + v + FLICKER_VARIANT_SALT, cx) * geos.length) % geos.length];
            const variant = new THREE.Mesh(geo, anchor.material);
            variant.position.copy(anchor.position);
            variant.rotation.copy(anchor.rotation);
            // Match the anchor's footprint with a hash-seeded variant scale.
            const vs = 0.7 + hash(v + FLICKER_VARIANT_SALT, cz) * 1.2;
            variant.scale.copy(anchor.scale).multiplyScalar(vs);
            variant.castShadow = true;
            variant.receiveShadow = true;
            variant.visible = false;
            buildGroup.add(variant);
            variants.push(variant);
        }

        flickerGroups.push({
            variants,
            // Decorrelated per-group phase so groups do not toggle in lockstep.
            phase: hash(i + FLICKER_PHASE_SALT, cz) * 10,
            current: 0,
        });
    }

    /**
     * RARE ANOMALY landmark. Builds one of three deterministic landmarks into the
     * chunk using existing factories / shared assets with capped counts and
     * tweaked scales. Returns the cable nodes so the caller can wire cables. All
     * fragment counts are bounded so a colossus never animates hundreds of
     * fragments at full rate; the animator still LOD-gates each object against
     * ANIMATION_LOD_DISTANCE, so distant giants go static.
     *
     * @param chunk - The chunk group being built.
     * @param anomaly - Which landmark kind to build.
     * @param cx - Chunk X coordinate (deterministic seed).
     * @param cz - Chunk Z coordinate (deterministic seed).
     * @param roomType - Room type (threaded into building params).
     * @param biome - The chunk's biome (light scale nudge).
     * @returns Cable nodes for the landmark's anchor buildings.
     */
    private buildAnomaly(
        chunk: Chunk,
        anomaly: ReturnType<typeof anomalyAt>,
        cx: number,
        cz: number,
        roomType: RoomType,
        biome: ReturnType<typeof biomeAt>,
    ): CableNode[] {
        const chunkData = chunk.userData as ExtendedChunkUserData;
        const animatedObjects = chunk.userData.animatedObjects;
        const disposables = chunkData.disposables;
        const nodes: CableNode[] = [];
        const params = { i: 0, cx, cz, assets: this.assets, roomType };

        if (anomaly === 'COLOSSUS') {
            // A single colossal BLOCKS building, scaled up uniformly. One group =
            // one wandering candidate; LOD gates its fragments when far.
            const group = new THREE.Group();
            let h = createBlocksBuilding(group, params);
            group.scale.setScalar(ANOMALY_COLOSSUS_SCALE);
            h *= ANOMALY_COLOSSUS_SCALE;
            (group.userData as BuildingUserData) = {
                initialPos: group.position.clone(),
                wanderSpeed: 0,
                wanderRange: 0,
                offset: 0,
                isMobile: false, // colossus stays put (no per-frame wander)
            };
            chunk.add(group);
            chunk.userData.buildings.push(group);
            nodes.push({ obj: group, topOffset: new THREE.Vector3(0, h, 0), isGround: false });
        }
        else if (anomaly === 'SPIKE_GRID') {
            // A regular grid of spikes (a field of needles). Capped at SIDE^2.
            const side = ANOMALY_SPIKE_GRID_SIDE;
            const spacing = (CHUNK_SIZE - 24) / (side - 1);
            const start = -(CHUNK_SIZE - 24) / 2;
            for (let gx = 0; gx < side; gx++) {
                for (let gz = 0; gz < side; gz++) {
                    const cone = new THREE.Mesh(this.assets.coneGeo, this.assets.matDark);
                    const sy = 6 + hash(gx + gz, cx + cz) * 6;
                    cone.scale.set(1.2, sy, 1.2);
                    cone.position.set(start + gx * spacing, sy * 1.5, start + gz * spacing);
                    cone.castShadow = true;
                    cone.receiveShadow = true;
                    chunk.add(cone);
                }
            }
            // No wandering groups; cables are skipped (no building nodes).
        }
        else if (anomaly === 'TREE_RING') {
            // A ring of trees around an empty center. Each tree is its own group
            // so the existing branch/leaf LOD animation gating applies per-tree.
            const count = ANOMALY_TREE_RING_COUNT;
            const radius = (CHUNK_SIZE - 28) / 2;
            const scaleNudge = biomeScaleFactor(biome);
            for (let r = 0; r < count; r++) {
                const angle = (r / count) * Math.PI * 2;
                const group = new THREE.Group();
                group.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
                const treeParams = { i: r, cx, cz, assets: this.assets, roomType };
                let h = createTree(group, treeParams, animatedObjects, disposables);
                if (scaleNudge !== 1.0) {
                    group.scale.setScalar(scaleNudge);
                    h *= scaleNudge;
                }
                (group.userData as BuildingUserData) = {
                    initialPos: group.position.clone(),
                    wanderSpeed: 0,
                    wanderRange: 0,
                    offset: 0,
                    isMobile: false,
                };
                chunk.add(group);
                chunk.userData.buildings.push(group);
                nodes.push({ obj: group, topOffset: new THREE.Vector3(0, h, 0), isGround: false });
            }
        }

        return nodes;
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
        const chunkData = chunk.userData as ExtendedChunkUserData;

        // Dispose cable geometry ONLY. The cable shader material is a module
        // singleton shared by every cable in every chunk (CableSystem), so it
        // must NOT be disposed here; it is released once in dispose().
        if (chunkData.cables) {
            chunkData.cables.forEach((c: DynamicCable) => {
                c.line?.geometry?.dispose();
            });
        }

        // Explicitly dispose the abyss-fog InstancedMesh so its instanceMatrix
        // GPU buffer is freed (disposeObject3D also handles this via traversal,
        // but the reference makes the intent explicit and is idempotent).
        if (chunkData.fogSystem) {
            chunkData.fogSystem.dispose();
        }

        // Dispose all geometries in chunk. Materials are skipped here to protect
        // the shared floor material; per-chunk unique materials are disposed below.
        disposeObject3D(chunk, false, false);

        // Dispose per-chunk unique materials (abyss, fog, moiré layer2, plasma
        // clones) and their textures, which disposeObject3D intentionally skips.
        if (chunkData.disposables) {
            chunkData.disposables.forEach((mat) => {
                const map = (mat as THREE.MeshBasicMaterial).map;
                if (map instanceof THREE.Texture)
                    map.dispose();
                mat.dispose();
            });
            chunkData.disposables.length = 0;
        }

        this.chunkGroup.remove(chunk);
        delete this.activeChunks[key];
    }

    /**
     * Animate all chunks (buildings, cables)
     * @param time - Current time in seconds
     * @param delta - Delta time in seconds
     * @param cameraPosition - Optional camera world position. When provided,
     *   per-object animation is gated by distance (LOD) using WORLD thresholds.
     *   When omitted (default), all objects animate (legacy behavior), keeping
     *   existing callers working unchanged.
     * @param flowerIntensity - Optional flower intensity in [0,1] driving the
     *   INFO_OVERFLOW building-flicker refresh rate. When omitted, flicker uses a
     *   neutral default so existing callers keep working.
     */
    animate(time: number, delta: number, cameraPosition?: THREE.Vector3, flowerIntensity?: number): void {
        // Animate all chunks (delegated to ChunkAnimator)
        for (const key in this.activeChunks) {
            animateChunk(this.activeChunks[key], time, delta, cameraPosition, flowerIntensity);
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
                // Get chunk world position offset
                const chunkOffset = chunk.position;

                for (const cable of chunk.userData.cables) {
                    if (!cable.line)
                        continue;

                    // Approximate distance to the line segment
                    // Convert local positions to world positions by adding chunk offset
                    const start = cable.startNode.obj.position.clone().add(cable.startNode.topOffset).add(chunkOffset);
                    const end = cable.endNode.obj.position.clone().add(cable.endNode.topOffset).add(chunkOffset);
                    const mid = start.clone().lerp(end, 0.5);

                    // Skip far cables for performance (>50m)
                    const CABLE_SKIP_DISTANCE_SQ = 2500;
                    if (playerPos.distanceToSquared(mid) > CABLE_SKIP_DISTANCE_SQ)
                        continue;

                    // Accurate distance to segment
                    const line = new THREE.Line3(start, end);
                    const closestPoint = new THREE.Vector3();
                    line.closestPointToPoint(playerPos, false, closestPoint);
                    const dist = playerPos.distanceTo(closestPoint);

                    if (dist < minDistance) {
                        minDistance = dist;
                    }

                    // Check the droop point for ALL cables (not just heavySag)
                    // Cables are rendered as Bezier curves with droop, so we need to check the lowest point
                    const droopAmount = cable.options.droop + (cable.options.heavySag ? 20 : 0);
                    const sagPoint = mid.clone();
                    sagPoint.y -= droopAmount;
                    const sagDist = playerPos.distanceTo(sagPoint);
                    if (sagDist < minDistance)
                        minDistance = sagDist;

                    // For dangling cables (one end on ground), also check points along the curve
                    if (cable.endNode.isGround || cable.startNode.isGround) {
                        // Check a few points along the Bezier curve
                        const controlPoint = mid.clone();
                        controlPoint.y -= droopAmount;
                        for (const t of [0.25, 0.5, 0.75]) {
                            const pt = new THREE.Vector3();
                            pt.x = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * controlPoint.x + t * t * end.x;
                            pt.y = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * controlPoint.y + t * t * end.y;
                            pt.z = (1 - t) * (1 - t) * start.z + 2 * (1 - t) * t * controlPoint.z + t * t * end.z;
                            const ptDist = playerPos.distanceTo(pt);
                            if (ptDist < minDistance)
                                minDistance = ptDist;
                        }
                    }
                }
            }
        }

        return minDistance;
    }

    /**
     * Dispose all resources and cleanup
     */
    dispose(): void {
        // Remove all active chunks
        for (const key in this.activeChunks) {
            this.removeChunk(key);
        }

        // Dispose floor material
        this.floorMaterial.dispose();

        // Dispose the module-shared floor pool (INFO_OVERFLOW glyph materials +
        // textures, POLARIZED seam-line material) exactly once. These are never
        // per-chunk disposables, so they are freed here, not in removeChunk().
        disposeFloorPool();

        // Dispose the shared cable shader material exactly once (it is a module
        // singleton in CableSystem, never disposed per-chunk).
        disposeCableMaterial();

        // Dispose shared assets
        this.assets.dispose();

        // Remove chunk group from scene
        this.chunkGroup.parent?.remove(this.chunkGroup);
    }
}
