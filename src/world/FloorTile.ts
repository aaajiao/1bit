// 1-bit Chimera Void - Floor Tile Generator
import * as THREE from 'three';
import { hash } from '../utils/hash';
import { FA_RIFT } from './RoomConfig';

/**
 * Deterministic pseudo-random generator seeded by chunk coords plus a
 * monotonically increasing counter. Mirrors the hash-based seeding used
 * elsewhere so re-entering a chunk regenerates identical geometry/fog.
 */
function makeSeededRandom(cx: number, cz: number): () => number {
    let counter = 0;
    return () => {
        counter += 1;
        // Spread the counter across both hash inputs for good distribution
        return hash(cx * 17.31 + counter * 0.613, cz * 11.97 + counter * 1.193);
    };
}

/**
 * Jagged-edge erosion depth (m) at a given WORLD z for one side of an FA
 * rift. Seeded by the chunk COLUMN (cx — every FA column carries its own
 * crack at its center) and parameterized by world z, NOT by the chunk + its
 * local z: all z-stacked chunks of one column therefore evaluate the exact
 * same function at their shared seam vertices, so a column's jagged edges
 * connect into one continuous line along z. The cx salt also lands in the
 * sine phases so the TWO parallel cracks of one cluster (adjacent columns)
 * draw genuinely different jags — never mirror twins. Position-pure hash
 * noise (no call-order-dependent RNG) keeps it deterministic per session.
 * @param cx - Chunk COLUMN x coordinate (the crack's owner column).
 * @param worldZ - World-space z of the vertex (cz * chunkSize + localZ).
 * @param side - 0 = left (negative-x) crack edge, 1 = right (positive-x),
 *   2 = the void tear's ragged top edge; the phase term keeps each
 *   decorrelated from the others (historical 123.4 phase offset).
 */
function crackJagOffset(cx: number, worldZ: number, side: number): number {
    // Jagged noise: mix of sine waves + deterministic positional jitter,
    // magnitudes unchanged from the historical per-chunk version; the cx
    // phase salts decorrelate neighboring columns' cracks.
    const wave = Math.sin(worldZ * 0.5 + side * 123.4 + cx * 7.93) * 0.8
        + Math.sin(worldZ * 2.1 + cx * 3.71) * 0.3;
    const jitter = (hash(
        cx * 17.31 + worldZ * 0.613,
        cx * 11.97 + worldZ * 1.193 + side * 5.77,
    ) - 0.5) * 0.4;
    return Math.abs(wave + jitter) * 0.8;
}

/**
 * Creates a procedural grid texture for the floor
 * @param size - Texture size in pixels
 */
export function createFloorMaterial(size: number = 64): THREE.MeshLambertMaterial {
    // Use RGBA format since RGBFormat was removed in Three.js r152+
    const data = new Uint8Array(size * size * 4);

    for (let i = 0; i < size * size; i++) {
        const x = i % size;
        const y = Math.floor(i / size);
        const c = x % 4 === 0 || y % 4 === 0 ? 100 : 40;
        data[i * 4] = c;
        data[i * 4 + 1] = c;
        data[i * 4 + 2] = c;
        data[i * 4 + 3] = 255; // Alpha channel
    }

    const tex = new THREE.DataTexture(
        data,
        size,
        size,
        THREE.RGBAFormat,
    );
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(20, 20);
    tex.needsUpdate = true;

    return new THREE.MeshLambertMaterial({ map: tex });
}

/**
 * Creates a floor plane mesh
 * @param chunkSize - Size of the chunk
 * @param material - Floor material
 */
export function createFloorMesh(chunkSize: number, material: THREE.Material): THREE.Mesh {
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(chunkSize, chunkSize),
        material,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    return floor;
}

// Abyss-fog particle count for a full (chunk-interior) crack — the regular
// path now that every FA chunk carries its own complete crack at local x=0.
// The edge-crack case (crack ON a footprint edge, shared with the x-neighbor:
// both chunks emit fog into the SAME crack volume) is retained capability;
// there each chunk spawns half so the combined density matches one crack.
const ABYSS_FOG_PARTICLES = 400;

/**
 * Creates a floor with a crack/rift for FORCED_ALIGNMENT rooms.
 * The crack splits the floor into two parts with pure black abyss in between.
 * Features jagged texturing and geometry.
 *
 * REGULAR PATH: every FA chunk column carries its own complete crack at the
 * chunk center, so ChunkManager always passes crackLocalX = 0 (one crack per
 * 80m, restored from the one-per-cluster experiment). The crack line may
 * still sit anywhere inside the chunk, including ON a footprint edge
 * (crackLocalX = ±chunkSize/2) — retained capability: an edge crack is
 * shared with the x-neighbor, each chunk carries the half overlapping its
 * own floor, and a side with no remaining floor strip is skipped entirely.
 *
 * @param chunkSize - Size of the chunk
 * @param material - Floor material
 * @param crackWidth - Base width of the crack (default 4 meters)
 * @param cx - Chunk X coordinate (column jagged-edge seed + fog seed)
 * @param cz - Chunk Z coordinate (world-z base + fog seed)
 * @param crackLocalX - Chunk-local x of the crack center line (default 0)
 */
export function createCrackedFloorMesh(
    chunkSize: number,
    material: THREE.Material,
    crackWidth: number = 4,
    cx: number = 0,
    cz: number = 0,
    crackLocalX: number = 0,
): { group: THREE.Group; fog?: THREE.InstancedMesh; disposables: THREE.Material[] } {
    const group = new THREE.Group();
    const disposables: THREE.Material[] = [];

    // Deterministic per-chunk RNG (abyss fog only — the jagged edges use the
    // column-seeded crackJagOffset) so re-entering a chunk looks identical.
    const rand = makeSeededRandom(cx, cz);

    // Floor strip widths on each side of the crack, clamped to the chunk
    // footprint (a crack on the footprint edge leaves one side empty).
    const halfChunk = chunkSize / 2;
    const halfCrackWidth = crackWidth / 2;
    const leftFloorWidth = Math.max(0, crackLocalX - halfCrackWidth + halfChunk);
    const rightFloorWidth = Math.max(0, halfChunk - (crackLocalX + halfCrackWidth));

    // Geometry with segments for vertex manipulation (jagged edge)
    const segmentsZ = 32; // More segments along Z for jagged detail
    const segmentsX = 4;

    // --- Left Floor Part (negative-x side of the crack) ---
    if (leftFloorWidth > 0) {
        const leftGeo = new THREE.PlaneGeometry(leftFloorWidth, chunkSize, segmentsX, segmentsZ);
        const leftPos = leftGeo.attributes.position;

        for (let i = 0; i < leftPos.count; i++) {
            const x = leftPos.getX(i);
            const z = -leftPos.getY(i); // Plane is created in XY, mapped to XZ. Y in geo is -Z in world

            // Right edge of left floor is at x = leftFloorWidth / 2
            // We want to perturb vertices near this edge
            if (x > leftFloorWidth / 2 - 0.1) {
                // World-z-parameterized, column-seeded jag: continuous across
                // every z seam of the chunk column. Mostly erode (move left,
                // widening the gap) to keep a minimum gap.
                leftPos.setX(i, x - crackJagOffset(cx, cz * chunkSize + z, 0));
            }
        }
        leftPos.needsUpdate = true;
        leftGeo.computeVertexNormals();

        const leftFloor = new THREE.Mesh(leftGeo, material);
        leftFloor.rotation.x = -Math.PI / 2;
        leftFloor.position.x = -halfChunk + leftFloorWidth / 2;
        leftFloor.receiveShadow = true;
        group.add(leftFloor);
    }

    // --- Right Floor Part (positive-x side of the crack) ---
    if (rightFloorWidth > 0) {
        const rightGeo = new THREE.PlaneGeometry(rightFloorWidth, chunkSize, segmentsX, segmentsZ);
        const rightPos = rightGeo.attributes.position;

        for (let i = 0; i < rightPos.count; i++) {
            const x = rightPos.getX(i);
            const z = -rightPos.getY(i);

            // Left edge of right floor is at x = -rightFloorWidth / 2
            if (x < -rightFloorWidth / 2 + 0.1) {
                // Add to X (move right, widening gap); side 1 = the crack's
                // right edge, decorrelated from the left by the 123.4 phase.
                rightPos.setX(i, x + crackJagOffset(cx, cz * chunkSize + z, 1));
            }
        }
        rightPos.needsUpdate = true;
        rightGeo.computeVertexNormals();

        const rightFloor = new THREE.Mesh(rightGeo, material);
        rightFloor.rotation.x = -Math.PI / 2;
        rightFloor.position.x = halfChunk - rightFloorWidth / 2;
        rightFloor.receiveShadow = true;
        group.add(rightFloor);
    }

    // Abyss plane (pure black) - per-chunk material, must be disposed explicitly.
    // Centered under the crack and clipped to the chunk footprint; the
    // neighboring chunk of a shared edge crack covers the other half.
    const abyssHalfWidth = halfCrackWidth + 3; // historical crackWidth + 6 total
    const abyssMinX = Math.max(-halfChunk, crackLocalX - abyssHalfWidth);
    const abyssMaxX = Math.min(halfChunk, crackLocalX + abyssHalfWidth);
    const abyssMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    disposables.push(abyssMaterial);
    const abyssFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(abyssMaxX - abyssMinX, chunkSize),
        abyssMaterial,
    );
    abyssFloor.rotation.x = -Math.PI / 2;
    abyssFloor.position.x = (abyssMinX + abyssMaxX) / 2;
    abyssFloor.position.y = -8; // Deep abyss
    group.add(abyssFloor);

    // --- Abyss Fog ---
    // Edge cracks are shared with the x-neighbor chunk (same crack volume), so
    // each contributes half the particles to keep the combined density stable.
    const isSharedEdgeCrack = leftFloorWidth <= 0 || rightFloorWidth <= 0;
    const fogParticles = isSharedEdgeCrack ? ABYSS_FOG_PARTICLES / 2 : ABYSS_FOG_PARTICLES;
    const fog = createAbyssFog(chunkSize, crackWidth, rand, fogParticles);
    fog.position.x = crackLocalX; // rise out of the crack, wherever it sits
    fog.position.y = FA_RIFT.FOG.MESH_Y; // Start fog deep down
    group.add(fog);
    // Fog material is per-chunk; the InstancedMesh GPU buffer is freed by the
    // caller via the fogSystem reference, but its material is tracked here too.
    if (fog.material instanceof THREE.Material)
        disposables.push(fog.material);

    // --- Void tear (rift presence) ---
    // A translucent pure-black plane standing in the crack so the rift reads
    // from fog distance as a dark vertical rip crossing the whole room, not a
    // ground-only line. On the regular path (interior crack, crackLocalX = 0)
    // every chunk owns its own tear. The owner rule only matters for the
    // retained edge-crack capability: a shared edge crack would otherwise get
    // TWO coplanar tears (one per x-neighbor: z-fighting + doubled opacity),
    // so only the chunk holding the crack on its +x side (crackLocalX >= 0)
    // OWNS the tear — the analogue of the fog's half-density split.
    if (crackLocalX >= 0) {
        const tear = createVoidTear(chunkSize, cx, cz);
        tear.position.x = crackLocalX;
        group.add(tear);
        disposables.push(tear.material as THREE.Material);
    }

    return { group, fog, disposables };
}

/**
 * Builds the FORCED_ALIGNMENT "void tear": a translucent pure-black vertical
 * plane standing in the crack (knobs in FA_RIFT.TEAR). The top edge is torn
 * ragged by the same column-seeded, world-z-parameterized jag noise as the
 * floor crack edges (crackJagOffset, side 2), so the tear's silhouette joins
 * into one continuous rip across every z seam of the chunk column.
 * DoubleSide + no depth write: it must read as a rip in space, not a wall.
 * One plane per owning chunk — effectively zero cost.
 *
 * @param chunkSize - Size of the chunk (the tear spans its full z extent).
 * @param cx - Chunk COLUMN x coordinate (jag seed).
 * @param cz - Chunk Z coordinate (world-z base for the jag parameterization).
 */
function createVoidTear(
    chunkSize: number,
    cx: number,
    cz: number,
): THREE.Mesh {
    const { HEIGHT, BASE_Y, OPACITY, JAG_SCALE } = FA_RIFT.TEAR;
    const planeHeight = HEIGHT - BASE_Y;
    const geometry = new THREE.PlaneGeometry(chunkSize, planeHeight, 32, 1);
    const pos = geometry.attributes.position;
    const topLocalY = planeHeight / 2;

    for (let i = 0; i < pos.count; i++) {
        // Only the top row is torn (the bottom row stays buried in the crack).
        if (pos.getY(i) < topLocalY - 0.1)
            continue;
        // After the -90° y-rotation below, local +x maps to world +z, so the
        // jag is parameterized by world z — continuous across the column's
        // z seams, exactly like the floor crack edges.
        const worldZ = cz * chunkSize + pos.getX(i);
        pos.setY(i, topLocalY - crackJagOffset(cx, worldZ, 2) * JAG_SCALE);
    }
    pos.needsUpdate = true;

    const material = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false, // a rip, not an occluder — never punches holes in fog
    });

    const tear = new THREE.Mesh(geometry, material);
    tear.name = 'riftTear';
    tear.rotation.y = -Math.PI / 2; // stand upright along the crack (z axis)
    tear.position.y = (HEIGHT + BASE_Y) / 2;
    return tear;
}

/**
 * Creates an instanced mesh for rising fog particles in the abyss.
 *
 * Rift presence: the column no longer caps near the floor. Most particles
 * cycle through the DENSE band (bottom .. FA_RIFT.FOG.DENSE_TOP); a sparse
 * minority of LEAKERS — slightly larger, fewer per metre — rise on past it to
 * FA_RIFT.FOG.LEAK_TOP, so the crack reads as a tall leak of the void without
 * doubling the near-ground density. Per-instance recycle ceilings are written
 * to userData.topYs (+ userData.resetY) and consumed by
 * ChunkAnimator.animateFogSystem — the two MUST agree or particles teleport
 * mid-rise.
 */
export function createAbyssFog(
    chunkSize: number,
    crackWidth: number,
    rand: () => number = Math.random,
    particleCount: number = ABYSS_FOG_PARTICLES,
): THREE.InstancedMesh {
    const geometry = new THREE.PlaneGeometry(1.5, 1.5);
    const material = new THREE.MeshBasicMaterial({
        color: 0x333333, // Dark grey fog
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, particleCount);
    const dummy = new THREE.Object3D();

    // FA_RIFT.FOG heights are world-frame; the fog mesh sits at y = MESH_Y
    // inside the chunk, so convert once into the mesh's local frame.
    const { MESH_Y, BOTTOM, DENSE_TOP, LEAK_TOP, LEAK_FRACTION, LEAK_SCALE } = FA_RIFT.FOG;
    const localBottom = BOTTOM - MESH_Y;
    const localDenseTop = DENSE_TOP - MESH_Y;
    const localLeakTop = LEAK_TOP - MESH_Y;

    const speeds: number[] = [];
    const topYs: number[] = [];
    for (let i = 0; i < particleCount; i++) {
        // Deterministic dense/leak split (越界泄漏: 上半段稍大稍稀).
        const isLeaker = rand() < LEAK_FRACTION;
        const topY = isLeaker ? localLeakTop : localDenseTop;

        // Deterministic position within the crack volume
        dummy.position.set(
            (rand() - 0.5) * crackWidth * 1.5, // Slightly wider spread
            localBottom + rand() * (topY - localBottom), // Anywhere along its own cycle
            (rand() - 0.5) * chunkSize, // Along entire chunk length
        );

        // Deterministic rotation and scale (leakers slightly larger)
        dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
        const s = (1.0 + rand() * 2.0) * (isLeaker ? LEAK_SCALE : 1.0);
        dummy.scale.set(s, s, s);

        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        speeds.push(0.5 + rand() * 1.5); // Upward speed
        topYs.push(topY); // Per-instance recycle ceiling
    }

    // Animation data consumed by ChunkAnimator.animateFogSystem.
    mesh.userData.speeds = speeds;
    mesh.userData.topYs = topYs;
    mesh.userData.resetY = localBottom;

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
}

/**
 * Creates a dual-layer floor with moiré interference pattern for IN_BETWEEN rooms
 * Two grid layers are rotated 45° relative to each other with different densities
 * @param chunkSize - Size of the chunk
 * @param material - Floor material (first layer)
 * @param rotationAngle - Rotation angle for second layer in degrees (default 45)
 */
export function createMoireFloorMesh(
    chunkSize: number,
    material: THREE.Material,
    rotationAngle: number = 45,
): { group: THREE.Group; disposables: THREE.Material[] } {
    const group = new THREE.Group();
    const disposables: THREE.Material[] = [];

    // First layer - standard floor
    const layer1 = new THREE.Mesh(
        new THREE.PlaneGeometry(chunkSize, chunkSize),
        material,
    );
    layer1.rotation.x = -Math.PI / 2;
    layer1.receiveShadow = true;
    group.add(layer1);

    // Second layer - different density grid for stronger moiré interference
    // Create a separate material with different grid density (32 vs default 64).
    // This material + its DataTexture are per-chunk and must be disposed explicitly.
    const layer2Material = createMoireLayerMaterial(32);
    layer2Material.transparent = true;
    layer2Material.opacity = 0.7;
    disposables.push(layer2Material);

    const layer2 = new THREE.Mesh(
        new THREE.PlaneGeometry(chunkSize * 1.5, chunkSize * 1.5), // Larger to cover corners after rotation
        layer2Material,
    );
    layer2.rotation.x = -Math.PI / 2;
    layer2.rotation.z = (rotationAngle * Math.PI) / 180; // Rotate around Y axis in world space (Z in local after X rotation)
    layer2.position.y = 0.02; // Slight height offset for clean moiré (Method A)
    layer2.receiveShadow = true;
    group.add(layer2);

    return { group, disposables };
}

// --- INFO_OVERFLOW glyph-floor pool ---------------------------------------
// A SMALL module-level cache of binary-glyph / dot-matrix materials. Each chunk
// picks one variant by hash(cx,cz); we NEVER allocate a DataTexture per chunk.
// These materials (and their textures) are module-shared and therefore must NOT
// be pushed to a chunk's disposables — they are freed once via disposeFloorPool().
const INFO_FLOOR_POOL_SIZE = 6;
const INFO_FLOOR_TEX_SIZE = 64;
const INFO_FLOOR_SALT = 419; // decorrelate the variant pick from other hashes
let infoFloorPool: THREE.MeshLambertMaterial[] | null = null;

/**
 * Builds one binary-glyph / dot-matrix DataTexture material for the
 * INFO_OVERFLOW floor pool. The pattern is a dense field of "lit" cells (bright
 * dots / short glyph strokes) on a dark ground, deterministic per variant so the
 * pool is reproducible. Greyscale-only so the duotone post-process maps cleanly.
 * @param variant - Pool index, seeds the deterministic glyph field.
 */
function createInfoFloorMaterial(variant: number): THREE.MeshLambertMaterial {
    const size = INFO_FLOOR_TEX_SIZE;
    const data = new Uint8Array(size * size * 4);

    for (let i = 0; i < size * size; i++) {
        const x = i % size;
        const y = Math.floor(i / size);

        // Dot-matrix cells on a 4px pitch: only the cell origin can be "lit",
        // giving an even data-feed grid of glyph dots rather than mushy noise.
        const cellX = Math.floor(x / 4);
        const cellY = Math.floor(y / 4);
        const inCell = x % 4 < 2 && y % 4 < 2; // 2x2 dot inside each 4px cell

        // Deterministic lit/unlit decision per cell + variant.
        const lit = inCell && hash(cellX + variant * 31.7, cellY + variant * 53.3) > 0.45;
        // Sparse bright "burst" pixels read as flickering data over the feed.
        const burst = hash(x + variant * 17.0, y + variant * 11.0) > 0.92;

        let c: number;
        if (burst)
            c = 235;
        else if (lit)
            c = 150 + Math.floor(hash(cellX + 7, cellY + variant) * 60); // 150-210
        else
            c = 18; // near-black data ground

        data[i * 4] = c;
        data[i * 4 + 1] = c;
        data[i * 4 + 2] = c;
        data[i * 4 + 3] = 255;
    }

    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(28, 28); // dense feed, distinct from the plain floor's 20x20
    tex.needsUpdate = true;

    return new THREE.MeshLambertMaterial({ map: tex });
}

/**
 * Lazily initializes (once) the module-level INFO_OVERFLOW glyph-floor pool.
 */
function getInfoFloorPool(): THREE.MeshLambertMaterial[] {
    if (!infoFloorPool) {
        infoFloorPool = [];
        for (let v = 0; v < INFO_FLOOR_POOL_SIZE; v++)
            infoFloorPool.push(createInfoFloorMaterial(v));
    }
    return infoFloorPool;
}

/**
 * Creates a dense binary-glyph / dot-matrix floor for INFO_OVERFLOW rooms —
 * "standing inside the data feed". The material is picked from a SMALL pooled
 * cache (see {@link getInfoFloorPool}) by hash(cx,cz), so re-entering a chunk
 * yields the identical variant and we never allocate a texture per chunk.
 *
 * The returned material is module-shared: callers MUST NOT push it to a chunk's
 * disposables. The pool is freed once via {@link disposeFloorPool}.
 *
 * @param chunkSize - Size of the chunk.
 * @param cx - Chunk X coordinate (deterministic variant seed).
 * @param cz - Chunk Z coordinate (deterministic variant seed).
 */
export function createInfoFloorMesh(chunkSize: number, cx: number, cz: number): THREE.Mesh {
    const pool = getInfoFloorPool();
    const variant = Math.floor(hash(cx + INFO_FLOOR_SALT, cz - INFO_FLOOR_SALT) * pool.length) % pool.length;

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(chunkSize, chunkSize),
        pool[variant],
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    return floor;
}

// --- POLARIZED seam-floor shared materials ---------------------------------
// Module-shared materials for the POLARIZED floor: a high-contrast seam line
// plus TWO phase-opposite checkerboard materials (one per faction half — the
// "us" cells are exactly the other side's "them" cells). All are shared across
// every POLARIZED chunk and freed once via disposeFloorPool().
let seamLineMaterial: THREE.MeshBasicMaterial | null = null;
let checkerMaterials: [THREE.MeshLambertMaterial, THREE.MeshLambertMaterial] | null = null;
const SEAM_LINE_WIDTH = 0.5; // razor-thin dividing line (metres)
const CHECKER_CELL_SIZE = 2.5; // checkerboard cell edge (metres)
const CHECKER_BRIGHT = 210; // renders as paper under the hard 0.5 threshold
const CHECKER_DARK = 28; // renders as ink

/**
 * Lazily initializes (once) the module-shared seam-line material.
 */
function getSeamLineMaterial(): THREE.MeshBasicMaterial {
    if (!seamLineMaterial) {
        // Pure paper-white (unlit) so the duotone post-process renders it as the
        // hardest possible 1-bit edge against the dark floor halves.
        seamLineMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    }
    return seamLineMaterial;
}

/**
 * Builds one checkerboard material (flow-audit enhancement #11: POLARIZED's
 * signature binary ground). A 2x2 DataTexture — one texel per cell — repeated
 * with NearestFilter stays razor sharp at any distance, and POLARIZED's hard
 * 0.5 threshold (zero dithering) maps it to pure ink/paper cells.
 * @param phase - 0 or 1; phase 1 is the exact cell-inverse of phase 0.
 * @param halfFloorWidth - Width (m) of one floor half (sets the X repeat).
 * @param chunkSize - Chunk size (m) (sets the Y repeat).
 */
function createCheckerMaterial(
    phase: 0 | 1,
    halfFloorWidth: number,
    chunkSize: number,
): THREE.MeshLambertMaterial {
    // 2x2 checker: cell (x+y) even = bright on phase 0, dark on phase 1.
    const data = new Uint8Array(2 * 2 * 4);
    for (let i = 0; i < 4; i++) {
        const x = i % 2;
        const y = Math.floor(i / 2);
        const c = (x + y + phase) % 2 === 0 ? CHECKER_BRIGHT : CHECKER_DARK;
        data[i * 4] = c;
        data[i * 4 + 1] = c;
        data[i * 4 + 2] = c;
        data[i * 4 + 3] = 255;
    }

    const tex = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    // One texture repeat covers 2 cells per axis; keep the cells square.
    tex.repeat.set(
        halfFloorWidth / (CHECKER_CELL_SIZE * 2),
        chunkSize / (CHECKER_CELL_SIZE * 2),
    );
    tex.needsUpdate = true;

    return new THREE.MeshLambertMaterial({ map: tex });
}

/**
 * Lazily initializes (once) the module-shared phase-opposite checkerboard
 * material pair for the POLARIZED floor halves.
 */
function getCheckerMaterials(chunkSize: number): [THREE.MeshLambertMaterial, THREE.MeshLambertMaterial] {
    if (!checkerMaterials) {
        const halfFloorWidth = (chunkSize - SEAM_LINE_WIDTH) / 2;
        checkerMaterials = [
            createCheckerMaterial(0, halfFloorWidth, chunkSize),
            createCheckerMaterial(1, halfFloorWidth, chunkSize),
        ];
    }
    return checkerMaterials;
}

/**
 * Creates the POLARIZED floor: two phase-opposite checkerboard halves split by
 * a razor-thin high-contrast dividing line at local x=0 (flow-audit
 * enhancement #11). Reuses the split-halves approach from
 * {@link createCrackedFloorMesh}: two coplanar floor halves are pushed apart by
 * the seam width so the bright seam strip never z-fights the floor. Aligning the
 * seam at local x=0 makes it tile continuously across chunk borders. The two
 * halves carry PHASE-OPPOSITE checkerboards — each side's bright cells are the
 * other side's dark cells, the factional opposition written into the ground.
 *
 * Both checker materials and the seam material are module-shared. NO
 * per-chunk-unique materials are created, so this returns no disposables and
 * the caller adds none.
 *
 * @param chunkSize - Size of the chunk.
 */
export function createSeamFloorMesh(chunkSize: number): THREE.Group {
    const group = new THREE.Group();

    const halfSeam = SEAM_LINE_WIDTH / 2;
    const halfFloorWidth = (chunkSize - SEAM_LINE_WIDTH) / 2;
    const [checkerA, checkerB] = getCheckerMaterials(chunkSize);

    // --- Left Floor Half (Negative X) ---
    const leftFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(halfFloorWidth, chunkSize),
        checkerA,
    );
    leftFloor.rotation.x = -Math.PI / 2;
    leftFloor.position.x = -(halfSeam + halfFloorWidth / 2);
    leftFloor.receiveShadow = true;
    group.add(leftFloor);

    // --- Right Floor Half (Positive X) ---
    const rightFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(halfFloorWidth, chunkSize),
        checkerB,
    );
    rightFloor.rotation.x = -Math.PI / 2;
    rightFloor.position.x = halfSeam + halfFloorWidth / 2;
    rightFloor.receiveShadow = true;
    group.add(rightFloor);

    // --- Seam line at local x=0 ---
    // Lifted a hair above the floor plane so it always wins the depth test
    // against the (coplanar-at-y=0) halves without z-fighting.
    const seam = new THREE.Mesh(
        new THREE.PlaneGeometry(SEAM_LINE_WIDTH, chunkSize),
        getSeamLineMaterial(),
    );
    seam.rotation.x = -Math.PI / 2;
    seam.position.y = 0.01;
    group.add(seam);

    return group;
}

/**
 * Frees all module-shared floor-pool resources (INFO_OVERFLOW glyph materials
 * + their DataTextures, and the POLARIZED seam-line + checkerboard
 * materials). Idempotent. Call once from {@link ChunkManager.dispose}; NEVER
 * per chunk, since the pool is shared across every chunk that uses it.
 */
export function disposeFloorPool(): void {
    if (infoFloorPool) {
        for (const mat of infoFloorPool) {
            if (mat.map instanceof THREE.Texture)
                mat.map.dispose();
            mat.dispose();
        }
        infoFloorPool = null;
    }
    if (seamLineMaterial) {
        seamLineMaterial.dispose();
        seamLineMaterial = null;
    }
    if (checkerMaterials) {
        for (const mat of checkerMaterials) {
            if (mat.map instanceof THREE.Texture)
                mat.map.dispose();
            mat.dispose();
        }
        checkerMaterials = null;
    }
}

/**
 * Creates a floor material with specified grid density for moiré effect
 * @param size - Texture size in pixels (affects grid density)
 */
function createMoireLayerMaterial(size: number = 32): THREE.MeshLambertMaterial {
    const data = new Uint8Array(size * size * 4);

    for (let i = 0; i < size * size; i++) {
        const x = i % size;
        const y = Math.floor(i / size);
        // Use different spacing than main floor (every 3 instead of 4) for interference
        const c = x % 3 === 0 || y % 3 === 0 ? 120 : 30;
        data[i * 4] = c;
        data[i * 4 + 1] = c;
        data[i * 4 + 2] = c;
        data[i * 4 + 3] = 255;
    }

    const tex = new THREE.DataTexture(
        data,
        size,
        size,
        THREE.RGBAFormat,
    );
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(25, 25); // Different repeat count for more interference
    tex.needsUpdate = true;

    return new THREE.MeshLambertMaterial({ map: tex });
}
