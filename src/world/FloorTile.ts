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
 * Now features jagged texturing and geometry
 * @param chunkSize - Size of the chunk
 * @param material - Floor material
 * @param crackWidth - Base width of the central crack (default 4 meters)
 */
export function createCrackedFloorMesh(
    chunkSize: number,
    material: THREE.Material,
    crackWidth: number = 4
): { group: THREE.Group, fog?: THREE.InstancedMesh } {
    const group = new THREE.Group();

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
            const noise = Math.sin(z * 0.5) * 0.8 + Math.sin(z * 2.1) * 0.3 + (Math.random() - 0.5) * 0.4;
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
            const noise = Math.sin(z * 0.5 + 123.4) * 0.8 + Math.sin(z * 2.1) * 0.3 + (Math.random() - 0.5) * 0.4;
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

    // Abyss plane (pure black)
    const abyssMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const abyssFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(crackWidth + 6, chunkSize),
        abyssMaterial
    );
    abyssFloor.rotation.x = -Math.PI / 2;
    abyssFloor.position.y = -8; // Deep abyss
    group.add(abyssFloor);

    // --- Abyss Fog ---
    const fog = createAbyssFog(chunkSize, crackWidth);
    fog.position.y = -5; // Start fog deep down
    group.add(fog);

    return { group, fog };
}

/**
 * Creates an instanced mesh for rising fog particles in the abyss
 */
export function createAbyssFog(chunkSize: number, crackWidth: number): THREE.InstancedMesh {
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
        // Random position within the crack volume
        dummy.position.set(
            (Math.random() - 0.5) * crackWidth * 1.5, // Slightly wider spread
            -160 + Math.random() * 162.0,            // Range from -160m to +2m
            (Math.random() - 0.5) * chunkSize         // Along entire chunk length
        );

        // Random rotation and scale
        dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        const s = 1.0 + Math.random() * 2.0;
        dummy.scale.set(s, s, s);

        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        // Use user data to store speed for animation
        if (!mesh.userData.speeds) mesh.userData.speeds = [];
        mesh.userData.speeds[i] = 0.5 + Math.random() * 1.5; // Upward speed
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
