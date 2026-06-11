import { describe, expect, it } from 'vitest';
import { SPAWN, WORLD } from '../src/config';
import {
    chunkToCluster,
    clusterCenterWorld,
    findQuietSpawnChunk,
    findQuietSpawnCluster,
    findQuietSpawnPosition,
    getRoomTypeAtWorldPosition,
    getRoomTypeForCluster,
    getRoomTypeFromPosition,
    QUIET_SPAWN_ROOMS,
    RoomType,
    worldToChunkCoord,
} from '../src/world/RoomConfig';

describe('quiet spawn scan (flow-audit medium #7, per-cluster rooms)', () => {
    it('confirms the origin cluster is INFO_OVERFLOW (the problem being solved)', () => {
        expect(getRoomTypeForCluster(0, 0)).toBe(RoomType.INFO_OVERFLOW);
        expect(getRoomTypeFromPosition(0, 0)).toBe(RoomType.INFO_OVERFLOW);
    });

    it('only treats IN_BETWEEN and POLARIZED as quiet spawn rooms', () => {
        expect(QUIET_SPAWN_ROOMS.has(RoomType.IN_BETWEEN)).toBe(true);
        expect(QUIET_SPAWN_ROOMS.has(RoomType.POLARIZED)).toBe(true);
        expect(QUIET_SPAWN_ROOMS.has(RoomType.INFO_OVERFLOW)).toBe(false);
        expect(QUIET_SPAWN_ROOMS.has(RoomType.FORCED_ALIGNMENT)).toBe(false);
    });

    it('returns a quiet-room cluster within the configured scan radius', () => {
        const { clusterX, clusterZ } = findQuietSpawnCluster();
        expect(QUIET_SPAWN_ROOMS.has(getRoomTypeForCluster(clusterX, clusterZ))).toBe(true);
        expect(Math.abs(clusterX)).toBeLessThanOrEqual(SPAWN.SCAN_RADIUS_CLUSTERS);
        expect(Math.abs(clusterZ)).toBeLessThanOrEqual(SPAWN.SCAN_RADIUS_CLUSTERS);
    });

    it('returns the quiet cluster nearest the origin (brute-force cross-check)', () => {
        const { clusterX, clusterZ } = findQuietSpawnCluster();
        const r = SPAWN.SCAN_RADIUS_CLUSTERS;
        let bestDistSq = Infinity;
        for (let z = -r; z <= r; z++) {
            for (let x = -r; x <= r; x++) {
                if (QUIET_SPAWN_ROOMS.has(getRoomTypeForCluster(x, z))) {
                    bestDistSq = Math.min(bestDistSq, x * x + z * z);
                }
            }
        }
        expect(bestDistSq).not.toBe(Infinity); // sanity: a candidate exists
        expect(clusterX * clusterX + clusterZ * clusterZ).toBe(bestDistSq);
    });

    it('is deterministic across calls', () => {
        expect(findQuietSpawnCluster()).toEqual(findQuietSpawnCluster());
        expect(findQuietSpawnChunk()).toEqual(findQuietSpawnChunk());
        expect(findQuietSpawnPosition()).toEqual(findQuietSpawnPosition());
    });

    it('falls back to the origin cluster when nothing quiet is in range', () => {
        // Radius 0 scans only the (INFO_OVERFLOW) origin cluster: no candidate.
        expect(findQuietSpawnCluster(0)).toEqual({ clusterX: 0, clusterZ: 0 });
        // The chunk projection still returns the origin cluster's center chunk.
        const fallback = findQuietSpawnChunk(0);
        expect(chunkToCluster(fallback.cx)).toBe(0);
        expect(chunkToCluster(fallback.cz)).toBe(0);
    });

    it('projects the cluster to its CENTER chunk (the chunk owning the cluster center point)', () => {
        const { clusterX, clusterZ } = findQuietSpawnCluster();
        const { cx, cz } = findQuietSpawnChunk();
        // Same cluster…
        expect(chunkToCluster(cx)).toBe(clusterX);
        expect(chunkToCluster(cz)).toBe(clusterZ);
        // …and specifically the chunk whose floor footprint contains the
        // cluster center point under the round convention.
        expect(cx).toBe(worldToChunkCoord(clusterCenterWorld(clusterX)));
        expect(cz).toBe(worldToChunkCoord(clusterCenterWorld(clusterZ)));
    });

    it('places the spawn point inside the found cluster, still in a quiet room', () => {
        const { cx, cz } = findQuietSpawnChunk();
        const pos = findQuietSpawnPosition();
        expect(pos.x).toBe(cx * WORLD.CHUNK_SIZE + SPAWN.SPAWN_OFFSET);
        expect(pos.z).toBe(cz * WORLD.CHUNK_SIZE + SPAWN.SPAWN_OFFSET);
        // The safe-spawn offset stays inside the cluster footprint, so the room
        // attribution at the ACTUAL spawn position (same round convention as
        // gameplay) is the quiet room the scan selected.
        expect(getRoomTypeAtWorldPosition(pos.x, pos.z)).toBe(getRoomTypeFromPosition(cx, cz));
        expect(QUIET_SPAWN_ROOMS.has(getRoomTypeAtWorldPosition(pos.x, pos.z))).toBe(true);
    });

    it('spawns away from the room rim (>= 1/4 cluster half-width from any boundary)', () => {
        const { clusterX, clusterZ } = findQuietSpawnCluster();
        const pos = findQuietSpawnPosition();
        const halfCluster = (WORLD.CHUNK_SIZE * WORLD.CLUSTER_CHUNKS) / 2;
        // Distance from the spawn point to the nearest cluster boundary on
        // each axis (center chunk's center + 8m offset => 32m with the
        // current constants — well clear of the boundary event).
        const edgeDistX = halfCluster - Math.abs(pos.x - clusterCenterWorld(clusterX));
        const edgeDistZ = halfCluster - Math.abs(pos.z - clusterCenterWorld(clusterZ));
        expect(edgeDistX).toBeGreaterThanOrEqual(halfCluster / 4);
        expect(edgeDistZ).toBeGreaterThanOrEqual(halfCluster / 4);
    });
});
