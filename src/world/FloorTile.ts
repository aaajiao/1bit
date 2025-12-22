// 1-bit Chimera Void - Floor Tile Generator
import * as THREE from 'three';

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
        THREE.RGBAFormat
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
        material
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    return floor;
}

/**
 * Creates a floor with a central crack/rift for FORCED_ALIGNMENT rooms
 * The crack splits the floor into two halves with pure black abyss in between
 * @param chunkSize - Size of the chunk
 * @param material - Floor material
 * @param crackWidth - Width of the central crack (default 4 meters)
 */
export function createCrackedFloorMesh(
    chunkSize: number,
    material: THREE.Material,
    crackWidth: number = 4
): THREE.Group {
    const group = new THREE.Group();

    // Calculate half-floor dimensions
    const halfFloorWidth = (chunkSize - crackWidth) / 2;
    const halfCrackWidth = crackWidth / 2;

    // Left floor half (negative X side)
    const leftFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(halfFloorWidth, chunkSize),
        material
    );
    leftFloor.rotation.x = -Math.PI / 2;
    leftFloor.position.x = -(halfCrackWidth + halfFloorWidth / 2);
    leftFloor.receiveShadow = true;
    group.add(leftFloor);

    // Right floor half (positive X side)
    const rightFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(halfFloorWidth, chunkSize),
        material
    );
    rightFloor.rotation.x = -Math.PI / 2;
    rightFloor.position.x = halfCrackWidth + halfFloorWidth / 2;
    rightFloor.receiveShadow = true;
    group.add(rightFloor);

    // Optional: Add a deep black plane below the crack for visual depth
    const abyssMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const abyssFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(crackWidth + 2, chunkSize),
        abyssMaterial
    );
    abyssFloor.rotation.x = -Math.PI / 2;
    abyssFloor.position.y = -5; // 5 meters below ground level
    abyssFloor.position.x = 0;
    group.add(abyssFloor);

    return group;
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
    rotationAngle: number = 45
): THREE.Group {
    const group = new THREE.Group();

    // First layer - standard floor
    const layer1 = new THREE.Mesh(
        new THREE.PlaneGeometry(chunkSize, chunkSize),
        material
    );
    layer1.rotation.x = -Math.PI / 2;
    layer1.receiveShadow = true;
    group.add(layer1);

    // Second layer - different density grid for stronger moiré interference
    // Create a separate material with different grid density (32 vs default 64)
    const layer2Material = createMoireLayerMaterial(32);
    layer2Material.transparent = true;
    layer2Material.opacity = 0.7;

    const layer2 = new THREE.Mesh(
        new THREE.PlaneGeometry(chunkSize * 1.5, chunkSize * 1.5), // Larger to cover corners after rotation
        layer2Material
    );
    layer2.rotation.x = -Math.PI / 2;
    layer2.rotation.z = (rotationAngle * Math.PI) / 180; // Rotate around Y axis in world space (Z in local after X rotation)
    layer2.position.y = 0.02; // Slight height offset for clean moiré (Method A)
    layer2.receiveShadow = true;
    group.add(layer2);

    return group;
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
        THREE.RGBAFormat
    );
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(25, 25); // Different repeat count for more interference
    tex.needsUpdate = true;

    return new THREE.MeshLambertMaterial({ map: tex });
}
