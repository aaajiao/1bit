// 1-bit Chimera Void - Floor Tile Generator
import * as THREE from 'three';

/**
 * Creates a procedural grid texture for the floor
 * @param {number} size - Texture size in pixels
 * @returns {THREE.MeshLambertMaterial}
 */
export function createFloorMaterial(size = 64) {
    const data = new Uint8Array(size * size * 3);

    for (let i = 0; i < size * size; i++) {
        const x = i % size;
        const y = Math.floor(i / size);
        const c = x % 4 === 0 || y % 4 === 0 ? 100 : 40;
        data[i * 3] = c;
        data[i * 3 + 1] = c;
        data[i * 3 + 2] = c;
    }

    const tex = new THREE.DataTexture(
        data,
        size,
        size,
        THREE.RGBFormat
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
 * @param {number} chunkSize - Size of the chunk
 * @param {THREE.Material} material - Floor material
 * @returns {THREE.Mesh}
 */
export function createFloorMesh(chunkSize, material) {
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(chunkSize, chunkSize),
        material
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    return floor;
}
