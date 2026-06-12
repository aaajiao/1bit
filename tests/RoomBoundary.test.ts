import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/config/constants';
import { RIFT_PHYSICS } from '../src/config/physics';
import {
    chunkToCluster,
    clusterCenterWorld,
    faSideAxisX,
    getRoomTypeAtWorldPosition,
    getRoomTypeForCluster,
    getRoomTypeFromPosition,
    riftLineXForWorldX,
    worldToChunkCoord,
} from '../src/world/RoomConfig';

const S = WORLD.CHUNK_SIZE;
const HALF = S / 2;
const CC = WORLD.CLUSTER_CHUNKS; // 2 chunks per cluster edge

// Chunk floors are CENTERED on the chunk origin (ChunkManager.createChunk +
// FloorTile), so chunk k's visible floor footprint is [k*S - HALF, k*S + HALF).
// Rooms are assigned per CC x CC chunk CLUSTER (chunkToCluster), so a cluster
// k spans the chunk footprints of chunks [k*CC, (k+1)*CC). These tests pin
// both conventions: the round chunk attribution AND the floor-grouping of
// chunks into 2x2 room clusters.

// Normalizes -0 to 0 (Math.round(-0.5) returns -0, which Object.is-based
// matchers treat as distinct from 0).
function chunkOf(world: number): number {
    return worldToChunkCoord(world, S) + 0;
}

describe('room boundary attribution (round convention)', () => {
    describe('worldToChunkCoord', () => {
        it('maps every point of a chunk visible floor footprint to that chunk', () => {
            const chunks = [-3, -1, 0, 1, 4];
            // Left edge inclusive, right edge exclusive.
            const offsets = [-HALF, -HALF + 0.01, -10, 0, 10, HALF - 0.01];
            for (const k of chunks) {
                for (const off of offsets) {
                    expect(chunkOf(k * S + off)).toBe(k);
                }
            }
        });

        it('assigns the shared floor seam x = k*S + HALF to the next chunk', () => {
            expect(chunkOf(HALF)).toBe(1);
            expect(chunkOf(-2 * S + HALF)).toBe(-1);
            expect(chunkOf(3 * S + HALF)).toBe(4);
        });

        it('fixes the old floor() misattribution on the western half of the floor', () => {
            // x = -30 sits on chunk 0's visible floor; Math.floor(x/S) wrongly
            // attributed it to chunk -1 (a 40m offset from the visible seams).
            expect(Math.floor(-30 / S)).toBe(-1);
            expect(chunkOf(-30)).toBe(0);
        });

        it('keeps the half-open footprint convention for negative chunks', () => {
            // Footprint of chunk -2 is [-200, -120).
            expect(chunkOf(-2 * S - HALF)).toBe(-2);
            expect(chunkOf(-2 * S + HALF)).toBe(-1);
        });
    });

    describe('chunkToCluster (single source of cluster grouping)', () => {
        it('groups chunks {k*CC .. k*CC+CC-1} into cluster k', () => {
            for (const k of [-3, -1, 0, 2, 7]) {
                for (let i = 0; i < CC; i++) {
                    expect(chunkToCluster(k * CC + i)).toBe(k);
                }
            }
        });

        it('keeps negative-coordinate grouping contiguous (Math.floor semantics)', () => {
            // Chunks {-2, -1} -> cluster -1; {-4, -3} -> cluster -2; {0, 1} -> 0.
            expect(chunkToCluster(-1)).toBe(-1);
            expect(chunkToCluster(-2)).toBe(-1);
            expect(chunkToCluster(-3)).toBe(-2);
            expect(chunkToCluster(-4)).toBe(-2);
            expect(chunkToCluster(0)).toBe(0);
            expect(chunkToCluster(1)).toBe(0);
            expect(chunkToCluster(2)).toBe(1);
        });

        it('walks every chunk over a long contiguous run without gaps or overlaps', () => {
            let prev = chunkToCluster(-50);
            let runLength = 0;
            for (let c = -50; c <= 50; c++) {
                const cluster = chunkToCluster(c);
                if (cluster === prev) {
                    runLength++;
                }
                else {
                    expect(cluster).toBe(prev + 1); // clusters advance by exactly 1
                    expect(runLength).toBe(CC); // every completed run is CC chunks wide
                    prev = cluster;
                    runLength = 1;
                }
            }
        });
    });

    describe('clusterCenterWorld / faSideAxisX / riftLineXForWorldX', () => {
        it('places the cluster center on the seam between the cluster chunk columns', () => {
            for (const k of [-2, 0, 3]) {
                const center = clusterCenterWorld(k, S);
                // The center is half a chunk past the first chunk of the cluster…
                expect(center).toBe(k * CC * S + HALF);
                // …which is exactly the floor seam: the next chunk starts here.
                expect(chunkOf(center)).toBe(k * CC + 1);
            }
        });

        it('keeps the SEMANTIC side axis at the cluster center for every x inside one cluster', () => {
            for (const k of [-2, 0, 5]) {
                const center = clusterCenterWorld(k, S);
                const halfCluster = (CC * S) / 2;
                expect(faSideAxisX(center, S)).toBe(center);
                // Anywhere in the cluster footprint maps to the same axis.
                for (const off of [-halfCluster, -30, 0, 30, halfCluster - 0.01]) {
                    expect(faSideAxisX(center + off, S)).toBe(center);
                }
                // The next cluster has its own axis, one cluster width away.
                expect(faSideAxisX(center + halfCluster, S)).toBe(center + CC * S);
            }
        });

        it('returns the nearest chunk COLUMN center as the physical rift line', () => {
            for (const k of [-3, 0, 4]) {
                const line = k * S; // chunk k's column center
                // Every x on chunk k's visible floor maps to chunk k's line
                // (+0 normalizes the -0 that Math.round(-0.5)*S produces).
                for (const off of [-HALF, -30, 0, 30, HALF - 0.01]) {
                    expect(riftLineXForWorldX(line + off, S) + 0).toBe(line);
                }
                // The next column has its own line, one chunk width away.
                expect(riftLineXForWorldX(line + HALF, S)).toBe(line + S);
            }
        });

        it('gives each FA cluster exactly TWO rift lines, 80m apart, at the axis ±S/2', () => {
            for (const k of [-2, 0, 5]) {
                const axis = clusterCenterWorld(k, S);
                const halfCluster = (CC * S) / 2;
                // Collect the distinct rift lines met while walking the footprint.
                const lines = new Set<number>();
                for (let off = -halfCluster; off < halfCluster; off += 1)
                    lines.add(riftLineXForWorldX(axis + off, S));
                expect([...lines].sort((a, b) => a - b)).toEqual([axis - S / 2, axis + S / 2]);
                // Adjacent crack spacing is exactly one chunk (80m).
                expect(axis + S / 2 - (axis - S / 2)).toBe(S);
                // The axis itself is NOT a rift line — solid mid-floor.
                expect(Math.abs(axis - riftLineXForWorldX(axis, S))).toBe(S / 2);
            }
        });
    });

    describe('getRoomTypeAtWorldPosition (per-cluster rooms)', () => {
        it('gives all 4 chunks of a cluster the same room as the cluster itself', () => {
            for (const kx of [-3, -1, 0, 2]) {
                for (const kz of [-2, 0, 1, 4]) {
                    const expected = getRoomTypeForCluster(kx, kz);
                    for (let ix = 0; ix < CC; ix++) {
                        for (let iz = 0; iz < CC; iz++) {
                            expect(getRoomTypeFromPosition(kx * CC + ix, kz * CC + iz)).toBe(expected);
                        }
                    }
                }
            }
        });

        it('matches the generating cluster room across the entire 160m cluster footprint', () => {
            const clusters = [-2, -1, 0, 1, 3];
            // Cluster k footprint on one axis: [center - CC*S/2, center + CC*S/2).
            const halfCluster = (CC * S) / 2;
            const offsets = [-halfCluster, -50, 0, 50, halfCluster - 0.01];
            for (const kx of clusters) {
                for (const kz of clusters) {
                    const expected = getRoomTypeForCluster(kx, kz);
                    const centerX = clusterCenterWorld(kx, S);
                    const centerZ = clusterCenterWorld(kz, S);
                    for (const ox of offsets) {
                        for (const oz of offsets) {
                            expect(getRoomTypeAtWorldPosition(centerX + ox, centerZ + oz, S)).toBe(expected);
                        }
                    }
                }
            }
        });

        it('reports each cluster own room on either side of a cluster boundary', () => {
            for (const k of [-2, 0, 2]) {
                // Boundary between cluster k and k+1 on x: the right edge of
                // cluster k's footprint.
                // z = 0 sits in cluster row 0.
                const boundary = clusterCenterWorld(k, S) + (CC * S) / 2;
                expect(getRoomTypeAtWorldPosition(boundary - 0.01, 0, S)).toBe(getRoomTypeForCluster(k, 0));
                expect(getRoomTypeAtWorldPosition(boundary + 0.01, 0, S)).toBe(getRoomTypeForCluster(k + 1, 0));
            }
        });

        it('can differ across a cluster boundary (boundaries are events again)', () => {
            // Find a pair of x-adjacent clusters with different rooms — must
            // exist within a small scan or the hash distribution is broken.
            let found = false;
            for (let k = -20; k < 20 && !found; k++) {
                if (getRoomTypeForCluster(k, 0) !== getRoomTypeForCluster(k + 1, 0)) {
                    const boundary = clusterCenterWorld(k, S) + (CC * S) / 2;
                    expect(getRoomTypeAtWorldPosition(boundary - 0.01, 0, S))
                        .not
                        .toBe(getRoomTypeAtWorldPosition(boundary + 0.01, 0, S));
                    found = true;
                }
            }
            expect(found).toBe(true);
        });

        it('never changes room across the INNER chunk seams of a cluster', () => {
            for (const kx of [-2, 0, 3]) {
                // The inner x seam of cluster kx is the cluster center line.
                const seam = clusterCenterWorld(kx, S);
                for (const z of [0, 100, -250]) {
                    expect(getRoomTypeAtWorldPosition(seam - 0.01, z, S))
                        .toBe(getRoomTypeAtWorldPosition(seam + 0.01, z, S));
                }
            }
        });

        it('attributes each rift crack strip (around a chunk column center) to that chunk and cluster', () => {
            // The FORCED_ALIGNMENT cracks run along the CHUNK column centers
            // (riftLineXForWorldX), so anywhere within the crack half-width
            // must belong to that chunk — and through it to its cluster.
            const dxs = [-RIFT_PHYSICS.crackHalfWidth + 0.01, 0, RIFT_PHYSICS.crackHalfWidth - 0.01];
            for (const c of [-3, 0, 5]) {
                const line = c * S; // chunk c's column center = its rift line
                expect(riftLineXForWorldX(line, S)).toBe(line);
                for (const dx of dxs) {
                    expect(chunkOf(line + dx)).toBe(c);
                    expect(chunkToCluster(chunkOf(line + dx))).toBe(chunkToCluster(c));
                    expect(getRoomTypeAtWorldPosition(line + dx, clusterCenterWorld(chunkToCluster(c), S), S))
                        .toBe(getRoomTypeForCluster(chunkToCluster(c), chunkToCluster(c)));
                }
            }
        });
    });
});
