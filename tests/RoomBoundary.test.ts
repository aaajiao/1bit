import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/config/constants';
import { RIFT_PHYSICS } from '../src/config/physics';
import {
    getRoomTypeAtWorldPosition,
    getRoomTypeFromPosition,
    worldToChunkCoord,
} from '../src/world/RoomConfig';

const S = WORLD.CHUNK_SIZE;
const HALF = S / 2;

// Chunk floors are CENTERED on the chunk origin (ChunkManager.createChunk +
// FloorTile), so chunk k's visible floor footprint is [k*S - HALF, k*S + HALF).
// These tests pin the round convention to that footprint: standing anywhere on
// chunk k's visible floor must attribute the player to chunk k's room.

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

    describe('getRoomTypeAtWorldPosition', () => {
        it('matches the generating chunk room across the entire visible floor', () => {
            const chunks = [-2, -1, 0, 1, 3];
            const offsets = [-HALF, -20, 0, 20, HALF - 0.01];
            for (const kx of chunks) {
                for (const kz of chunks) {
                    const expected = getRoomTypeFromPosition(kx, kz);
                    for (const ox of offsets) {
                        for (const oz of offsets) {
                            expect(getRoomTypeAtWorldPosition(kx * S + ox, kz * S + oz, S)).toBe(expected);
                        }
                    }
                }
            }
        });

        it('reports each chunk own room on either side of a visible floor seam', () => {
            for (const k of [-2, 0, 2]) {
                const seam = k * S + HALF;
                expect(getRoomTypeAtWorldPosition(seam - 0.01, 0, S)).toBe(getRoomTypeFromPosition(k, 0));
                expect(getRoomTypeAtWorldPosition(seam + 0.01, 0, S)).toBe(getRoomTypeFromPosition(k + 1, 0));
            }
        });

        it('attributes the rift crack strip around k*S to chunk k itself', () => {
            // The FORCED_ALIGNMENT crack runs along the chunk center line, so
            // anywhere within the crack half-width must belong to that chunk.
            const dxs = [-RIFT_PHYSICS.crackHalfWidth + 0.01, 0, RIFT_PHYSICS.crackHalfWidth - 0.01];
            for (const k of [-3, 0, 5]) {
                for (const dx of dxs) {
                    expect(chunkOf(k * S + dx)).toBe(k);
                    expect(getRoomTypeAtWorldPosition(k * S + dx, k * S, S)).toBe(getRoomTypeFromPosition(k, k));
                }
            }
        });
    });
});
