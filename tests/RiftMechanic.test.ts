import type { PlayerManager } from '../src/player/PlayerManager';
import type { AudioSystemInterface } from '../src/types';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RIFT_PHYSICS } from '../src/config/physics';
import { CHUNK_SIZE } from '../src/world/ChunkManager';
import { RiftMechanic } from '../src/world/RiftMechanic';
import { getRoomTypeFromPosition, RoomType } from '../src/world/RoomConfig';

interface TeleportCall { x: number; y: number; z: number }

// Rooms are hash-assigned per chunk, so fixtures are searched (not hardcoded)
// to survive seed-math changes. Scans chunk row cz in direction dir for the
// first chunk whose FORCED_ALIGNMENT-ness matches wantRift.
function findChunkX(cz: number, dir: 1 | -1, wantRift: boolean): number {
    for (let i = 1; i <= 200; i++) {
        const cx = i * dir;
        const isRift = getRoomTypeFromPosition(cx, cz) === RoomType.FORCED_ALIGNMENT;
        if (isRift === wantRift)
            return cx;
    }
    throw new Error('No matching chunk found near origin');
}

// Finds a rift chunk whose +z neighbour is NOT a rift chunk (for testing that
// the crack never extends into a neighbouring intact floor).
function findRiftChunkWithIntactNeighborZ(): { cx: number; cz: number; neighborCz: number } {
    for (let cx = -50; cx <= 50; cx++) {
        for (let cz = -50; cz <= 50; cz++) {
            if (getRoomTypeFromPosition(cx, cz) === RoomType.FORCED_ALIGNMENT
                && getRoomTypeFromPosition(cx, cz + 1) !== RoomType.FORCED_ALIGNMENT) {
                return { cx, cz, neighborCz: cz + 1 };
            }
        }
    }
    throw new Error('No rift chunk with intact z-neighbour found');
}

// Crack center x of the nearest FORCED_ALIGNMENT chunk on row cz=0.
const riftCenterX = findChunkX(0, 1, true) * CHUNK_SIZE;

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
    const audio = {
        startRiftFog: () => { calls.startRiftFog++; },
        updateRiftFog: (intensity: number) => { calls.updateRiftFog++; lastFogIntensity = intensity; },
        stopRiftFog: () => { calls.stopRiftFog++; },
        playRiftFall: () => { calls.playRiftFall++; },
        stopRiftFall: () => { calls.stopRiftFall++; },
        playRiftRespawn: () => { calls.playRiftRespawn++; },
        updateBinauralPosition: () => { calls.updateBinauralPosition++; },
    };
    return {
        audio: audio as unknown as AudioSystemInterface,
        calls,
        getFogIntensity: () => lastFogIntensity,
    };
}

describe('riftMechanic', () => {
    describe('crack / fall logic', () => {
        it('should engage low gravity infinite-fall ground when above the crack', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels, gravities } = makePlayer();
            const { audio } = makeAudio();

            // Exactly on a rift chunk center -> distFromCenter 0 < crackHalfWidth.
            const pos = new THREE.Vector3(riftCenterX, 2, 0);
            rift.update(player, audio, pos);

            expect(groundLevels).toContain(-1000);
            expect(gravities).toContain(RIFT_PHYSICS.fallGravity);
        });

        it('should keep solid ground and default gravity when away from the crack', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels, gravities } = makePlayer();
            const { audio, calls } = makeAudio();

            // Same rift chunk, 30m from the crack center (footprint is +/-40m).
            const pos = new THREE.Vector3(riftCenterX + 30, 2, 0);
            rift.update(player, audio, pos);

            expect(groundLevels).toContain(2.0);
            expect(gravities).toContain(29.4);
            // Off the crack, the fall sound is stopped as a safety.
            expect(calls.stopRiftFall).toBeGreaterThan(0);
        });

        it('should play the fall sound when descending just below the surface over the crack', () => {
            const rift = new RiftMechanic();
            const { player } = makePlayer();
            const { audio, calls } = makeAudio();

            // Above the crack, y in (-5, 0) triggers the fall sound.
            const pos = new THREE.Vector3(riftCenterX, -2, 0);
            rift.update(player, audio, pos);

            expect(calls.playRiftFall).toBeGreaterThan(0);
        });

        it('should drive rift fog intensity from proximity to the crack center', () => {
            const rift = new RiftMechanic();
            const { player } = makePlayer();
            const { audio, calls, getFogIntensity } = makeAudio();

            rift.update(player, audio, new THREE.Vector3(riftCenterX, 2, 0));
            expect(calls.startRiftFog).toBeGreaterThan(0);
            // At the center, proximity is maxed (1).
            expect(getFogIntensity()).toBeCloseTo(1, 5);
        });
    });

    describe('chunk validation (round convention)', () => {
        it('should NOT open the fall over a non-rift chunk center (intact floor)', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels } = makePlayer();
            const { audio } = makeAudio();

            // On the center line of a chunk that has no crack at all.
            const intactCenterX = findChunkX(0, 1, false) * CHUNK_SIZE;
            rift.update(player, audio, new THREE.Vector3(intactCenterX, 2, 0));

            expect(groundLevels).not.toContain(-1000);
            expect(groundLevels).toContain(2.0);
        });

        it('should NOT open the fall when z is in a neighbouring intact chunk row', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels } = makePlayer();
            const { audio } = makeAudio();

            // x sits on a rift chunk's crack line, but z is on the visible
            // floor of the +z neighbour, which has no crack.
            const { cx, neighborCz } = findRiftChunkWithIntactNeighborZ();
            const pos = new THREE.Vector3(cx * CHUNK_SIZE, 2, neighborCz * CHUNK_SIZE);
            rift.update(player, audio, pos);

            expect(groundLevels).not.toContain(-1000);
            expect(groundLevels).toContain(2.0);
        });

        it('should open the fall everywhere inside the rift chunk own z footprint', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels } = makePlayer();
            const { audio } = makeAudio();

            // Just inside the rift chunk's footprint near the z seam.
            const { cx, cz } = findRiftChunkWithIntactNeighborZ();
            const zNearSeam = cz * CHUNK_SIZE + CHUNK_SIZE / 2 - 0.5;
            rift.update(player, audio, new THREE.Vector3(cx * CHUNK_SIZE, 2, zNearSeam));

            expect(groundLevels).toContain(-1000);
        });

        it('should open the fall in negative-coordinate rift chunks too', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels } = makePlayer();
            const { audio } = makeAudio();

            const negRiftCenterX = findChunkX(0, -1, true) * CHUNK_SIZE;
            rift.update(player, audio, new THREE.Vector3(negRiftCenterX, 2, 0));

            expect(groundLevels).toContain(-1000);
        });
    });

    describe('respawn math', () => {
        it('should NOT respawn while above the respawn height', () => {
            const rift = new RiftMechanic();
            const { player, teleports } = makePlayer();
            const { audio, calls } = makeAudio();

            // y just above threshold (-150): -149 is not < -150.
            rift.update(player, audio, new THREE.Vector3(0, RIFT_PHYSICS.respawnHeight + 1, 0));
            expect(teleports.length).toBe(0);
            expect(calls.playRiftRespawn).toBe(0);
        });

        it('should respawn when y drops below the respawn height', () => {
            const rift = new RiftMechanic();
            const { player, teleports } = makePlayer();
            const { audio, calls } = makeAudio();

            rift.update(player, audio, new THREE.Vector3(0, RIFT_PHYSICS.respawnHeight - 1, 0));
            expect(teleports.length).toBe(1);
            expect(calls.playRiftRespawn).toBe(1);
        });

        it('should respawn within center +/- safeSpawnDistance and reset y to surface', () => {
            const rift = new RiftMechanic();
            const { player, teleports } = makePlayer();
            const { audio } = makeAudio();

            // Player slightly positive of center 0 -> sign +1 -> safeX = 0 + 3.5.
            const z = 12.34;
            rift.update(player, audio, new THREE.Vector3(0.5, -200, z));

            expect(teleports.length).toBe(1);
            const t = teleports[0];
            const chunkCenterX = Math.round(0.5 / CHUNK_SIZE) * CHUNK_SIZE; // 0
            expect(Math.abs(t.x - chunkCenterX)).toBeCloseTo(RIFT_PHYSICS.safeSpawnDistance, 5);
            expect(t.x).toBeCloseTo(chunkCenterX + RIFT_PHYSICS.safeSpawnDistance, 5);
            expect(t.y).toBe(2.0);
            expect(t.z).toBe(z); // z preserved
        });

        it('should respawn on the negative side when player fell on the negative side of center', () => {
            const rift = new RiftMechanic();
            const { player, teleports } = makePlayer();
            const { audio } = makeAudio();

            // x just negative of chunk center 0 -> sign -1.
            rift.update(player, audio, new THREE.Vector3(-0.5, -300, 0));
            const t = teleports[0];
            const chunkCenterX = Math.round(-0.5 / CHUNK_SIZE) * CHUNK_SIZE; // 0
            expect(t.x).toBeCloseTo(chunkCenterX - RIFT_PHYSICS.safeSpawnDistance, 5);
        });

        it('should reset gravity to default on respawn', () => {
            const rift = new RiftMechanic();
            const { player, gravities } = makePlayer();
            const { audio } = makeAudio();

            rift.update(player, audio, new THREE.Vector3(0, -200, 0));
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
