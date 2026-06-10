import { describe, expect, it } from 'vitest';
import { SPAWN, WORLD } from '../src/config';
import {
    findQuietSpawnChunk,
    findQuietSpawnPosition,
    getRoomTypeAtWorldPosition,
    getRoomTypeFromPosition,
    QUIET_SPAWN_ROOMS,
    RoomType,
} from '../src/world/RoomConfig';

describe('quiet spawn scan (flow-audit medium #7)', () => {
    it('confirms the origin chunk is INFO_OVERFLOW (the problem being solved)', () => {
        expect(getRoomTypeFromPosition(0, 0)).toBe(RoomType.INFO_OVERFLOW);
    });

    it('only treats IN_BETWEEN and POLARIZED as quiet spawn rooms', () => {
        expect(QUIET_SPAWN_ROOMS.has(RoomType.IN_BETWEEN)).toBe(true);
        expect(QUIET_SPAWN_ROOMS.has(RoomType.POLARIZED)).toBe(true);
        expect(QUIET_SPAWN_ROOMS.has(RoomType.INFO_OVERFLOW)).toBe(false);
        expect(QUIET_SPAWN_ROOMS.has(RoomType.FORCED_ALIGNMENT)).toBe(false);
    });

    it('returns a quiet-room chunk within the configured scan radius', () => {
        const { cx, cz } = findQuietSpawnChunk();
        expect(QUIET_SPAWN_ROOMS.has(getRoomTypeFromPosition(cx, cz))).toBe(true);
        expect(Math.abs(cx)).toBeLessThanOrEqual(SPAWN.SCAN_RADIUS_CHUNKS);
        expect(Math.abs(cz)).toBeLessThanOrEqual(SPAWN.SCAN_RADIUS_CHUNKS);
    });

    it('returns the quiet chunk nearest the origin (brute-force cross-check)', () => {
        const { cx, cz } = findQuietSpawnChunk();
        const r = SPAWN.SCAN_RADIUS_CHUNKS;
        let bestDistSq = Infinity;
        for (let z = -r; z <= r; z++) {
            for (let x = -r; x <= r; x++) {
                if (QUIET_SPAWN_ROOMS.has(getRoomTypeFromPosition(x, z))) {
                    bestDistSq = Math.min(bestDistSq, x * x + z * z);
                }
            }
        }
        expect(bestDistSq).not.toBe(Infinity); // sanity: a candidate exists
        expect(cx * cx + cz * cz).toBe(bestDistSq);
    });

    it('is deterministic across calls', () => {
        expect(findQuietSpawnChunk()).toEqual(findQuietSpawnChunk());
        expect(findQuietSpawnPosition()).toEqual(findQuietSpawnPosition());
    });

    it('falls back to the origin chunk when nothing quiet is in range', () => {
        // Radius 0 scans only the (INFO_OVERFLOW) origin: no candidate.
        expect(findQuietSpawnChunk(0)).toEqual({ cx: 0, cz: 0 });
    });

    it('places the spawn point inside the found chunk, still in a quiet room', () => {
        const { cx, cz } = findQuietSpawnChunk();
        const pos = findQuietSpawnPosition();
        expect(pos.x).toBe(cx * WORLD.CHUNK_SIZE + SPAWN.SPAWN_OFFSET);
        expect(pos.z).toBe(cz * WORLD.CHUNK_SIZE + SPAWN.SPAWN_OFFSET);
        // The safe-spawn offset stays inside the chunk footprint, so the room
        // attribution at the ACTUAL spawn position (same round convention as
        // gameplay) is the quiet room the scan selected.
        expect(getRoomTypeAtWorldPosition(pos.x, pos.z)).toBe(getRoomTypeFromPosition(cx, cz));
        expect(QUIET_SPAWN_ROOMS.has(getRoomTypeAtWorldPosition(pos.x, pos.z))).toBe(true);
    });
});
