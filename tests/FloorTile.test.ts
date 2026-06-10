import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { createSeamFloorMesh, disposeFloorPool } from '../src/world/FloorTile';

const CHUNK_SIZE = 80;

function getHalves(group: THREE.Group): [THREE.Mesh, THREE.Mesh] {
    // createSeamFloorMesh adds left half, right half, then the seam strip.
    const meshes = group.children.filter(c => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
    return [meshes[0], meshes[1]];
}

function texData(mesh: THREE.Mesh): Uint8Array {
    const mat = mesh.material as THREE.MeshLambertMaterial;
    const tex = mat.map as THREE.DataTexture;
    return tex.image.data as Uint8Array;
}

// Flow-audit enhancement #11 — POLARIZED's signature checkerboard ground.
describe('floorTile createSeamFloorMesh (POLARIZED checkerboard)', () => {
    afterEach(() => {
        // The checker/seam materials are module-shared; reset between tests so
        // each test observes a fresh lazy-init.
        disposeFloorPool();
    });

    it('builds two floor halves and one seam strip', () => {
        const group = createSeamFloorMesh(CHUNK_SIZE);
        const meshes = group.children.filter(c => (c as THREE.Mesh).isMesh);
        expect(meshes).toHaveLength(3);
    });

    it('gives the two halves PHASE-OPPOSITE checkerboards (factional opposition)', () => {
        const [left, right] = getHalves(createSeamFloorMesh(CHUNK_SIZE));
        expect(left.material).not.toBe(right.material);

        const a = texData(left);
        const b = texData(right);
        expect(a.length).toBe(b.length);
        // Every cell of phase B is the bright/dark inverse of phase A: where A
        // is bright B is dark and vice versa (alpha channel stays 255 on both).
        for (let i = 0; i < a.length / 4; i++) {
            expect(a[i * 4]).not.toBe(b[i * 4]);
            expect(a[i * 4 + 3]).toBe(255);
            expect(b[i * 4 + 3]).toBe(255);
        }
    });

    it('each half is itself a checker (both bright and dark cells present)', () => {
        const [left] = getHalves(createSeamFloorMesh(CHUNK_SIZE));
        const a = texData(left);
        const values = new Set([a[0], a[4], a[8], a[12]]);
        expect(values.size).toBe(2);
    });

    it('keeps the checker razor-sharp: NearestFilter + RepeatWrapping', () => {
        const [left] = getHalves(createSeamFloorMesh(CHUNK_SIZE));
        const tex = (left.material as THREE.MeshLambertMaterial).map as THREE.DataTexture;
        expect(tex.magFilter).toBe(THREE.NearestFilter);
        expect(tex.minFilter).toBe(THREE.NearestFilter);
        expect(tex.wrapS).toBe(THREE.RepeatWrapping);
        expect(tex.wrapT).toBe(THREE.RepeatWrapping);
    });

    it('shares the SAME material instances across chunks (no per-chunk allocation)', () => {
        const [leftA, rightA] = getHalves(createSeamFloorMesh(CHUNK_SIZE));
        const [leftB, rightB] = getHalves(createSeamFloorMesh(CHUNK_SIZE));
        expect(leftA.material).toBe(leftB.material);
        expect(rightA.material).toBe(rightB.material);
    });

    it('disposeFloorPool resets the shared pool (fresh materials afterwards)', () => {
        const [leftA] = getHalves(createSeamFloorMesh(CHUNK_SIZE));
        disposeFloorPool();
        const [leftB] = getHalves(createSeamFloorMesh(CHUNK_SIZE));
        expect(leftA.material).not.toBe(leftB.material);
    });
});
