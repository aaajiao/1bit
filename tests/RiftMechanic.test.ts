import type { PlayerManager } from '../src/player/PlayerManager';
import type { AudioSystemInterface } from '../src/types';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/config/constants';
import { RIFT_PHYSICS } from '../src/config/physics';
import { CHUNK_SIZE } from '../src/world/ChunkManager';
import { RiftMechanic } from '../src/world/RiftMechanic';
import {
    clusterCenterWorld,
    getRoomTypeForCluster,
    riftLineXForWorldX,
    RoomType,
} from '../src/world/RoomConfig';

interface TeleportCall { x: number; y: number; z: number }

const CLUSTER_SIZE = CHUNK_SIZE * WORLD.CLUSTER_CHUNKS;

// Rooms are hash-assigned per 2x2-chunk CLUSTER, so fixtures are searched (not
// hardcoded) to survive seed-math changes. Scans cluster row clusterZ in
// direction dir for the first cluster whose FORCED_ALIGNMENT-ness matches
// wantRift.
function findClusterX(clusterZ: number, dir: 1 | -1, wantRift: boolean): number {
    for (let i = 1; i <= 200; i++) {
        const clusterX = i * dir;
        const isRift = getRoomTypeForCluster(clusterX, clusterZ) === RoomType.FORCED_ALIGNMENT;
        if (isRift === wantRift)
            return clusterX;
    }
    throw new Error('No matching cluster found near origin');
}

// Finds a rift cluster whose +z neighbour cluster is NOT a rift cluster (for
// testing that the crack never extends into a neighbouring intact floor).
function findRiftClusterWithIntactNeighborZ(): { clusterX: number; clusterZ: number; neighborClusterZ: number } {
    for (let clusterX = -25; clusterX <= 25; clusterX++) {
        for (let clusterZ = -25; clusterZ <= 25; clusterZ++) {
            if (getRoomTypeForCluster(clusterX, clusterZ) === RoomType.FORCED_ALIGNMENT
                && getRoomTypeForCluster(clusterX, clusterZ + 1) !== RoomType.FORCED_ALIGNMENT) {
                return { clusterX, clusterZ, neighborClusterZ: clusterZ + 1 };
            }
        }
    }
    throw new Error('No rift cluster with intact z-neighbour found');
}

// Crack center x (the cluster rift line) of the nearest FORCED_ALIGNMENT
// cluster on cluster row 0, and a z inside that cluster row's footprint.
const riftClusterX = findClusterX(0, 1, true);
const riftCenterX = clusterCenterWorld(riftClusterX);
const row0Z = clusterCenterWorld(0); // z inside cluster row 0

// Minimal fake PlayerManager recording only the methods RiftMechanic uses.
function makePlayer() {
    const groundLevels: number[] = [];
    const gravities: number[] = [];
    const teleports: TeleportCall[] = [];
    const player = {
        setGroundLevel: (level: number) => groundLevels.push(level),
        setGravity: (g: number) => gravities.push(g),
        teleport: (x: number, y: number, z: number) => teleports.push({ x, y, z }),
    };
    return {
        player: player as unknown as PlayerManager,
        groundLevels,
        gravities,
        teleports,
    };
}

// Minimal fake audio recording the rift-related calls.
function makeAudio() {
    const calls: Record<string, number> = {
        startRiftFog: 0,
        updateRiftFog: 0,
        stopRiftFog: 0,
        playRiftFall: 0,
        stopRiftFall: 0,
        playRiftRespawn: 0,
        updateBinauralPosition: 0,
    };
    let lastFogIntensity = -1;
    let lastBinauralOffset = Number.NaN;
    const audio = {
        startRiftFog: () => { calls.startRiftFog++; },
        updateRiftFog: (intensity: number) => { calls.updateRiftFog++; lastFogIntensity = intensity; },
        stopRiftFog: () => { calls.stopRiftFog++; },
        playRiftFall: () => { calls.playRiftFall++; },
        stopRiftFall: () => { calls.stopRiftFall++; },
        playRiftRespawn: () => { calls.playRiftRespawn++; },
        updateBinauralPosition: (offset: number) => { calls.updateBinauralPosition++; lastBinauralOffset = offset; },
    };
    return {
        audio: audio as unknown as AudioSystemInterface,
        calls,
        getFogIntensity: () => lastFogIntensity,
        getBinauralOffset: () => lastBinauralOffset,
    };
}

describe('riftMechanic', () => {
    describe('crack / fall logic (one rift per cluster)', () => {
        it('should engage low gravity infinite-fall ground when above the crack', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels, gravities } = makePlayer();
            const { audio } = makeAudio();

            // Exactly on a rift cluster center line -> distFromCenter 0 < crackHalfWidth.
            const pos = new THREE.Vector3(riftCenterX, 2, row0Z);
            rift.update(player, audio, pos);

            expect(groundLevels).toContain(-1000);
            expect(gravities).toContain(RIFT_PHYSICS.fallGravity);
        });

        it('should keep solid ground and default gravity when away from the crack', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels, gravities } = makePlayer();
            const { audio, calls } = makeAudio();

            // Same rift cluster, 30m from the crack line (footprint is +/-80m).
            const pos = new THREE.Vector3(riftCenterX + 30, 2, row0Z);
            rift.update(player, audio, pos);

            expect(groundLevels).toContain(2.0);
            expect(gravities).toContain(29.4);
            // Off the crack, the fall sound is stopped as a safety.
            expect(calls.stopRiftFall).toBeGreaterThan(0);
        });

        it('keeps the rift UNIQUE: no fall at any of the cluster four chunk centers', () => {
            // The old per-chunk cracks ran along every FA chunk center line;
            // the cluster rift replaces them with ONE line on the inner seam.
            // Each chunk center is CHUNK_SIZE/2 = 40m from that line — solid.
            const rift = new RiftMechanic();
            for (const chunkOffsetX of [-CHUNK_SIZE / 2, CHUNK_SIZE / 2]) {
                for (const chunkOffsetZ of [-CHUNK_SIZE / 2, CHUNK_SIZE / 2]) {
                    const { player, groundLevels } = makePlayer();
                    const { audio } = makeAudio();
                    const pos = new THREE.Vector3(
                        riftCenterX + chunkOffsetX,
                        2,
                        row0Z + chunkOffsetZ,
                    );
                    rift.update(player, audio, pos);
                    expect(groundLevels).not.toContain(-1000);
                    expect(groundLevels).toContain(2.0);
                }
            }
        });

        it('should open the fall along the WHOLE cluster z extent of the crack line', () => {
            const rift = new RiftMechanic();
            const halfCluster = CLUSTER_SIZE / 2;
            // Near both z edges of the rift cluster row and at its center.
            for (const dz of [-halfCluster + 0.5, 0, halfCluster - 0.5]) {
                const { player, groundLevels } = makePlayer();
                const { audio } = makeAudio();
                rift.update(player, audio, new THREE.Vector3(riftCenterX, 2, row0Z + dz));
                expect(groundLevels).toContain(-1000);
            }
        });

        it('should play the fall sound when descending just below the surface over the crack', () => {
            const rift = new RiftMechanic();
            const { player } = makePlayer();
            const { audio, calls } = makeAudio();

            // Above the crack, y in (-5, 0) triggers the fall sound.
            const pos = new THREE.Vector3(riftCenterX, -2, row0Z);
            rift.update(player, audio, pos);

            expect(calls.playRiftFall).toBeGreaterThan(0);
        });

        it('should drive rift fog intensity from proximity to the crack line', () => {
            const rift = new RiftMechanic();
            const { player } = makePlayer();
            const { audio, calls, getFogIntensity } = makeAudio();

            rift.update(player, audio, new THREE.Vector3(riftCenterX, 2, row0Z));
            expect(calls.startRiftFog).toBeGreaterThan(0);
            // At the center, proximity is maxed (1).
            expect(getFogIntensity()).toBeCloseTo(1, 5);
        });

        it('feeds the binaural side as the SIGNED offset from the cluster rift line', () => {
            const rift = new RiftMechanic();
            const { player } = makePlayer();
            const { audio, getBinauralOffset } = makeAudio();

            // 50m right of the line — beyond a chunk half-width, only reachable
            // because the crack base is the cluster line, not the chunk center.
            rift.update(player, audio, new THREE.Vector3(riftCenterX + 50, 2, row0Z));
            expect(getBinauralOffset()).toBeCloseTo(50, 9);
            rift.update(player, audio, new THREE.Vector3(riftCenterX - 50, 2, row0Z));
            expect(getBinauralOffset()).toBeCloseTo(-50, 9);
        });
    });

    describe('cluster validation (round convention)', () => {
        it('should NOT open the fall over a non-rift cluster center (intact floor)', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels } = makePlayer();
            const { audio } = makeAudio();

            // On the center line of a cluster that has no crack at all.
            const intactCenterX = clusterCenterWorld(findClusterX(0, 1, false));
            rift.update(player, audio, new THREE.Vector3(intactCenterX, 2, row0Z));

            expect(groundLevels).not.toContain(-1000);
            expect(groundLevels).toContain(2.0);
        });

        it('should NOT open the fall when z is in a neighbouring intact cluster row', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels } = makePlayer();
            const { audio } = makeAudio();

            // x sits on a rift cluster's crack line, but z is on the visible
            // floor of the +z neighbour cluster, which has no crack.
            const { clusterX, neighborClusterZ } = findRiftClusterWithIntactNeighborZ();
            const pos = new THREE.Vector3(
                clusterCenterWorld(clusterX),
                2,
                clusterCenterWorld(neighborClusterZ),
            );
            rift.update(player, audio, pos);

            expect(groundLevels).not.toContain(-1000);
            expect(groundLevels).toContain(2.0);
        });

        it('should open the fall everywhere inside the rift cluster own z footprint', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels } = makePlayer();
            const { audio } = makeAudio();

            // Just inside the rift cluster's footprint near the z boundary.
            const { clusterX, clusterZ } = findRiftClusterWithIntactNeighborZ();
            const zNearBoundary = clusterCenterWorld(clusterZ) + CLUSTER_SIZE / 2 - 0.5;
            rift.update(player, audio, new THREE.Vector3(clusterCenterWorld(clusterX), 2, zNearBoundary));

            expect(groundLevels).toContain(-1000);
        });

        it('should open the fall in negative-coordinate rift clusters too', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels } = makePlayer();
            const { audio } = makeAudio();

            const negRiftCenterX = clusterCenterWorld(findClusterX(0, -1, true));
            rift.update(player, audio, new THREE.Vector3(negRiftCenterX, 2, row0Z));

            expect(groundLevels).toContain(-1000);
        });
    });

    describe('respawn math', () => {
        it('should NOT respawn while above the respawn height', () => {
            const rift = new RiftMechanic();
            const { player, teleports } = makePlayer();
            const { audio, calls } = makeAudio();

            // y just above threshold (-150): -149 is not < -150.
            rift.update(player, audio, new THREE.Vector3(riftCenterX, RIFT_PHYSICS.respawnHeight + 1, row0Z));
            expect(teleports.length).toBe(0);
            expect(calls.playRiftRespawn).toBe(0);
        });

        it('should respawn when y drops below the respawn height', () => {
            const rift = new RiftMechanic();
            const { player, teleports } = makePlayer();
            const { audio, calls } = makeAudio();

            rift.update(player, audio, new THREE.Vector3(riftCenterX, RIFT_PHYSICS.respawnHeight - 1, row0Z));
            expect(teleports.length).toBe(1);
            expect(calls.playRiftRespawn).toBe(1);
        });

        it('should respawn within rift line +/- safeSpawnDistance and reset y to surface', () => {
            const rift = new RiftMechanic();
            const { player, teleports } = makePlayer();
            const { audio } = makeAudio();

            // Player slightly positive of the rift line -> sign +1.
            const z = row0Z + 12.34;
            rift.update(player, audio, new THREE.Vector3(riftCenterX + 0.5, -200, z));

            expect(teleports.length).toBe(1);
            const t = teleports[0];
            const lineX = riftLineXForWorldX(riftCenterX + 0.5);
            expect(lineX).toBe(riftCenterX); // sanity: same cluster line
            expect(Math.abs(t.x - lineX)).toBeCloseTo(RIFT_PHYSICS.safeSpawnDistance, 5);
            expect(t.x).toBeCloseTo(lineX + RIFT_PHYSICS.safeSpawnDistance, 5);
            expect(t.y).toBe(2.0);
            expect(t.z).toBe(z); // z preserved
        });

        it('should respawn on the negative side when player fell on the negative side of the line', () => {
            const rift = new RiftMechanic();
            const { player, teleports } = makePlayer();
            const { audio } = makeAudio();

            // x just negative of the rift line -> sign -1.
            rift.update(player, audio, new THREE.Vector3(riftCenterX - 0.5, -300, row0Z));
            const t = teleports[0];
            expect(t.x).toBeCloseTo(riftCenterX - RIFT_PHYSICS.safeSpawnDistance, 5);
        });

        it('should reset gravity to default on respawn', () => {
            const rift = new RiftMechanic();
            const { player, gravities } = makePlayer();
            const { audio } = makeAudio();

            rift.update(player, audio, new THREE.Vector3(riftCenterX, -200, row0Z));
            // Last gravity write should be the default reset.
            expect(gravities[gravities.length - 1]).toBe(29.4);
        });
    });

    describe('onExit', () => {
        it('should reset ground/gravity and stop the fog', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels, gravities } = makePlayer();
            const { audio, calls } = makeAudio();

            rift.onExit(player, audio);
            expect(groundLevels).toContain(2.0);
            expect(gravities).toContain(29.4);
            expect(calls.stopRiftFog).toBeGreaterThan(0);
        });
    });

    describe('dispose', () => {
        it('should expose a callable no-op dispose()', () => {
            const rift = new RiftMechanic();
            expect(typeof rift.dispose).toBe('function');
            expect(() => rift.dispose()).not.toThrow();
        });
    });
});
