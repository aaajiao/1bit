import type { PlayerManager } from '../src/player/PlayerManager';
import type { AudioSystemInterface } from '../src/types';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RIFT_PHYSICS } from '../src/config/physics';
import { CHUNK_SIZE } from '../src/world/ChunkManager';
import { RiftMechanic } from '../src/world/RiftMechanic';

interface TeleportCall { x: number; y: number; z: number }

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

            // Exactly on a chunk center -> distFromCenter 0 < crackHalfWidth.
            const pos = new THREE.Vector3(0, 2, 0);
            rift.update(player, audio, pos);

            expect(groundLevels).toContain(-1000);
            expect(gravities).toContain(RIFT_PHYSICS.fallGravity);
        });

        it('should keep solid ground and default gravity when away from the crack', () => {
            const rift = new RiftMechanic();
            const { player, groundLevels, gravities } = makePlayer();
            const { audio, calls } = makeAudio();

            // Far from any chunk center: half-chunk offset = 40m from center.
            const pos = new THREE.Vector3(CHUNK_SIZE / 2, 2, 0);
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

            // Above crack (x=0), y in (-5, 0) triggers the fall sound.
            const pos = new THREE.Vector3(0, -2, 0);
            rift.update(player, audio, pos);

            expect(calls.playRiftFall).toBeGreaterThan(0);
        });

        it('should drive rift fog intensity from proximity to the crack center', () => {
            const rift = new RiftMechanic();
            const { player } = makePlayer();
            const { audio, calls, getFogIntensity } = makeAudio();

            rift.update(player, audio, new THREE.Vector3(0, 2, 0));
            expect(calls.startRiftFog).toBeGreaterThan(0);
            // At the center, proximity is maxed (1).
            expect(getFogIntensity()).toBeCloseTo(1, 5);
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
