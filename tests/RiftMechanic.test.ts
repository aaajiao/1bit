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

// The nearest FORCED_ALIGNMENT cluster on cluster row 0: its SEMANTIC side
// axis (the cluster center — solid floor) and its TWO physical rift lines
// (one per chunk column, at axis ± CHUNK_SIZE/2, 80m apart).
const riftClusterX = findClusterX(0, 1, true);
const riftAxisX = clusterCenterWorld(riftClusterX);
const riftLines = [riftAxisX - CHUNK_SIZE / 2, riftAxisX + CHUNK_SIZE / 2];
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
    let lastBinauralDistance = Number.NaN;
    const audio = {
        startRiftFog: () => { calls.startRiftFog++; },
        updateRiftFog: (intensity: number) => { calls.updateRiftFog++; lastFogIntensity = intensity; },
        stopRiftFog: () => { calls.stopRiftFog++; },
        playRiftFall: () => { calls.playRiftFall++; },
        stopRiftFall: () => { calls.stopRiftFall++; },
        playRiftRespawn: () => { calls.playRiftRespawn++; },
        updateBinauralPosition: (sideOffsetX: number, riftDistance: number) => {
            calls.updateBinauralPosition++;
            lastBinauralOffset = sideOffsetX;
            lastBinauralDistance = riftDistance;
        },
    };
    return {
        audio: audio as unknown as AudioSystemInterface,
        calls,
        getFogIntensity: () => lastFogIntensity,
        getBinauralOffset: () => lastBinauralOffset,
        getBinauralDistance: () => lastBinauralDistance,
    };
}

describe('riftMechanic', () => {
    describe('crack / fall logic (one rift per chunk column)', () => {
        it('should engage low gravity infinite-fall ground when above EITHER crack', () => {
            // An FA cluster carries TWO cracks, one per chunk column.
            for (const line of riftLines) {
                const rift = new RiftMechanic();
                const { player, groundLevels, gravities } = makePlayer();
                const { audio } = makeAudio();

                // Exactly on a rift line -> distFromCenter 0 < crackHalfWidth.
                rift.update(player, audio, new THREE.Vector3(line, 2, row0Z));

                expect(groundLevels).toContain(-1000);
                expect(gravities).toContain(RIFT_PHYSICS.fallGravity);
            }
        });

        it('should keep solid ground and default gravity when away from the cracks', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels, gravities } = makePlayer();
            const { audio, calls } = makeAudio();

            // 20m from the nearest crack line (cracks at axis ± 40).
            const pos = new THREE.Vector3(riftLines[0] + 20, 2, row0Z);
            rift.update(player, audio, pos);

            expect(groundLevels).toContain(2.0);
            expect(gravities).toContain(29.4);
            // Off the crack, the fall sound is stopped as a safety.
            expect(calls.stopRiftFall).toBeGreaterThan(0);
        });

        it('keeps exactly TWO cracks, 80m apart: midpoints between them are solid', () => {
            // The one-crack-per-cluster experiment is reverted: the cracks sit
            // on the chunk column centers (axis ± 40), and the old single-line
            // location — the cluster center — is now solid mid-floor, as are
            // the cluster footprint x edges (axis ± 80).
            expect(riftLines[1] - riftLines[0]).toBe(CHUNK_SIZE);
            const rift = new RiftMechanic();
            for (const solidX of [riftAxisX, riftAxisX - CLUSTER_SIZE / 2 + 1, riftAxisX + CLUSTER_SIZE / 2 - 1]) {
                for (const chunkOffsetZ of [-CHUNK_SIZE / 2, CHUNK_SIZE / 2]) {
                    const { player, groundLevels } = makePlayer();
                    const { audio } = makeAudio();
                    rift.update(player, audio, new THREE.Vector3(solidX, 2, row0Z + chunkOffsetZ));
                    expect(groundLevels).not.toContain(-1000);
                    expect(groundLevels).toContain(2.0);
                }
            }
        });

        it('should open the fall along the WHOLE cluster z extent of both crack lines', () => {
            const rift = new RiftMechanic();
            const halfCluster = CLUSTER_SIZE / 2;
            // Near both z edges of the rift cluster row and at its center.
            for (const line of riftLines) {
                for (const dz of [-halfCluster + 0.5, 0, halfCluster - 0.5]) {
                    const { player, groundLevels } = makePlayer();
                    const { audio } = makeAudio();
                    rift.update(player, audio, new THREE.Vector3(line, 2, row0Z + dz));
                    expect(groundLevels).toContain(-1000);
                }
            }
        });

        it('should play the fall sound when descending just below the surface over the crack', () => {
            const rift = new RiftMechanic();
            const { player } = makePlayer();
            const { audio, calls } = makeAudio();

            // Above the crack, y in (-5, 0) triggers the fall sound.
            const pos = new THREE.Vector3(riftLines[0], -2, row0Z);
            rift.update(player, audio, pos);

            expect(calls.playRiftFall).toBeGreaterThan(0);
        });

        it('should drive rift fog intensity from proximity to the NEAREST crack line', () => {
            const rift = new RiftMechanic();
            const { player } = makePlayer();
            const { audio, calls, getFogIntensity } = makeAudio();

            rift.update(player, audio, new THREE.Vector3(riftLines[1], 2, row0Z));
            expect(calls.startRiftFog).toBeGreaterThan(0);
            // On a crack, proximity is maxed (1).
            expect(getFogIntensity()).toBeCloseTo(1, 5);

            // On the axis midway between the cracks (40m out) it fades to 0.
            rift.update(player, audio, new THREE.Vector3(riftAxisX, 2, row0Z));
            expect(getFogIntensity()).toBeCloseTo(0, 5);
        });

        it('feeds the binaural SIDE from the semantic axis and the LOUDNESS from the nearest crack', () => {
            const rift = new RiftMechanic();
            const { player } = makePlayer();
            const { audio, getBinauralOffset, getBinauralDistance } = makeAudio();

            // 50m right of the AXIS: the side offset reads the room choice
            // (+50, well past the right crack at +40), while the loudness
            // distance reads the nearest PHYSICAL crack (10m away).
            rift.update(player, audio, new THREE.Vector3(riftAxisX + 50, 2, row0Z));
            expect(getBinauralOffset()).toBeCloseTo(50, 9);
            expect(getBinauralDistance()).toBeCloseTo(10, 9);
            rift.update(player, audio, new THREE.Vector3(riftAxisX - 50, 2, row0Z));
            expect(getBinauralOffset()).toBeCloseTo(-50, 9);
            expect(getBinauralDistance()).toBeCloseTo(10, 9);

            // Standing ON the left crack the side STILL reads left (-40):
            // the semantic side never flips across a physical crack.
            rift.update(player, audio, new THREE.Vector3(riftLines[0], 2, row0Z));
            expect(getBinauralOffset()).toBeCloseTo(-CHUNK_SIZE / 2, 9);
            expect(getBinauralDistance()).toBeCloseTo(0, 9);
        });
    });

    describe('cluster validation (round convention)', () => {
        it('should NOT open the fall over a non-rift cluster column center (intact floor)', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels } = makePlayer();
            const { audio } = makeAudio();

            // On a chunk column center line of a cluster that has no crack.
            const intactLineX = clusterCenterWorld(findClusterX(0, 1, false)) - CHUNK_SIZE / 2;
            rift.update(player, audio, new THREE.Vector3(intactLineX, 2, row0Z));

            expect(groundLevels).not.toContain(-1000);
            expect(groundLevels).toContain(2.0);
        });

        it('should NOT open the fall when z is in a neighbouring intact cluster row', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels } = makePlayer();
            const { audio } = makeAudio();

            // x sits on a rift cluster's left crack line, but z is on the
            // visible floor of the +z neighbour cluster, which has no crack.
            const { clusterX, neighborClusterZ } = findRiftClusterWithIntactNeighborZ();
            const pos = new THREE.Vector3(
                clusterCenterWorld(clusterX) - CHUNK_SIZE / 2,
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
            rift.update(player, audio, new THREE.Vector3(
                clusterCenterWorld(clusterX) - CHUNK_SIZE / 2,
                2,
                zNearBoundary,
            ));

            expect(groundLevels).toContain(-1000);
        });

        it('should open the fall in negative-coordinate rift clusters too', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels } = makePlayer();
            const { audio } = makeAudio();

            const negRiftLineX = clusterCenterWorld(findClusterX(0, -1, true)) - CHUNK_SIZE / 2;
            rift.update(player, audio, new THREE.Vector3(negRiftLineX, 2, row0Z));

            expect(groundLevels).toContain(-1000);
        });
    });

    describe('respawn math', () => {
        it('should NOT respawn while above the respawn height', () => {
            const rift = new RiftMechanic();
            const { player, teleports } = makePlayer();
            const { audio, calls } = makeAudio();

            // y just above threshold (-150): -149 is not < -150.
            rift.update(player, audio, new THREE.Vector3(riftLines[0], RIFT_PHYSICS.respawnHeight + 1, row0Z));
            expect(teleports.length).toBe(0);
            expect(calls.playRiftRespawn).toBe(0);
        });

        it('should respawn when y drops below the respawn height', () => {
            const rift = new RiftMechanic();
            const { player, teleports } = makePlayer();
            const { audio, calls } = makeAudio();

            rift.update(player, audio, new THREE.Vector3(riftLines[0], RIFT_PHYSICS.respawnHeight - 1, row0Z));
            expect(teleports.length).toBe(1);
            expect(calls.playRiftRespawn).toBe(1);
        });

        it('should respawn within the NEAREST rift line +/- safeSpawnDistance and reset y to surface', () => {
            // Each crack respawns onto its own banks (both lines exercised).
            for (const line of riftLines) {
                const rift = new RiftMechanic();
                const { player, teleports } = makePlayer();
                const { audio } = makeAudio();

                // Player slightly positive of this rift line -> sign +1.
                const z = row0Z + 12.34;
                rift.update(player, audio, new THREE.Vector3(line + 0.5, -200, z));

                expect(teleports.length).toBe(1);
                const t = teleports[0];
                const lineX = riftLineXForWorldX(line + 0.5);
                expect(lineX).toBe(line); // sanity: nearest line is this crack
                expect(Math.abs(t.x - lineX)).toBeCloseTo(RIFT_PHYSICS.safeSpawnDistance, 5);
                expect(t.x).toBeCloseTo(lineX + RIFT_PHYSICS.safeSpawnDistance, 5);
                expect(t.y).toBe(2.0);
                expect(t.z).toBe(z); // z preserved
            }
        });

        it('should respawn on the negative side when player fell on the negative side of the line', () => {
            const rift = new RiftMechanic();
            const { player, teleports } = makePlayer();
            const { audio } = makeAudio();

            // x just negative of the rift line -> sign -1.
            rift.update(player, audio, new THREE.Vector3(riftLines[1] - 0.5, -300, row0Z));
            const t = teleports[0];
            expect(t.x).toBeCloseTo(riftLines[1] - RIFT_PHYSICS.safeSpawnDistance, 5);
        });

        it('should reset gravity to default on respawn', () => {
            const rift = new RiftMechanic();
            const { player, gravities } = makePlayer();
            const { audio } = makeAudio();

            rift.update(player, audio, new THREE.Vector3(riftLines[0], -200, row0Z));
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
