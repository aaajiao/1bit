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
