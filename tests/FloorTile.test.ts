import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { createCrackedFloorMesh, createSeamFloorMesh, disposeFloorPool } from '../src/world/FloorTile';
import { FA_RIFT } from '../src/world/RoomConfig';

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

// F0 room clustering — the FORCED_ALIGNMENT rift is ONE line per 2x2-chunk
// cluster, running along the cluster center (a chunk footprint edge), so each
// FA chunk carries only the crack half overlapping its own floor.
describe('floorTile createCrackedFloorMesh (cluster-shared rift)', () => {
    const floorMaterial = new THREE.MeshLambertMaterial();
    const CRACK_WIDTH = 4;

    interface CrackedParts {
        floors: THREE.Mesh[];
        abyss: THREE.Mesh;
        fog: THREE.InstancedMesh;
    }

    function build(crackLocalX: number, cx = 0, cz = 0): CrackedParts {
        const { group, fog } = createCrackedFloorMesh(
            CHUNK_SIZE,
            floorMaterial,
            CRACK_WIDTH,
            cx,
            cz,
            crackLocalX,
        );
        const floors = group.children.filter(c =>
            (c as THREE.Mesh).isMesh
            && !(c as THREE.InstancedMesh).isInstancedMesh
            && (c as THREE.Mesh).material === floorMaterial) as THREE.Mesh[];
        const abyss = group.children.find(c =>
            (c as THREE.Mesh).isMesh && c.position.y === -8) as THREE.Mesh;
        return { floors, abyss, fog: fog as THREE.InstancedMesh };
    }

    function planeWidth(mesh: THREE.Mesh): number {
        return (mesh.geometry as THREE.PlaneGeometry).parameters.width;
    }

    it('keeps the historical centered layout when the crack is at local x=0', () => {
        const { floors, abyss } = build(0);
        expect(floors).toHaveLength(2);
        const expectedWidth = (CHUNK_SIZE - CRACK_WIDTH) / 2; // 38
        expect(planeWidth(floors[0])).toBeCloseTo(expectedWidth, 9);
        expect(planeWidth(floors[1])).toBeCloseTo(expectedWidth, 9);
        expect(floors[0].position.x).toBeCloseTo(-(CRACK_WIDTH / 2 + expectedWidth / 2), 9);
        expect(floors[1].position.x).toBeCloseTo(CRACK_WIDTH / 2 + expectedWidth / 2, 9);
        // Abyss spans the historical crackWidth + 6, centered under the crack.
        expect(planeWidth(abyss)).toBeCloseTo(CRACK_WIDTH + 6, 9);
        expect(abyss.position.x).toBeCloseTo(0, 9);
    });

    it('builds ONE floor strip for a +edge crack (right half lives in the x-neighbor)', () => {
        const { floors } = build(CHUNK_SIZE / 2);
        expect(floors).toHaveLength(1);
        // The single strip covers [-40, 38]: everything left of the crack.
        const expectedWidth = CHUNK_SIZE - CRACK_WIDTH / 2; // 78
        expect(planeWidth(floors[0])).toBeCloseTo(expectedWidth, 9);
        expect(floors[0].position.x).toBeCloseTo(-CHUNK_SIZE / 2 + expectedWidth / 2, 9);
    });

    it('builds ONE floor strip for a -edge crack (mirror case)', () => {
        const { floors } = build(-CHUNK_SIZE / 2);
        expect(floors).toHaveLength(1);
        const expectedWidth = CHUNK_SIZE - CRACK_WIDTH / 2; // 78
        expect(planeWidth(floors[0])).toBeCloseTo(expectedWidth, 9);
        expect(floors[0].position.x).toBeCloseTo(CHUNK_SIZE / 2 - expectedWidth / 2, 9);
    });

    it('clips the abyss plane to the chunk footprint for edge cracks', () => {
        const { abyss } = build(CHUNK_SIZE / 2);
        const halfChunk = CHUNK_SIZE / 2;
        const w = planeWidth(abyss);
        const minX = abyss.position.x - w / 2;
        const maxX = abyss.position.x + w / 2;
        expect(minX).toBeGreaterThanOrEqual(-halfChunk - 1e-9);
        expect(maxX).toBeLessThanOrEqual(halfChunk + 1e-9);
        // It still reaches the crack line on the footprint edge.
        expect(maxX).toBeCloseTo(halfChunk, 9);
    });

    it('positions the abyss fog on the crack line and halves shared-edge particles', () => {
        const centered = build(0);
        const edge = build(CHUNK_SIZE / 2);
        expect(centered.fog.position.x).toBeCloseTo(0, 9);
        expect(edge.fog.position.x).toBeCloseTo(CHUNK_SIZE / 2, 9);
        // Edge cracks are shared with the x-neighbor chunk: each side emits
        // half the particles so the combined density matches one full crack.
        expect(edge.fog.count * 2).toBe(centered.fog.count);
    });

    it('is deterministic per seed (re-entering regenerates identical jagged edges)', () => {
        const a = build(CHUNK_SIZE / 2, 3, -7);
        const b = build(CHUNK_SIZE / 2, 3, -7);
        const posA = a.floors[0].geometry.attributes.position.array;
        const posB = b.floors[0].geometry.attributes.position.array;
        expect(posA.length).toBe(posB.length);
        for (let i = 0; i < posA.length; i++) {
            expect(posA[i]).toBe(posB[i]);
        }
    });

    it('connects the jagged edge across the z seam inside a cluster (one continuous crack)', () => {
        // Chunks (0,0) and (0,1) form one column of cluster (0,0)
        // (CLUSTER_CHUNKS=2); the column left of the rift carries the crack on
        // its +x footprint edge (crackLocalX = +CHUNK_SIZE/2) in both chunks.
        const a = build(CHUNK_SIZE / 2, 0, 0);
        const b = build(CHUNK_SIZE / 2, 0, 1);

        // Plane-geometry rows are unrotated: local plane y = -world z, so
        // chunk (0,0)'s +z edge is the row at plane y = -40 and chunk (0,1)'s
        // -z edge is the row at plane y = +40 — the same world z = 40.
        const rowXs = (mesh: THREE.Mesh, planeY: number): number[] => {
            const pos = mesh.geometry.attributes.position;
            const xs: number[] = [];
            for (let i = 0; i < pos.count; i++) {
                if (pos.getY(i) === planeY)
                    xs.push(pos.getX(i));
            }
            return xs;
        };
        const seamA = rowXs(a.floors[0], -CHUNK_SIZE / 2);
        const seamB = rowXs(b.floors[0], CHUNK_SIZE / 2);
        expect(seamA.length).toBeGreaterThan(0);
        expect(seamA.length).toBe(seamB.length);
        // The seam-row jag endpoints meet: same x offsets on both sides.
        for (let i = 0; i < seamA.length; i++) {
            expect(seamA[i]).toBeCloseTo(seamB[i], 12);
        }
        // Sanity (non-vacuous): the seam row's edge column really was eroded
        // away from the un-perturbed strip edge.
        const stripHalfWidth = (CHUNK_SIZE - CRACK_WIDTH / 2) / 2; // 39
        expect(Math.max(...seamA)).toBeLessThan(stripHalfWidth);
    });
});

// Rift presence — the FA crack must be legible from anywhere in the room, so
// the floor system grows two vertical layers: a raised abyss-fog column (with
// sparse larger "leak" particles above the dense band) and a translucent
// pure-black "void tear" plane standing in the crack. Knobs in FA_RIFT.
describe('floorTile rift presence (fog column + void tear)', () => {
    const floorMaterial = new THREE.MeshLambertMaterial();
    const CRACK_WIDTH = 4;

    function build(crackLocalX: number, cx = 0, cz = 0): ReturnType<typeof createCrackedFloorMesh> {
        return createCrackedFloorMesh(CHUNK_SIZE, floorMaterial, CRACK_WIDTH, cx, cz, crackLocalX);
    }

    function tearOf(group: THREE.Group): THREE.Mesh | undefined {
        return group.getObjectByName('riftTear') as THREE.Mesh | undefined;
    }

    describe('abyss-fog column', () => {
        it('writes per-instance recycle ceilings reaching the leak top', () => {
            const { fog } = build(CHUNK_SIZE / 2);
            const topYs = fog!.userData.topYs as number[];
            expect(topYs).toHaveLength(fog!.count);

            const { MESH_Y, DENSE_TOP, LEAK_TOP, BOTTOM } = FA_RIFT.FOG;
            const localDenseTop = DENSE_TOP - MESH_Y;
            const localLeakTop = LEAK_TOP - MESH_Y;
            // Every ceiling is one of the two bands, and both bands occur.
            for (const top of topYs)
                expect(top === localDenseTop || top === localLeakTop).toBe(true);
            expect(topYs).toContain(localDenseTop);
            expect(topYs).toContain(localLeakTop);
            // The shared reset floor matches the configured column bottom.
            expect(fog!.userData.resetY).toBe(BOTTOM - MESH_Y);
        });

        it('keeps the leakers a sparse minority (稍稀)', () => {
            const { fog } = build(0);
            const topYs = fog!.userData.topYs as number[];
            const localLeakTop = FA_RIFT.FOG.LEAK_TOP - FA_RIFT.FOG.MESH_Y;
            const leakers = topYs.filter(t => t === localLeakTop).length;
            expect(leakers).toBeGreaterThan(0);
            expect(leakers / topYs.length).toBeLessThan(0.5);
        });

        it('no particle starts above its own recycle ceiling (no boot teleport)', () => {
            const { fog } = build(CHUNK_SIZE / 2, 3, -7);
            const topYs = fog!.userData.topYs as number[];
            const m = new THREE.Matrix4();
            const p = new THREE.Vector3();
            const q = new THREE.Quaternion();
            const s = new THREE.Vector3();
            for (let i = 0; i < fog!.count; i++) {
                fog!.getMatrixAt(i, m);
                m.decompose(p, q, s);
                expect(p.y).toBeLessThanOrEqual(topYs[i]);
                expect(p.y).toBeGreaterThanOrEqual(fog!.userData.resetY as number);
            }
        });
    });

    describe('void tear plane', () => {
        it('stands a translucent black DoubleSide plane on the crack line', () => {
            const { group } = build(CHUNK_SIZE / 2);
            const tear = tearOf(group)!;
            expect(tear).toBeDefined();
            expect(tear.position.x).toBeCloseTo(CHUNK_SIZE / 2, 9);
            expect(tear.position.y).toBeCloseTo((FA_RIFT.TEAR.HEIGHT + FA_RIFT.TEAR.BASE_Y) / 2, 9);

            const geo = tear.geometry as THREE.PlaneGeometry;
            expect(geo.parameters.width).toBe(CHUNK_SIZE);
            expect(geo.parameters.height).toBe(FA_RIFT.TEAR.HEIGHT - FA_RIFT.TEAR.BASE_Y);

            const mat = tear.material as THREE.MeshBasicMaterial;
            expect(mat.transparent).toBe(true);
            expect(mat.opacity).toBe(FA_RIFT.TEAR.OPACITY);
            expect(mat.side).toBe(THREE.DoubleSide);
            expect(mat.depthWrite).toBe(false);
            expect(mat.color.getHex()).toBe(0x000000);
        });

        it('is owned by the +x-side chunk only (shared edge crack never doubles)', () => {
            // crackLocalX >= 0 owns the tear; the -x-edge twin contributes none,
            // mirroring the fog's half-density rule for a one-plane element.
            expect(tearOf(build(CHUNK_SIZE / 2).group)).toBeDefined();
            expect(tearOf(build(0).group)).toBeDefined();
            expect(tearOf(build(-CHUNK_SIZE / 2).group)).toBeUndefined();
        });

        it('tracks the tear material in the disposables (dispose chain)', () => {
            const { group, disposables } = build(CHUNK_SIZE / 2);
            const tear = tearOf(group)!;
            expect(disposables).toContain(tear.material as THREE.Material);
        });

        it('tears the top edge ragged within the configured amplitude', () => {
            const { group } = build(CHUNK_SIZE / 2);
            const pos = (tearOf(group)!.geometry as THREE.PlaneGeometry).attributes.position;
            const topLocalY = (FA_RIFT.TEAR.HEIGHT - FA_RIFT.TEAR.BASE_Y) / 2;
            // crackJagOffset is bounded by |wave| + |jitter| <= 1.5, times 0.8.
            const maxJag = 1.5 * 0.8 * FA_RIFT.TEAR.JAG_SCALE;

            let torn = 0;
            for (let i = 0; i < pos.count; i++) {
                const y = pos.getY(i);
                if (y < 0)
                    continue; // bottom row stays buried in the crack
                expect(y).toBeLessThanOrEqual(topLocalY);
                expect(y).toBeGreaterThanOrEqual(topLocalY - maxJag);
                if (y < topLocalY - 1e-6)
                    torn++;
            }
            expect(torn).toBeGreaterThan(0); // non-vacuous: the edge IS ragged
        });

        it('joins the torn silhouette across the cluster z seam (one continuous rip)', () => {
            // Chunks (0,0) and (0,1) are one column of cluster (0,0); both own
            // the tear (crackLocalX = +40). Local +x maps to world +z, so chunk
            // (0,0)'s +z end is x=+40 (worldZ 40) and chunk (0,1)'s -z end is
            // x=-40 (worldZ 40) — the torn top heights must meet exactly.
            const topAt = (group: THREE.Group, localX: number): number => {
                const pos = (tearOf(group)!.geometry as THREE.PlaneGeometry).attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    if (pos.getX(i) === localX && pos.getY(i) > 0)
                        return pos.getY(i);
                }
                throw new Error(`no top vertex at local x=${localX}`);
            };
            const a = topAt(build(CHUNK_SIZE / 2, 0, 0).group, CHUNK_SIZE / 2);
            const b = topAt(build(CHUNK_SIZE / 2, 0, 1).group, -CHUNK_SIZE / 2);
            expect(a).toBeCloseTo(b, 12);
        });

        it('is deterministic per seed (re-entering regenerates the identical tear)', () => {
            const a = (tearOf(build(CHUNK_SIZE / 2, 3, -7).group)!.geometry as THREE.PlaneGeometry).attributes.position.array;
            const b = (tearOf(build(CHUNK_SIZE / 2, 3, -7).group)!.geometry as THREE.PlaneGeometry).attributes.position.array;
            expect(a.length).toBe(b.length);
            for (let i = 0; i < a.length; i++)
                expect(a[i]).toBe(b[i]);
        });
    });
});
