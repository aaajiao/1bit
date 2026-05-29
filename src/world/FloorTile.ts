// 1-bit Chimera Void - Floor Tile Generator
import * as THREE from 'three';
import { hash } from '../utils/hash';

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

/**
 * Creates a floor with a central crack/rift for FORCED_ALIGNMENT rooms
 * The crack splits the floor into two halves with pure black abyss in between
 * Now features jagged texturing and geometry
 * @param chunkSize - Size of the chunk
 * @param material - Floor material
 * @param crackWidth - Base width of the central crack (default 4 meters)
 */
export function createCrackedFloorMesh(
    chunkSize: number,
    material: THREE.Material,
    crackWidth: number = 4,
    cx: number = 0,
    cz: number = 0,
): { group: THREE.Group; fog?: THREE.InstancedMesh; disposables: THREE.Material[] } {
    const group = new THREE.Group();
    const disposables: THREE.Material[] = [];

    // Deterministic per-chunk RNG so re-entering a chunk looks identical
    const rand = makeSeededRandom(cx, cz);

    // Calculate half-floor dimensions
    const halfFloorWidth = (chunkSize - crackWidth) / 2;
    const halfCrackWidth = crackWidth / 2;

    // Geometry with segments for vertex manipulation (jagged edge)
    const segmentsZ = 32; // More segments along Z for jagged detail
    const segmentsX = 4;

    // --- Left Floor Half (Negative X) ---
    const leftGeo = new THREE.PlaneGeometry(halfFloorWidth, chunkSize, segmentsX, segmentsZ);
    const leftPos = leftGeo.attributes.position;

    for (let i = 0; i < leftPos.count; i++) {
        const x = leftPos.getX(i);
        const z = -leftPos.getY(i); // Plane is created in XY, mapped to XZ. Y in geo is -Z in world

        // Right edge of left floor is at x = halfFloorWidth / 2
        // We want to perturb vertices near this edge
        if (x > halfFloorWidth / 2 - 0.1) {
            // Jagged noise: mix of sine waves
            const noise = Math.sin(z * 0.5) * 0.8 + Math.sin(z * 2.1) * 0.3 + (rand() - 0.5) * 0.4;
            // Subtract from X (move left, widening gap randomly) or add (narrowing)
            // But we want to keep a minimum gap, so let's mostly erode
            leftPos.setX(i, x - Math.abs(noise) * 0.8);
        }
    }
    leftPos.needsUpdate = true;
    leftGeo.computeVertexNormals();

    const leftFloor = new THREE.Mesh(leftGeo, material);
    leftFloor.rotation.x = -Math.PI / 2;
    leftFloor.position.x = -(halfCrackWidth + halfFloorWidth / 2);
    leftFloor.receiveShadow = true;
    group.add(leftFloor);

    // --- Right Floor Half (Positive X) ---
    const rightGeo = new THREE.PlaneGeometry(halfFloorWidth, chunkSize, segmentsX, segmentsZ);
    const rightPos = rightGeo.attributes.position;

    for (let i = 0; i < rightPos.count; i++) {
        const x = rightPos.getX(i);
        const z = -rightPos.getY(i);

        // Left edge of right floor is at x = -halfFloorWidth / 2
        if (x < -halfFloorWidth / 2 + 0.1) {
            const noise = Math.sin(z * 0.5 + 123.4) * 0.8 + Math.sin(z * 2.1) * 0.3 + (rand() - 0.5) * 0.4;
            // Add to X (move right, widening gap)
            rightPos.setX(i, x + Math.abs(noise) * 0.8);
        }
    }
    rightPos.needsUpdate = true;
    rightGeo.computeVertexNormals();

    const rightFloor = new THREE.Mesh(rightGeo, material);
    rightFloor.rotation.x = -Math.PI / 2;
    rightFloor.position.x = halfCrackWidth + halfFloorWidth / 2;
    rightFloor.receiveShadow = true;
    group.add(rightFloor);

    // Abyss plane (pure black) - per-chunk material, must be disposed explicitly
    const abyssMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    disposables.push(abyssMaterial);
    const abyssFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(crackWidth + 6, chunkSize),
        abyssMaterial,
    );
    abyssFloor.rotation.x = -Math.PI / 2;
    abyssFloor.position.y = -8; // Deep abyss
    group.add(abyssFloor);

    // --- Abyss Fog ---
    const fog = createAbyssFog(chunkSize, crackWidth, rand);
    fog.position.y = -5; // Start fog deep down
    group.add(fog);
    // Fog material is per-chunk; the InstancedMesh GPU buffer is freed by the
    // caller via the fogSystem reference, but its material is tracked here too.
    if (fog.material instanceof THREE.Material)
        disposables.push(fog.material);

    return { group, fog, disposables };
}

/**
 * Creates an instanced mesh for rising fog particles in the abyss
 */
export function createAbyssFog(
    chunkSize: number,
    crackWidth: number,
    rand: () => number = Math.random,
): THREE.InstancedMesh {
    const particleCount = 400;
    const geometry = new THREE.PlaneGeometry(1.5, 1.5);
    const material = new THREE.MeshBasicMaterial({
        color: 0x333333, // Dark grey fog
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, particleCount);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < particleCount; i++) {
        // Deterministic position within the crack volume
        dummy.position.set(
            (rand() - 0.5) * crackWidth * 1.5, // Slightly wider spread
            -160 + rand() * 162.0, // Range from -160m to +2m
            (rand() - 0.5) * chunkSize, // Along entire chunk length
        );

        // Deterministic rotation and scale
        dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
        const s = 1.0 + rand() * 2.0;
        dummy.scale.set(s, s, s);

        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        // Use user data to store speed for animation
        if (!mesh.userData.speeds)
            mesh.userData.speeds = [];
        mesh.userData.speeds[i] = 0.5 + rand() * 1.5; // Upward speed
    }

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

// --- POLARIZED seam-floor shared material ---------------------------------
// A single module-shared high-contrast greyscale material for the dividing
// line. Shared across all POLARIZED chunks, freed once via disposeFloorPool().
let seamLineMaterial: THREE.MeshBasicMaterial | null = null;
const SEAM_LINE_WIDTH = 0.5; // razor-thin dividing line (metres)

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
 * Creates a razor-thin high-contrast ink/paper dividing line at local x=0 for
 * POLARIZED rooms. Reuses the split-halves approach from
 * {@link createCrackedFloorMesh}: two coplanar floor halves are pushed apart by
 * the seam width so the bright seam strip never z-fights the floor. Aligning the
 * seam at local x=0 makes it tile continuously across chunk borders.
 *
 * Both floor halves reuse the passed-in shared floor material; the seam strip
 * uses a module-shared greyscale material. NO per-chunk-unique materials are
 * created, so this returns no disposables and the caller adds none.
 *
 * @param chunkSize - Size of the chunk.
 * @param material - Shared floor material (both halves).
 */
export function createSeamFloorMesh(chunkSize: number, material: THREE.Material): THREE.Group {
    const group = new THREE.Group();

    const halfSeam = SEAM_LINE_WIDTH / 2;
    const halfFloorWidth = (chunkSize - SEAM_LINE_WIDTH) / 2;

    // --- Left Floor Half (Negative X) ---
    const leftFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(halfFloorWidth, chunkSize),
        material,
    );
    leftFloor.rotation.x = -Math.PI / 2;
    leftFloor.position.x = -(halfSeam + halfFloorWidth / 2);
    leftFloor.receiveShadow = true;
    group.add(leftFloor);

    // --- Right Floor Half (Positive X) ---
    const rightFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(halfFloorWidth, chunkSize),
        material,
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
 * + their DataTextures, and the POLARIZED seam-line material). Idempotent.
 * Call once from {@link ChunkManager.dispose}; NEVER per chunk, since the pool
 * is shared across every chunk that uses it.
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
