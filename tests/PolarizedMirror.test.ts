// 1-bit Chimera Void - POLARIZED mirror-twin tests
//
// POLARIZED clusters are mirror twin cities: both chunk columns draw their
// content from the canonical (+x) column's seeds and the -x column reflects
// the result across the cluster-center seam plane, so the factions are
// identical content whose only difference is the rendering language (solid
// 'us' vs wireframe 'them'). These tests cover the pure mirror math and the
// placement pipeline composed from the SAME pure helpers ChunkManager
// consumes (polarizedLocalX carries the skew+clamp+mirror step, so the
// contract cannot silently diverge): involution, mirrored twin placements,
// side-determined language, and per-chunk determinism independent of
// generation order.

import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/config/constants';
import { hash } from '../src/utils/hash';
import {
    chunkToCluster,
    clusterCenterWorld,
    POLARIZED_MIRROR,
    RoomType,
} from '../src/world/RoomConfig';
import {
    applyLayout,
    chunkBuildingCount,
    layoutAt,
    polarizedLocalX,
    polarizedMirrorFrame,
    polarizedTwinCx,
    selectBuildingStyle,
} from '../src/world/RoomGeneration';

const CHUNK = WORLD.CHUNK_SIZE;

/**
 * Composes ChunkManager.createChunk's POLARIZED placement pipeline from the
 * shared pure helpers: canonical raw draw -> layout -> polarizedLocalX
 * (pole skew + clamp + mirror — the exact function ChunkManager calls).
 * Returns the building's chunk-local (x, z) and the world x.
 */
function polarizedPlacement(cx: number, cz: number, i: number): { x: number; z: number; worldX: number } {
    const frame = polarizedMirrorFrame(cx);
    const gcx = frame.genCx;
    const half = (CHUNK - 20) / 2;
    const rawX = (hash(gcx + i, cz) - 0.5) * (CHUNK - 20);
    const rawZ = (hash(gcx, cz + i) - 0.5) * (CHUNK - 20);
    const layoutMode = layoutAt(gcx, cz, RoomType.POLARIZED);
    const composed = applyLayout(layoutMode, rawX, rawZ, gcx, cz, i, half);
    const bx = polarizedLocalX(composed.x, gcx, cz, i, half, frame.mirrored);
    return { x: bx, z: composed.z, worldX: cx * CHUNK + bx };
}

describe('polarizedMirror', () => {
    describe('polarizedTwinCx', () => {
        it('is an involution (the twin of the twin is the chunk itself)', () => {
            for (let cx = -25; cx <= 25; cx++) {
                expect(polarizedTwinCx(polarizedTwinCx(cx))).toBe(cx);
            }
        });

        it('pairs columns within the same cluster', () => {
            for (let cx = -25; cx <= 25; cx++) {
                expect(chunkToCluster(polarizedTwinCx(cx))).toBe(chunkToCluster(cx));
            }
        });

        it('never self-pairs with the even CLUSTER_CHUNKS in production', () => {
            // 2x2 clusters => the two columns always pair with each other.
            expect(WORLD.CLUSTER_CHUNKS % 2).toBe(0);
            for (let cx = -25; cx <= 25; cx++) {
                expect(polarizedTwinCx(cx)).not.toBe(cx);
            }
        });

        it('reflects the chunk-center across the cluster-center seam plane', () => {
            for (let cx = -25; cx <= 25; cx++) {
                const seamX = clusterCenterWorld(chunkToCluster(cx));
                expect(polarizedTwinCx(cx) * CHUNK).toBeCloseTo(2 * seamX - cx * CHUNK, 9);
            }
        });
    });

    describe('polarizedMirrorFrame', () => {
        it('twin columns share the canonical genCx', () => {
            for (let cx = -25; cx <= 25; cx++) {
                const twin = polarizedTwinCx(cx);
                expect(polarizedMirrorFrame(cx).genCx).toBe(polarizedMirrorFrame(twin).genCx);
            }
        });

        it('the canonical column is the +x member and never mirrors', () => {
            for (let cx = -25; cx <= 25; cx++) {
                const frame = polarizedMirrorFrame(cx);
                const seamX = clusterCenterWorld(chunkToCluster(cx));
                // Canonical chunk-center lies strictly on the +x side of the seam.
                expect(frame.genCx * CHUNK).toBeGreaterThan(seamX);
                expect(polarizedMirrorFrame(frame.genCx).mirrored).toBe(false);
            }
        });

        it('exactly one column of each pair mirrors', () => {
            for (let cx = -25; cx <= 25; cx++) {
                const a = polarizedMirrorFrame(cx).mirrored;
                const b = polarizedMirrorFrame(polarizedTwinCx(cx)).mirrored;
                expect(a).not.toBe(b);
            }
        });

        it('language is side-determined: twins render opposite banks', () => {
            for (let cx = -25; cx <= 25; cx++) {
                const frame = polarizedMirrorFrame(cx);
                const twinFrame = polarizedMirrorFrame(polarizedTwinCx(cx));
                expect(frame.solid).not.toBe(twinFrame.solid);
                // The canonical (+x) bank carries the configured language.
                const canonical = frame.mirrored ? twinFrame : frame;
                expect(canonical.solid).toBe(POLARIZED_MIRROR.CANONICAL_SOLID);
            }
        });
    });

    describe('polarizedLocalX', () => {
        const HALF = (CHUNK - 20) / 2;

        it('stays within the placement bounds for any composed x', () => {
            for (const composedX of [-HALF * 2, -HALF, -7.3, 0, 12.9, HALF, HALF * 2]) {
                for (let i = 0; i < 6; i++) {
                    const x = polarizedLocalX(composedX, 4, -3, i, HALF, false);
                    expect(Math.abs(x)).toBeLessThanOrEqual(HALF);
                }
            }
        });

        it('mirrored is the exact negation of the canonical result', () => {
            for (const composedX of [-22.5, -1, 0, 8.4, 29]) {
                for (let i = 0; i < 6; i++) {
                    const canonical = polarizedLocalX(composedX, 4, -3, i, HALF, false);
                    expect(polarizedLocalX(composedX, 4, -3, i, HALF, true)).toBe(-canonical);
                }
            }
        });

        it('parks the building on its hash-chosen pole (sign follows the pole draw)', () => {
            // |x|*pole + pole*half/2 always lands on the pole's half-chunk.
            const signs = new Set<number>();
            for (let i = 0; i < 12; i++) {
                const x = polarizedLocalX(10, 4, -3, i, HALF, false);
                expect(x).not.toBe(0);
                signs.add(Math.sign(x));
            }
            // Both poles occur across a building sweep (not one shared side).
            expect(signs.size).toBe(2);
        });
    });

    describe('mirrored twin placements', () => {
        it('twin chunks produce mirrored world-x placements, identical z', () => {
            for (let cluster = -6; cluster <= 6; cluster++) {
                const west = cluster * WORLD.CLUSTER_CHUNKS;
                const east = polarizedTwinCx(west);
                const seamX = clusterCenterWorld(cluster);
                for (const cz of [-3, 0, 4]) {
                    const count = chunkBuildingCount(polarizedMirrorFrame(west).genCx, cz, RoomType.POLARIZED);
                    for (let i = 0; i < count; i++) {
                        const w = polarizedPlacement(west, cz, i);
                        const e = polarizedPlacement(east, cz, i);
                        expect(w.worldX).toBeCloseTo(2 * seamX - e.worldX, 9);
                        expect(w.z).toBe(e.z);
                    }
                }
            }
        });

        it('twin chunks agree on content: count and per-building style', () => {
            for (let cluster = -6; cluster <= 6; cluster++) {
                const west = cluster * WORLD.CLUSTER_CHUNKS;
                const east = polarizedTwinCx(west);
                const gw = polarizedMirrorFrame(west).genCx;
                const ge = polarizedMirrorFrame(east).genCx;
                for (const cz of [-3, 0, 4]) {
                    const count = chunkBuildingCount(gw, cz, RoomType.POLARIZED);
                    expect(chunkBuildingCount(ge, cz, RoomType.POLARIZED)).toBe(count);
                    for (let i = 0; i < count; i++) {
                        expect(selectBuildingStyle(hash(i, gw), RoomType.POLARIZED))
                            .toBe(selectBuildingStyle(hash(i, ge), RoomType.POLARIZED));
                    }
                }
            }
        });

        it('is deterministic independent of generation order', () => {
            // A chunk generates identically whether or not (or before/after)
            // its twin is generated: the canonical frame is a pure function of
            // the chunk's own coordinate, so repeated/reordered evaluation is
            // bit-identical.
            const first = polarizedPlacement(-8, 2, 3);
            polarizedPlacement(polarizedTwinCx(-8), 2, 3); // twin "generated" in between
            const again = polarizedPlacement(-8, 2, 3);
            expect(again).toEqual(first);
        });
    });
});
