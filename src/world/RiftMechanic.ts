import type * as THREE from 'three';
import type { PlayerManager } from '../player/PlayerManager';
import type { AudioSystemInterface } from '../types';
import { CHUNK_SIZE } from './ChunkManager';

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
        const nearestChunkX = Math.round(cameraPosition.x / CHUNK_SIZE);
        const chunkCenterX = nearestChunkX * CHUNK_SIZE;
        const distFromCenter = Math.abs(cameraPosition.x - chunkCenterX);

        // Update binaural position for audio context
        audio.updateBinauralPosition(cameraPosition.x, 20);

        // RIFT AUDIO: Fog Sound
        // Start if not already playing (internal check handles redundancy)
        audio.startRiftFog();

        // Intensity based on proximity (closer = louder)
        // Normalized: 1.0 at 0m, 0.0 at 10m
        const riftProximity = Math.max(0, 1 - distFromCenter / 10);
        audio.updateRiftFog(riftProximity);

        // Crack half-width is 2m
        if (distFromCenter < 2) {
            // Player is above the crack - infinite fall with low gravity
            player.setGroundLevel(-1000);
            player.setGravity(5.0); // Lunar gravity for slow, long fall

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
        if (cameraPosition.y < -150) {
            // Calculate safe spawn point (3.5m from center, on the side they fell closest to)
            const sign = cameraPosition.x > chunkCenterX ? 1 : -1;
            const safeX = chunkCenterX + sign * 3.5;

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
}
