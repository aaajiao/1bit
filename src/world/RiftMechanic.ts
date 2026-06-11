import type * as THREE from 'three';
import type { PlayerManager } from '../player/PlayerManager';
import type { AudioSystemInterface } from '../types';
import { BINAURAL_SIDE_CONFIG } from '../config/audio';
import { RIFT_PHYSICS } from '../config/physics';
import { CHUNK_SIZE } from './ChunkManager';
import { getRoomTypeFromPosition, RoomType, worldToChunkCoord } from './RoomConfig';

export class RiftMechanic {
    constructor() { }

    /**
     * Update rift logic: check if player is over crack, handle falling and respawning
     */
    public update(
        player: PlayerManager,
        audio: AudioSystemInterface,
        cameraPosition: THREE.Vector3,
    ): void {
        const nearestChunkX = worldToChunkCoord(cameraPosition.x, CHUNK_SIZE);
        const chunkCenterX = nearestChunkX * CHUNK_SIZE;
        const distFromCenter = Math.abs(cameraPosition.x - chunkCenterX);

        // The crack only exists in FORCED_ALIGNMENT chunks. Validate the chunk
        // the player is actually standing on (round convention — the rounded
        // x/z chunk is the one whose floor footprint contains the player by
        // construction), so the fall can never punch through the intact floor
        // of a neighbouring non-rift chunk.
        const nearestChunkZ = worldToChunkCoord(cameraPosition.z, CHUNK_SIZE);
        const isRiftChunk = getRoomTypeFromPosition(nearestChunkX, nearestChunkZ) === RoomType.FORCED_ALIGNMENT;

        // Update binaural position for audio context: SIGNED x offset from the
        // rift crack center (flow-audit break #7) so the beat hears which side
        // the player stands on — negative = tidy left, positive = broken right.
        audio.updateBinauralPosition(cameraPosition.x - chunkCenterX, BINAURAL_SIDE_CONFIG.fieldWidth);

        // RIFT AUDIO: Fog Sound
        // Start if not already playing (internal check handles redundancy)
        audio.startRiftFog();

        // Intensity based on proximity (closer = louder)
        // Normalized: 1.0 at 0m, 0.0 at 10m
        const riftProximity = Math.max(0, 1 - distFromCenter / 10);
        audio.updateRiftFog(riftProximity);

        // Crack half-width (meters from center), gated on the chunk actually
        // having a crack (see isRiftChunk above)
        if (isRiftChunk && distFromCenter < RIFT_PHYSICS.crackHalfWidth) {
            // Player is above the crack - infinite fall with low gravity
            player.setGroundLevel(-1000);
            player.setGravity(RIFT_PHYSICS.fallGravity); // Lunar gravity for slow, long fall

            // Trigger fall sound if just started falling
            if (cameraPosition.y < 0 && cameraPosition.y > -5) {
                audio.playRiftFall();
            }
        }
        else {
            // Player is on solid ground
            player.setGroundLevel(2.0);
            player.setGravity(29.4); // Default gravity

            // Safety: Stop fall sound if we stepped out
            audio.stopRiftFall();
        }

        // Fall reset check (Respawn)
        if (cameraPosition.y < RIFT_PHYSICS.respawnHeight) {
            // Calculate safe spawn point (from center, on the side they fell closest to)
            const sign = cameraPosition.x > chunkCenterX ? 1 : -1;
            const safeX = chunkCenterX + sign * RIFT_PHYSICS.safeSpawnDistance;

            // Teleport back to surface
            player.teleport(safeX, 2.0, cameraPosition.z);

            // Reset gravity immediately
            player.setGravity(29.4);

            // Play respawn sound
            audio.playRiftRespawn();
        }
    }

    /**
     * Clean up interactions when leaving the rift area
     */
    public onExit(player: PlayerManager, audio: AudioSystemInterface): void {
        // Reset ground level and gravity
        player.setGroundLevel(2.0);
        player.setGravity(29.4);

        // Stop rift fog
        audio.stopRiftFog();
    }

    /**
     * Dispose any resources owned by this mechanic.
     * RiftMechanic holds no listeners, timers, or GPU resources of its own
     * (it mutates the shared player/audio systems, which own their cleanup),
     * so this is a no-op provided for interface consistency with other systems.
     */
    public dispose(): void {
        // No-op: nothing owned here to release.
    }
}
